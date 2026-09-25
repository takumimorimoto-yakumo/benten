/**
 * Equivalence of the hosted `.vercel/output` with the loopback host.
 *
 * Run after `pnpm build` and `node scripts/vercel/build-output.mjs`. The
 * reference is the local stack itself: the facts API server behind the
 * loopback Web host (`startCapsuleHost` with an injected API origin). The
 * hosted side evaluates the generated `config.json` with `evaluate-output.mjs`
 * and answers from the published static files or the bundled function, behind
 * a simulated edge that sets the client address headers from the socket.
 * Every request goes out as a raw request target, so no client normalizes it.
 *
 * `BENTEN_VERCEL_OUTPUT_TEST_PORTS=api,web,hosted` binds fixed loopback ports;
 * the default `0,0,0` lets the OS choose.
 */
import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadOutput, routeRequest } from "./evaluate-output.mjs";
import { INGRESS_DEST, MAX_HEADER_ROUTE_SRC_LENGTH, buildRoutes, chunkEscapedAlternatives } from "./routes.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
// `BENTEN_VERCEL_OUTPUT_DIRECTORY` evaluates another copy, for example the output of `vercel build`.
const outputDirectory = process.env.BENTEN_VERCEL_OUTPUT_DIRECTORY ? resolve(process.env.BENTEN_VERCEL_OUTPUT_DIRECTORY) : join(repoRoot, ".vercel", "output");
const clientDirectory = join(repoRoot, "apps/public-web/.generated/local-web/output/client");

// The upstream RPC is a stub on a reserved name: nothing leaves the machine.
const UPSTREAM = "https://rpc.benten-output-test.invalid/";
process.env.SOLANA_RPC_UPSTREAM_URL = UPSTREAM;
delete process.env.SOLANA_RPC_RELAY_ALLOWED_ORIGINS;
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.startsWith(UPSTREAM)) return realFetch(input, init);
  const call = JSON.parse(String(init?.body ?? "{}"));
  const result = call.method === "getMultipleAccounts"
    ? { context: { slot: 1 }, value: call.params[0].map(() => null) }
    : { context: { slot: 1 }, value: { blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 1 } };
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: call.id ?? 1, result }), { headers: { "content-type": "application/json" } });
};

const [apiPort, webPort, hostedPort] = (process.env.BENTEN_VERCEL_OUTPUT_TEST_PORTS ?? "0,0,0").split(",").map((value) => Number.parseInt(value, 10));

const { startPublicApi } = await import(join(repoRoot, "apps/public-api/dist/node.js"));
const { startCapsuleHost } = await import(join(repoRoot, "apps/public-web/build-host/host/server.js"));
const { staticInventory } = await import(join(repoRoot, "apps/public-web/build-host/host/static-inventory.js"));
const { classifyWebIngress } = await import(join(repoRoot, "apps/public-web/build-host/ingress/classify.js"));

const output = await loadOutput(outputDirectory);
const ingressFunction = output.functions.get(INGRESS_DEST);
assert.ok(ingressFunction, "the ingress function is published");
const ingress = (await import(join(ingressFunction.directory, ingressFunction.config.handler))).default;
const inventory = await staticInventory(clientDirectory);
const staticPaths = new Set(inventory.pages.keys());

// The reference API gets the same purchase quote reader the hosted function bundles, as the local stack does.
const { createServerQuoteReader } = await import(join(repoRoot, "packages/purchase/dist/server-quote.js"));
const api = await startPublicApi({ port: apiPort, env: process.env, purchaseQuote: createServerQuoteReader({ env: process.env }) });
const reference = await startCapsuleHost({ clientDirectory, factsOrigin: api.origin, port: webPort });

/** The simulated platform: route with the generated table, then answer. */
const hosted = createServer((request, response) => {
  // The edge owns the client address headers; a client-sent value never passes.
  request.headers["x-real-ip"] = request.socket.remoteAddress;
  request.headers["x-forwarded-for"] = request.socket.remoteAddress;
  const hit = routeRequest(output, request.method ?? "GET", request.url ?? "/");
  if (hit.kind === "function") {
    void ingress(request, response);
    return;
  }
  if (hit.kind === "static" || hit.kind === "error_document") {
    void readFile(hit.file).then((body) => {
      response.writeHead(hit.kind === "static" ? 200 : hit.status, { "content-type": hit.contentType, ...hit.headers });
      response.end(request.method === "HEAD" ? undefined : body);
    });
    return;
  }
  response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  response.end("PLATFORM_NOT_FOUND");
});
await new Promise((resolvePromise) => hosted.listen(hostedPort, "127.0.0.1", resolvePromise));
const hostedPortBound = hosted.address().port;
const referencePort = Number(new URL(reference.capsuleAddress).port);

test.after(async () => {
  await new Promise((resolvePromise) => hosted.close(resolvePromise));
  await new Promise((resolvePromise) => reference.close(resolvePromise));
  await api.close();
});

/** One raw request; the target is sent byte for byte. */
function raw(port, method, target, { headers = {}, body } = {}) {
  return new Promise((resolvePromise, reject) => {
    const outgoing = httpRequest({ host: "127.0.0.1", port, method, path: target, headers, setHost: !("host" in headers) }, (incoming) => {
      const chunks = [];
      incoming.on("data", (chunk) => chunks.push(chunk));
      incoming.on("end", () => resolvePromise({ status: incoming.statusCode, headers: incoming.headers, body: Buffer.concat(chunks) }));
      incoming.on("error", reject);
    });
    outgoing.on("error", reject);
    outgoing.end(body);
  });
}

const MATERIAL_HEADERS = ["allow", "cache-control", "content-type", "location", "retry-after", "x-benten-artifact-revision"];

function material(response) {
  const headers = {};
  for (const name of MATERIAL_HEADERS) if (response.headers[name] !== undefined) headers[name] = response.headers[name];
  return { status: response.status, headers, body: `sha256:${createHash("sha256").update(response.body).digest("hex")}:${response.body.length}` };
}

async function both(method, target, options) {
  const [local, remote] = await Promise.all([raw(referencePort, method, target, options), raw(hostedPortBound, method, target, options)]);
  return { local, remote };
}

/**
 * The one known difference: routes see the pathname, never the query, so a
 * servable path whose raw query the classifier rejects (a control character
 * after one decode) is served by the static layer as the page, where the
 * loopback host answers 404. The page ignores that query; nothing else differs.
 */
function isQueryOnlyRejection(target) {
  const queryOffset = target.indexOf("?");
  if (queryOffset === -1) return false;
  return classifyWebIngress(target, { staticPaths }).kind === "html_not_found"
    && classifyWebIngress(target.slice(0, queryOffset), { staticPaths }).kind === "static";
}

async function assertSame(method, target, options) {
  const { local, remote } = await both(method, target, options);
  if (isQueryOnlyRejection(target) && (method === "GET" || method === "HEAD")) {
    assert.equal(local.status, 404, `${method} ${target}`);
    assert.equal(remote.status, 200, `${method} ${target} is the documented query-only difference`);
    return remote;
  }
  assert.deepEqual(material(remote), material(local), `${method} ${target}`);
  return remote;
}

/** Paths the classifier and the host tests single out, including malformed ones. */
const EDGE_TARGETS = [
  "/", "/ja", "/ko", "/zh-Hans", "/zh-Hant", "/stock/NVDA", "/ja/stock/NVDA", "/companies", "/company/openai", "/provider/prestocks/OPENAI",
  "/stock/NVDA.data", "/_root.data",
  "/stock/nvda?ref=catalog", "/zh-Hant/stock/nvda", "/ja/stock/%4eVDA", "/stock/%4EVDA",
  "/en", "/en/stock/NVDA", "/stock/UNKNOWN", "/stock/UNKNOWN.data", "/stock/NVDA/", "/stock/%20NVDA", "/stock/NV%00DA", "/stock/NV%7fDA",
  "/stock/../stock/NVDA", "/stock/%2e%2e/stock/NVDA", "/stock/./NVDA", "/stock//NVDA", "/stock/NV%2fDA", "/stock/%254eVDA", "/ja/stock/NVDA%20",
  "/stock/NVDA?ref=a%0ab", "/api/a%0ab", "//foreign.invalid/stock/NVDA",
  // Withheld from the product: SPCX and VCX (PreStocks track rule) and every Tessera page.
  "/stock/SPCX", "/stock/spcx", "/ja/stock/VCX", "/provider/tessera/tOpenAI", "/ja/provider/tessera/tOpenAI",
  "/company/OpenAI", "/company/openai/", "/en/company/openai", "/provider/prestocks/openai", "/nothing-here", "/ko/provider/prestocks/openai",
  // Built files that are not pages.
  "/index.html", "/stock/NVDA.html", "/ja.html", "/stock/NVDA/index.html", "/__spa-fallback.html", "/.vite/manifest.json",
  "/__not-found/en/company", "/__not-found/en/company.data", "/__not-found/ja/page/index.html", "/assets/missing.js", "/_benten/ingress",
  // API paths.
  "/api", "/api/", "/api/v2/fundamentals?ticker=NVDA", "/api/v2/financials?ticker=NVDA&statement=cf", "/api/v2/fundamentals?ticker=NVDA&ticker=NVDA",
  "/api/fundamentals/NVDA", "/api/financials/NVDA?statement=pl", "/api/v2/unknown", "/api/solana-rpc/extra", "/api/solana-rpc/", "/api/Solana-RPC",
  "/api/prices/extra", "/api/acquisition/quotes?raw=100", "/api/acquisition",
];

/** Casing, slash, suffix and encoding variants of every servable path. */
function variantsOf(path) {
  const variants = [`${path}/`, `${path}.html`, `${path}?q=1`, path.toLowerCase(), path.toUpperCase()];
  const firstLetter = path.search(/[A-Za-z]/);
  if (firstLetter !== -1) variants.push(`${path.slice(0, firstLetter)}%${path.charCodeAt(firstLetter).toString(16)}${path.slice(firstLetter + 1)}`);
  return variants;
}

test("the route table sends exactly the classifier's static decisions to the static layer", () => {
  const targets = new Set(EDGE_TARGETS);
  for (const path of staticPaths) {
    targets.add(path);
    for (const variant of variantsOf(path)) targets.add(variant);
  }
  let checked = 0;
  for (const target of targets) {
    const decision = classifyWebIngress(target, { staticPaths });
    for (const method of ["GET", "HEAD", "POST", "OPTIONS", "DELETE"]) {
      const hit = routeRequest(output, method, target);
      const staticMethod = method === "GET" || method === "HEAD";
      const expectStatic = staticMethod && (decision.kind === "static" || isQueryOnlyRejection(target));
      if (expectStatic) {
        assert.equal(hit.kind, "static", `${method} ${target}`);
        const pathname = target.split("?", 1)[0];
        assert.equal(hit.path, pathname, `${method} ${target}`);
        assert.equal(hit.contentType, inventory.pages.get(pathname).contentType, `${method} ${target}`);
      } else {
        // Never the platform's own 404: the function answers like the host.
        assert.deepEqual(hit, { kind: "function", name: INGRESS_DEST }, `${method} ${target} (${decision.kind})`);
      }
      checked += 1;
    }
  }
  assert.ok(checked > staticPaths.size * 5);
});

test("the published static files are exactly the host inventory", () => {
  // The root file is also addressable as `/index.html`, which the route table sends to the function.
  const published = [...output.staticPaths.keys()].filter((path) => path !== "/index.html");
  assert.deepEqual(published.sort(), [...staticPaths].sort());
  assert.deepEqual(routeRequest(output, "GET", "/index.html"), { kind: "function", name: INGRESS_DEST });
  const data = output.functions.get(INGRESS_DEST);
  assert.equal(data.config.runtime, "nodejs24.x");
  assert.equal(data.config.launcherType, "Nodejs");
  assert.equal(data.config.shouldAddHelpers, false);
});

/**
 * Regression coverage for the header-route length split (`buildRoutes` in
 * `routes.mjs`): a single `src` naming every published data file once grew
 * past the platform's route length bound and failed
 * `process-and-upload-routes` (`invalid_routes`). `buildRoutes` now emits one
 * or more `src`-bounded routes per Cache-Control value instead of one
 * unbounded route; these tests hold that split to the same enumeration
 * guarantee the single route used to provide.
 */
test("chunkEscapedAlternatives keeps every alternative, in original order, within the length bound", () => {
  const alternatives = Array.from({ length: 200 }, (_, index) => `alt-${index}-${"x".repeat(index % 40)}`);
  const chunks = chunkEscapedAlternatives(alternatives, 200);
  assert.deepEqual(chunks.flat(), alternatives, "every alternative is kept, none duplicated, order preserved");
  for (const chunk of chunks) {
    const src = `^(?:${chunk.join("|")})$`;
    assert.ok(src.length <= 200, `${src.length} <= 200`);
  }
});

test("chunkEscapedAlternatives refuses an alternative that cannot fit alone", () => {
  assert.throws(() => chunkEscapedAlternatives(["x".repeat(50)], 10));
});

test("buildRoutes splits one Cache-Control value into src-bounded routes that together match exactly its paths", () => {
  const value = "public, max-age=31536000, immutable";
  // Long enough, and with enough entries, that a single alternation would
  // exceed MAX_HEADER_ROUTE_SRC_LENGTH: the same shape as the real data-file set.
  const paths = Array.from({ length: 400 }, (_, index) => `/data/prices/SYNTHETIC-${index}.${(1e15 + index).toString(16)}.json`);
  const routes = buildRoutes(new Map([[value, new Set(paths)]]));
  const headerRoutes = routes.filter((route) => route.continue === true);
  assert.ok(headerRoutes.length > 1, "the synthetic corpus must not fit in a single route");
  for (const route of headerRoutes) {
    assert.ok(route.src.length <= MAX_HEADER_ROUTE_SRC_LENGTH, `${route.src.length} <= ${MAX_HEADER_ROUTE_SRC_LENGTH}`);
    assert.deepEqual(route.headers, { "cache-control": value });
  }
  // Every enumerated path matches exactly one of the split routes.
  for (const path of paths) {
    const matches = headerRoutes.filter((route) => new RegExp(route.src).test(path));
    assert.equal(matches.length, 1, `${path} must match exactly one header route`);
  }
  // Paths never listed, including near misses, match none of the split routes.
  const unlisted = ["/data/prices/SYNTHETIC-0-extra.json", "/data/prices/", "/data/prices/SYNTHETIC-0", "/data/prices/SYNTHETIC-9999.json", "/other/path"];
  for (const path of unlisted) assert.equal(headerRoutes.some((route) => new RegExp(route.src).test(path)), false, path);
});

test("the published route table's data-file header routes cover exactly the data files and nothing else, within the length bound", () => {
  const dataFiles = [...output.staticPaths.keys()].filter((path) => path.startsWith("/data/statements/") || path.startsWith("/data/prices/"));
  const headerRoutes = output.config.routes.filter((route) => route.continue === true && route.headers?.["cache-control"]);
  assert.ok(headerRoutes.length > 0, "the build publishes at least one data file");
  for (const route of headerRoutes) assert.ok(route.src.length <= MAX_HEADER_ROUTE_SRC_LENGTH, `${route.src.length} <= ${MAX_HEADER_ROUTE_SRC_LENGTH}`);
  for (const path of dataFiles) {
    const matches = headerRoutes.filter((route) => new RegExp(route.src).test(path));
    assert.equal(matches.length, 1, `${path} must match exactly one header route`);
  }
  const otherPublishedPaths = [...output.staticPaths.keys()].filter((path) => !dataFiles.includes(path));
  for (const path of otherPublishedPaths) {
    assert.equal(headerRoutes.some((route) => new RegExp(route.src).test(path)), false, path);
  }
});

test("every emitted route src stays within the platform's route length bound", () => {
  for (const route of output.config.routes) {
    if (typeof route.src === "string") assert.ok(route.src.length <= MAX_HEADER_ROUTE_SRC_LENGTH, `${route.src.length} <= ${MAX_HEADER_ROUTE_SRC_LENGTH}: ${route.src.slice(0, 80)}`);
  }
});

/** The install surface (app IA section 3.4): each locale's manifest, the app icons and /favicon.ico. */
const INSTALL_FILES = [
  ["/manifest.webmanifest", "application/manifest+json"], ["/ja/manifest.webmanifest", "application/manifest+json"],
  ["/ko/manifest.webmanifest", "application/manifest+json"], ["/zh-Hans/manifest.webmanifest", "application/manifest+json"],
  ["/zh-Hant/manifest.webmanifest", "application/manifest+json"], ["/icons/icon-192.png", "image/png"], ["/icons/icon-512.png", "image/png"],
  ["/icons/icon-maskable-512.png", "image/png"], ["/icons/apple-touch-icon.png", "image/png"], ["/icons/favicon-light.png", "image/png"],
  ["/icons/favicon-dark.png", "image/png"], ["/favicon.ico", "image/x-icon"],
];

test("the install manifests and app icons are published with the host's Content-Type", async () => {
  for (const [path, type] of INSTALL_FILES) {
    assert.ok(staticPaths.has(path), `${path} is in the host inventory`);
    assert.ok(output.staticPaths.has(path), `${path} is published`);
    assert.equal(routeRequest(output, "GET", path).kind, "static", path);
    const remote = await assertSame("GET", path);
    assert.equal(remote.status, 200, path);
    assert.equal(remote.headers["content-type"], type, path);
  }
  for (const path of ["/en/manifest.webmanifest", "/icons/icon-1024.png", "/icons/icon.svg"]) await assertSame("GET", path);
});

test("every servable path answers the same over hosted output as over the loopback host", async () => {
  for (const path of staticPaths) {
    const remote = await assertSame("GET", path);
    assert.equal(remote.status, 200, path);
  }
  for (const path of ["/", "/stock/NVDA", "/stock/NVDA.data"]) await assertSame("HEAD", path);
});

/** The published data files (apps/public-web/app/lib/data-files.ts) by directory, with the least count the build publishes. */
const DATA_FILE_KINDS = [["/data/statements/", 100], ["/data/prices/", 12]];

test("the data files (statements and prices) are published with the host's Content-Type and year-long Cache-Control, and only they are", async () => {
  for (const [directory, least] of DATA_FILE_KINDS) {
    const files = [...staticPaths].filter((path) => path.startsWith(directory));
    assert.ok(files.length >= least, `${files.length} files under ${directory}`);
    for (const path of files) {
      assert.match(path, /^\/data\/(?:statements|prices)\/[A-Z0-9][A-Z0-9.-]*\.[0-9a-f]{16}\.json$/, path);
      assert.ok(output.staticPaths.has(path), `${path} is published`);
      assert.equal(routeRequest(output, "GET", path).kind, "static", path);
      const remote = await assertSame("GET", path);
      assert.equal(remote.status, 200, path);
      assert.equal(remote.headers["cache-control"], "public, max-age=31536000, immutable", path);
      assert.equal(remote.headers["content-type"], "application/json; charset=utf-8", path);
    }
    const nvda = files.find((path) => path.startsWith(`${directory}NVDA.`));
    assert.ok(nvda, `the NVDA file under ${directory} is in the host inventory`);
    for (const target of [`${nvda}?v=1`, nvda.toLowerCase(), `${directory}NVDA.0000000000000000.json`, `${directory}NVDA.json`, `${directory}AAPL.json`, `${directory}NVDA`, directory]) {
      for (const method of ["GET", "HEAD", "POST"]) await assertSame(method, target);
    }
  }
  for (const path of ["/", "/stock/NVDA", "/stock/NVDA.data", "/assets/missing.js"]) {
    assert.equal((await raw(hostedPortBound, "GET", path)).headers["cache-control"] === "public, max-age=31536000, immutable", false, path);
  }
});

test("edge, malformed, withheld and API targets answer the same for every method", async () => {
  for (const target of EDGE_TARGETS) {
    for (const method of ["GET", "HEAD", "POST", "OPTIONS", "PUT", "DELETE"]) await assertSame(method, target);
  }
});

test("user-visible acceptance: pages, withheld 404s, canonical 308 and Content-Type", async () => {
  for (const path of ["/", "/ja", "/stock/NVDA", "/ja/stock/NVDA", "/stock/NVDA/sell", "/ja/stock/NVDA/sell", "/companies", "/company/openai", "/provider/prestocks/OPENAI", "/about", "/learn/prestocks", "/legal/privacy", "/ja/legal/privacy", "/zh-Hant/learn/self-custody"]) {
    const response = await raw(hostedPortBound, "GET", path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers["content-type"], "text/html; charset=utf-8", path);
  }
  for (const path of ["/stock/SPCX", "/ja/stock/SPCX", "/stock/SPCX/sell", "/provider/tessera/tOpenAI", "/en", "/nothing-here"]) {
    const response = await raw(hostedPortBound, "GET", path);
    assert.equal(response.status, 404, path);
    assert.equal(response.headers["content-type"], "text/html; charset=utf-8", path);
    assert.equal(response.headers["cache-control"], "no-store", path);
    assert.match(response.body.toString("utf8"), /data-not-found-scope=/, path);
  }
  const redirect = await raw(hostedPortBound, "GET", "/stock/nvda?ref=catalog");
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.location, "/stock/NVDA?ref=catalog");
  const data = await raw(hostedPortBound, "GET", "/stock/NVDA.data");
  assert.equal(data.headers["content-type"], "application/json; charset=utf-8");
  const facts = await raw(hostedPortBound, "GET", "/api/v2/fundamentals?ticker=NVDA");
  assert.equal(facts.status, 200);
  assert.match(facts.headers["content-type"], /^application\/json/);
  assert.equal(facts.headers["cache-control"], "no-store");
  const unknown = await raw(hostedPortBound, "GET", "/api/solana-rpc/extra");
  assert.equal(unknown.status, 404);
  assert.equal(JSON.parse(unknown.body.toString("utf8")).error.code, "unknown_endpoint");
});

const PREVIEW_HOST = "benten-git-vercel-hosting-example.vercel.app";
const RELAY_BODY = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getLatestBlockhash" });
const FEED = JSON.parse(await readFile(join(repoRoot, "packages/pricing/src/pyth-feeds-v1.json"), "utf8")).entries[0].feed_id;

function callerHeaders(host, origin, site) {
  return { host, origin, "sec-fetch-site": site, "content-type": "application/json" };
}

test("the relay answers a same-origin caller on a preview host and refuses a cross-site one, as the host does", async () => {
  for (const host of [PREVIEW_HOST, `127.0.0.1:${hostedPortBound}`]) {
    const origin = host.startsWith("127.0.0.1") ? `http://${host}` : `https://${host}`;
    const same = await both("POST", "/api/solana-rpc", { headers: callerHeaders(host, origin, "same-origin"), body: RELAY_BODY });
    assert.equal(same.remote.status, 200, host);
    assert.deepEqual(material(same.remote), material(same.local), host);
    assert.equal(same.remote.body.includes("benten-output-test.invalid"), false, "the upstream URL is never echoed");
  }
  const cross = await both("POST", "/api/solana-rpc", { headers: callerHeaders(PREVIEW_HOST, "https://evil.example", "cross-site"), body: RELAY_BODY });
  assert.equal(cross.remote.status, 403);
  assert.deepEqual(material(cross.remote), material(cross.local));
  // A client-sent X-Real-IP does not pass the edge.
  const spoofed = await raw(hostedPortBound, "POST", "/api/solana-rpc", { headers: { ...callerHeaders(PREVIEW_HOST, `https://${PREVIEW_HOST}`, "same-origin"), "x-real-ip": "203.0.113.9" }, body: RELAY_BODY });
  assert.equal(spoofed.status, 200);
});

test("prices answer a same-origin caller and refuse a cross-site one, as the host does", async () => {
  const target = `/api/prices?feed=${FEED}`;
  const same = await both("GET", target, { headers: callerHeaders(PREVIEW_HOST, `https://${PREVIEW_HOST}`, "same-origin") });
  assert.equal(same.remote.status, 200);
  assert.deepEqual(
    { ...material(same.remote), body: undefined },
    { ...material(same.local), body: undefined },
  );
  const remoteBody = JSON.parse(same.remote.body.toString("utf8"));
  const localBody = JSON.parse(same.local.body.toString("utf8"));
  assert.deepEqual(Object.keys(remoteBody).sort(), Object.keys(localBody).sort());
  assert.equal(remoteBody.feed_map_revision, localBody.feed_map_revision);
  // Each result is identical except its own observation time.
  const withoutTime = (prices) => prices.map(({ observed_at: observedAt, ...rest }) => (assert.equal(typeof observedAt, "string"), rest));
  assert.deepEqual(withoutTime(remoteBody.prices), withoutTime(localBody.prices));
  assert.equal(remoteBody.prices[0].feed_id, FEED);
  const cross = await both("GET", target, { headers: callerHeaders(PREVIEW_HOST, "https://evil.example", "cross-site") });
  assert.equal(cross.remote.status, 403);
  assert.deepEqual(material(cross.remote), material(cross.local));
  const invalid = await both("GET", "/api/prices?feed=nope", { headers: callerHeaders(PREVIEW_HOST, `https://${PREVIEW_HOST}`, "same-origin") });
  assert.equal(invalid.remote.status, 400);
  assert.deepEqual(material(invalid.remote), material(invalid.local));
});

const MCP_HEADERS = { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" };
const MCP_INITIALIZE = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "output-test", version: "0" } } });

test("the remote MCP endpoint answers a connector without Origin and refuses a foreign browser Origin, as the host does", async () => {
  const connector = await both("POST", "/api/mcp", { headers: { ...MCP_HEADERS, host: PREVIEW_HOST }, body: MCP_INITIALIZE });
  assert.equal(connector.remote.status, 200);
  assert.deepEqual(material(connector.remote), material(connector.local));
  assert.equal(JSON.parse(connector.remote.body.toString("utf8")).result.serverInfo.name, "benten");
  const list = await both("POST", "/api/mcp", { headers: { ...MCP_HEADERS, host: PREVIEW_HOST }, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) });
  assert.equal(list.remote.status, 200);
  assert.deepEqual(material(list.remote), material(list.local));
  const foreign = await both("POST", "/api/mcp", { headers: { ...MCP_HEADERS, host: PREVIEW_HOST, origin: "https://evil.example" }, body: MCP_INITIALIZE });
  assert.equal(foreign.remote.status, 403);
  assert.deepEqual(material(foreign.remote), material(foreign.local));
  const names = JSON.parse(list.remote.body.toString("utf8")).result.tools.map((tool) => tool.name);
  assert.ok(names.includes("prepare_purchase"), "the hosted function offers prepare_purchase");
  // The stub upstream has no route mints, so both sides fail closed the same way.
  const prepare = await both("POST", "/api/mcp", { headers: { ...MCP_HEADERS, host: PREVIEW_HOST }, body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "prepare_purchase", arguments: { amount_usdc: "5" } } }) });
  assert.equal(prepare.remote.status, 200);
  assert.deepEqual(material(prepare.remote), material(prepare.local));
  assert.equal(JSON.parse(prepare.remote.body.toString("utf8")).result.structuredContent.data.reason, "service_unavailable");
  const over = await both("POST", "/api/mcp", { headers: { ...MCP_HEADERS, host: PREVIEW_HOST }, body: JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "prepare_purchase", arguments: { amount_usdc: "10.01" } } }) });
  assert.equal(JSON.parse(over.remote.body.toString("utf8")).result.structuredContent.data.reason, "over_limit");
  assert.deepEqual(material(over.remote), material(over.local));
  // The ticker reaches the hosted reader: a registry product with no route is refused before any upstream read, on both sides.
  const unrouted = await both("POST", "/api/mcp", { headers: { ...MCP_HEADERS, host: PREVIEW_HOST }, body: JSON.stringify({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "prepare_purchase", arguments: { ticker: "AMZN", amount_usdc: "2" } } }) });
  assert.equal(JSON.parse(unrouted.remote.body.toString("utf8")).result.structuredContent.data.reason, "not_purchasable");
  assert.deepEqual(material(unrouted.remote), material(unrouted.local));
  const own = await both("POST", "/api/mcp", { headers: { ...MCP_HEADERS, host: PREVIEW_HOST, origin: `https://${PREVIEW_HOST}` }, body: MCP_INITIALIZE });
  assert.equal(own.remote.status, 200);
  const get = await both("GET", "/api/mcp", { headers: { host: PREVIEW_HOST } });
  assert.equal(get.remote.status, 405);
  assert.deepEqual(material(get.remote), material(get.local));
});

/**
 * The purchase quote reader (and the pool SDK it carries) is a separate chunk
 * of the function, loaded on the first prepare_purchase quote only. A fresh
 * process records every module it loads while it answers the relay, prices,
 * facts, 404 and the other MCP tools, then one prepare_purchase call.
 */
const LAZY_PROBE = `
import { registerHooks } from "node:module";
import { createServer, request } from "node:http";
const loaded = [];
registerHooks({ load(url, context, nextLoad) { loaded.push(url); return nextLoad(url, context); } });
const ingress = (await import(process.env.BENTEN_INGRESS)).default;
const server = createServer((incoming, outgoing) => { incoming.headers["x-real-ip"] = "127.0.0.1"; void ingress(incoming, outgoing); });
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const port = server.address().port;
const host = "127.0.0.1:" + port;
function send(method, path, headers = {}, body) {
  return new Promise((done, fail) => {
    const outgoing = request({ host: "127.0.0.1", port, method, path, headers: { host, ...headers } }, (incoming) => {
      const chunks = [];
      incoming.on("data", (chunk) => chunks.push(chunk));
      incoming.on("end", () => done({ status: incoming.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
    });
    outgoing.on("error", fail);
    outgoing.end(body);
  });
}
const quoteChunkLoaded = () => loaded.some((url) => /\\/chunks\\/server-quote-[^/]*\\.mjs$/.test(url));
const mcp = { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" };
const call = (id, name, args) => JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });
const statuses = {};
statuses.relay = (await send("POST", "/api/solana-rpc", { "content-type": "application/json", origin: "http://" + host, "sec-fetch-site": "same-origin" }, JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getSlot" }))).status;
statuses.prices = (await send("GET", "/api/prices?feed=" + process.env.BENTEN_FEED, { origin: "http://" + host, "sec-fetch-site": "same-origin" })).status;
statuses.facts = (await send("GET", "/api/v2/fundamentals?ticker=NVDA")).status;
statuses.notFound = (await send("GET", "/no-such-page")).status;
statuses.tools = (await send("POST", "/api/mcp", mcp, JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }))).status;
statuses.fundamentals = (await send("POST", "/api/mcp", mcp, call(2, "get_fundamentals", { ticker: "NVDA" }))).status;
const before = quoteChunkLoaded();
const prepare = JSON.parse((await send("POST", "/api/mcp", mcp, call(3, "prepare_purchase", { amount_usdc: "5" }))).body);
const after = quoteChunkLoaded();
server.close();
process.stdout.write(JSON.stringify({ statuses, before, after, reason: prepare.result.structuredContent.data.reason, entryLoaded: loaded.some((url) => url.endsWith("/index.mjs")) }));
`;

test("the function loads the purchase quote reader on the first prepare_purchase quote only", async () => {
  const { execFile } = await import("node:child_process");
  const { readdir } = await import("node:fs/promises");
  const chunks = await readdir(join(ingressFunction.directory, "chunks"));
  const quoteChunk = chunks.find((name) => /^server-quote-.*\.mjs$/.test(name));
  assert.ok(quoteChunk, "the quote reader is its own chunk");
  const entry = await readFile(join(ingressFunction.directory, ingressFunction.config.handler), "utf8");
  assert.ok(entry.includes(`import("./chunks/${quoteChunk}")`), "the entry imports the quote chunk dynamically");
  assert.ok(!entry.includes(`from "./chunks/${quoteChunk}"`), "the entry does not import the quote chunk statically");
  assert.ok(!entry.includes("swapQuote"), "the pool SDK is not in the entry");
  const stdout = await new Promise((done, fail) => execFile(process.execPath, ["--input-type=module", "-e", LAZY_PROBE], {
    env: {
      ...process.env,
      BENTEN_INGRESS: pathToFileURL(join(ingressFunction.directory, ingressFunction.config.handler)).href,
      BENTEN_FEED: FEED,
      SOLANA_RPC_UPSTREAM_URL: "https://rpc.benten-lazy-probe.invalid/",
    },
    timeout: 60_000,
  }, (error, out, err) => (error ? fail(new Error(`${error.message}\n${err}`)) : done(out))));
  const probe = JSON.parse(stdout);
  assert.equal(probe.entryLoaded, true);
  const { relay, prices, ...rest } = probe.statuses;
  assert.deepEqual(rest, { facts: 200, notFound: 404, tools: 200, fundamentals: 200 });
  assert.ok(relay >= 200 && prices >= 200, "relay and prices answered (the upstream is unreachable on purpose)");
  assert.equal(probe.before, false, "no route before prepare_purchase loaded the quote chunk");
  assert.equal(probe.after, true, "prepare_purchase loaded the quote chunk");
  assert.equal(probe.reason, "service_unavailable");
});
