/**
 * Assemble `.vercel/output` (Build Output API v3) from the already-built
 * repository: the guarded public-Web static client, the compiled Web host
 * modules, and the compiled facts API. Run after `pnpm build`.
 *
 * - `static/`: exactly the loopback host's servable inventory
 *   (`staticInventory`), each file with the host's Content-Type; page
 *   documents are published under `<path>.html` and addressed by a path
 *   override, so no directory `index.html` other than the root exists.
 * - `functions/_benten/ingress.func/`: one bundled Node function running the
 *   hosted ingress plus the facts API, with the static path set and the
 *   not-found bodies it needs. The purchase quote reader is split into
 *   `chunks/` and loaded on the first `prepare_purchase` quote only.
 * - `config.json`: the route table from `routes.mjs` (with the host's
 *   Cache-Control of the files that have one) and the overrides.
 *
 * Output ownership: the output directory is replaced only when the sidecar
 * `.vercel/benten-output.owner.json` names it; an unowned, symlinked or
 * foreign output aborts without deleting anything.
 */
import { lstat, mkdir, readFile, realpath, rm, writeFile, copyFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { INGRESS_FUNCTION, buildRoutes } from "./routes.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const OUTPUT_DIRECTORY = join(repoRoot, ".vercel", "output");
const OWNER_FILE = join(repoRoot, ".vercel", "benten-output.owner.json");
const OWNER_SCHEMA = "benten-vercel-output-owner-v1";
const CLIENT_DIRECTORY = join(repoRoot, "apps/public-web/.generated/local-web/output/client");
const HOST_INVENTORY = join(repoRoot, "apps/public-web/build-host/host/static-inventory.js");
const FUNCTION_ENTRY = join(repoRoot, "scripts/vercel/ingress-function.mjs");
/** Hosted Node runtime; must match the root `engines.node` major. */
export const FUNCTION_RUNTIME = "nodejs24.x";

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function prepareOutput() {
  await mkdir(dirname(OUTPUT_DIRECTORY), { recursive: true });
  if (await exists(OUTPUT_DIRECTORY)) {
    const stat = await lstat(OUTPUT_DIRECTORY);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`${OUTPUT_DIRECTORY} is not a plain directory; refusing to replace it`);
    let owner;
    try {
      owner = JSON.parse(await readFile(OWNER_FILE, "utf8"));
    } catch {
      throw new Error(`${OUTPUT_DIRECTORY} exists without a valid ${relative(repoRoot, OWNER_FILE)}; refusing to replace an output this builder does not own`);
    }
    if (owner?.schema !== OWNER_SCHEMA || owner.outputDirectory !== await realpath(OUTPUT_DIRECTORY)) {
      throw new Error(`${relative(repoRoot, OWNER_FILE)} does not name ${OUTPUT_DIRECTORY}; refusing to replace it`);
    }
    await rm(OUTPUT_DIRECTORY, { recursive: true });
  }
  await mkdir(OUTPUT_DIRECTORY);
  await writeOwner("building");
}

async function writeOwner(state) {
  await writeFile(OWNER_FILE, `${JSON.stringify({ schema: OWNER_SCHEMA, outputDirectory: await realpath(OUTPUT_DIRECTORY), state }, null, 2)}\n`);
}

async function copyInto(source, target) {
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
}

/** Publish the inventory; returns the path overrides for `config.json`. */
async function writeStatic(pages) {
  const overrides = {};
  const staticDirectory = join(OUTPUT_DIRECTORY, "static");
  for (const [pathname, entry] of pages) {
    if (!pathname.startsWith("/") || pathname === "/api" || pathname.startsWith("/api/") || pathname.startsWith(`/${INGRESS_FUNCTION.split("/")[0]}/`)) {
      throw new Error(`servable path ${pathname} collides with a routed prefix`);
    }
    if (pathname.endsWith(".html")) throw new Error(`servable path ${pathname} ends with .html, which the routes reserve`);
    const isDocument = entry.file.endsWith("/index.html");
    let file;
    if (pathname === "/") file = "index.html";
    else if (isDocument) file = `${pathname.slice(1)}.html`;
    else file = pathname.slice(1);
    await copyInto(entry.file, join(staticDirectory, file));
    overrides[file] = isDocument && pathname !== "/" ? { path: pathname.slice(1), contentType: entry.contentType } : { contentType: entry.contentType };
  }
  return overrides;
}

async function writeFunction(pages, notFound) {
  const functionDirectory = join(OUTPUT_DIRECTORY, "functions", `${INGRESS_FUNCTION}.func`);
  await mkdir(functionDirectory, { recursive: true });
  await build({
    entryPoints: [FUNCTION_ENTRY],
    outdir: functionDirectory,
    entryNames: "index",
    // The purchase quote reader is a dynamic import: a separate chunk loaded on the first quote only.
    splitting: true,
    chunkNames: "chunks/[name]-[hash]",
    outExtension: { ".js": ".mjs" },
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    // CommonJS dependencies inside an ESM bundle need a real `require`, and `__filename`/`__dirname`
    // (the native-binding loader of a Solana dependency reads `__filename` inside a stack-trace hook).
    banner: { js: "import { createRequire as __bentenCreateRequire } from 'node:module'; import { fileURLToPath as __bentenFileURLToPath } from 'node:url'; import { dirname as __bentenDirname } from 'node:path'; const require = __bentenCreateRequire(import.meta.url); const __filename = __bentenFileURLToPath(import.meta.url); const __dirname = __bentenDirname(__filename);" },
    logLevel: "warning",
    legalComments: "none",
  });
  const contentTypes = new Set([...notFound.values()].map((entry) => entry.contentType));
  if (contentTypes.size !== 1) throw new Error("not-found documents must share one Content-Type");
  const bodies = {};
  for (const [path, entry] of notFound) bodies[path] = await readFile(entry.file, "utf8");
  await writeFile(join(functionDirectory, "ingress-data.json"), JSON.stringify({
    staticPaths: [...pages.keys()].sort(),
    notFoundContentType: [...contentTypes][0],
    notFound: bodies,
  }));
  await writeFile(join(functionDirectory, ".vc-config.json"), `${JSON.stringify({
    runtime: FUNCTION_RUNTIME,
    handler: "index.mjs",
    launcherType: "Nodejs",
    shouldAddHelpers: false,
    supportsResponseStreaming: false,
  }, null, 2)}\n`);
}

export async function buildVercelOutput() {
  await lstat(join(CLIENT_DIRECTORY, "index.html")).catch(() => {
    throw new Error("the guarded public-Web client is missing; run `pnpm build` first");
  });
  const { staticInventory } = await import(HOST_INVENTORY);
  const { pages, notFound } = await staticInventory(CLIENT_DIRECTORY);
  if (notFound.size === 0) throw new Error("the build has no not-found documents");
  await prepareOutput();
  const overrides = await writeStatic(pages);
  await writeFunction(pages, notFound);
  const cacheControl = new Map();
  for (const [pathname, entry] of pages) {
    if (entry.cacheControl) cacheControl.set(entry.cacheControl, [...(cacheControl.get(entry.cacheControl) ?? []), pathname]);
  }
  await writeFile(join(OUTPUT_DIRECTORY, "config.json"), `${JSON.stringify({ version: 3, routes: buildRoutes(cacheControl), overrides }, null, 2)}\n`);
  await writeOwner("complete");
  return { outputDirectory: OUTPUT_DIRECTORY, staticFiles: pages.size, notFoundDocuments: notFound.size };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildVercelOutput();
  console.info(`Vercel build output: ${relative(repoRoot, result.outputDirectory)} (${result.staticFiles} static files, ${result.notFoundDocuments} not-found documents, 1 function)`);
}
