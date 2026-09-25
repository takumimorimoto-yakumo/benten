import assert from "node:assert/strict";
import { once } from "node:events";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appDirectory = dirname(fileURLToPath(import.meta.url));
const { startCapsuleHost } = await import("../build-host/host/server.js");
const clientDirectory = process.env.BENTEN_PUBLIC_WEB_CLIENT_DIRECTORY
  ? join(appDirectory, "..", process.env.BENTEN_PUBLIC_WEB_CLIENT_DIRECTORY)
  : join(appDirectory, "..", "build-capsule", "client");
const host = await startCapsuleHost({ clientDirectory });
console.info(`capsule host: ${host.capsuleAddress}`);

test.after(async () => {
  host.close();
  await once(host, "close");
});

test("serves generated documents and data only for canonical paths", async () => {
  const document = await fetch(`${host.capsuleAddress}/stock/NVDA`);
  assert.equal(document.status, 200);
  assert.match(document.headers.get("content-type") ?? "", /^text\/html/);
  const html = await document.text();
  assert.match(html, /static-dossier/);
  // The runtime labels itself a development preview until a reviewed public release.
  assert.match(html, /Development preview/);
  assert.equal(html.includes("Under construction"), false);

  const data = await fetch(`${host.capsuleAddress}/stock/NVDA.data`);
  assert.equal(data.status, 200);
  assert.match(data.headers.get("content-type") ?? "", /^application\/json/);
  assert.match(await data.text(), /static-foundation-v1/);

  const head = await fetch(`${host.capsuleAddress}/stock/NVDA`, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
});

test("redirects a validated casing alias but denies fallback, unknown, and malformed paths", async () => {
  const redirect = await fetch(`${host.capsuleAddress}/stock/nvda?ref=catalog`, { redirect: "manual" });
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get("location"), "/stock/NVDA?ref=catalog");

  // SPCX and VCX stay in the registry data but are withheld from the product (PreStocks track rule).
  for (const path of ["/__spa-fallback.html", "/stock/UNKNOWN", "/stock/SPCX", "/ja/stock/VCX", "/stock/spcx", "/en", "/stock/NVDA/", "/api/a%0ab"]) {
    const response = await fetch(`${host.capsuleAddress}${path}`);
    assert.equal(response.status, 404, path);
  }
});

test("dispatches fixed API prefixes as unavailable JSON rather than a financial success", async () => {
  const facts = await fetch(`${host.capsuleAddress}/api/v2/financials?ticker=NVDA`);
  assert.equal(facts.status, 503);
  assert.equal(facts.headers.get("cache-control"), "no-store");
  assert.deepEqual(await facts.json(), { status: "unavailable", service: "facts" });

  const acquisition = await fetch(`${host.capsuleAddress}/api/acquisition/quotes`);
  assert.equal(acquisition.status, 503);
  assert.deepEqual(await acquisition.json(), { status: "unavailable", service: "acquisition" });
});

test("serves provider and company pages only at their exact canonical paths", async () => {
  for (const path of ["/provider/prestocks/OPENAI", "/provider/prestocks/KALSHI", "/company/openai", "/company/spacex", "/ja/company/openai", "/ko/provider/prestocks/KALSHI", "/company/nvidia", "/zh-Hant/company/nvidia", "/companies", "/ja/companies"]) {
    const response = await fetch(`${host.capsuleAddress}${path}`, { redirect: "manual" });
    assert.equal(response.status, 200, path);
  }
  for (const path of [
    "/company/OpenAI", "/company/OPENAI", "/company/unknown", "/company/figureai", "/company/openai/", "/en/company/openai",
    // The fail-closed US-listed tokens (BAC, XOM, MSTR) have no company page under any likely slug.
    "/company/bank-of-america-corp", "/company/exxon-mobil", "/company/exxonmobil", "/company/bofa-finance", "/company/microstrategy", "/company/NVIDIA", "/companies/",
    "/provider/prestocks/openai", "/provider/PreStocks/OPENAI", "/provider/unknown/OPENAI", "/provider/prestocks/UNKNOWN", "/provider/prestocks",
    "/__not-found/en/company", "/__not-found/en/company.data",
  ]) {
    const response = await fetch(`${host.capsuleAddress}${path}`, { redirect: "manual" });
    assert.equal(response.status, 404, path);
  }
});

test("a 404 carries the locale's scoped, neutral not-found body with the right way back", async () => {
  const cases = [
    ["/company/OpenAI", "en", "company", 'href="/companies"'],
    ["/ja/company/bank-of-america-corp", "ja", "company", 'href="/ja/companies"'],
    ["/ko/provider/prestocks/openai", "ko", "provider", 'href="/ko/companies"'],
    ["/zh-Hans/stock/UNKNOWN", "zh-Hans", "stock", 'href="/zh-Hans/companies"'],
    ["/nothing-here", "en", "page", 'href="/"'],
  ];
  for (const [path, locale, scope, back] of cases) {
    const response = await fetch(`${host.capsuleAddress}${path}`);
    assert.equal(response.status, 404, path);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html/, path);
    const html = await response.text();
    assert.match(html, new RegExp(`<html lang="${locale}"`), path);
    assert.ok(html.includes(`data-not-found-scope="${scope}"`), path);
    assert.ok(html.includes(back), `${path} back link`);
    // Its one script is the inline theme boot script, which loads nothing and never hydrates.
    assert.equal(/<script\b/.test(html.replace(/<script data-theme-boot="">[\s\S]*?<\/script>/, "")), false, `${path} is not hydrated as another page`);
  }
  const head = await fetch(`${host.capsuleAddress}/company/OpenAI`, { method: "HEAD" });
  assert.equal(head.status, 404);
  assert.equal(await head.text(), "");
});

test("serves each locale's Web App Manifest and the app icons with their content types", async () => {
  for (const [path, startUrl] of [["/manifest.webmanifest", "/"], ["/ja/manifest.webmanifest", "/ja"], ["/zh-Hant/manifest.webmanifest", "/zh-Hant"]]) {
    const response = await fetch(`${host.capsuleAddress}${path}`);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("content-type"), "application/manifest+json");
    const manifest = await response.json();
    assert.equal(manifest.start_url, startUrl);
    assert.equal(manifest.display, "standalone");
  }
  for (const [path, type] of [["/icons/icon-192.png", "image/png"], ["/icons/icon-maskable-512.png", "image/png"], ["/icons/apple-touch-icon.png", "image/png"], ["/icons/favicon-light.png", "image/png"], ["/icons/favicon-dark.png", "image/png"]]) {
    const response = await fetch(`${host.capsuleAddress}${path}`);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("content-type"), type);
    assert.ok((await response.arrayBuffer()).byteLength > 0, path);
  }
  // `/en` is never a path; unknown icons and a service worker do not exist.
  for (const path of ["/en/manifest.webmanifest", "/xx/manifest.webmanifest", "/icons/icon-1024.png", "/icons/icon.svg", "/sw.js", "/.well-known/assetlinks.json"]) {
    const response = await fetch(`${host.capsuleAddress}${path}`);
    assert.equal(response.status, 404, path);
  }
});

test("serves each ticker's statements file as JSON cached for a year, and nothing else under its prefix", async () => {
  const { readdir } = await import("node:fs/promises");
  const names = await readdir(join(clientDirectory, "data", "statements"));
  const nvda = names.find((name) => name.startsWith("NVDA."));
  assert.ok(nvda, "the NVDA statements file is built");
  const response = await fetch(`${host.capsuleAddress}/data/statements/${nvda}`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(response.headers.get("cache-control"), "public, max-age=31536000, immutable");
  const file = await response.json();
  assert.equal(file.ticker, "NVDA");
  assert.ok(file.statements.years.length > 0);
  // Documents are not cached for a year: only the digest-named files are.
  assert.equal((await fetch(`${host.capsuleAddress}/stock/NVDA`)).headers.get("cache-control"), null);
  // A name with another digest, another ticker's shape or a lowercase name is not a file.
  for (const path of ["/data/statements/NVDA.0000000000000000.json", "/data/statements/nvda.json", `/data/statements/${nvda.toLowerCase()}`, "/data/statements/", "/data/statements"]) {
    const missing = await fetch(`${host.capsuleAddress}${path}`);
    assert.equal(missing.status, 404, path);
    assert.notEqual(missing.headers.get("cache-control"), "public, max-age=31536000, immutable", path);
  }
});

test("serves each bundled price file as JSON cached for a year, named by its digest, and nothing else under its prefix", async () => {
  const { readdir } = await import("node:fs/promises");
  const names = await readdir(join(clientDirectory, "data", "prices"));
  const nvda = names.find((name) => name.startsWith("NVDA."));
  assert.ok(nvda, "the NVDA price file is built");
  assert.match(nvda, /^NVDA\.[0-9a-f]{16}\.json$/);
  const response = await fetch(`${host.capsuleAddress}/data/prices/${nvda}`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(response.headers.get("cache-control"), "public, max-age=31536000, immutable");
  const file = await response.json();
  assert.equal(file.schema_version, "benten.public-web.price-series.v1");
  assert.equal(file.ticker, "NVDA");
  // Another digest, the undigested name, casing, a ticker without a series and other names under the directory are not files.
  for (const path of ["/data/prices/NVDA.0000000000000000.json", "/data/prices/NVDA.json", "/data/prices/nvda.json", `/data/prices/${nvda.toLowerCase()}`, "/data/prices/NVDA", "/data/prices/AAPL.json", "/data/prices/", `/data/prices/${nvda}.data`, "/data/NVDA.json"]) {
    const missing = await fetch(`${host.capsuleAddress}${path}`, { redirect: "manual" });
    assert.equal(missing.status, 404, path);
    assert.notEqual(missing.headers.get("cache-control"), "public, max-age=31536000, immutable", path);
  }
});
