import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import mapJson from "./company-map-v1.json" with { type: "json" };
import xstocksData from "./xstocks.json" with { type: "json" };
import { validateCompanyMap } from "./company-map-validation.js";
import {
  companyForProviderAsset,
  companyForXStock,
  companyMap,
  findCompany,
  listCompanies,
} from "./company-read-model.js";
import { providerAssets } from "./provider-read-model.js";
import type { XStockEntry } from "./types.js";

const sourceRoot = import.meta.dirname;
const xstocks = xstocksData as XStockEntry[];
const sources = { providerAssets, xstocks };

function copy(): any {
  return JSON.parse(JSON.stringify(mapJson));
}

function company(map: any, slug: string): any {
  return map.companies.find((entry: any) => entry.slug === slug);
}

const NVDA_MINT = xstocks.find((entry) => entry.ticker === "NVDA")!.mint;

/** A copy with one reviewed xStock binding, to exercise the xStock rules the bundled map no longer uses. */
function withXStock(map: any, ticker = "NVDA", mint = NVDA_MINT): any {
  map.companies.push({
    slug: "zz-test-company",
    display_name: "Test Company",
    listing_status: "us_listed",
    instruments: [{ source: "xstocks_registry", ticker, mint, binding_basis: "issuer_product_name" }],
  });
  map.review.issuer_product_checks.push({ ticker, url: "https://xstocks.fi/products/test", checked_on: "2026-09-24" });
  return map;
}

function rejects(mutate: (map: any) => void, message?: RegExp) {
  const map = copy();
  mutate(map);
  expect(() => validateCompanyMap(map, sources)).toThrow(message ?? TypeError);
}

describe("company map artifact", () => {
  it("validates the bundled map against the bundled provider artifact and registry", () => {
    expect(() => validateCompanyMap(mapJson, sources)).not.toThrow();
    expect(companyMap.schema_version).toBe("benten.company-map.v1");
    expect(companyMap.bound_sources.provider_assets_revision).toBe(providerAssets.revision);
    expect(Object.isFrozen(companyMap)).toBe(true);
    expect(Object.isFrozen(companyMap.companies[0].instruments)).toBe(true);
  });

  it("binds to the exact bytes of the bundled xStocks registry", () => {
    const bytes = readFileSync(join(sourceRoot, "xstocks.json"));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(companyMap.bound_sources.xstocks_registry_sha256);
  });

  it("covers the eight private companies with the eight PreStocks entries and binds no xStock", () => {
    expect(listCompanies({ listing_status: "private" }).map(({ slug, display_name, instrument_count }) => ({ slug, display_name, instrument_count }))).toEqual([
      { slug: "anduril", display_name: "Anduril", instrument_count: 1 },
      { slug: "anthropic", display_name: "Anthropic", instrument_count: 1 },
      { slug: "figure-ai", display_name: "Figure AI", instrument_count: 1 },
      { slug: "kalshi", display_name: "Kalshi", instrument_count: 1 },
      { slug: "neuralink", display_name: "Neuralink", instrument_count: 1 },
      { slug: "openai", display_name: "OpenAI", instrument_count: 1 },
      { slug: "polymarket", display_name: "Polymarket", instrument_count: 1 },
      { slug: "spacex", display_name: "SpaceX", instrument_count: 1 },
    ]);
    for (const record of companyMap.companies) {
      expect(record.listing_status).toBe("private");
      expect(record.instruments.every((instrument) => instrument.source === "provider_assets")).toBe(true);
    }
    expect(companyMap.review.issuer_product_checks).toEqual([]);
  });

  it("records the two registry rows withheld from the product as exclusions, never as instruments", () => {
    expect(companyMap.excluded).toEqual([
      { source: "xstocks_registry", ticker: "SPCX", reason: "not_offered" },
      { source: "xstocks_registry", ticker: "VCX", reason: "not_offered" },
    ]);
    expect(findCompany("spacex")!.instruments.map((instrument) => instrument.source)).toEqual(["provider_assets"]);
    const spcx = xstocks.find((entry) => entry.ticker === "SPCX")!;
    rejects((map) => {
      map.excluded = map.excluded.filter((entry: any) => entry.ticker !== "SPCX");
      withXStock(map, "SPCX", spcx.mint);
    }, /excluded xStock/);
    const spy = xstocks.find((entry) => entry.ticker === "SPY")!;
    rejects((map) => { withXStock(map, "SPY", spy.mint); }, /excluded xStock/);
  });

  it("records a public handle as reviewer, never an email address", () => {
    expect(companyMap.review.reviewer).not.toContain("@");
    rejects((map) => { map.review.reviewer = "maintainer@example.com"; });
    rejects((map) => { map.review.reviewer = ""; });
  });

  it("rejects an unknown asset", () => {
    rejects((map) => { company(map, "anduril").instruments[0].provider_asset_id = "ANDURIL2"; }, /does not resolve/);
    rejects((map) => { withXStock(map).companies.at(-1).instruments[0].ticker = "ZZZZ"; }, /does not resolve/);
  });

  it("rejects a mint mismatch", () => {
    rejects((map) => { company(map, "openai").instruments[0].mint = company(map, "anduril").instruments[0].mint; }, /mint mismatch/);
    rejects((map) => { withXStock(map, "NVDA", "Xs7UsqobM3EJgMeHwdAbmDBCZH1G5WTCjatpeYcCr8x"); }, /mint mismatch/);
  });

  it("rejects an instrument from a provider outside the artifact", () => {
    rejects((map) => {
      company(map, "openai").instruments.push({
        source: "provider_assets", provider: "other", provider_asset_id: "OPENAI2",
        mint: "11111111111111111111111111111111", binding_basis: "provider_company_claim", provider_company_id: "openai",
      });
    }, /does not resolve/);
  });

  it("rejects a provider company id mismatch", () => {
    rejects((map) => { company(map, "figure-ai").instruments[0].provider_company_id = "figure-ai"; }, /company id mismatch/);
  });

  it("rejects a duplicate instrument across companies or exclusions", () => {
    rejects((map) => { company(map, "anthropic").instruments.push(company(map, "openai").instruments[0]); });
    rejects((map) => { map.excluded.push({ source: "xstocks_registry", ticker: "SPCX", reason: "not_reviewed" }); }, /duplicate/);
    rejects((map) => { withXStock(map).excluded.push({ source: "xstocks_registry", ticker: "NVDA", reason: "not_reviewed" }); }, /duplicate/);
    rejects((map) => { map.excluded.push({ source: "provider_assets", provider: "prestocks", provider_asset_id: "OPENAI", reason: "not_reviewed" }); }, /duplicate/);
  });

  it("rejects an unmapped provider entry", () => {
    rejects((map) => { map.companies = map.companies.filter((entry: any) => entry.slug !== "polymarket"); }, /cover every provider/);
  });

  it("rejects a wrong provider assets revision", () => {
    rejects((map) => { map.bound_sources.provider_assets_revision = "0".repeat(64); }, /different provider assets revision/);
  });

  it("detects a wrong xStocks registry digest", () => {
    const bytes = readFileSync(join(sourceRoot, "xstocks.json"));
    expect(createHash("sha256").update(bytes).digest("hex")).not.toBe("0".repeat(64));
    rejects((map) => { map.bound_sources.xstocks_registry_sha256 = "not-a-digest"; }, /registry digest/);
  });

  it("rejects an unsorted company list or instrument list", () => {
    rejects((map) => { map.companies.reverse(); }, /not sorted/);
    rejects((map) => {
      company(map, "spacex").instruments.push({ ...company(map, "anduril").instruments[0] });
      map.companies = map.companies.filter((entry: any) => entry.slug !== "anduril");
    }, /fixed order/);
    rejects((map) => {
      const test = withXStock(map).companies.at(-1);
      test.instruments.unshift({ ...company(map, "anduril").instruments[0] });
      map.companies = map.companies.filter((entry: any) => entry.slug !== "anduril");
    }, /fixed order/);
  });

  it("rejects an uppercase or malformed slug", () => {
    for (const slug of ["OpenAI", "open_ai", "-openai", "openai-", "open--ai", " openai", ""]) {
      rejects((map) => { company(map, "openai").slug = slug; }, /slug/);
    }
  });

  it("rejects unknown fields, bindings and reasons", () => {
    rejects((map) => { map.extra = true; });
    rejects((map) => { company(map, "openai").instruments[0].note = "x"; });
    rejects((map) => { company(map, "openai").instruments[0].binding_basis = "name_match"; });
    rejects((map) => { withXStock(map).companies.at(-1).instruments[0].binding_basis = "provider_company_claim"; });
    rejects((map) => { map.excluded[0].reason = "similar_name"; });
    rejects((map) => { company(map, "openai").listing_status = "public"; });
    rejects((map) => { map.reviewed_at = "2026-09-24 11:26"; });
    rejects((map) => { map.revision = 0; });
  });

  it("requires exactly one issuer product check per mapped xStock", () => {
    expect(() => validateCompanyMap(withXStock(copy()), sources)).not.toThrow();
    rejects((map) => { withXStock(map).review.issuer_product_checks = []; }, /issuer product checks/);
    rejects((map) => { withXStock(map).review.issuer_product_checks[0].url = "https://example.com/spacex"; });
    rejects((map) => { withXStock(map).review.issuer_product_checks[0].checked_on = "2026-09-25"; }, /postdates/);
    rejects((map) => {
      map.review.issuer_product_checks.push({ ticker: "NVDA", url: "https://xstocks.fi/products/test", checked_on: "2026-09-24" });
    }, /issuer product checks/);
  });

  it("looks companies up exactly", () => {
    expect(findCompany("openai")?.display_name).toBe("OpenAI");
    for (const slug of ["OpenAI", " openai", "openai ", "figureai", "open-ai", "open", "", undefined, null, 1]) {
      expect(findCompany(slug)).toBeUndefined();
    }
    expect(findCompany("constructor")).toBeUndefined();
    expect(findCompany("__proto__")).toBeUndefined();
  });

  it("maps every provider entry to a company and no withheld xStock", () => {
    for (const entry of providerAssets.entries) {
      expect(companyForProviderAsset(entry.provider, entry.provider_asset_id)).toBeDefined();
    }
    expect(companyForProviderAsset("prestocks", "OPENAI")).toEqual({ slug: "openai", display_name: "OpenAI" });
    expect(companyForProviderAsset("other", "OPENAI")).toBeUndefined();
    expect(companyForProviderAsset("prestocks", "openai")).toBeUndefined();
    expect(companyForProviderAsset("xstocks", "SPCX")).toBeUndefined();
    expect(companyForXStock("SPCX")).toBeUndefined();
    expect(companyForXStock("spcx")).toBeUndefined();
    expect(companyForXStock("VCX")).toBeUndefined();
    expect(companyForXStock("NVDA")).toEqual({ slug: "nvidia", display_name: "NVIDIA" });
  });
});
