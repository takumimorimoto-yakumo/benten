import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { companyForXStock, findCompany, listedCompanyMap, productXStockEntries, resolveTicker } from "../../../packages/registry/src/index.ts";
import { buildCompanySearchIndex } from "../../../packages/registry/src/search-index-source.ts";
import indexJson from "../../../packages/registry/src/company-search-index-v1.json" with { type: "json" };
import { NVDAX_MINT } from "../../../packages/purchase/src/route.ts";
import { PRODUCT_ROUTES, PRODUCT_TICKERS } from "../../../packages/purchase/src/routes-table.ts";
import { createCompanyView, isPublishedCompany, publishedCompanies } from "../app/lib/company.server.ts";
import { createCompaniesView, createExploreView } from "../app/lib/directory.server.ts";
import { createStaticFoundationDocument } from "../app/lib/static-document.server.ts";
import { buildDirectoryPrerenderPaths, buildReferencePrerenderPaths } from "../app/lib/prerender-paths.server.ts";
import { listProviderAssets } from "../../../packages/registry/src/index.ts";
import { indexLabels, nextActive, submitOutcome, suggestionPath, suggestionsFor, typedNoMatch } from "../app/features/explore/explore-search.tsx";
import { byLetter } from "../app/features/explore/companies-page.tsx";
import { repeatsName } from "../app/features/explore/directory-rows.tsx";
import { CompanyPage } from "../app/features/references/company-page.tsx";
import { ownershipSentences, purchaseEntryPath } from "../app/features/references/company-product-card.tsx";
import { COMPANY_MESSAGES } from "../app/i18n/company-messages.ts";
import { formatSourceDate } from "../app/i18n/format.ts";
import { PUBLIC_WEB_LOCALES, type PublicWebLocale } from "../app/i18n/locales.ts";
import { forbiddenWords, markedWords } from "./app-vocabulary.mjs";
import { DOUBLED_PUNCTUATION } from "./reference-vocabulary.mjs";

const explore = createExploreView();
const directory = createCompaniesView();
const labels = indexLabels(explore.suggestions);
const RESTORED = { BAC: "bank-of-america", MSTR: "strategy", XOM: "exxonmobil-holdings" } as const;
/**
 * Published companies with a buyable xStock, and the buyable funds no company
 * binds, A to Z: written out here, not read from the routes table, so that a
 * route added or dropped there fails these checks until the lists are
 * reviewed again. A test below ties both to the table.
 */
const BUYABLE_COMPANY_SLUGS = ["advanced-micro-devices", "alphabet", "amazon-com", "berkshire-hathaway", "broadcom", "circle-internet-group", "coca-cola", "coinbase-global", "exxonmobil-holdings", "gamestop", "intel", "mcdonalds", "meta-platforms", "microsoft", "nvidia", "palantir-technologies", "robinhood-markets", "strategy", "tesla", "unitedhealth-group", "walmart"];
const BUYABLE_FUND_TICKERS = ["GLD", "QQQ", "SPY", "STRC"];

describe("buyable lists", () => {
  it("are the routes table's products: those the company maps bind, and the funds no company binds", () => {
    expect(PRODUCT_TICKERS.map((ticker) => companyForXStock(ticker)?.slug).filter((slug): slug is string => slug !== undefined && isPublishedCompany(slug)).sort()).toEqual(BUYABLE_COMPANY_SLUGS);
    expect(PRODUCT_TICKERS.filter((ticker) => companyForXStock(ticker) === undefined).sort()).toEqual(BUYABLE_FUND_TICKERS);
  });
});

describe("published companies", () => {
  it("are the 8 reviewed private companies and the 129 US-listed companies of the generated map, in slug order", () => {
    const published = publishedCompanies();
    expect(published.filter((company) => company.listing_status === "private").map((company) => company.slug))
      .toEqual(["anduril", "anthropic", "figure-ai", "kalshi", "neuralink", "openai", "polymarket", "spacex"]);
    expect(published.filter((company) => company.listing_status === "us_listed")).toHaveLength(129);
    expect(published).toHaveLength(137);
    expect(published.map((company) => company.slug)).toEqual([...published.map((company) => company.slug)].sort());
    expect(isPublishedCompany("nvidia")).toBe(true);
    expect(isPublishedCompany("NVIDIA")).toBe(false);
  });

  it("give BAC, MSTR and XOM their companies again, readable names and no unlinked token", () => {
    expect(listedCompanyMap.excluded).toEqual([]);
    for (const [ticker, slug] of Object.entries(RESTORED)) {
      expect(isPublishedCompany(slug)).toBe(true);
      expect(findCompany(slug)!.instruments.map((instrument) => instrument.source === "xstocks_registry" ? instrument.entry.ticker : null)).toEqual([ticker]);
    }
    expect(createCompanyView("bank-of-america")).toMatchObject({ displayName: "Bank of America", secRegistrant: "BANK OF AMERICA CORP /DE/" });
    expect(createCompanyView("strategy")).toMatchObject({ displayName: "Strategy" });
    expect(createCompanyView("exxonmobil-holdings")).toMatchObject({ displayName: "ExxonMobil", secRegistrant: "ExxonMobil Holdings Corp" });
    expect(createCompanyView("nvidia")).toMatchObject({ displayName: "NVIDIA", secRegistrant: "NVIDIA CORP" });
    expect(createCompanyView("openai").secRegistrant).toBeNull();
    expect(directory.unlinked).toEqual([]);
  });

  it("prerender one page per published company and one companies list per locale", () => {
    const paths = buildReferencePrerenderPaths(listProviderAssets({}), publishedCompanies());
    expect(paths).toHaveLength(5 * (8 + 137));
    expect(paths).toContain("/company/nvidia");
    expect(paths).toContain("/ja/company/nvidia");
    expect(paths).toContain("/company/bank-of-america");
    expect(buildDirectoryPrerenderPaths()).toEqual(["/companies", "/ja/companies", "/ko/companies", "/zh-Hans/companies", "/zh-Hant/companies"]);
    expect(createStaticFoundationDocument({ pathname: "/ja/companies", route: "companies", locale: "ja" })).toEqual({ kind: "static-foundation-v1", route: "companies", locale: "ja", canonicalPath: "/ja/companies" });
    expect(() => createStaticFoundationDocument({ pathname: "/companies/", route: "companies" })).toThrow();
  });
});

describe("directory views", () => {
  it("place every product xStock exactly once: under its company, unlinked, or with funds", () => {
    const held = publishedCompanies().flatMap((company) => findCompany(company.slug)!.instruments.filter((instrument) => instrument.source === "xstocks_registry").map((instrument) => instrument.entry.ticker));
    const placed = [...held, ...directory.unlinked.map((row) => row.ticker), ...directory.funds.map((row) => row.ticker)].sort();
    expect(placed).toEqual(productXStockEntries.map((entry) => entry.ticker).sort());
    expect(directory.funds).toHaveLength(23);
    expect(directory.funds.every((row) => resolveTicker(row.ticker)?.fundamentals_available === false)).toBe(true);
    for (const withheld of ["SPCX", "VCX"]) expect(placed).not.toContain(withheld);
  });

  it("list rows A to Z, never by a value, and mark only the fixed-route products", () => {
    expect(directory.usListed.map((row) => row.slug)).toEqual([...directory.usListed.map((row) => row.slug)].sort());
    const names = directory.funds.map((row) => row.name.toLowerCase());
    expect(names).toEqual([...names].sort());
    expect([...directory.private, ...directory.usListed].filter((row) => row.buyInBenten).map((row) => row.slug)).toEqual(BUYABLE_COMPANY_SLUGS);
    expect(BUYABLE_COMPANY_SLUGS).toContain("nvidia");
    // Only the funds with a route are marked; no unlinked token has one.
    expect([...directory.unlinked, ...directory.funds].filter((row) => row.buyInBenten).map((row) => row.ticker).sort()).toEqual(BUYABLE_FUND_TICKERS);
    expect(BUYABLE_FUND_TICKERS).toContain("SPY");
    for (const row of [...directory.private, ...directory.usListed]) expect(Object.keys(row).sort()).toEqual(["buyInBenten", "name", "products", "slug"]);
    for (const row of [...directory.unlinked, ...directory.funds]) expect(Object.keys(row).sort()).toEqual(["buyInBenten", "name", "symbol", "ticker"]);
  });

  it("gives Explore all private companies, the first five US-listed companies and three fund examples", () => {
    expect(explore.private.count).toBe(8);
    expect(explore.private.rows).toHaveLength(8);
    expect(explore.usListed.count).toBe(129);
    expect(explore.usListed.rows.map((row) => row.slug)).toEqual(directory.usListed.slice(0, 5).map((row) => row.slug));
    expect(explore.funds).toEqual({ count: 23, examples: directory.funds.slice(0, 3).map((row) => row.name) });
    // Every routes-table product, in registry order, named from its registry record.
    expect(explore.buyable).toEqual(productXStockEntries.filter((entry) => PRODUCT_TICKERS.includes(entry.ticker as never)).map((entry) => ({ symbol: entry.symbol, name: entry.name })));
    expect(explore.buyable.map((token) => token.symbol).sort()).toEqual(PRODUCT_TICKERS.map((ticker) => PRODUCT_ROUTES[ticker].symbol).sort());
    expect(resolveTicker("NVDA")?.mint).toBe(NVDAX_MINT.toBase58());
  });

  it("files rows under their first letter, digits under #", () => {
    expect(byLetter(["3m", "abbott", "adobe", "boeing"], (row) => row).map((group) => [group.letter, group.rows.length])).toEqual([["#", 1], ["A", 2], ["B", 1]]);
    expect(repeatsName("FIGUREAI", "Figure AI")).toBe(true);
    expect(repeatsName("NVDAx", "NVIDIA CORP")).toBe(false);
  });
});

describe("Explore search", () => {
  it("labels every entry of the committed search index, which matches the registry and maps", () => {
    expect(indexJson).toEqual(buildCompanySearchIndex());
    for (const entry of indexJson.entries) {
      const label = entry.slug !== null ? labels.bySlug.get(entry.slug) : labels.byTicker.get(entry.ticker!);
      expect(label, `${entry.slug ?? entry.ticker}`).toBeDefined();
    }
    expect(explore.suggestions).toHaveLength(indexJson.entries.length);
  });

  it("opens a suggestion by the index's exact slug or ticker, never by the typed text", () => {
    const open = (query: string) => suggestionsFor(query, labels).map((label) => suggestionPath("en", label));
    expect(open("nvidia")).toEqual(["/company/nvidia"]);
    expect(open("NVDA")[0]).toBe("/company/nvidia");
    expect(open("nvdax")[0]).toBe("/company/nvidia");
    expect(open("openai")[0]).toBe("/company/openai");
    expect(open("SPY")[0]).toBe("/stock/SPY");
    expect(open("BAC")[0]).toBe("/company/bank-of-america");
    expect(open("Advanced Micro Devices")[0]).toBe("/company/advanced-micro-devices");
    expect(suggestionsFor("nvidia", labels).map((label) => suggestionPath("ja", label))).toEqual(["/ja/company/nvidia"]);
    for (const probe of ["", "   ", "../stock/NVDA", "/company/nvidia", "zzzz", "SPCX", "VCX", "tOpenAI"]) {
      for (const path of open(probe)) expect(path, probe).toMatch(/^\/(company\/[a-z0-9-]+|stock\/[A-Z0-9.-]+)$/);
    }
    expect(open("SPCX")).toEqual([]);
    expect(open("zzzz")).toEqual([]);
    expect(suggestionsFor("a", labels).length).toBeLessThanOrEqual(6);
  });

  it("opens on Enter only the highlighted suggestion or the only one", () => {
    const one = suggestionsFor("nvidia", labels);
    const several = suggestionsFor("a", labels);
    expect(submitOutcome("nvidia", one, -1)).toEqual({ kind: "open", label: one[0] });
    expect(submitOutcome("a", several, -1)).toEqual({ kind: "choose" });
    expect(submitOutcome("a", several, 2)).toEqual({ kind: "open", label: several[2] });
    expect(submitOutcome("zzzz", [], -1)).toEqual({ kind: "no-match" });
    expect(submitOutcome("  ", [], -1)).toEqual({ kind: "none" });
    expect([nextActive(-1, 1, 3), nextActive(2, 1, 3), nextActive(-1, -1, 3), nextActive(0, -1, 3)]).toEqual([0, -1, 2, -1]);
  });

  it("tags the buyable companies' and tokens' suggestions as in the lists, and no other", () => {
    expect(explore.suggestions.filter((label) => label.buyInBenten).map((label) => label.slug ?? label.ticker).sort()).toEqual([...BUYABLE_COMPANY_SLUGS, ...BUYABLE_FUND_TICKERS].sort());
    expect(suggestionsFor("nvidia", labels)[0]?.buyInBenten).toBe(true);
  });

  it("says no match while typing once two or more characters match nothing", () => {
    expect(typedNoMatch("zzzz", suggestionsFor("zzzz", labels).length)).toBe(true);
    expect(typedNoMatch(" z ", 0)).toBe(false);
    expect(typedNoMatch("\u30bc\u30bc", 0)).toBe(true);
    expect(typedNoMatch("nvidia", suggestionsFor("nvidia", labels).length)).toBe(false);
  });
});

describe("company page", () => {
  it("builds every published company's cards in map order, with SEC facts only for US-listed companies", () => {
    for (const company of publishedCompanies()) {
      const view = createCompanyView(company.slug);
      const record = findCompany(company.slug)!;
      expect(view.products.map((product) => product.key)).toEqual(record.instruments.map((instrument) => (instrument.source === "xstocks_registry" ? `xstocks/${instrument.entry.ticker}` : `${instrument.entry.provider}/${instrument.entry.provider_asset_id}`)));
      expect(view.facts.kind === "private").toBe(company.listing_status === "private");
      expect(view.method.kind).toBe(company.listing_status === "private" ? "reviewed" : "generated");
      if (view.method.kind === "generated") expect(view.method.humanReview).toBe("pending");
    }
    const nvidia = createCompanyView("nvidia");
    expect(nvidia.products).toEqual([expect.objectContaining({ symbol: "NVDAx", buyable: true, mint: NVDAX_MINT.toBase58() })]);
    expect(nvidia.facts.kind).toBe("verified");
    expect(createCompanyView("openai").products).toEqual([expect.objectContaining({ provider: "prestocks", routeKey: "OPENAI", buyable: false })]);
    expect(publishedCompanies().filter((company) => createCompanyView(company.slug).products.some((product) => product.buyable)).map((company) => company.slug).sort()).toEqual(BUYABLE_COMPANY_SLUGS);
    expect(purchaseEntryPath("ja", "NVDA")).toBe("/ja/stock/NVDA/buy");
  });

  it("carries no provider reference or supply value", () => {
    const providers = listProviderAssets({});
    if (!providers.found) throw new Error("provider catalog unavailable");
    for (const slug of ["openai", "spacex", "anthropic"]) {
      const serialized = JSON.stringify(createCompanyView(slug));
      for (const entry of providers.items) {
        for (const reference of entry.references) expect(serialized.includes(reference.value)).toBe(false);
        if (entry.supply_reference) expect(serialized.includes(entry.supply_reference.value)).toBe(false);
      }
    }
  });

  it("renders the IA order, the Pyth reference price, the empty agent slot, one buy action and the notice only with two products", () => {
    for (const locale of PUBLIC_WEB_LOCALES) {
      const nvidia = renderToStaticMarkup(createElement(CompanyPage, { view: createCompanyView("nvidia"), locale }));
      const order = ["data-company-title", "company-products-heading", "company-facts-heading", 'data-slot="consider-with-my-conditions"', "company-method-heading"].map((marker) => nvidia.indexOf(marker));
      expect(order.every((index, position) => index >= 0 && (position === 0 || index > order[position - 1]!)), locale).toBe(true);
      expect(nvidia).toContain('<div data-slot="consider-with-my-conditions" class="empty:hidden"></div>');
      expect(nvidia).not.toContain("data-price-slot");
      expect([...nvidia.matchAll(/data-term="pyth-reference-price"/g)]).toHaveLength(1);
      expect(nvidia).toMatch(/data-term="pyth-reference-price" data-pyth-price-status="loading" data-pyth-feed="[0-9a-f]{64}"/);
      expect([...nvidia.matchAll(/data-cta="buy"/g)]).toHaveLength(1);
      expect(nvidia).not.toContain("data-company-notice");
      const openai = renderToStaticMarkup(createElement(CompanyPage, { view: createCompanyView("openai"), locale }));
      expect(openai).not.toContain('data-cta="buy"');
      expect(openai).toContain("data-product-compare-only");
      expect(openai).toMatch(/data-term="pyth-reference-price" data-pyth-price-status="(loading|no-feed)"/);
      const two = createCompanyView("openai");
      const multi = renderToStaticMarkup(createElement(CompanyPage, { view: { ...two, products: [two.products[0]!, { ...two.products[0]!, key: "prestocks/OTHER", routeKey: "OTHER" }] }, locale }));
      expect(multi.indexOf("data-company-notice")).toBeGreaterThan(multi.indexOf("company-products-heading"));
      expect(multi.indexOf("data-company-notice")).toBeLessThan(multi.indexOf("data-company-product="));
    }
  });

  it("states ownership from the record's fields", () => {
    expect(ownershipSentences({ kind: "xstock" }, "xStocks", "en")).toEqual([COMPANY_MESSAGES.en.company.own.xstock]);
    expect(ownershipSentences({ kind: "provider", instrumentKind: "economic_exposure_instrument", claimOnly: true, equityOwnership: "unknown", votingRights: "unknown" }, "PreStocks", "en").join(" "))
      .toBe("PreStocks says this token gives economic exposure to the company. Ownership and voting rights are unknown. Benten has not verified this.");
    expect(ownershipSentences({ kind: "provider", instrumentKind: "tracker_certificate", claimOnly: false, equityOwnership: false, votingRights: false }, "P", "en")).toHaveLength(2);
  });

  it("runs the ownership sentences together without a half-width space after a Japanese or Chinese full stop", () => {
    for (const locale of ["ja", "zh-Hans", "zh-Hant"] as const) {
      const openai = renderToStaticMarkup(createElement(CompanyPage, { view: createCompanyView("openai"), locale }));
      const ownership = [...openai.matchAll(/<p class="text-base">([^<]*)<\/p>/g)].map((match) => match[1]!);
      expect(ownership.length).toBeGreaterThan(0);
      for (const text of ownership) {
        expect(text.match(/\u3002/g)?.length ?? 0).toBeGreaterThan(1);
        // The ideographic full stop, and the full-width exclamation and question marks, followed by a space.
        expect(text).not.toMatch(/[\u3002\uff01\uff1f] /);
      }
    }
  });
});

function shape(value: unknown): unknown {
  if (typeof value === "function") return `fn/${value.length}`;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, shape(nested)]));
  return typeof value;
}

/** Every string a catalog can produce, with the locale's real date as each argument (ko dates end in a period). */
function strings(value: unknown, locale: PublicWebLocale): string[] {
  if (typeof value === "string") return [value];
  const date = formatSourceDate("2026-09-23", locale);
  if (typeof value === "function") return [String(value(date, date, date, date))];
  if (value && typeof value === "object") return Object.values(value).flatMap((nested) => strings(nested, locale));
  return [];
}

describe("company catalog copy", () => {
  it("has the same keys in every locale", () => {
    for (const locale of PUBLIC_WEB_LOCALES) expect(shape(COMPANY_MESSAGES[locale])).toEqual(shape(COMPANY_MESSAGES.en));
  });

  it("names no forbidden word, and names buying only in the strings rendered inside the buy markers", () => {
    for (const locale of PUBLIC_WEB_LOCALES) {
      const copy = COMPANY_MESSAGES[locale];
      for (const text of strings(copy, locale)) {
        expect(forbiddenWords(text, locale), `${locale}: ${text}`).toEqual([]);
        expect(DOUBLED_PUNCTUATION.test(text), `${locale}: ${text}`).toBe(false);
      }
      const { buyInBenten, explore: { capability, ...exploreRest }, company: { capability: { buy, ...capabilityRest }, cta, ...companyRest }, ...rest } = copy;
      for (const text of strings({ exploreRest, capabilityRest, companyRest, rest }, locale)) expect(markedWords(text, locale), `${locale}: ${text}`).toEqual([]);
      expect(strings({ buyInBenten, capability, buy, cta }, locale).every((text) => markedWords(text, locale).length > 0), locale).toBe(true);
    }
  });
});
