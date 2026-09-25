/**
 * A small evaluator of this repository's `.vercel/output` (Build Output API
 * v3), used by the equivalence tests instead of a deployment.
 *
 * It models only the subset `routes.mjs` emits and rejects anything else, so a
 * new route shape cannot pass untested. Modeled platform behavior (from the
 * Build Output API v3 specification; the live platform is a separate gate):
 *  - `src` is a regular expression tested against the request pathname, the
 *    raw request target up to `?`, without decoding;
 *  - `methods`, when present, limits a route to those methods;
 *  - a matching route with `dest` ends routing at that destination;
 *  - a matching route with `headers` and `continue: true` adds its headers
 *    to the response and routing goes on (modeled in the main phase only);
 *  - routes before any `handle` run first; then the file system (an exact
 *    static path or function path); then the routes after
 *    `{ handle: "filesystem" }`; the routes after `{ handle: "error" }` run
 *    only when none of those matched (the CLI's zero-config builder adds a
 *    `404.html` error route there, which a table ending in a catch-all never
 *    reaches);
 *  - a static file is addressed at its `overrides[file].path` when present,
 *    otherwise at its own file path, and the root `index.html` also at `/`;
 *    its Content-Type is `overrides[file].contentType`;
 *  - no match at the end of the table is the platform's own 404.
 */
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  }));
  return nested.flat();
}

function assertModeledRoute(route, index) {
  const keys = Object.keys(route).sort().join(",");
  if (keys === "handle" && (route.handle === "filesystem" || route.handle === "error")) return;
  if (keys === "dest,src,status" && Number.isInteger(route.status)) return;
  if (keys === "continue,headers,src") {
    if (route.continue !== true || typeof route.src !== "string" || typeof route.headers !== "object" || route.headers === null) throw new Error(`route ${index} is malformed`);
    if (!Object.entries(route.headers).every(([name, value]) => name === name.toLowerCase() && typeof value === "string")) throw new Error(`route ${index} has malformed headers`);
    return;
  }
  if (keys === "dest,src" || keys === "dest,methods,src") {
    if (typeof route.src !== "string" || typeof route.dest !== "string") throw new Error(`route ${index} is malformed`);
    if (route.methods && !(Array.isArray(route.methods) && route.methods.every((method) => typeof method === "string"))) throw new Error(`route ${index} has malformed methods`);
    return;
  }
  throw new Error(`route ${index} uses a shape the evaluator does not model: ${keys}`);
}

export async function loadOutput(outputDirectory) {
  const config = JSON.parse(await readFile(join(outputDirectory, "config.json"), "utf8"));
  if (config.version !== 3) throw new Error("config.json must be Build Output API version 3");
  const extraKeys = Object.keys(config).filter((key) => !["version", "routes", "overrides", "crons"].includes(key));
  if (extraKeys.length > 0) throw new Error(`config.json has unmodeled keys: ${extraKeys.join(", ")}`);
  if (config.crons !== undefined && !(Array.isArray(config.crons) && config.crons.length === 0)) throw new Error("config.json crons are not modeled");
  config.routes.forEach(assertModeledRoute);
  const phases = { main: [], filesystem: [], error: [] };
  let phase = "main";
  for (const route of config.routes) {
    if (route.handle) {
      if (phases[route.handle].length > 0 || phase === route.handle) throw new Error(`phase ${route.handle} appears twice`);
      phase = route.handle;
      continue;
    }
    if (route.status !== undefined && phase !== "error") throw new Error("a status route is modeled only in the error phase");
    if (route.continue && phase !== "main") throw new Error("a header route is modeled only in the main phase");
    phases[phase].push(route);
  }
  if (!config.routes.some((route) => route.handle === "filesystem")) throw new Error("the table must hand off to the file system");

  const staticDirectory = join(outputDirectory, "static");
  const overrides = config.overrides ?? {};
  const staticPaths = new Map();
  for (const file of await files(staticDirectory)) {
    const name = relative(staticDirectory, file).replaceAll("\\", "/");
    const override = overrides[name];
    if (!override?.contentType) throw new Error(`static file ${name} has no Content-Type override`);
    const address = `/${override.path ?? name}`;
    if (staticPaths.has(address)) throw new Error(`two static files share ${address}`);
    staticPaths.set(address, { file, contentType: override.contentType });
    if (name === "index.html") staticPaths.set("/", { file, contentType: override.contentType });
  }
  const published = new Set([...staticPaths.values()].map((entry) => relative(staticDirectory, entry.file).replaceAll("\\", "/")));
  for (const name of Object.keys(overrides)) {
    if (!published.has(name)) throw new Error(`override ${name} names no static file`);
  }

  const functionsDirectory = join(outputDirectory, "functions");
  const functions = new Map();
  for (const file of await files(functionsDirectory)) {
    const name = relative(functionsDirectory, file).replaceAll("\\", "/");
    const match = /^(.+)\.func\/\.vc-config\.json$/.exec(name);
    if (match) functions.set(`/${match[1]}`, { directory: join(functionsDirectory, `${match[1]}.func`), config: JSON.parse(await readFile(file, "utf8")) });
  }
  return { config, phases, staticPaths, functions };
}

function destination(output, path) {
  if (output.functions.has(path)) return { kind: "function", name: path };
  const entry = output.staticPaths.get(path);
  if (entry) return { kind: "static", path, ...entry };
  return { kind: "platform_not_found" };
}

/** Headers added by `continue` routes, kept on the result only when there are any (so a plain result keeps its shape). */
function withHeaders(hit, headers) {
  return Object.keys(headers).length ? { ...hit, headers } : hit;
}

/** Route one request; returns the static file, the function, or the platform 404. */
function firstMatch(routes, method, pathname) {
  return routes.find((route) => (!route.methods || route.methods.includes(method)) && new RegExp(route.src).test(pathname));
}

export function routeRequest(output, method, rawTarget) {
  const queryOffset = rawTarget.indexOf("?");
  const pathname = queryOffset === -1 ? rawTarget : rawTarget.slice(0, queryOffset);
  const upperMethod = method.toUpperCase();
  const headers = {};
  for (const route of output.phases.main) {
    if (!(!route.methods || route.methods.includes(upperMethod)) || !new RegExp(route.src).test(pathname)) continue;
    if (route.continue) {
      Object.assign(headers, route.headers);
      continue;
    }
    return withHeaders(destination(output, route.dest), headers);
  }
  const file = destination(output, pathname);
  if (file.kind !== "platform_not_found") return withHeaders(file, headers);
  const afterFilesystem = firstMatch(output.phases.filesystem, upperMethod, pathname);
  if (afterFilesystem) return destination(output, afterFilesystem.dest);
  const error = firstMatch(output.phases.error, upperMethod, pathname);
  if (error) {
    const target = destination(output, error.dest);
    return target.kind === "static" ? { kind: "error_document", status: error.status, ...target } : { kind: "platform_not_found" };
  }
  return { kind: "platform_not_found" };
}
