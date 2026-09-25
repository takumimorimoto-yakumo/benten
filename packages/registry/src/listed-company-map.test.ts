import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import listedJson from "./listed-company-map-v1.json" with { type: "json" };
import xstocksData from "./xstocks.json" with { type: "json" };
import { companyMap } from "./company-read-model.js";
import { validateListedCompanyMap } from "./listed-company-map-validation.js";
import type { XStockEntry } from "./types.js";

const sourceRoot = import.meta.dirname;
const xstocks = xstocksData as XStockEntry[];
const sources = { xstocks, reviewedMap: companyMap };
const eligible = xstocks.filter((entry) => entry.exclusion_reason === null);

function copy(): any {
  return JSON.parse(JSON.stringify(listedJson));
}

function company(map: any, ticker: string): any {
  return map.companies.find((entry: any) => entry.instruments[0].ticker === ticker);
}

/** Move `ticker`'s company into `excluded` with `reason` (the map itself has no exclusion today). */
function excludeRow(map: any, ticker: string, reason: string, evidence: Record<string, unknown> = {}): any {
  const row = company(map, ticker);
  map.companies = map.companies.filter((entry: any) => entry !== row);
  map.generation.verification.counts.map_companies -= 1;
  map.generation.verification.counts.map_cik_matches_sec -= 1;
  const exclusion = {
    source: "xstocks_registry", ticker, reason,
    evidence: { sec_ciks: [row.evidence.sec_cik], sec_entity_name: row.evidence.sec_entity_name, sec_ticker_title: row.evidence.sec_ticker_title, registry_token_name: row.evidence.registry_token_name, shared_with_tickers: [], ...evidence },
  };
  map.excluded.push(exclusion);
  return exclusion;
}

function rejects(mutate: (map: any) => void, message?: RegExp) {
  const map = copy();
  mutate(map);
  expect(() => validateListedCompanyMap(map, sources)).toThrow(message ?? TypeError);
}

describe("listed company map artifact", () => {
  const map = validateListedCompanyMap(listedJson, sources);

  it("records how it was generated, the independent re-check, and that no person has reviewed it yet", () => {
    expect(map.schema_version).toBe("benten.listed-company-map.v1");
    expect(map.revision).toBe(2);
    expect(map.generation).toMatchObject({
      method: "registry_ticker_sec_cik_entity_name",
      generator: "scripts/companies/build-listed-company-map.mjs",
      generated_by: "claude-opus-5.5",
      human_review: { status: "pending", reviewer: null, reviewed_at: null },
      verification: {
        checked_on: "2026-09-24",
        counts: { map_companies: 129, map_cik_matches_sec: 129, verified_facts_records: 107, verified_facts_cik_and_accession_match: 107 },
      },
    });
    expect(map.generated_at).toMatch(/^2026-09-24T/);
  });

  it("binds to the exact bytes of the reviewed display name overrides", () => {
    const bytes = readFileSync(join(sourceRoot, "../../../scripts/companies/listed-company-display-names.json"));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(map.bound_sources.display_names_sha256);
  });

  it("binds to the exact bytes of the bundled xStocks registry", () => {
    const bytes = readFileSync(join(sourceRoot, "xstocks.json"));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(map.bound_sources.xstocks_registry_sha256);
  });

  it("covers all 129 filing-eligible xStocks as companies, with no exclusion", () => {
    expect(eligible).toHaveLength(129);
    expect(map.companies).toHaveLength(129);
    expect(map.excluded).toEqual([]);
    // Restored 2026-09-24: BAC and XOM are named by their own registrant, and MSTR no longer counts the excluded STRC.
    expect(company(map, "BAC")).toMatchObject({ slug: "bank-of-america", display_name: "Bank of America", evidence: { sec_cik: "0000070858", sec_registrant_name: "BANK OF AMERICA CORP /DE/", sec_entity_name: "BofA Finance LLC" } });
    expect(company(map, "XOM")).toMatchObject({ display_name: "ExxonMobil", evidence: { sec_cik: "0002115436", sec_registrant_name: "ExxonMobil Holdings Corp" } });
    expect(company(map, "MSTR")).toMatchObject({ display_name: "Strategy", evidence: { sec_cik: "0001050446", sec_registrant_name: "STRATEGY INC" } });
    const covered = [...map.companies.map((row) => row.instruments[0].ticker), ...map.excluded.map((row) => row.ticker)];
    expect(covered.sort()).toEqual(eligible.map((entry) => entry.ticker).sort());
  });

  it("lists one us_listed company per token, bound by issuer product name, with a readable name and its SEC registrant", () => {
    for (const row of map.companies) {
      expect(row.listing_status).toBe("us_listed");
      expect(row.instruments).toHaveLength(1);
      expect(row.instruments[0].binding_basis).toBe("issuer_product_name");
      expect(row.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      // Never the raw SEC spelling on its own (upper case with a legal form, or a state suffix such as /DE/).
      expect(row.display_name, row.instruments[0].ticker).not.toMatch(/\/[A-Z]{2}\/?$|\b(INC|CORP|CO|LTD|PLC)\.?$/);
      if (row.display_name_basis === "registry_token_name") expect(row.display_name).toBe(row.evidence.registry_token_name.replace(/ xStock$/, ""));
    }
    expect(map.companies.filter((row) => row.display_name_basis === "sec_registrant_fallback")).toEqual([]);
    expect(map.companies.filter((row) => row.display_name_basis === "reviewed_override").map((row) => row.instruments[0].ticker).sort())
      .toEqual(["AMAT", "AMD", "ARM", "ASML", "DELL", "DIS", "FWONK", "GE", "GME", "MARA", "MSTR", "PEG", "RTX", "SLMT", "SMCI", "TSM", "XOM"]);
    expect(company(map, "NVDA")).toMatchObject({ slug: "nvidia", display_name: "NVIDIA", display_name_basis: "registry_token_name", evidence: { sec_cik: "0001045810", sec_registrant_name: "NVIDIA CORP" } });
    expect(company(map, "MMM")).toMatchObject({ display_name: "3M", evidence: { sec_registrant_name: "3M CO" } });
    expect(company(map, "DIS")).toMatchObject({ display_name: "Walt Disney", evidence: { sec_registrant_name: "WALT DISNEY CO/" } });
    expect(new Set(map.companies.map((row) => row.evidence.sec_cik)).size).toBe(map.companies.length);
  });

  it("never lists a withheld or excluded registry row", () => {
    for (const ticker of ["SPCX", "VCX", "SPY", "STRC", "BDWAP"]) {
      expect(company(map, ticker)).toBeUndefined();
      expect(map.excluded.some((row) => row.ticker === ticker)).toBe(false);
    }
  });
});

describe("listed company map validation", () => {
  it("rejects a withheld or otherwise excluded xStock", () => {
    const spcx = xstocks.find((entry) => entry.ticker === "SPCX")!;
    rejects((map) => {
      company(map, "NVDA").instruments[0] = { source: "xstocks_registry", ticker: "SPCX", mint: spcx.mint, binding_basis: "issuer_product_name" };
    }, /not a filing-eligible xStock/);
    rejects((map) => { excludeRow(map, "AMD", "cik_unresolved", { sec_ciks: [] }).ticker = "SPY"; }, /not a filing-eligible xStock/);
  });

  it("rejects an unknown ticker, a mint mismatch and a second token", () => {
    rejects((map) => { company(map, "NVDA").instruments[0].ticker = "ZZZZ"; }, /does not resolve/);
    rejects((map) => { company(map, "NVDA").instruments[0].mint = company(map, "AMD").instruments[0].mint; }, /mint mismatch/);
    rejects((map) => { company(map, "NVDA").instruments.push({ ...company(map, "AMD").instruments[0] }); }, /exactly one xStock/);
  });

  it("rejects a duplicate token, slug, name or registrant, and a collision with the reviewed map", () => {
    rejects((map) => { const row = excludeRow(map, "AMD", "cik_unresolved", { sec_ciks: [] }); map.excluded.push({ ...row }); }, /duplicate/);
    rejects((map) => { company(map, "AMD").slug = "nvidia"; });
    rejects((map) => { company(map, "AMD").display_name = "NVIDIA"; }, /duplicate/);
    rejects((map) => { company(map, "AMD").evidence.sec_cik = company(map, "NVDA").evidence.sec_cik; }, /share one SEC registrant/);
    rejects((map) => {
      const row = company(map, "ABNB");
      row.slug = "anthropic";
      map.companies.sort((a: any, b: any) => (a.slug < b.slug ? -1 : 1));
    }, /duplicate listed company/);
  });

  it("rejects an uncovered eligible xStock, an unsorted list and a malformed slug", () => {
    rejects((map) => { map.companies = map.companies.filter((row: any) => row.instruments[0].ticker !== "NVDA"); }, /every filing-eligible/);
    rejects((map) => { excludeRow(map, "AMD", "cik_unresolved", { sec_ciks: [] }); map.excluded = []; }, /every filing-eligible/);
    rejects((map) => { map.generation.verification.counts.map_companies = 128; map.generation.verification.counts.map_cik_matches_sec = 128; }, /verification/);
    rejects((map) => { map.companies.reverse(); }, /not sorted/);
    for (const slug of ["NVIDIA", "nv_idia", "-nvidia", "nvidia-", "nv--idia", ""]) {
      rejects((map) => { company(map, "NVDA").slug = slug; }, /slug/);
    }
  });

  it("rejects a display name that is not what its basis says, and evidence that does not cite the registry", () => {
    rejects((map) => { company(map, "NVDA").display_name = "Nvidia Corporation"; }, /token display name/);
    rejects((map) => { company(map, "NVDA").display_name_basis = "sec_registrant_fallback"; }, /fallback display name/);
    rejects((map) => { company(map, "NVDA").display_name_basis = "guessed"; }, /display name/);
    const fallback = copy();
    Object.assign(company(fallback, "NVDA"), { display_name: "NVIDIA CORP", display_name_basis: "sec_registrant_fallback" });
    expect(() => validateListedCompanyMap(fallback, sources)).not.toThrow();
    rejects((map) => { company(map, "NVDA").evidence.registry_token_name = "Nvidia xStock"; }, /evidence/);
    rejects((map) => { company(map, "NVDA").evidence.sec_cik = "1045810"; }, /evidence/);
    rejects((map) => { company(map, "NVDA").evidence.sec_registrant_name = null; }, /evidence/);
    rejects((map) => { excludeRow(map, "AMD", "cik_unresolved", { sec_ciks: [] }).evidence.registry_token_name = "x"; }, /evidence/);
  });

  it("rejects exclusion evidence that does not support its reason", () => {
    rejects((map) => { excludeRow(map, "MSTR", "cik_shared_by_registry_tokens"); }, /support its reason/);
    rejects((map) => { excludeRow(map, "XOM", "cik_unresolved"); }, /support its reason/);
    rejects((map) => { excludeRow(map, "XOM", "similar_name"); }, /reason/);
    const excluded = copy();
    excludeRow(excluded, "XOM", "submissions_unavailable");
    expect(() => validateListedCompanyMap(excluded, sources)).not.toThrow();
  });

  it("requires a reviewer handle and time only once the review is approved", () => {
    rejects((map) => { map.generation.human_review.reviewer = "someone"; }, /pending/);
    rejects((map) => { map.generation.human_review = { status: "approved", reviewer: null, reviewed_at: null }; }, /approved/);
    rejects((map) => {
      map.generation.human_review = { status: "approved", reviewer: "maintainer@example.com", reviewed_at: "2026-09-25T00:00:00Z" };
    }, /approved/);
    rejects((map) => {
      map.generation.human_review = { status: "approved", reviewer: "maintainer", reviewed_at: "2026-09-01T00:00:00Z" };
    }, /approved/);
    const approved = copy();
    approved.generation.human_review = { status: "approved", reviewer: "maintainer", reviewed_at: "2026-09-25T00:00:00+09:00" };
    expect(() => validateListedCompanyMap(approved, sources)).not.toThrow();
  });

  it("rejects unknown fields, other listing statuses, bindings and generators", () => {
    rejects((map) => { map.extra = true; });
    rejects((map) => { company(map, "NVDA").note = "x"; });
    rejects((map) => { company(map, "NVDA").evidence.note = "x"; });
    rejects((map) => { company(map, "NVDA").listing_status = "private"; }, /listing status/);
    rejects((map) => { company(map, "NVDA").instruments[0].binding_basis = "name_match"; }, /binding basis/);
    rejects((map) => { map.generation.generator = "scripts/other.mjs"; }, /generation/);
    rejects((map) => { map.generation.generated_by = "Someone Else"; }, /generation/);
    rejects((map) => { map.bound_sources.xstocks_registry_sha256 = "0".repeat(64); }, /different xStocks registry/);
    rejects((map) => { map.generated_at = "2026-09-24 08:31"; }, /generation time/);
    rejects((map) => { map.revision = 0; }, /revision/);
    rejects((map) => { map.generation.verification.extra = 1; }, /verification/);
    rejects((map) => { map.generation.verification.counts.map_cik_matches_sec = 130; }, /verification/);
    rejects((map) => { map.generation.verification.checked_on = "yesterday"; }, /verification/);
    rejects((map) => { delete map.bound_sources.display_names_sha256; }, /bound sources/);
  });
});
