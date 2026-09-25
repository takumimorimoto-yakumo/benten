import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const origin = process.env.LEGACY_ORIGIN;
if (!origin || !/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) {
  throw new Error("LEGACY_ORIGIN must be an explicit loopback HTTP origin");
}

const getCases = [
  ["v1-fundamentals-known", "GET", "/api/fundamentals/NVDA"],
  ["v1-fundamentals-unknown", "GET", "/api/fundamentals/ZZUNKNOWN"],
  ["v1-fundamentals-ineligible", "GET", "/api/fundamentals/SPY"],
  ["v1-financials-statement", "GET", "/api/financials/NVDA?statement=cf"],
  ["v1-financials-invalid-statement", "GET", "/api/financials/NVDA?statement=quarterly"],
  ["v2-fundamentals-known", "GET", "/api/v2/fundamentals?ticker=NVDA"],
  ["v2-fundamentals-repeated", "GET", "/api/v2/fundamentals?ticker=NVDA&ticker=MSFT"],
  ["v2-financials-unknown-mint", "GET", "/api/v2/financials?mint=11111111111111111111111111111111"],
];

const knownPaths = [
  "/api/fundamentals/NVDA",
  "/api/financials/NVDA?statement=cf",
  "/api/v2/fundamentals?ticker=NVDA",
  "/api/v2/financials?ticker=NVDA&statement=cf",
];

const cases = [
  ...getCases,
  ...getCases.map(([id, , path]) => [`${id}-head`, "HEAD", path]),
  ...knownPaths.flatMap((path, index) => [
    [`known-${index + 1}-options`, "OPTIONS", path],
    [`known-${index + 1}-post`, "POST", path],
  ]),
  ["unknown-api-get", "GET", "/api/unknown"],
  ["unknown-api-head", "HEAD", "/api/unknown"],
  ["unknown-api-options", "OPTIONS", "/api/unknown"],
  ["unknown-api-post", "POST", "/api/unknown"],
];

const captured = [];
for (const [id, method, path] of cases) {
  const response = await fetch(`${origin}${path}`, { method });
  const body = await response.text();
  captured.push({
    id, method, path, status: response.status,
    headers: Object.fromEntries(["allow", "cache-control", "content-type", "x-benten-artifact-revision"]
      .map((name) => [name, response.headers.get(name)]).filter(([, value]) => value !== null)),
    body: path.startsWith("/api/unknown") ? "" : body,
    body_sha256: createHash("sha256").update(body).digest("hex"),
    parity: path.startsWith("/api/unknown")
      ? "provenance-only-intentional-json-normalization"
      : method === "GET" || method === "HEAD"
        ? "literal"
        : "provenance-only-intentional-method-normalization",
  });
}

const target = resolve(dirname(fileURLToPath(import.meta.url)), "../tests/golden/legacy-http.json");
await mkdir(dirname(target), { recursive: true });
await writeFile(target, `${JSON.stringify({
  schema_version: "benten.legacy-http-oracle.v2",
  source_revision: process.env.LEGACY_SOURCE_REVISION ?? "e3efffd",
  capture_transport: "real-local-http",
  cases: captured,
}, null, 2)}\n`);
process.stdout.write(`${target}\n`);
