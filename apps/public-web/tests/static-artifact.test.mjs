import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readdir, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { companyMap, getAnnualHistory, getStatementSeries, STATEMENT_DETAIL_NAMES, isWithheldFromProduct, listedCompanyMap, listPublicAssets, productXStockEntries, providerAssets, xstocks } from "@benten/registry";
import { onchainDailySeries, onchainDailyTickers } from "@benten/pricing/onchain-daily";
import { forbiddenWords, markedWords, withoutAccountingTerms, withoutMarked } from "./app-vocabulary.mjs";
import { DOUBLED_PUNCTUATION, forbiddenMatches } from "./reference-vocabulary.mjs";
import { staticPageVocabularyFindings } from "./static-pages-vocabulary.mjs";

/** The inline theme boot script at the top of every document's head (features/theme). */
const THEME_BOOT = /<script data-theme-boot="">([\s\S]*?)<\/script>/;

function withoutThemeBoot(html) {
  return html.replace(THEME_BOOT, "");
}

const appDirectory = dirname(fileURLToPath(import.meta.url));
const clientDirectory = process.env.BENTEN_PUBLIC_WEB_CLIENT_DIRECTORY
  ? join(appDirectory, "..", process.env.BENTEN_PUBLIC_WEB_CLIENT_DIRECTORY)
  : join(appDirectory, "..", "build-capsule", "client");

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  }));
  return nested.flat();
}

/** How React writes text into HTML (only the characters these names contain). */
function escapeHtml(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("'", "&#x27;").replaceAll('"', "&quot;");
}

function publicCatalog() {
  const catalog = listPublicAssets({});
  assert.equal(catalog.found, true, "the reviewed public catalog must be buildable");
  return catalog;
}

/** Published companies: the reviewed private map and the generated US-listed map (its excluded tokens get no page). */
const PUBLISHED_COMPANIES = [...companyMap.companies, ...listedCompanyMap.companies];
/** Provider instrument and company pages per locale, and not-found bodies (four scopes) per locale. */
const REFERENCE_PAGES_PER_LOCALE = 8 + 137;
/** The companies list per locale. */
const DIRECTORY_PAGES_PER_LOCALE = 1;
const NOT_FOUND_BODIES = 5 * 4;
/** App shell tab pages per locale: Holdings and Activity. */
const APP_SHELL_PAGES_PER_LOCALE = 2;
/** Product subpages per locale: an evidence page per xStock and provider instrument, and the one buy flow frame. */
const productSubpagesPerLocale = (catalog) => catalog.items.length + providerAssets.entries.length + 1;
/** Static information pages per locale: About, four learn topics and three legal documents. */
const STATIC_INFORMATION_PAGES = ["/about", "/learn/xstocks", "/learn/prestocks", "/learn/reference-prices", "/learn/self-custody", "/legal/terms", "/legal/privacy", "/legal/disclaimer"];

test("the capsule has exactly one HTML document and one data artifact per generated public path", async () => {
  const catalog = publicCatalog();
  const expected = 5 * (catalog.items.length + 1) + 5 * REFERENCE_PAGES_PER_LOCALE + 5 * APP_SHELL_PAGES_PER_LOCALE + 5 * DIRECTORY_PAGES_PER_LOCALE + NOT_FOUND_BODIES + 5 * productSubpagesPerLocale(catalog) + 5 * STATIC_INFORMATION_PAGES.length;
  assert.equal(expected, 2370);
  assert.equal(companyMap.companies.length, 8);
  assert.equal(listedCompanyMap.companies.length, 129);
  assert.equal(providerAssets.entries.length + PUBLISHED_COMPANIES.length, REFERENCE_PAGES_PER_LOCALE);

  const output = await files(clientDirectory);
  const html = output.filter((path) => path.endsWith(".html"));
  const data = output.filter((path) => path.endsWith(".data"));
  const canonicalHtml = html.filter((path) => !path.endsWith("/__spa-fallback.html"));

  assert.equal(canonicalHtml.length, expected);
  assert.equal(data.length, expected);
  await Promise.all([
    readFile(join(clientDirectory, "index.html")),
    readFile(join(clientDirectory, "_root.data")),
    readFile(join(clientDirectory, "stock", "NVDA", "index.html")),
    readFile(join(clientDirectory, "stock", "NVDA.data")),
    readFile(join(clientDirectory, "ja", "index.html")),
    readFile(join(clientDirectory, "ja.data")),
  ]);
  assert.ok(html.some((path) => path.endsWith("/__spa-fallback.html")), "the host must explicitly deny the SPA fallback");
});

/** Never in any client file. */
const FORBIDDEN_CLIENT_TEXT = ["@react-router/node", "node-fetch-server", "financials-snapshot"];
/**
 * Solana SDK and DEX identifiers: allowed only in the purchase island chunk
 * and the chunks that only it reaches (case-insensitive).
 */
const PURCHASE_ISLAND_ONLY_TEXT = [
  "@solana/", "wallet-adapter", "meteora", "dlmm", "raydium", "jupiter",
  // The `buffer` package's own error text: the Buffer polyfill ships only with the island.
  "unknown encoding",
];
/**
 * Wallet Standard detection and connect identifiers: allowed in the app
 * shell's one wallet-session chunk, which every hydrating document loads (the
 * lifted session), and in the purchase island. The shell carries no Solana
 * SDK; the sign-and-send feature name appears with it only because
 * `packages/purchase/src/wallet-standard.ts` filters wallets by it, and the
 * one call that uses it is made from the island's `approveOnce`.
 */
const SHELL_WALLET_TEXT = ["standard:connect", "wallet-standard:register-wallet", "solana:mainnet"];
const PURCHASE_ISLAND_CHUNK = /^assets\/purchase-island-[\w-]+\.js$/;
/**
 * The Mobile Wallet Adapter registration (Android only): a dynamic chunk that
 * only the shell's wallet-session chunk imports, and only on Android. It
 * carries the MWA library, which registers one more Wallet Standard wallet,
 * and the Solana SDK code that library uses; never DEX code or the Buffer
 * polyfill, and it never reaches the purchase island.
 */
const MOBILE_WALLET_CHUNK = /^assets\/mobile-wallet-registration-[\w-]+\.js$/;
/**
 * The chart drawing island (Recharts through the shadcn chart component): a
 * dynamic chunk that only the chart section loads after hydration, and only
 * on company and product pages. Recharts' own class names mark its code.
 */
const CHART_ISLAND_CHUNK = /^assets\/chart-island-[\w-]+\.js$/;
const CHART_ISLAND_TEXT = "recharts-";
/** Route chunks of the pages that carry a chart: company pages and the two kinds of product page. */
const CHART_ROUTE_CHUNK = /^assets\/(?:locale-)?(?:company|dossier|provider)-[\w-]+\.js$/;
/** Island-only words the MWA chunks may carry: the SDK's package scope, and the library's own `mobile-wallet-adapter` names. */
const MOBILE_WALLET_ALLOWED_TEXT = ["@solana/", "wallet-adapter"];

/** Static ES imports (`import ... from "./x.js"`, `import "./x.js"`, `export ... from`), resolved to client paths. */
const STATIC_IMPORT = /(?:^|[;\s}])(?:import|export)\s*(?:[\w$*{}\s,]*?\s*from\s*)?["'`]([^"'`()]+\.js)["'`]/g;
/** Dynamic `import("./x.js")` sites. */
const DYNAMIC_IMPORT = /\bimport\(\s*["'`]([^"'`]+\.js)["'`]\s*\)/g;

function resolveSpecifier(fromPath, specifier) {
  if (specifier.startsWith("/")) return specifier.slice(1);
  return join(dirname(fromPath), specifier).replaceAll("\\", "/");
}

function specifiers(text, pattern, fromPath) {
  return [...text.matchAll(pattern)].map((match) => resolveSpecifier(fromPath, match[1]));
}

async function clientGraph() {
  const output = await files(clientDirectory);
  const chunks = new Map();
  for (const path of output.filter((file) => file.endsWith(".js"))) {
    const relativePath = relative(clientDirectory, path).replaceAll("\\", "/");
    const text = await readFile(path, "utf8");
    chunks.set(relativePath, { text, imports: specifiers(text, STATIC_IMPORT, relativePath), dynamicImports: specifiers(text, DYNAMIC_IMPORT, relativePath) });
  }
  const closure = (roots, { followDynamic }) => {
    const seen = new Set();
    const pending = [...roots];
    while (pending.length) {
      const path = pending.pop();
      if (seen.has(path)) continue;
      seen.add(path);
      const chunk = chunks.get(path);
      assert.ok(chunk, `referenced client chunk ${path} exists`);
      pending.push(...chunk.imports, ...(followDynamic ? chunk.dynamicImports : []));
    }
    return seen;
  };
  // Chunks reached only through the MWA registration: the entry, and any chunk whose every importer is one of them.
  const mobileWalletOnly = new Set([...chunks.keys()].filter((path) => MOBILE_WALLET_CHUNK.test(path)));
  for (let grew = true; grew;) {
    grew = false;
    for (const path of chunks.keys()) {
      if (mobileWalletOnly.has(path)) continue;
      const importers = [...chunks].filter(([, chunk]) => chunk.imports.includes(path) || chunk.dynamicImports.includes(path)).map(([from]) => from);
      if (importers.length > 0 && importers.every((from) => mobileWalletOnly.has(from))) {
        mobileWalletOnly.add(path);
        grew = true;
      }
    }
  }
  /** Island-only words a chunk outside the purchase island must not carry. */
  const forbiddenOutsideIsland = (path) => mobileWalletOnly.has(path) ? PURCHASE_ISLAND_ONLY_TEXT.filter((word) => !MOBILE_WALLET_ALLOWED_TEXT.includes(word)) : PURCHASE_ISLAND_ONLY_TEXT;
  return { output, chunks, closure, mobileWalletOnly, forbiddenOutsideIsland };
}

/** Every script a document loads before any user action: modulepreloads, module scripts and the imports they name. */
function documentRoots(html) {
  const roots = new Set();
  for (const match of html.matchAll(/<link\b[^>]*rel="modulepreload"[^>]*href="\/([^"]+)"/g)) roots.add(match[1]);
  for (const match of html.matchAll(/<script\b[^>]*\bsrc="\/([^"]+)"/g)) roots.add(match[1]);
  for (const match of html.matchAll(/<script\b[^>]*type="module"[^>]*>([\s\S]*?)<\/script>/g)) {
    for (const specifier of [...specifiers(match[1], STATIC_IMPORT, "index.html"), ...specifiers(match[1], DYNAMIC_IMPORT, "index.html")]) roots.add(specifier);
  }
  return roots;
}

test("the purchase island is a dynamic chunk outside every document's static graph", async () => {
  const { output, chunks, closure, mobileWalletOnly, forbiddenOutsideIsland } = await clientGraph();
  const dossierChunk = [...chunks].find(([, chunk]) => chunk.dynamicImports.some((path) => PURCHASE_ISLAND_CHUNK.test(path)));
  const islandEntries = [...chunks.keys()].filter((path) => PURCHASE_ISLAND_CHUNK.test(path));
  assert.equal(islandEntries.length, 1, "exactly one purchase island entry chunk");
  assert.ok(dossierChunk, "a route chunk loads the island through a dynamic import");
  const [islandEntry] = islandEntries;

  const html = output.filter((path) => path.endsWith(".html"));
  const staticGraph = new Set();
  const closures = new Map();
  for (const path of html) {
    const text = await readFile(path, "utf8");
    const roots = [...documentRoots(text)].sort();
    // Not-found bodies are served under the requested URL, so they ship without client scripts.
    const scriptless = path.endsWith("__spa-fallback.html") || relative(clientDirectory, path).startsWith("__not-found/");
    assert.ok(scriptless ? roots.length === 0 || path.endsWith("__spa-fallback.html") : roots.length > 0, `${relative(clientDirectory, path)} client graph`);
    const key = roots.join("\n");
    if (!closures.has(key)) closures.set(key, closure(roots, { followDynamic: false }));
    for (const chunk of closures.get(key)) staticGraph.add(chunk);
    assert.equal(text.includes("purchase-island-"), false, `${relative(clientDirectory, path)} never names the island chunk`);
  }
  // The regex must see real static edges, or an empty graph would pass trivially.
  assert.ok(chunks.get(dossierChunk[0]).imports.length > 0, "static imports are detected in the route chunk");
  assert.ok(staticGraph.has(dossierChunk[0]), "the chunk with the dynamic import is itself part of the Dossier graph");

  const islandGraph = closure([islandEntry], { followDynamic: true });
  // Generic libraries the chart island shares with the purchase island (an event emitter) are not island-only: they keep the island-only word check below.
  const chartGraph = closure([...chunks.keys()].filter((path) => CHART_ISLAND_CHUNK.test(path)), { followDynamic: true });
  const islandOnly = new Set([...islandGraph].filter((path) => !staticGraph.has(path) && !chartGraph.has(path)));
  assert.equal(staticGraph.has(islandEntry), false, "no document statically loads the island entry");
  assert.ok(islandOnly.has(islandEntry));
  for (const path of islandOnly) {
    for (const [from, chunk] of chunks) {
      if (islandOnly.has(from)) continue;
      assert.equal(chunk.imports.includes(path), false, `${from} must not statically import island chunk ${path}`);
    }
  }

  const islandText = [...islandOnly].map((path) => chunks.get(path).text).join("\n").toLowerCase();
  assert.ok(islandText.includes("@solana/") && islandText.includes("meteora"), "the island chunk carries the Solana SDK and DEX code");

  // The lifted wallet session: exactly one chunk has the Wallet Standard code, and it is in the shell's static graph.
  // The Android-only MWA registration chunks carry the MWA wallet's own copy of it (see the MWA test below).
  const walletChunks = [...chunks].filter(([path, chunk]) => !mobileWalletOnly.has(path) && chunk.text.includes("standard:connect")).map(([path]) => path);
  assert.equal(walletChunks.length, 1, `one wallet-session chunk: ${walletChunks.join(", ")}`);
  assert.ok(staticGraph.has(walletChunks[0]), "the wallet session is part of the documents' static graph");
  const walletText = chunks.get(walletChunks[0]).text.toLowerCase();
  for (const word of SHELL_WALLET_TEXT) assert.ok(walletText.includes(word), `the wallet-session chunk carries ${word}`);
  const sendFeature = "solana:signAndSend" + "Transaction";
  assert.deepEqual([...chunks].filter(([path, chunk]) => !mobileWalletOnly.has(path) && chunk.text.includes(sendFeature)).map(([path]) => path), walletChunks, "outside the MWA registration, the sign-and-send feature name exists only in the wallet-session chunk");
  for (const [path, chunk] of chunks) {
    const lower = chunk.text.toLowerCase();
    for (const forbidden of FORBIDDEN_CLIENT_TEXT) assert.equal(chunk.text.includes(forbidden), false, `${path} must not include ${forbidden}`);
    if (islandOnly.has(path)) continue;
    for (const forbidden of forbiddenOutsideIsland(path)) assert.equal(lower.includes(forbidden), false, `${path} is outside the purchase island and must not include ${forbidden}`);
  }
  const staticText = [...staticGraph].map((path) => chunks.get(path).text).join("\n");
  assert.equal(staticText.includes("hydrateRoot"), true, "the static documents retain a React client hydration graph");
});

test("the chart island is a dynamic chunk that only company and product pages can reach, and Recharts lives only there", async () => {
  const { output, chunks, closure } = await clientGraph();
  const entries = [...chunks.keys()].filter((path) => CHART_ISLAND_CHUNK.test(path));
  assert.equal(entries.length, 1, "exactly one chart island entry chunk");
  const [entry] = entries;
  assert.equal([...chunks.values()].some((chunk) => chunk.imports.includes(entry)), false, "no chunk statically imports the chart island");
  const importers = [...chunks].filter(([, chunk]) => chunk.dynamicImports.includes(entry)).map(([path]) => path);
  assert.equal(importers.length, 1, `one chunk (the chart section) loads the chart island: ${importers.join(", ")}`);

  // No document loads it before hydration.
  const staticGraph = new Set();
  for (const path of output.filter((file) => file.endsWith(".html"))) {
    const text = await readFile(path, "utf8");
    assert.equal(text.includes("chart-island-"), false, `${relative(clientDirectory, path)} never names the chart island`);
    for (const chunk of closure([...documentRoots(text)], { followDynamic: false })) staticGraph.add(chunk);
  }
  assert.equal(staticGraph.has(entry), false, "no document statically loads the chart island");

  // Recharts code exists only in chunks reached through the island.
  const islandOnly = new Set([...closure([entry], { followDynamic: true })].filter((path) => !staticGraph.has(path)));
  const withRecharts = [...chunks].filter(([, chunk]) => chunk.text.includes(CHART_ISLAND_TEXT)).map(([path]) => path);
  assert.ok(withRecharts.includes(entry), "the chart island carries Recharts");
  for (const path of withRecharts) assert.ok(islandOnly.has(path), `${path} carries Recharts outside the chart island`);

  // Only the company and product route chunks reach it; every other route chunk does not.
  const routeChunks = [...chunks.keys()].filter((path) => /^assets\/[\w-]+-[\w-]{8}\.js$/.test(path) && !CHART_ISLAND_CHUNK.test(path));
  const reaching = routeChunks.filter((path) => closure([path], { followDynamic: true }).has(entry));
  assert.ok(reaching.some((path) => CHART_ROUTE_CHUNK.test(path)), "a company or product route chunk reaches the chart island");
  const islandGraph = closure([entry], { followDynamic: true });
  // A shared chunk may reach it when only company and product route chunks load it (the bundler names a shared
  // chunk after one of its modules, for example the Share action with the island's loader beside it).
  const staticImporters = (path) => [...chunks].filter(([, chunk]) => chunk.imports.includes(path)).map(([from]) => from);
  const onlyChartRoutes = (path, seen = new Set()) => {
    if (CHART_ROUTE_CHUNK.test(path)) return true;
    if (seen.has(path)) return true;
    const from = staticImporters(path);
    return from.length > 0 && from.every((importer) => onlyChartRoutes(importer, new Set([...seen, path])));
  };
  for (const path of reaching) {
    assert.ok(CHART_ROUTE_CHUNK.test(path) || importers.includes(path) || islandGraph.has(path) || onlyChartRoutes(path), `${path} is not a company or product route but reaches the chart island`);
  }
  for (const route of ["home", "companies", "holdings", "activity", "learn", "about", "legal", "stock-evidence", "provider-evidence", "buy"]) {
    for (const path of routeChunks.filter((candidate) => new RegExp(`^assets/(?:locale-)?${route}-[\\w-]{8}\\.js$`).test(candidate))) {
      assert.equal(closure([path], { followDynamic: true }).has(entry), false, `the ${route} route chunk ${path} must not reach the chart island`);
    }
  }
});

test("the Mobile Wallet Adapter registration is an Android-only dynamic chunk of the wallet session that never reaches the purchase island", async () => {
  const { output, chunks, closure, mobileWalletOnly } = await clientGraph();
  const entries = [...chunks.keys()].filter((path) => MOBILE_WALLET_CHUNK.test(path));
  assert.equal(entries.length, 1, "exactly one MWA registration entry chunk");
  const [entry] = entries;
  // Only the wallet-session chunk (the one with the shell's Wallet Standard code) imports it, and only dynamically.
  const importers = [...chunks].filter(([, chunk]) => chunk.dynamicImports.includes(entry)).map(([path]) => path);
  assert.equal(importers.length, 1, `one chunk loads the MWA registration: ${importers.join(", ")}`);
  assert.ok(chunks.get(importers[0]).text.includes("standard:connect"), "the importer is the wallet-session chunk");
  assert.equal([...chunks.values()].some((chunk) => chunk.imports.includes(entry)), false, "no chunk statically imports the MWA registration");
  for (const path of output.filter((file) => file.endsWith(".html"))) {
    const html = await readFile(path, "utf8");
    assert.equal(html.includes("mobile-wallet-registration-"), false, `${relative(clientDirectory, path)} never names the MWA chunk`);
    for (const reached of closure([...documentRoots(html)], { followDynamic: false })) assert.equal(mobileWalletOnly.has(reached), false, `${relative(clientDirectory, path)} statically loads ${reached}`);
  }
  // It registers a Wallet Standard wallet for Solana mainnet, and carries no DEX code, Buffer polyfill or island chunk.
  const text = [...mobileWalletOnly].map((path) => chunks.get(path).text).join("\n").toLowerCase();
  for (const word of SHELL_WALLET_TEXT) assert.ok(text.includes(word), `the MWA registration carries ${word}`);
  for (const reached of closure([entry], { followDynamic: true })) assert.equal(PURCHASE_ISLAND_CHUNK.test(reached), false, `the MWA registration reaches ${reached}`);
  for (const word of PURCHASE_ISLAND_ONLY_TEXT.filter((candidate) => !MOBILE_WALLET_ALLOWED_TEXT.includes(candidate))) assert.equal(text.includes(word), false, `the MWA registration includes ${word}`);
});

const LOCALE_PREFIXES = { en: "", ja: "/ja", ko: "/ko", "zh-Hans": "/zh-Hans", "zh-Hant": "/zh-Hant" };
const FIXED_ROUTE_TICKER = "NVDA";
/**
 * Words the Dossier must never present: quotes, NAV, advice, recommendations.
 * Non-Latin terms are escaped (ja: advice/recommend/estimate; ko: advice/recommend/market price;
 * zh: advice/recommend/quote) because only registered catalogs may contain CJK text.
 */
const FORBIDDEN_DOSSIER_VOCABULARY = [
  /\bquotes?\b/i, /\bNAV\b/, /advice/i, /recommend/i,
  /\u52a9\u8a00|\u63a8\u5968|\u898b\u7a4d/u, /\uc870\uc5b8|\ucd94\ucc9c|\uc2dc\uc138/u, /\u5efa\u8bae|\u5efa\u8b70|\u63a8\u8350|\u63a8\u85a6|\u62a5\u4ef7|\u5831\u50f9/u,
];

function documentPath(locale, ticker) {
  return join(clientDirectory, ...`${LOCALE_PREFIXES[locale]}/stock/${ticker}`.split("/").filter(Boolean), "index.html");
}

/** The four "Before you buy" sentences: required disclaimer copy, so the vocabulary scan skips it. */
const PURCHASE_NOTICE_BLOCK = /<div[^>]*data-purchase-notice=""[^>]*>[\s\S]*?<\/div>/;

function mainContent(html) {
  const match = /<main\b[^>]*>([\s\S]*?)<\/main>/.exec(html);
  assert.ok(match, "every document has one main landmark");
  return match[1];
}

test("every product document states its language and states its capability: one Buy link for the product with a route, a fact for every other", async () => {
  const { items } = publicCatalog();
  let buyableDocuments = 0;
  for (const locale of Object.keys(LOCALE_PREFIXES)) {
    for (const { identity } of items) {
      const html = await readFile(documentPath(locale, identity.ticker), "utf8");
      assert.match(html, new RegExp(`<html lang="${locale}"`), `${locale} ${identity.ticker} lang`);
      const main = mainContent(html);
      // The purchase panel moved to the buy flow: no product page carries it (app IA section 5.1).
      assert.equal(main.includes("purchase-slot"), false, `${locale} ${identity.ticker} no in-page purchase panel`);
      assert.equal(main.includes("data-purchase-"), false, `${locale} ${identity.ticker} no purchase panel markup`);
      assert.ok(main.includes(`data-product-mint="">${identity.mint}<`), `${locale} ${identity.ticker} full mint`);
      assert.ok(main.includes(`href="${LOCALE_PREFIXES[locale]}/stock/${identity.ticker}/evidence"`), `${locale} ${identity.ticker} evidence link`);
      assert.match(main, /data-term="pyth-reference-price"/, `${locale} ${identity.ticker} Pyth reference price block`);
      if (identity.ticker === FIXED_ROUTE_TICKER) {
        buyableDocuments += 1;
        const buy = [...main.matchAll(/<a\b[^>]*data-cta="buy"[^>]*>/g)].map((match) => match[0]);
        assert.equal(buy.length, 1, `${locale} one Buy link`);
        assert.ok(buy[0].includes(`href="${LOCALE_PREFIXES[locale]}/stock/${FIXED_ROUTE_TICKER}/buy"`), `${locale} Buy opens the flow`);
        assert.equal(count(main, /[\s"]bg-primary[\s"]/g), 1, `${locale} the Buy link is the page's one filled control`);
        assert.equal(main.includes('data-product-capability="not-buyable"'), false);
      } else {
        assert.equal(main.includes("data-cta="), false, `${locale} ${identity.ticker} has no Buy link`);
        assert.match(main, /data-product-capability="not-buyable"/, `${locale} ${identity.ticker} not-buyable fact`);
      }
      const scanned = main.replace(PURCHASE_NOTICE_BLOCK, "");
      for (const word of FORBIDDEN_DOSSIER_VOCABULARY) {
        assert.equal(word.test(scanned), false, `${locale} ${identity.ticker} main content must not contain ${word}`);
      }
    }
  }
  assert.equal(buyableDocuments, 5, "exactly the fixed-route token in each locale has the Buy link");
});

function homeDocumentPath(locale) {
  return join(clientDirectory, ...LOCALE_PREFIXES[locale].split("/").filter(Boolean), "index.html");
}

function count(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

/** Section 7 vocabulary inside `<main>`: no 7.1 word anywhere, price and buying words only inside their marked elements. */
function assertAppVocabulary(main, locale, label) {
  const text = textOf(main);
  // Standard accounting names (the statements' line and statement names) are the one marked exception.
  assert.deepEqual(forbiddenWords(textOf(withoutAccountingTerms(main)), locale), [], `${label} vocabulary`);
  assert.deepEqual(markedWords(textOf(withoutMarked(main)), locale), [], `${label} price and buying words outside their marked elements`);
  assert.equal(DOUBLED_PUNCTUATION.test(text), false, `${label} doubled punctuation`);
}

test("every Explore document has the search form, the three groups, one capability line and no registry table", async () => {
  const privateSlugs = companyMap.companies.map((company) => company.slug);
  const listedSlugs = listedCompanyMap.companies.map((company) => company.slug).sort();
  for (const locale of Object.keys(LOCALE_PREFIXES)) {
    const prefix = LOCALE_PREFIXES[locale];
    const html = await readFile(homeDocumentPath(locale), "utf8");
    assert.match(html, new RegExp(`<html lang="${locale}"`), `${locale} Explore lang`);
    const main = mainContent(html);
    const form = /<form\b[^>]*>/.exec(main)?.[0] ?? "";
    assert.ok(form.includes('method="get"') && form.includes(`action="${prefix}/companies"`), `${locale} search form opens the companies list without JavaScript`);
    assert.match(main, /<input[^>]*name="q"[^>]*role="combobox"|<input[^>]*role="combobox"[^>]*name="q"/, `${locale} search combobox`);
    assert.deepEqual([...main.matchAll(/data-explore-group="([^"]+)"/g)].map((match) => match[1]), ["private", "us-listed", "funds"], `${locale} group order`);
    const rows = [...main.matchAll(/data-directory-company="([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(rows, [...privateSlugs, ...listedSlugs.slice(0, 5)], `${locale} private rows then the first five US-listed rows`);
    for (const slug of rows) assert.ok(main.includes(`href="${prefix}/company/${slug}"`), `${locale} Explore links ${slug}`);
    for (const hash of ["us-listed", "funds"]) assert.ok(main.includes(`href="${prefix}/companies#${hash}"`), `${locale} Explore links the ${hash} list`);
    assert.equal(count(main, /data-term="buy-in-benten"/g), 1, `${locale} one capability line and no highlighted row`);
    assert.equal(count(main, /data-cta="buy"/g), 0, `${locale} Explore has no buy action`);
    for (const legacy of ["data-home-xstock", "data-home-provider", "purchase-slot", "data-price-slot"]) assert.equal(main.includes(legacy), false, `${locale} Explore has no ${legacy}`);
    assert.equal(/\$\s?\d/.test(textOf(main)), false, `${locale} Explore shows no price`);
    assertAppVocabulary(main, locale, `${locale} Explore`);
  }
});

test("every companies document lists each product xStock and company exactly once, A to Z, in three groups", async () => {
  const held = new Set(PUBLISHED_COMPANIES.flatMap((company) => company.instruments.filter((instrument) => instrument.source === "xstocks_registry").map((instrument) => instrument.ticker)));
  const tokens = productXStockEntries.filter((entry) => !held.has(entry.ticker)).map((entry) => entry.ticker).sort();
  assert.equal(tokens.length, 23, "23 funds and other xStocks; every US-listed token has its company");
  for (const locale of Object.keys(LOCALE_PREFIXES)) {
    const prefix = LOCALE_PREFIXES[locale];
    const html = await readFile(pageDocumentPath(locale, "/companies"), "utf8");
    const main = mainContent(html);
    const label = `${locale} /companies`;
    assert.deepEqual([...main.matchAll(/<section id="([^"]+)"[^>]*data-directory-group=/g)].map((match) => match[1]), ["private", "us-listed", "funds"], `${label} groups`);
    const companies = [...main.matchAll(/data-directory-company="([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(companies, [...companyMap.companies.map((company) => company.slug), ...listedCompanyMap.companies.map((company) => company.slug).sort()], `${label} every company once, A to Z`);
    const tokenRows = [...main.matchAll(/data-directory-token="([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual([...tokenRows].sort(), tokens, `${label} every token without a company once`);
    for (const ticker of tokenRows) assert.ok(main.includes(`href="${prefix}/stock/${ticker}"`), `${label} ${ticker} opens its token page`);
    const unlinked = /data-directory-unlinked=""[\s\S]*?<\/ul>/.exec(main)?.[0] ?? "";
    assert.deepEqual([...unlinked.matchAll(/data-directory-token="([^"]+)"/g)].map((match) => match[1]).sort(), [], `${label} no unlinked token`);
    assert.deepEqual([...main.matchAll(/data-directory-filter="([^"]+)"/g)].map((match) => match[1]), ["all", "private", "us-listed", "funds"], `${label} group filter`);
    assert.equal(count(main, /data-term="buy-in-benten"/g), 1, `${label} one buyable row`);
    assert.ok(/data-directory-company="nvidia"[^>]*>[\s\S]*?data-term="buy-in-benten"/.test(main), `${label} the tag is on the NVIDIA row`);
    for (const withheld of xstocks.filter(isWithheldFromProduct)) assert.equal(main.includes(withheld.mint) || main.includes(`/stock/${withheld.ticker}"`), false, `${label} omits ${withheld.ticker}`);
    assertAppVocabulary(main, locale, label);
  }
});

test("no Home document can reach the purchase island, even through dynamic imports", async () => {
  const { chunks, closure, forbiddenOutsideIsland } = await clientGraph();
  for (const locale of Object.keys(LOCALE_PREFIXES)) {
    const html = await readFile(homeDocumentPath(locale), "utf8");
    const reachable = closure([...documentRoots(html)], { followDynamic: true });
    assert.ok(reachable.size > 0, `${locale} Home loads a client graph`);
    // Route modules are lazy-loaded by the manifest; take the Home route chunk explicitly.
    const homeRoute = [...chunks.keys()].filter((path) => /^assets\/(?:locale-)?home-[\w-]+\.js$/.test(path));
    assert.ok(homeRoute.length > 0, "the Home route chunk exists");
    for (const path of closure([...reachable, ...homeRoute], { followDynamic: true })) {
      assert.equal(PURCHASE_ISLAND_CHUNK.test(path), false, `${locale} Home reaches ${path}`);
      const lower = chunks.get(path).text.toLowerCase();
      for (const forbidden of forbiddenOutsideIsland(path)) assert.equal(lower.includes(forbidden), false, `${path} in the Home graph includes ${forbidden}`);
    }
  }
});

/** The summary shows this many newest fiscal years (STATEMENTS_CONFIG.summary.years). */
const SUMMARY_YEARS = 5;
const STATEMENTS_FILE = /\/data\/statements\/([A-Z0-9.-]+)\.([0-9a-f]{16})\.json/g;

/** The one statements file a document names (in its loader data), read and checked from the client output. */
async function statementsFileOf(html, ticker, label) {
  const named = [...new Set([...html.matchAll(STATEMENTS_FILE)].map((match) => match[0]))];
  assert.equal(named.length, 1, `${label} names one statements file`);
  assert.ok(named[0].startsWith(`/data/statements/${ticker}.`), `${label} names its own ticker's file`);
  const body = await readFile(join(clientDirectory, named[0]));
  assert.equal(createHash("sha256").update(body).digest("hex").slice(0, 16), named[0].split(".").at(-2), `${label} the file name carries its digest`);
  const file = JSON.parse(body.toString("utf8"));
  assert.equal(file.schema_version, "benten.public-web.statements.v1");
  assert.equal(file.ticker, ticker);
  return file;
}

test("each ticker's statements file is one locale-free file that every locale's company and evidence page names", async () => {
  const published = (await files(join(clientDirectory, "data", "statements"))).map((path) => `/${relative(clientDirectory, path)}`);
  assert.ok(published.length > 100, `${published.length} statements files`);
  const tickers = new Set(publicCatalog().items.map(({ identity }) => identity.ticker));
  for (const path of published) {
    const match = /^\/data\/statements\/([A-Z0-9.-]+)\.[0-9a-f]{16}\.json$/.exec(path);
    assert.ok(match, `${path} is named ticker.digest.json`);
    assert.ok(tickers.has(match[1]), `${path} belongs to a published xStock`);
    assert.equal(xstocks.filter(isWithheldFromProduct).some((withheld) => withheld.ticker === match[1]), false, `${path} is not a withheld product`);
  }
  assert.equal(new Set(published.map((path) => path.split("/").at(-1).split(".")[0])).size, published.length, "one file per ticker");
  for (const locale of Object.keys(LOCALE_PREFIXES)) {
    const company = await readFile(pageDocumentPath(locale, "/company/nvidia"), "utf8");
    const evidence = await readFile(pageDocumentPath(locale, `/stock/${FIXED_ROUTE_TICKER}/evidence`), "utf8");
    const [companyFile] = new Set([...company.matchAll(STATEMENTS_FILE)].map((match) => match[0]));
    const [evidenceFile] = new Set([...evidence.matchAll(STATEMENTS_FILE)].map((match) => match[0]));
    assert.equal(companyFile, evidenceFile, `${locale} the company and evidence pages share one file`);
    assert.ok(published.includes(companyFile), `${locale} ${companyFile} is published`);
    const main = mainContent(company);
    assert.ok(main.includes('data-statements-state="summary"') && main.includes('data-statements-full="static"'), `${locale} the company page prerenders the summary and the frame`);
    assert.equal(main.includes('data-statement-table="pl"'), false, `${locale} the full statements are not prerendered`);
    assert.ok(company.length < 120_000, `${locale} /company/nvidia is ${company.length} bytes`);
    assert.ok(evidence.length < 120_000, `${locale} /stock/NVDA/evidence is ${evidence.length} bytes`);
  }
});

test("fiscal years are named by the month they end, never by a fiscal-year number or digit-grouped", async () => {
  const main = mainContent(await readFile(pageDocumentPath("en", `/stock/${FIXED_ROUTE_TICKER}/evidence`), "utf8"));
  assert.ok(main.includes("Year ended Jan 2026"), "a fiscal year is named by the month it ends");
  for (const path of [`/stock/${FIXED_ROUTE_TICKER}/evidence`, "/company/nvidia", "/company/home-depot"]) {
    // The legacy snapshot quotes its source's own label ("FY2026"), stated as the source's with no period end recorded.
    const page = withoutElements(mainContent(await readFile(pageDocumentPath("en", path), "utf8")), /<div\b[^>]*aria-labelledby="legacy-snapshot-heading"[^>]*>/);
    assert.equal(/\bFY\s?\d{4}\b/.test(page), false, `${path} shows no fiscal-year number outside the legacy snapshot`);
  }
  assert.equal(/\b2,02\d\b/.test(main), false, "a fiscal year must not be rendered as 2,02x");
  assert.ok(main.includes(">2026 (source label; period end not recorded)<"), "the legacy fiscal year is the source's ungrouped label, with no period end recorded");
  assert.ok(main.includes("As of the fiscal year the source labels FY2026 (the source records no period end)."), "the legacy snapshot says its period end is not recorded");
});

test("each evidence page shows the annual history year by year, citing each year's filing and marking unverified values", async () => {
  const { items } = publicCatalog();
  const notVerified = { en: "Not verified against the filing" };
  let markedValues = 0;
  let withFiles = 0;
  for (const { identity } of items) {
    const years = getAnnualHistory(identity.ticker);
    const html = await readFile(pageDocumentPath("en", `/stock/${identity.ticker}/evidence`), "utf8");
    const main = mainContent(html);
    const label = `/stock/${identity.ticker}/evidence`;
    const statements = STATEMENT_DETAIL_NAMES.map((statement) => getStatementSeries(identity.ticker, statement)).filter((series) => series && series.years.length > 0);
    if (years.length === 0 && statements.length === 0) {
      assert.equal(main.includes('id="annual-history-heading"'), false, `${label} has no annual history`);
      continue;
    }
    assert.equal(main.includes('data-annual-history-source="statements"'), statements.length > 0, `${label} the history comes from the statements when Benten has them`);
    if (statements.length > 0) {
      // With the statement read model, the document prerenders the main lines of the newest years, and every line
      // of the four statements (and the calculated values) for every year is in the ticker's statements file.
      const file = await statementsFileOf(html, identity.ticker, label);
      withFiles += 1;
      const reported = statements.flatMap((series) => series.years.flatMap((year) => Object.values(year.cells))).filter((cell) => cell.kind === "reported");
      const expectedYears = [...new Set(statements.flatMap((series) => series.years.map((year) => year.fiscal_year)))].sort((a, b) => a - b);
      assert.deepEqual(file.statements.years.map((year) => year.fiscal_year), expectedYears, `${label} every year in the file, oldest first`);
      const summaryYears = [...main.matchAll(/data-statement-year="(\d+)"/g)].map((match) => Number(match[1]));
      assert.deepEqual(summaryYears, expectedYears.slice(-SUMMARY_YEARS), `${label} the summary shows the newest years`);
      for (const year of years) {
        if (year.annual_report && expectedYears.includes(year.fiscal_year)) {
          assert.ok(file.statements.filings.some((filing) => filing.accession === year.annual_report.accession_number && filing.filing_url === year.annual_report.filing_url), `${label} FY${year.fiscal_year} annual report in the file`);
          if (summaryYears.includes(year.fiscal_year)) assert.ok(main.includes(`href="${escapeHtml(year.annual_report.filing_url)}"`), `${label} FY${year.fiscal_year} filing link in the summary`);
        }
      }
      const cells = Object.values(file.statements.tabs).flatMap((lines) => lines.flatMap((line) => line.cells)).filter(Boolean);
      const unverified = reported.filter((point) => point.status === "unverified_or_derived").length;
      assert.equal(cells.filter((cell) => cell.status === "unverified").length, unverified, `${label} unverified values`);
      assert.equal(cells.filter((cell) => cell.status === "verified" && cell.restatement).length, reported.filter((point) => point.status === "verified_reported" && point.restatement).length, `${label} restatements`);
      assert.equal(main.includes("data-annual-year="), false, `${label} the full history is not prerendered`);
      markedValues += unverified;
      continue;
    }
    const shown = [...main.matchAll(/data-annual-year="(\d+)"/g)].map((match) => Number(match[1]));
    const points = years.flatMap((year) => Object.values(year.points));
    assert.deepEqual(shown, years.map((year) => year.fiscal_year).reverse(), `${label} every year, newest first`);
    for (const year of years) {
      if (year.annual_report) {
        assert.ok(main.includes(year.annual_report.accession_number), `${label} FY${year.fiscal_year} accession`);
        assert.ok(main.includes(`href="${escapeHtml(year.annual_report.filing_url)}"`), `${label} FY${year.fiscal_year} filing link`);
      }
    }
    const unverified = points.filter((point) => point.status === "unverified_or_derived").length;
    assert.equal(count(main, /data-annual-status="unverified_or_derived"/g), unverified, `${label} unverified rows`);
    assert.equal(count(main, new RegExp(`data-annual-not-verified="">${notVerified.en}<`, "g")), unverified, `${label} each unverified value is marked`);
    assert.equal(count(main, /data-annual-restatement=""/g), points.filter((point) => point.status === "verified_reported" && point.restatement).length, `${label} restatements`);
    markedValues += unverified;
  }
  assert.ok(withFiles > 100, "most evidence pages read a statements file");
  assert.ok(markedValues > 0, "the bundled history has unverified values to mark");
  // The same year label on the evidence page as on the company page, in every locale.
  for (const locale of Object.keys(LOCALE_PREFIXES)) {
    const evidence = mainContent(await readFile(pageDocumentPath(locale, "/stock/HD/evidence"), "utf8"));
    const company = mainContent(await readFile(pageDocumentPath(locale, "/company/home-depot"), "utf8"));
    const expected = { en: "Year ended Feb 2026", ja: "2026\u5e742\u6708\u671f", ko: "2026\ub144 2\uc6d4 \uacb0\uc0b0", "zh-Hans": "\u622a\u81f32026\u5e742\u6708\u7684\u8d22\u5e74", "zh-Hant": "\u622a\u81f32026\u5e742\u6708\u7684\u8ca1\u5e74" }[locale];
    assert.ok(evidence.includes(expected), `${locale} HD evidence ${expected}`);
    assert.ok(company.includes(expected), `${locale} home-depot company ${expected}`);
  }
});

const PRICE_FILE_LINK = /href="\/data\/prices\/([A-Z0-9.-]+\.[0-9a-f]{16}\.json)"/g;

/** The one built price file of a ticker, checked to be named by the digest of its bytes. */
async function priceFileName(ticker) {
  const names = (await readdir(join(clientDirectory, "data", "prices"))).filter((name) => name.startsWith(`${ticker}.`) && /^[A-Z0-9.-]+\.[0-9a-f]{16}\.json$/.test(name) && name.slice(0, -".0000000000000000.json".length) === ticker);
  assert.equal(names.length, 1, `${ticker} has one price file`);
  const body = await readFile(join(clientDirectory, "data", "prices", names[0]));
  assert.equal(createHash("sha256").update(body).digest("hex").slice(0, 16), names[0].split(".").at(-2), `${ticker} the price file name carries its digest`);
  return names[0];
}

/** A document or loader data file of a page with a price chart stays well under this size (the days are in the price file). */
const PRICE_PAGE_MAX_BYTES = { html: 400_000, data: 200_000 };

test("a US-listed company page prerenders the chart of its reported annual figures and links its price file, never the days", async () => {
  const nvda = onchainDailySeries("NVDA");
  // A signature from the middle of the series: it must be in the price file only.
  const inner = nvda.points.filter((point) => point.signature)[Math.floor(nvda.points.length / 2)].signature;
  for (const locale of Object.keys(LOCALE_PREFIXES)) {
    for (const suffix of ["/company/nvidia", `/stock/${FIXED_ROUTE_TICKER}`]) {
      const html = await readFile(pageDocumentPath(locale, suffix), "utf8");
      const data = await readFile(join(clientDirectory, `${LOCALE_PREFIXES[locale]}${suffix}.data`.replace(/^\//, "")), "utf8");
      const main = mainContent(html);
      const label = `${locale} ${suffix}`;
      assert.ok(main.includes(`data-chart-section="${suffix.startsWith("/company") ? "company" : "product"}"`), `${label} has the chart section`);
      assert.equal(main.includes("data-chart-fixture"), false, `${label} shows no fixture note`);
      const linked = [...new Set([...main.matchAll(PRICE_FILE_LINK)].map((match) => match[1]))];
      assert.deepEqual(linked, [await priceFileName("NVDA")], `${label} links the NVDA price file by its digest name`);
      assert.equal(main.includes("data-chart-table-prices"), false, `${label} does not prerender the days`);
      for (const [kind, text] of [["html", html], ["data", data]]) {
        assert.equal(text.includes(inner), false, `${label} ${kind} carries no day of the series`);
        assert.ok(Buffer.byteLength(text) < PRICE_PAGE_MAX_BYTES[kind], `${label} ${kind} is ${Buffer.byteLength(text)} bytes`);
      }
      if (suffix.startsWith("/company")) {
        assert.ok(main.includes("data-chart-table-figures"), `${label} prerenders the figures table`);
        const figures = main.slice(main.indexOf("data-chart-table-figures"), main.indexOf("</table>", main.indexOf("data-chart-table-figures")));
        const rows = count(figures, /<th\b[^>]*scope="row"/g);
        assert.ok(rows >= 10, `${label} lists ten or more fiscal years (${rows})`);
      }
    }
  }
  // A product without a bundled series has no chart.
  const other = catalogTickerWithoutSeries();
  const product = mainContent(await readFile(pageDocumentPath("en", `/stock/${other}`), "utf8"));
  assert.equal(product.includes("data-chart-section"), false, `the ${other} product page has no chart without a price series`);
});

function catalogTickerWithoutSeries() {
  const covered = new Set(onchainDailyTickers());
  return publicCatalog().items.map(({ identity }) => identity.ticker).find((ticker) => !covered.has(ticker));
}

test("the build publishes exactly one price file per bundled series, each with every session of its series", async () => {
  const directory = join(clientDirectory, "data", "prices");
  const published = (await readdir(directory)).sort();
  assert.deepEqual(published, (await Promise.all(onchainDailyTickers().map((ticker) => priceFileName(ticker)))).sort());
  for (const name of published) {
    const ticker = name.slice(0, -".0000000000000000.json".length);
    const model = onchainDailySeries(ticker);
    const file = JSON.parse(await readFile(join(directory, name), "utf8"));
    assert.equal(file.schema_version, "benten.public-web.price-series.v1");
    assert.equal(file.ticker, ticker);
    assert.equal(file.series.mint, model.mint);
    assert.equal(file.series.points.length, model.points.length, `${ticker} has one entry per session`);
    for (const [index, point] of file.series.points.entries()) {
      const source = model.points[index];
      assert.equal(point.date, source.date);
      // The value is USDC per token (before the display multiplier); a session without a verified trade is a gap with its reason.
      if (source.status === "observed") assert.equal(point.value, Number(source.usdcPerUnscaledToken), `${ticker} ${point.date}`);
      else assert.deepEqual(point, { date: source.date, value: null, reason: source.reason }, `${ticker} ${point.date}`);
    }
  }
});

test("a company page that had only the legacy snapshot now summarizes filing-cited annual facts", async () => {
  for (const locale of Object.keys(LOCALE_PREFIXES)) {
    const main = mainContent(await readFile(pageDocumentPath(locale, "/company/goldman-sachs-group"), "utf8"));
    for (const name of ["revenue", "net_income_parent"]) assert.ok(main.includes(`data-company-fact="${name}"`), `${locale} goldman-sachs-group ${name}`);
    assert.match(main, /href="https:\/\/www\.sec\.gov\/Archives\/edgar\/data\//, `${locale} goldman-sachs-group links its filing`);
  }
});

test("the development-only Living Catalog is absent from the build", async () => {
  const output = await files(clientDirectory);
  assert.equal(output.some((path) => relative(clientDirectory, path).startsWith("_catalog")), false);
  const clientText = (await Promise.all(output.filter((path) => path.endsWith(".js")).map((path) => readFile(path, "utf8")))).join("\n");
  assert.equal(clientText.includes("Living Catalog"), false);
});

function pageDocumentPath(locale, suffix) {
  return join(clientDirectory, ...`${LOCALE_PREFIXES[locale]}${suffix}`.split("/").filter(Boolean), "index.html");
}

function textOf(html) {
  return html.replace(/<script\b[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ");
}

/** The provider page's one static no-purchase statement; the only place purchase words may appear. */
const NO_PURCHASE_BLOCK = /<div data-provider-purchase="unsupported">[\s\S]*?<\/div><\/div><\/div>/;

/** The Share action's wrapper (company and product pages). */
function withoutShare(main) {
  return main.replace(/<span class="[^"]*" data-share=""[^>]*>[\s\S]*?<\/button><span class="sr-only" role="status"[^>]*><\/span><\/span>/, "");
}

function assertReferenceMain(main, locale, label) {
  for (const pattern of [/<button\b/, /<form\b/, /<input\b/, /purchase-slot/, /data-purchase-/]) assert.equal(pattern.test(main), false, `${label} has no ${pattern}`);
  const text = textOf(main);
  assert.deepEqual(forbiddenMatches(text, locale), [], `${label} vocabulary`);
  assert.equal(DOUBLED_PUNCTUATION.test(text), false, `${label} doubled punctuation: ${text.match(new RegExp(`.{0,30}${DOUBLED_PUNCTUATION.source}.{0,10}`, "u"))?.[0]}`);
}

test("every published company page follows the IA order, with one card per product in map order and no reference value", async () => {
  const values = providerAssets.entries.flatMap((entry) => [...entry.references.map((reference) => reference.value), ...(entry.supply_reference ? [entry.supply_reference.value] : [])]);
  let buyActions = 0;
  for (const locale of Object.keys(LOCALE_PREFIXES)) {
    const prefix = LOCALE_PREFIXES[locale];
    for (const company of PUBLISHED_COMPANIES) {
      const html = await readFile(pageDocumentPath(locale, `/company/${company.slug}`), "utf8");
      assert.match(html, new RegExp(`<html lang="${locale}"`));
      const main = mainContent(html);
      const label = `${locale} /company/${company.slug}`;
      const keys = [...main.matchAll(/data-company-product="([^"]+)"/g)].map((match) => match[1]);
      assert.deepEqual(keys, company.instruments.map((instrument) => instrument.source === "xstocks_registry" ? `xstocks/${instrument.ticker}` : `${instrument.provider}/${instrument.provider_asset_id}`), `${label} cards in map order`);
      for (const instrument of company.instruments) {
        const href = instrument.source === "xstocks_registry" ? `${prefix}/stock/${instrument.ticker}` : `${prefix}/provider/${instrument.provider}/${instrument.provider_asset_id}`;
        assert.ok(main.includes(`href="${href}"`), `${label} links ${href}`);
      }
      assert.equal(count(main, /<div\b[^>]*data-term="pyth-reference-price"[^>]*>/g), keys.length, `${label} one Pyth reference price block per card`);
      assert.equal(main.includes("data-price-slot"), false, `${label} no empty price slot`);
      assert.equal(count(main, /<div data-slot="consider-with-my-conditions"[^>]*><\/div>/g), 1, `${label} empty agent slot`);
      const order = ["data-company-title", "company-products-heading", "company-facts-heading", 'data-slot="consider-with-my-conditions"', "company-method-heading"].map((marker) => main.indexOf(marker));
      assert.ok(order.every((index, position) => index >= 0 && (position === 0 || index > order[position - 1])), `${label} section order`);
      assert.equal(main.includes("data-company-notice"), keys.length >= 2, `${label} notice only with two or more products`);
      const buy = [...main.matchAll(/<div data-cta="buy"[^>]*>[\s\S]*?<a href="([^"]+)"/g)].map((match) => match[1]);
      if (company.slug === "nvidia") assert.deepEqual(buy, [`${prefix}/stock/NVDA/buy`], `${label} one buy action, to the buy flow`);
      else assert.deepEqual(buy, [], `${label} no buy action`);
      buyActions += buy.length;
      if (company.listing_status === "us_listed") assert.ok(main.includes('data-company-map-review="pending"'), `${label} says the generated map is not yet reviewed`);
      else assert.equal(main.includes("data-company-map-review"), false, `${label} reviewed map`);
      for (const value of values) assert.equal(html.includes(value), false, `${label} must not render reference value ${value}`);
      // The one control before hydration: Share, invisible and unfocusable until then, right after the name and status line.
      assert.equal(count(main, /data-share="/g), 1, `${label} one Share action`);
      assert.ok(main.indexOf("data-share=") < main.indexOf("company-products-heading"), `${label} Share sits in the title band`);
      const share = /data-share-mode="pending"[^>]*>\s*(<button[^>]*>)/.exec(main)?.[1] ?? "";
      assert.ok(share.includes('aria-hidden="true"') && share.includes('tabindex="-1"'), `${label} Share is inert before hydration`);
      for (const pattern of [/<button\b/, /<form\b/, /<input\b/, /id="purchase-slot"/, /data-purchase-/]) assert.equal(pattern.test(withoutShare(main)), false, `${label} has no ${pattern}`);
      assertAppVocabulary(main, locale, label);
    }
  }
  assert.equal(buyActions, 5, "the buy action exists only on the NVIDIA page, once per locale");
});

test("company documents are exactly the published companies; US-listed pages show the SEC registrant once and never claim or deny a human review", async () => {
  const pages = new Set((await files(join(clientDirectory, "company"))).filter((path) => path.endsWith("index.html")).map((path) => relative(join(clientDirectory, "company"), path).split("/")[0]));
  assert.deepEqual([...pages].sort(), PUBLISHED_COMPANIES.map((company) => company.slug).sort(), "company documents are exactly the published companies");
  assert.deepEqual(listedCompanyMap.excluded, []);
  for (const locale of Object.keys(LOCALE_PREFIXES)) {
    for (const company of listedCompanyMap.companies) {
      const main = mainContent(await readFile(pageDocumentPath(locale, `/company/${company.slug}`), "utf8"));
      const label = `${locale} /company/${company.slug}`;
      assert.match(main, new RegExp(`<h1[^>]*>${escapeHtml(company.display_name)}</h1>`), `${label} readable display name as the title`);
      assert.equal(count(main, /data-sec-registrant=""/g), 1, `${label} one SEC registrant line`);
      assert.ok(main.includes(escapeHtml(company.evidence.sec_registrant_name)), `${label} SEC registrant name`);
      assert.equal(/not reviewed|has not reviewed/i.test(main), false, `${label} no pending-review line`);
    }
    for (const company of companyMap.companies) {
      const main = mainContent(await readFile(pageDocumentPath(locale, `/company/${company.slug}`), "utf8"));
      assert.equal(main.includes("data-sec-registrant"), false, `${locale} ${company.slug} private: no SEC registrant`);
    }
  }
  for (const company of listedCompanyMap.companies) {
    const evidence = mainContent(await readFile(pageDocumentPath("en", `/stock/${company.instruments[0].ticker}/evidence`), "utf8"));
    assert.ok(evidence.includes(`${escapeHtml(company.evidence.sec_registrant_name)} (CIK ${company.evidence.sec_cik})`), `${company.instruments[0].ticker} evidence names the SEC registrant`);
  }
});

test("every provider product page shows its identity, its company, one compare-only statement and no provider reference value; its evidence page keeps the record", async () => {
  for (const locale of Object.keys(LOCALE_PREFIXES)) {
    for (const entry of providerAssets.entries) {
      const suffix = `/provider/${entry.provider}/${entry.provider_asset_id}`;
      const html = await readFile(pageDocumentPath(locale, suffix), "utf8");
      const main = mainContent(html);
      const label = `${locale} ${entry.provider}/${entry.provider_asset_id}`;
      assert.ok(main.includes(entry.mint_or_contract), `${label} full mint`);
      assert.equal(count(main, /data-provider-purchase="unsupported"/g), 1, `${label} one compare-only statement`);
      assert.equal(main.includes("data-cta="), false, `${label} has no Buy link`);
      assert.ok(main.includes(`href="${LOCALE_PREFIXES[locale]}${suffix}/evidence"`), `${label} evidence link`);
      const slug = companyMap.companies.find((company) => company.instruments.some((instrument) => instrument.source === "provider_assets" && instrument.provider === entry.provider && instrument.provider_asset_id === entry.provider_asset_id)).slug;
      assert.ok(main.includes(`href="${LOCALE_PREFIXES[locale]}/company/${slug}"`), `${label} links its company page`);
      assert.equal(main.includes(entry.rights.provider_statement), false, `${label} does not restate the provider's own marketing statement`);
      for (const reference of entry.references) assert.equal(main.includes(reference.value), false, `${label} shows no provider reference value on the product page`);
      // The product page has Copy controls; it still has no form, no input and no purchase markup.
      for (const pattern of [/<form\b/, /<input\b/, /purchase-slot/, /data-purchase-/]) assert.equal(pattern.test(main), false, `${label} has no ${pattern}`);
      const text = textOf(withoutAllowedTerms(main));
      assert.deepEqual(forbiddenMatches(text, locale), [], `${label} vocabulary`);
      assert.equal(DOUBLED_PUNCTUATION.test(text), false, `${label} doubled punctuation`);

      const evidence = mainContent(await readFile(pageDocumentPath(locale, `${suffix}/evidence`), "utf8"));
      assert.ok(evidence.includes(entry.mint_or_contract), `${label} evidence full mint`);
      assert.deepEqual([...evidence.matchAll(/data-provider-unknown="([^"]+)"/g)].map((match) => match[1]), entry.unknowns.map((unknown) => unknown.code), `${label} evidence unknowns`);
      assert.deepEqual([...evidence.matchAll(/data-provider-reference="([^"]+)"/g)].map((match) => match[1]), entry.references.map((reference) => reference.kind), `${label} evidence references`);
      assertReferenceMain(evidence, locale, `${label} evidence`);
    }
  }
});

test("provider and company documents never reach the purchase island, even through dynamic imports", async () => {
  const { chunks, closure, forbiddenOutsideIsland } = await clientGraph();
  const routeChunks = [...chunks.keys()].filter((path) => /^assets\/(?:locale-)?(?:provider|company)-[\w-]+\.js$/.test(path));
  assert.ok(routeChunks.length >= 4, "provider and company route chunks exist");
  for (const suffix of ["/provider/prestocks/OPENAI", "/provider/prestocks/SPACEX", "/company/openai", "/company/spacex"]) {
    for (const locale of Object.keys(LOCALE_PREFIXES)) {
      const html = await readFile(pageDocumentPath(locale, suffix), "utf8");
      assert.equal(html.includes("purchase-island"), false);
      for (const path of closure([...documentRoots(html), ...routeChunks], { followDynamic: true })) {
        assert.equal(PURCHASE_ISLAND_CHUNK.test(path), false, `${locale} ${suffix} reaches ${path}`);
        const lower = chunks.get(path).text.toLowerCase();
        for (const forbidden of forbiddenOutsideIsland(path)) assert.equal(lower.includes(forbidden), false, `${path} includes ${forbidden}`);
      }
    }
  }
});

test("withheld registry rows (SPCX, VCX) have no document and appear on no Explore or companies list", async () => {
  // The PreStocks track rule makes a project ineligible when it integrates a
  // non-PreStocks pre-IPO token; see `isWithheldFromProduct` in the registry.
  const withheld = xstocks.filter(isWithheldFromProduct);
  assert.deepEqual(withheld.map((entry) => entry.ticker), ["SPCX", "VCX"]);
  for (const locale of Object.keys(LOCALE_PREFIXES)) {
    const main = mainContent(await readFile(homeDocumentPath(locale), "utf8")) + mainContent(await readFile(pageDocumentPath(locale, "/companies"), "utf8"));
    for (const entry of withheld) {
      await assert.rejects(access(documentPath(locale, entry.ticker)), `${locale} ${entry.ticker} has no Dossier`);
      assert.equal(main.includes(`data-home-xstock="${entry.ticker}"`), false, `${locale} Home omits ${entry.ticker}`);
      assert.equal(main.includes(entry.mint), false, `${locale} Home omits the ${entry.ticker} mint`);
      assert.equal(main.includes(entry.name), false, `${locale} Home omits the ${entry.ticker} token name`);
    }
  }
});

test("not-found bodies are scoped, neutral and scriptless", async () => {
  const backs = { company: "/companies", provider: "/companies", stock: "/companies", page: null };
  for (const locale of Object.keys(LOCALE_PREFIXES)) {
    for (const [scope, hash] of Object.entries(backs)) {
      const html = await readFile(join(clientDirectory, "__not-found", locale, scope, "index.html"), "utf8");
      assert.match(html, new RegExp(`<html lang="${locale}"`));
      // The only script is the inline theme boot script, which loads nothing and never hydrates.
      assert.equal(/<script\b/.test(withoutThemeBoot(html)), false, `${locale} ${scope} ships no other script`);
      assert.match(html, /<meta name="robots" content="noindex"/);
      const main = mainContent(html);
      assert.ok(main.includes(`data-not-found-scope="${scope}"`));
      const home = LOCALE_PREFIXES[locale] || "/";
      assert.ok(main.includes(`href="${hash ? `${LOCALE_PREFIXES[locale]}${hash}` : home}"`), `${locale} ${scope} back link`);
      if (scope !== "stock") assert.equal(/ticker|xStock/i.test(textOf(main)), false, `${locale} ${scope} copy names no ticker`);
      assertReferenceMain(main, locale, `${locale} not-found ${scope}`);
    }
  }
});

test("every Holdings and Activity document is a prerendered, unindexed shell state that never reaches the purchase island", async () => {
  const { chunks, closure } = await clientGraph();
  const routeChunks = [...chunks.keys()].filter((path) => /^assets\/(?:locale-)?(?:holdings|activity)-[\w-]+\.js$/.test(path));
  assert.ok(routeChunks.length >= 2, "the Holdings and Activity route chunks exist");
  for (const locale of Object.keys(LOCALE_PREFIXES)) {
    for (const [tab, state] of [["holdings", 'data-holdings-state="not-connected"'], ["activity", 'data-activity-state="empty"']]) {
      const html = await readFile(pageDocumentPath(locale, `/${tab}`), "utf8");
      const label = `${locale} /${tab}`;
      assert.match(html, new RegExp(`<html lang="${locale}"`), label);
      assert.match(html, /<meta name="robots" content="noindex"/, `${label} noindex`);
      assert.match(html, /viewport-fit=cover/, `${label} viewport`);
      const main = mainContent(html);
      assert.ok(main.includes(state), `${label} state`);
      assert.match(main, /<h1\b/, `${label} heading`);
      for (const word of FORBIDDEN_DOSSIER_VOCABULARY) assert.equal(word.test(main), false, `${label} must not contain ${word}`);
      assert.equal(DOUBLED_PUNCTUATION.test(textOf(main)), false, `${label} doubled punctuation`);
      for (const path of closure([...documentRoots(html), ...routeChunks], { followDynamic: true })) {
        assert.equal(PURCHASE_ISLAND_CHUNK.test(path), false, `${label} reaches ${path}`);
      }
    }
    const holdings = mainContent(await readFile(pageDocumentPath(locale, "/holdings"), "utf8"));
    assert.match(holdings, /<noscript>/, `${locale} Holdings says connecting needs JavaScript`);
  }
});

test("every hydrating document carries the app shell: header, three tabs as plain links, and back only on detail pages", async () => {
  // Logical parents come from the published company maps: a mapped product goes to its company page (NVDA to /company/nvidia).
  const mapped = PUBLISHED_COMPANIES.flatMap((company) => company.instruments.map((instrument) => [instrument.source === "xstocks_registry" ? `/stock/${instrument.ticker}` : `/provider/${instrument.provider}/${instrument.provider_asset_id}`, `/company/${company.slug}`, "explore"]));
  assert.ok(mapped.some(([path, parent]) => path === "/stock/NVDA" && parent === "/company/nvidia"));
  // A token without a company page (funds, and the unlinked US-listed tokens) goes to the companies list.
  const unmapped = publicCatalog().items.map(({ identity }) => identity.ticker).filter((ticker) => !mapped.some(([path]) => path === `/stock/${ticker}`)).map((ticker) => [`/stock/${ticker}`, "/companies", "explore"]);
  assert.equal(unmapped.length, 23);
  const pages = [["/", null, "explore"], ["/companies", "/", "explore"], ...unmapped, [`/company/${companyMap.companies[0].slug}`, "/", "explore"], ["/company/nvidia", "/", "explore"], ...mapped, ["/holdings", null, "holdings"], ["/activity", null, "activity"]];
  for (const locale of Object.keys(LOCALE_PREFIXES)) {
    const prefix = LOCALE_PREFIXES[locale];
    for (const [suffix, parent, tab] of pages) {
      const html = await readFile(pageDocumentPath(locale, suffix), "utf8");
      const label = `${locale} ${suffix}`;
      const header = /<header\b[^>]*data-app-header=""[\s\S]*?<\/header>/.exec(html)?.[0] ?? "";
      assert.ok(header, `${label} header`);
      for (const [name, path] of [["explore", prefix || "/"], ["holdings", `${prefix}/holdings`], ["activity", `${prefix}/activity`]]) {
        assert.match(header, new RegExp(`<a\\b[^>]*data-app-tab="${name}"[^>]*href="${path}"`), `${label} ${name} tab is a plain link`);
      }
      assert.match(header, new RegExp(`aria-current="page"[^>]*data-app-tab="${tab}"`), `${label} current tab`);
      const back = /<a\b[^>]*data-app-back=""[^>]*href="([^"]+)"/.exec(header);
      if (parent === null) assert.equal(back, null, `${label} has no back button`);
      else assert.equal(back?.[1], parent === "/" ? prefix || "/" : `${prefix}${parent}`, `${label} back goes to its logical parent`);
      assert.match(header, /<details\b[^>]*data-language-menu=""/, `${label} language list works without JavaScript`);
      assert.match(header, /<details\b[^>]*data-wallet-menu="header"/, `${label} header wallet`);
    }
  }
});

/*
 * Product pages, evidence pages and the buy flow (app IA sections 4.5, 4.6,
 * 5 and 7.3).
 */

/** Remove every element whose opening tag matches `opening`, with its whole subtree (balanced on its tag name). */
function withoutElements(html, opening) {
  let output = html;
  for (;;) {
    const match = opening.exec(output);
    if (!match) return output;
    const tag = /^<([a-z0-9]+)/.exec(match[0])[1];
    const tags = new RegExp(`<${tag}\\b[^>]*>|</${tag}>`, "g");
    tags.lastIndex = match.index + match[0].length;
    let depth = 1;
    let end = output.length;
    for (let found = tags.exec(output); found; found = tags.exec(output)) {
      depth += found[0].startsWith("</") ? -1 : 1;
      if (depth === 0) {
        end = found.index + found[0].length;
        break;
      }
    }
    output = output.slice(0, match.index) + output.slice(end);
  }
}

/**
 * App IA 7.3: "price" words only inside the Pyth reference price block and
 * the on-chain trade price chart, buy
 * words only inside the Buy link and the capability statements (and the
 * buy flow, which has its own document). Everything else in `<main>` keeps
 * the reference vocabulary rule.
 */
function withoutAllowedTerms(main) {
  return [/<[a-z0-9]+\b[^>]*data-term="pyth-reference-price"[^>]*>/, /<[a-z0-9]+\b[^>]*data-term="onchain-trade-price"[^>]*>/, /<[a-z0-9]+\b[^>]*data-term="capability"[^>]*>/, /<a\b[^>]*data-cta="buy"[^>]*>/]
    .reduce((html, opening) => withoutElements(html, opening), main);
}

test("every xStock product page keeps price words in the Pyth block and buy words in the Buy link and the capability fact", async () => {
  const { items } = publicCatalog();
  for (const locale of Object.keys(LOCALE_PREFIXES)) {
    for (const { identity } of items) {
      const main = mainContent(await readFile(documentPath(locale, identity.ticker), "utf8"));
      const text = textOf(withoutAllowedTerms(main));
      assert.deepEqual(forbiddenMatches(text, locale), [], `${locale} ${identity.ticker} vocabulary`);
      assert.equal(DOUBLED_PUNCTUATION.test(text), false, `${locale} ${identity.ticker} doubled punctuation`);
    }
  }
});

test("every product has a prerendered evidence page with the registry record, and the xStock facts moved there", async () => {
  const { items } = publicCatalog();
  for (const locale of Object.keys(LOCALE_PREFIXES)) {
    for (const { identity } of items) {
      const suffix = `/stock/${identity.ticker}/evidence`;
      const html = await readFile(pageDocumentPath(locale, suffix), "utf8");
      const label = `${locale} ${suffix}`;
      assert.match(html, new RegExp(`<html lang="${locale}"`), label);
      const main = mainContent(html);
      assert.match(main, /<h1\b/, `${label} heading`);
      assert.ok(main.includes('id="registry-record-heading"'), `${label} registry record`);
      assert.ok(main.includes(identity.mint), `${label} full mint`);
      assert.ok(main.includes(`href="${LOCALE_PREFIXES[locale]}/stock/${identity.ticker}"`), `${label} links back to the product`);
      assert.equal(/<button\b|<form\b|data-cta=|purchase-slot/.test(main), false, `${label} has no action`);
      for (const word of FORBIDDEN_DOSSIER_VOCABULARY) assert.equal(word.test(main), false, `${label} must not contain ${word}`);
      const header = /<header\b[^>]*data-app-header=""[\s\S]*?<\/header>/.exec(html)?.[0] ?? "";
      assert.match(header, new RegExp(`data-app-back=""[^>]*href="${LOCALE_PREFIXES[locale]}/stock/${identity.ticker}"`), `${label} back goes to the product`);
    }
    // The long source tables are on the evidence page, not the product page.
    const product = mainContent(await readFile(documentPath(locale, FIXED_ROUTE_TICKER), "utf8"));
    const evidence = mainContent(await readFile(pageDocumentPath(locale, `/stock/${FIXED_ROUTE_TICKER}/evidence`), "utf8"));
    for (const marker of ['id="verified-facts-heading"', 'id="annual-history-heading"', 'id="legacy-snapshot-heading"', 'id="registry-record-heading"']) {
      assert.equal(product.includes(marker), false, `${locale} product page has no ${marker}`);
      assert.ok(evidence.includes(marker), `${locale} evidence page has ${marker}`);
    }
  }
});

test("the buy flow frame is prerendered in five locales as a modal over the inert product page, at step 1 with the four notice sentences", async () => {
  const { chunks, closure, forbiddenOutsideIsland } = await clientGraph();
  for (const locale of Object.keys(LOCALE_PREFIXES)) {
    const html = await readFile(pageDocumentPath(locale, `/stock/${FIXED_ROUTE_TICKER}/buy`), "utf8");
    const label = `${locale} buy flow`;
    assert.match(html, new RegExp(`<html lang="${locale}"`), label);
    assert.match(html, /<meta name="robots" content="noindex"/, `${label} noindex`);
    const dialog = /<div data-buy-flow=""[^>]*>/.exec(html)?.[0] ?? "";
    assert.ok(dialog.includes('role="dialog"') && dialog.includes('aria-modal="true"') && dialog.includes('aria-labelledby="purchase-heading"'), `${label} modal dialog`);
    const flow = html.slice(html.indexOf("<div data-buy-flow"));
    assert.match(flow, new RegExp(`<section id="purchase"[^>]* data-purchase-variant="flow" data-phase="frame" lang="${locale}"`), `${label} frame section`);
    assert.match(flow, /<h2 id="purchase-heading"[^>]*>[^<]+<\/h2>/, `${label} heading`);
    assert.match(flow, /data-purchase-step=""[^>]*>(?=[^<]*1)(?=[^<]*3)[^<]+</, `${label} step 1 of 3`);
    const notice = PURCHASE_NOTICE_BLOCK.exec(flow);
    assert.ok(notice, `${label} notice`);
    assert.equal(notice[0].match(/<li>/g)?.length, 4, `${label} four notice sentences`);
    assert.ok(flow.indexOf("data-purchase-route") < flow.indexOf("data-purchase-notice"), `${label} route line, then the notice`);
    assert.equal(flow.includes("data-purchase-wallet"), false, `${label} no wallet step before the island`);
    assert.match(flow, /<a\b[^>]*data-buy-flow-close=""[^>]*href="[^"]*\/stock\/NVDA"|<a\b[^>]*href="[^"]*\/stock\/NVDA"[^>]*data-buy-flow-close=""/, `${label} Close is a link to the product page`);
    // The product page behind the flow is inert and has no Buy link of its own that could be reached.
    const background = /<div class="contents" inert="">([\s\S]*?)<div data-buy-flow=""/.exec(html)?.[1] ?? "";
    assert.ok(background.includes("data-app-header"), `${label} the product page with its shell is inert`);
    assert.equal(html.includes("purchase-island-"), false, `${label} never names the island chunk`);
    for (const path of closure([...documentRoots(html)], { followDynamic: false })) {
      assert.equal(PURCHASE_ISLAND_CHUNK.test(path), false, `${label} statically loads ${path}`);
    }
  }
  const buyRoute = [...chunks.keys()].filter((path) => /^assets\/(?:locale-)?buy-[\w-]+\.js$/.test(path));
  assert.ok(buyRoute.some((path) => chunks.get(path).dynamicImports.some((target) => PURCHASE_ISLAND_CHUNK.test(target))), "the buy flow route loads the island only through a dynamic import");
  // Every other product route cannot reach the island.
  const productRoutes = [...chunks.keys()].filter((path) => /^assets\/(?:locale-)?(?:dossier|stock-evidence|provider-evidence)-[\w-]+\.js$/.test(path));
  assert.ok(productRoutes.length >= 3, "product and evidence route chunks exist");
  for (const path of closure(productRoutes, { followDynamic: true })) {
    assert.equal(PURCHASE_ISLAND_CHUNK.test(path), false, `a product or evidence route reaches ${path}`);
    const lower = chunks.get(path).text.toLowerCase();
    for (const forbidden of forbiddenOutsideIsland(path)) assert.equal(lower.includes(forbidden), false, `${path} includes ${forbidden}`);
  }
});

test("only the fixed-route product has a buy flow document", async () => {
  const { items } = publicCatalog();
  for (const locale of Object.keys(LOCALE_PREFIXES)) {
    for (const { identity } of items) {
      if (identity.ticker === FIXED_ROUTE_TICKER) continue;
      await assert.rejects(access(pageDocumentPath(locale, `/stock/${identity.ticker}/buy`)), `${locale} ${identity.ticker} has no buy flow`);
    }
    for (const entry of providerAssets.entries) {
      await assert.rejects(access(pageDocumentPath(locale, `/provider/${entry.provider}/${entry.provider_asset_id}/buy`)), `${locale} ${entry.provider_asset_id} has no buy flow`);
    }
  }
});

test("the Pyth reference price client chunk reads only the same-origin prices path and carries no wallet or DEX code", async () => {
  const { chunks } = await clientGraph();
  const priceChunks = [...chunks].filter(([, chunk]) => chunk.text.includes("pyth-reference-price")).map(([path]) => path);
  assert.ok(priceChunks.length > 0, "a chunk renders the Pyth reference price");
  for (const path of priceChunks) {
    const text = chunks.get(path).text;
    assert.equal(/https?:\/\/[^"'`]*pyth/i.test(text), false, `${path} calls no Pyth host`);
    const lower = text.toLowerCase();
    for (const forbidden of PURCHASE_ISLAND_ONLY_TEXT) assert.equal(lower.includes(forbidden), false, `${path} includes ${forbidden}`);
  }
  assert.ok([...chunks.values()].some((chunk) => chunk.text.includes("/api/prices")), "the client reads /api/prices");
});

test("every document links its own locale's Web App Manifest and the app icons, and no service worker ships", async () => {
  const output = await files(clientDirectory);
  const documents = output.filter((path) => path.endsWith(".html") && !path.endsWith("/__spa-fallback.html"));
  for (const path of documents) {
    const html = await readFile(path, "utf8");
    const locale = /<html lang="([^"]+)"/.exec(html)?.[1];
    assert.ok(locale, relative(clientDirectory, path));
    const manifest = locale === "en" ? "/manifest.webmanifest" : `/${locale}/manifest.webmanifest`;
    assert.ok(html.includes(`<link rel="manifest" href="${manifest}"/>`), `${relative(clientDirectory, path)} manifest`);
    assert.ok(html.includes('<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png"/>'), `${relative(clientDirectory, path)} apple-touch-icon`);
    // The tab icon follows the browser's colour scheme; the scalable SVG favicon is gone.
    for (const scheme of ["light", "dark"]) {
      assert.ok(html.includes(`<link rel="icon" href="/icons/favicon-${scheme}.png" type="image/png" sizes="64x64" media="(prefers-color-scheme: ${scheme})"/>`), `${relative(clientDirectory, path)} ${scheme} favicon`);
    }
    assert.equal(html.includes("/icons/icon.svg"), false, `${relative(clientDirectory, path)} links no SVG favicon`);
    // One browser UI colour per operating-system scheme; the theme boot script points both at the app's chosen theme.
    assert.ok(html.includes('<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" data-theme-scheme="light"/>'), `${relative(clientDirectory, path)} light theme-color`);
    assert.ok(html.includes('<meta name="theme-color" content="#0a0a0a" media="(prefers-color-scheme: dark)" data-theme-scheme="dark"/>'), `${relative(clientDirectory, path)} dark theme-color`);
  }
  const relativePaths = new Set(output.map((path) => relative(clientDirectory, path).replaceAll("\\", "/")));
  for (const path of ["manifest.webmanifest", "ja/manifest.webmanifest", "ko/manifest.webmanifest", "zh-Hans/manifest.webmanifest", "zh-Hant/manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png", "icons/favicon-light.png", "icons/favicon-dark.png"]) {
    assert.ok(relativePaths.has(path), path);
  }
  // App IA U6: Chrome does not need a service worker to install this app, so none is built or registered.
  assert.equal([...relativePaths].some((path) => /(^|\/)(sw|service-worker)[^/]*\.js$/.test(path)), false);
  for (const path of output.filter((file) => file.endsWith(".js"))) {
    assert.equal((await readFile(path, "utf8")).includes("serviceWorker.register"), false, relative(clientDirectory, path));
  }
});

test("every document applies the theme before its first paint: one identical inline boot script in the head, ahead of the stylesheet", async () => {
  const output = await files(clientDirectory);
  const documents = output.filter((path) => path.endsWith(".html"));
  let script = null;
  for (const path of documents) {
    const html = await readFile(path, "utf8");
    const label = relative(clientDirectory, path);
    const head = /<head>([\s\S]*?)<\/head>/.exec(html)?.[1] ?? "";
    const match = THEME_BOOT.exec(head);
    assert.ok(match, `${label} has the theme boot script in its head`);
    assert.equal(html.match(/data-theme-boot=""/g).length, 1, `${label} has one theme boot script`);
    script ??= match[1];
    assert.equal(match[1], script, `${label} theme boot script is the shared one`);
    const stylesheet = head.indexOf('rel="stylesheet"');
    assert.ok(stylesheet < 0 || head.indexOf("data-theme-boot") < stylesheet, `${label} runs the theme before the stylesheet`);
    assert.ok(head.includes('<meta name="color-scheme" content="light dark"/>'), `${label} color-scheme`);
  }
  assert.ok(script.includes('"storageKey":"benten:theme"') && script.includes('"fallback":"system"'), "the script carries the theme config");
  assert.equal(/\bimport\b|\bfetch\b|src=/.test(script), false, "the script loads nothing");
});

/*
 * About, the learn topics and the legal documents (app IA sections 4.1, 7
 * and 8.12), and the footer links to them.
 */

test("every static information page is prerendered in five locales, indexable, under Explore, with the vocabulary rule and its negation exception", async () => {
  const { closure } = await clientGraph();
  for (const locale of Object.keys(LOCALE_PREFIXES)) {
    const prefix = LOCALE_PREFIXES[locale];
    for (const suffix of STATIC_INFORMATION_PAGES) {
      const html = await readFile(pageDocumentPath(locale, suffix), "utf8");
      const label = `${locale} ${suffix}`;
      assert.match(html, new RegExp(`<html lang="${locale}"`), `${label} lang`);
      assert.equal(/<meta name="robots" content="noindex"/.test(html), false, `${label} is indexable`);
      const header = /<header\b[^>]*data-app-header=""[\s\S]*?<\/header>/.exec(html)?.[0] ?? "";
      assert.match(header, /aria-current="page"[^>]*data-app-tab="explore"/, `${label} sits under Explore`);
      assert.equal(/<a\b[^>]*data-app-back=""[^>]*href="([^"]+)"/.exec(header)?.[1], prefix || "/", `${label} back goes to Explore`);
      const main = mainContent(html);
      assert.equal(count(main, /<h1\b/g), 1, `${label} one heading`);
      assert.match(main, /data-static-page="/, `${label} static page`);
      for (const pattern of [/<button\b/, /<form\b/, /<input\b/, /data-cta=/, /purchase-slot/, /data-purchase-/]) assert.equal(pattern.test(main), false, `${label} has no ${pattern}`);
      // Only About links the source repository.
      assert.equal(/data-static-source/.test(main), suffix === "/about", `${label} source repository link only on About`);
      assert.deepEqual(staticPageVocabularyFindings(main, locale), [], `${label} vocabulary`);
      for (const path of closure(documentRoots(html), { followDynamic: true })) assert.equal(PURCHASE_ISLAND_CHUNK.test(path), false, `${label} reaches ${path}`);
    }
  }
});

test("every document's footer links About, every learn topic and every legal document in its own locale", async () => {
  for (const locale of Object.keys(LOCALE_PREFIXES)) {
    const prefix = LOCALE_PREFIXES[locale];
    for (const suffix of ["", "/stock/NVDA", "/holdings", "/activity", "/legal/privacy"]) {
      const html = await readFile(suffix === "" ? homeDocumentPath(locale) : pageDocumentPath(locale, suffix), "utf8");
      const footer = /<nav\b[^>]*data-footer-pages=""[\s\S]*?<\/nav>/.exec(html)?.[0] ?? "";
      assert.ok(footer, `${locale} ${suffix || "/"} footer page links`);
      assert.deepEqual([...footer.matchAll(/href="([^"]+)"/g)].map((match) => match[1]), STATIC_INFORMATION_PAGES.map((page) => `${prefix}${page}`), `${locale} ${suffix || "/"} footer links in order`);
    }
  }
});

test("Activity's privacy note links the privacy page in its own locale", async () => {
  for (const locale of Object.keys(LOCALE_PREFIXES)) {
    const main = mainContent(await readFile(pageDocumentPath(locale, "/activity"), "utf8"));
    const note = /<section\b[^>]*data-activity-privacy=""[\s\S]*?<\/section>/.exec(main)?.[0] ?? "";
    assert.ok(note.includes(`href="${LOCALE_PREFIXES[locale]}/legal/privacy"`), `${locale} Activity privacy link`);
  }
});

test("while the Mobile Wallet Adapter chunks load a Google font, every privacy page names Google Fonts", async () => {
  const { chunks, mobileWalletOnly } = await clientGraph();
  const loadsGoogleFont = [...mobileWalletOnly].some((path) => chunks.get(path).text.includes("fonts.googleapis.com"));
  // Only the Android-only MWA chunks may reach Google Fonts.
  for (const [path, chunk] of chunks) if (!mobileWalletOnly.has(path)) assert.equal(chunk.text.includes("fonts.googleapis.com"), false, `${path} names Google Fonts`);
  if (!loadsGoogleFont) return;
  for (const locale of Object.keys(LOCALE_PREFIXES)) {
    const main = mainContent(await readFile(pageDocumentPath(locale, "/legal/privacy"), "utf8"));
    assert.ok(main.includes("Google Fonts") && main.includes("Mobile Wallet Adapter"), `${locale} privacy names Google Fonts for the Mobile Wallet Adapter screens`);
  }
});

test("Explore, every company card and every product page's What you own link the learn topic that explains it, in their own locale", async () => {
  const { items } = publicCatalog();
  const learnHrefs = (html) => [...html.matchAll(/data-learn-link="([^"]+)"[^>]*>\s*<a href="([^"]+)"/g)].map((match) => [match[1], match[2]]);
  for (const locale of Object.keys(LOCALE_PREFIXES)) {
    const prefix = LOCALE_PREFIXES[locale];
    const explore = mainContent(await readFile(homeDocumentPath(locale), "utf8"));
    assert.deepEqual(learnHrefs(explore), ["xstocks", "prestocks", "reference-prices"].map((topic) => [topic, `${prefix}/learn/${topic}`]), `${locale} Explore learn links`);
    for (const { identity } of items) {
      const own = /id="what-you-own"[\s\S]*?(?=role="region"|<\/main>)/.exec(mainContent(await readFile(documentPath(locale, identity.ticker), "utf8")))?.[0] ?? "";
      assert.deepEqual(learnHrefs(own), [["xstocks", `${prefix}/learn/xstocks`]], `${locale} ${identity.ticker} What you own links the xStocks topic`);
    }
    for (const suffix of ["/provider/prestocks/OPENAI", "/provider/prestocks/SPACEX"]) {
      const own = /id="what-you-own"[\s\S]*?(?=role="region"|<\/main>)/.exec(mainContent(await readFile(pageDocumentPath(locale, suffix), "utf8")))?.[0] ?? "";
      assert.deepEqual(learnHrefs(own), [["prestocks", `${prefix}/learn/prestocks`]], `${locale} ${suffix} What you own links the PreStocks topic`);
    }
    for (const [slug, topic] of [["nvidia", "xstocks"], ["openai", "prestocks"]]) {
      const main = mainContent(await readFile(pageDocumentPath(locale, `/company/${slug}`), "utf8"));
      const cards = count(main, /data-company-product="/g);
      assert.ok(cards >= 1, `${locale} ${slug} has product cards`);
      assert.deepEqual(learnHrefs(main), Array.from({ length: cards }, () => [topic, `${prefix}/learn/${topic}`]), `${locale} ${slug} one learn link per card`);
    }
  }
});
