import { describe, expect, it } from "vitest";
import { publishedCompanies } from "../app/lib/company.server.ts";
import { findCompany, getAnnualFactSeries, listProviderAssets, providerAssets } from "../../../packages/registry/src/index.ts";
import { COMPANY_FACT_SUMMARY } from "../app/features/references/company-view.ts";
import { createCompanyView } from "../app/lib/company.server.ts";
import { createProviderView } from "../app/lib/provider.server.ts";
import { buildReferencePrerenderPaths } from "../app/lib/prerender-paths.server.ts";
import { createStaticFoundationDocument } from "../app/lib/static-document.server.ts";
import { notFoundDocumentFor, notFoundDocumentPath, notFoundDocumentPaths } from "../app/lib/not-found.ts";
import { formatSourceDate } from "../app/i18n/format.ts";
import { PUBLIC_WEB_LOCALES, type PublicWebLocale } from "../app/i18n/locales.ts";
import { REFERENCE_MESSAGES } from "../app/i18n/messages.ts";
import { DOUBLED_PUNCTUATION, forbiddenMatches } from "./reference-vocabulary.mjs";

function providers() {
  const result = listProviderAssets({});
  if (!result.found) throw new Error("provider catalog unavailable");
  return result.items;
}

describe("provider instrument view", () => {
  it("projects every reviewed instrument exactly, with its full mint and every unknown", () => {
    const items = providers();
    expect(items).toHaveLength(8);
    for (const entry of items) {
      const view = createProviderView(entry.provider, entry.provider_asset_id);
      expect(view.mint).toBe(entry.mint_or_contract);
      expect(view.unknowns.map((unknown) => unknown.code)).toEqual(entry.unknowns.map((unknown) => unknown.code));
      expect(view.references.map((reference) => reference.value)).toEqual(entry.references.map((reference) => reference.value));
      expect(view.sources.length).toBeGreaterThan(0);
      for (const source of view.sources) expect(providerAssets.sources.some((candidate) => candidate.source_url === source.url)).toBe(true);
      expect(view.company.page?.slug).toBeDefined();
    }
  });

  it("fails closed for anything but an exact provider and identifier", () => {
    for (const [provider, id] of [["prestocks", "openai"], ["PreStocks", "OPENAI"], ["other", "OPENAI"], ["prestocks", " OPENAI"], ["unknown", "OPENAI"]]) {
      expect(() => createProviderView(provider!, id!)).toThrow();
    }
  });
});

describe("company view", () => {
  it("resolves slugs exactly: other casings and near misses fail", () => {
    for (const slug of ["OpenAI", "OPENAI", " openai", "openai ", "figureai", "open-ai", "openai/", "NVIDIA", "nvidia-corp"]) expect(() => createCompanyView(slug)).toThrow();
    expect(createCompanyView("spacex").products).toEqual([expect.objectContaining({ provider: "prestocks", routeKey: "SPACEX" })]);
    expect(findCompany("nvidia")?.listing_status).toBe("us_listed");
    expect(createCompanyView("nvidia").listingStatus).toBe("us_listed");
  });

  it("summarizes the newest filing-verified annual point of each summary metric, with its filing", () => {
    let verifiedPages = 0;
    for (const company of publishedCompanies().filter((candidate) => candidate.listing_status === "us_listed")) {
      const view = createCompanyView(company.slug);
      if (view.facts.kind === "private") throw new Error("a US-listed company has SEC facts or the not-verified note");
      const ticker = view.facts.ticker;
      const expected = COMPANY_FACT_SUMMARY.flatMap((name) => {
        const point = getAnnualFactSeries(ticker, { metrics: [name], statuses: ["verified_reported"] }).at(-1);
        return point ? [{ name, value: point.value, currency: point.unit, label: { fiscalYear: point.fiscal_year, periodEnd: point.period_end }, filing: { form: point.form, accessionNumber: point.accession, filedAt: point.filed, filingUrl: point.filing_url } }] : [];
      });
      if (expected.length === 0) {
        expect(view.facts.kind, company.slug).toBe("not_verified");
        continue;
      }
      verifiedPages += 1;
      expect(view.facts.kind === "verified" && view.facts.rows, company.slug).toEqual(expected);
      expect(view.facts.kind === "verified" && view.facts.sources.map((source) => source.accessionNumber), company.slug)
        .toEqual([...new Set(expected.map((row) => row.filing.accessionNumber))]);
    }
    expect(verifiedPages).toBeGreaterThan(0);
  });

  it("shows filing-cited facts on a company page that had only the legacy snapshot", () => {
    const facts = createCompanyView("goldman-sachs-group").facts;
    expect(facts.kind).toBe("verified");
    if (facts.kind !== "verified") return;
    expect(facts.rows.map((row) => [row.name, row.label])).toEqual([
      ["revenue", { fiscalYear: 2025, periodEnd: "2025-12-31" }],
      ["net_income_parent", { fiscalYear: 2025, periodEnd: "2025-12-31" }],
    ]);
    expect(facts.rows.every((row) => row.filing.filingUrl.startsWith("https://www.sec.gov/Archives/edgar/data/"))).toBe(true);
  });

  it("names a January or February year end by the annual history's year and its end month", () => {
    const facts = createCompanyView("home-depot").facts;
    expect(facts.kind === "verified" && facts.rows.map((row) => row.label)).toEqual([
      { fiscalYear: 2026, periodEnd: "2026-02-01" },
      { fiscalYear: 2026, periodEnd: "2026-02-01" },
    ]);
  });
});

describe("reference page documents and paths", () => {
  it("validates provider and company route identity against the artifacts", () => {
    expect(createStaticFoundationDocument({ pathname: "/ja/provider/prestocks/OPENAI", route: "provider", locale: "ja", provider: "prestocks", providerAssetId: "OPENAI" }))
      .toEqual({ kind: "static-foundation-v1", route: "provider", locale: "ja", canonicalPath: "/ja/provider/prestocks/OPENAI", provider: "prestocks", providerAssetId: "OPENAI" });
    expect(() => createStaticFoundationDocument({ pathname: "/provider/other/OPENAI", route: "provider", provider: "other", providerAssetId: "OPENAI" })).toThrow();
    expect(createStaticFoundationDocument({ pathname: "/company/openai", route: "company", slug: "openai" }))
      .toEqual({ kind: "static-foundation-v1", route: "company", locale: "en", canonicalPath: "/company/openai", slug: "openai" });
    expect(() => createStaticFoundationDocument({ pathname: "/company/OpenAI", route: "company", slug: "OpenAI" })).toThrow();
    expect(() => createStaticFoundationDocument({ pathname: "/en/company/openai", route: "company", locale: "en", slug: "openai" })).toThrow();
    expect(() => createStaticFoundationDocument({ pathname: "/provider/prestocks/openai", route: "provider", provider: "prestocks", providerAssetId: "openai" })).toThrow();
    expect(() => createStaticFoundationDocument({ pathname: "/company/openai", route: "company", slug: "openai", ticker: "NVDA" })).toThrow();
  });

  it("prerenders 8 provider and 137 company pages per locale, and one not-found body per locale and scope", () => {
    const paths = buildReferencePrerenderPaths(listProviderAssets({}), publishedCompanies());
    expect(paths).toHaveLength(5 * (8 + 137));
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toContain("/provider/prestocks/OPENAI");
    expect(paths).toContain("/zh-Hant/provider/prestocks/SPACEX");
    expect(paths.some((path) => path.includes("/provider/") && !path.includes("/provider/prestocks/"))).toBe(false);
    expect(paths).toContain("/ko/company/figure-ai");
    expect(paths.some((path) => path.startsWith("/en/"))).toBe(false);
    expect(notFoundDocumentPaths()).toHaveLength(20);
    expect(() => buildReferencePrerenderPaths({ found: true, items: [{ provider: "prestocks", provider_asset_id: "A/B" }] }, [])).toThrow("noncanonical");
    expect(() => buildReferencePrerenderPaths({ found: true, items: [] }, [{ slug: "OpenAI" }])).toThrow("noncanonical");
    expect(() => buildReferencePrerenderPaths({ found: false }, [])).toThrow("unavailable");
  });

  it.each([
    ["/company/unknown", "en", "company"],
    ["/company/OpenAI", "en", "company"],
    ["/ja/company/x?y=1", "ja", "company"],
    ["/ko/provider/prestocks/openai", "ko", "provider"],
    ["/provider/PreStocks/OPENAI", "en", "provider"],
    ["/zh-Hant/stock/UNKNOWN", "zh-Hant", "stock"],
    ["/en/company/openai", "en", "page"],
    ["/Company/openai", "en", "page"],
    ["/fr/company/openai", "en", "page"],
    ["/zzz", "en", "page"],
    ["//evil", "en", "page"],
  ] as const)("maps %s to the %s %s not-found body", (target, locale, scope) => {
    expect(notFoundDocumentFor(target)).toEqual({ locale, scope });
    expect(notFoundDocumentPaths()).toContain(notFoundDocumentPath(locale, scope));
  });
});

function shape(value: unknown): unknown {
  if (typeof value === "function") return `fn/${value.length}`;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, shape(nested)]));
  return typeof value;
}

/**
 * Every string a catalog can produce. Each argument is the locale's real
 * formatted date, because some locales' dates end in a period (ko "2026. 9. 23.").
 */
function strings(value: unknown, locale: PublicWebLocale): string[] {
  if (typeof value === "string") return [value];
  const date = formatSourceDate("2026-09-23", locale);
  if (typeof value === "function") return [String(value(date, date, date))];
  if (value && typeof value === "object") return Object.values(value).flatMap((nested) => strings(nested, locale));
  return [];
}

describe("reference page copy", () => {
  it("has the same key structure in every locale", () => {
    const english = shape(REFERENCE_MESSAGES.en);
    for (const locale of PUBLIC_WEB_LOCALES) expect(shape(REFERENCE_MESSAGES[locale])).toEqual(english);
  });

  it("never doubles sentence punctuation, and names no forbidden term outside the provider no-purchase statement", () => {
    for (const locale of PUBLIC_WEB_LOCALES) {
      const { provider, ...rest } = REFERENCE_MESSAGES[locale];
      const { purchase, ...providerRest } = provider;
      for (const text of strings(REFERENCE_MESSAGES[locale], locale)) expect(DOUBLED_PUNCTUATION.test(text), `${locale}: ${text}`).toBe(false);
      for (const text of strings({ rest, providerRest }, locale)) expect(forbiddenMatches(text, locale), `${locale}: ${text}`).toEqual([]);
      expect(strings(purchase, locale).length).toBe(2);
    }
  });
});
