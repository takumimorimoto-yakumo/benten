import { describe, expect, it } from "vitest";
import verifiedOverlay from "./verified-facts-v2.json" with { type: "json" };
import manifestJson from "./snapshot-manifest.json" with { type: "json" };
import publicLedger from "../../../docs/source-verification-ledger.json" with { type: "json" };

import {
  ARTIFACT_REVISION,
  RELEASE_PROFILE,
  getAssetIdentity,
  getCoverageState,
  getLegacyFundamentals,
  getLegacyStatements,
  getVerifiedFundamentals,
  getVerifiedStatements,
  resolveAssetIdentifier,
  validateSnapshotManifest,
  validateVerifiedOverlay,
  xstocks,
} from "./index.js";
import { availabilityFromSources, coverageAvailabilityFromRecords } from "./coverage-state.js";

const ABNB_MINT = "XscSc1zjbVizEnhCzzehJ9fzztm3WRKdn9pjmriKDuN";

describe("public data v2 selectors", () => {
  it("marks a verified-only capability available", () => {
    expect(availabilityFromSources(false, true)).toBe("available");
    expect(availabilityFromSources(false, false)).toBe("no_data");
  });
  it("derives a real verified-only NVDA fixture as fully available", () => {
    expect(coverageAvailabilityFromRecords(null, null, (verifiedOverlay.records as any).NVDA)).toEqual({
      snapshot_status: "available",
      capabilities: { fundamentals: "available", pl: "available", bs: "available", cf: "available" },
    });
  });
  it("converges a known ticker and mint on the same allowlisted entry", () => {
    expect(resolveAssetIdentifier({ ticker: " abnb " }))
      .toBe(resolveAssetIdentifier({ mint: ` ${ABNB_MINT} ` }));
  });

  it.each([
    {},
    { ticker: "ABNB", mint: ABNB_MINT },
    { ticker: "AB" },
    { ticker: "mſft" },
    { ticker: "ＮＶＤＡ" },
    { mint: ABNB_MINT.toLowerCase() },
    { ticker: "NVDA' OR '1'='1" },
  ])("fails closed for invalid identifier %#", (input) => {
    expect(resolveAssetIdentifier(input)).toBeUndefined();
  });

  it("keeps legacy facts separate and preserves the exact ABNB values", () => {
    expect(getLegacyFundamentals("ABNB")).toMatchObject({
      kind: "legacy_snapshot",
      legacy_as_of: "FY2025",
      currency: null,
      unit: null,
      fact_kind: "unknown",
      source_refs: [],
      values: { company_name: "Airbnb, Inc.", fcf: 3_898_000_000 },
    });
  });

  it("returns independent statement availability without inventing a row", () => {
    expect(getLegacyStatements("SLMT")).toMatchObject({
      pl: { kind: "legacy_snapshot" },
      bs: null,
      cf: null,
    });
  });

  it("uses null verified facts and legacy identity for a ticker outside the overlay", () => {
    const entry = resolveAssetIdentifier({ ticker: "TSM" });
    expect(entry).toBeDefined();
    expect(getAssetIdentity(entry!)).toMatchObject({
      ticker: "TSM",
      underlying_company: null,
      underlying_company_source_ref: null,
      token_program: "unknown",
    });
    expect(getVerifiedFundamentals("TSM")).toBeNull();
    expect(getVerifiedStatements("TSM")).toEqual({ pl: null, bs: null, cf: null });
  });

  it("separates eligibility, snapshot, source, and statement capabilities", () => {
    const asml = resolveAssetIdentifier({ ticker: "ASML" });
    const slmt = resolveAssetIdentifier({ ticker: "SLMT" });
    const bdw = resolveAssetIdentifier({ ticker: "BDWAP" });
    expect(getCoverageState(asml!)).toMatchObject({
      filing_eligibility: "eligible",
      snapshot_status: "no_data",
      source_status: "not_applicable",
    });
    expect(getCoverageState(slmt!).capabilities).toEqual({
      fundamentals: "available", pl: "available", bs: "no_data", cf: "no_data",
    });
    expect(getCoverageState(bdw!)).toMatchObject({
      filing_eligibility: "not_eligible",
      snapshot_status: "no_data",
      source_status: "not_applicable",
      exclusion_reason: "non_sec_listing",
    });
  });

  it.each([
    ["BITX", "etf"],
    ["BDWAP", "non_sec_listing"],
    ["STRC", "preferred"],
  ])("preserves the structural exclusion reason for %s", (ticker, reason) => {
    expect(getCoverageState(resolveAssetIdentifier({ ticker })!).exclusion_reason).toBe(reason);
  });

  it("exports the immutable artifact revision and mint-core profile", () => {
    expect(ARTIFACT_REVISION).toBe(manifestJson.artifact_revision);
    expect(RELEASE_PROFILE).toBe("mint_core");
  });

  it("returns only the directly reported allowlist for a source-verified issuer", () => {
    const nvda = resolveAssetIdentifier({ ticker: "NVDA" })!;
    const facts = getVerifiedFundamentals("NVDA")!.facts;
    expect(getCoverageState(nvda).source_status).toBe("source_verified");
    expect(Object.keys(facts).sort()).toEqual([
      "net_income_parent", "operating_cf", "revenue", "total_assets", "total_liabilities",
    ]);
    expect("fcf" in facts).toBe(false);
  });

  it("publishes the mechanically extracted annual EDGAR issuer set", () => {
    const verified = xstocks.filter((entry) => getVerifiedFundamentals(entry.ticker) !== null);
    expect(verified).toHaveLength(107);
    const counts = ["NVDA", "MSFT", "AMZN"].map((ticker) =>
      Object.keys(getVerifiedFundamentals(ticker)!.facts).length);
    expect(counts).toEqual([5, 5, 4]);
    expect(getVerifiedFundamentals("AMZN")!.facts.total_liabilities).toBeUndefined();
    expect(getVerifiedFundamentals("TSM")).toBeNull();
  });

  it("keeps the canonical verified overlay immutable across sequential reads", () => {
    const first = getVerifiedFundamentals("NVDA")!;
    const firstRevenue = first.facts.revenue!;
    const firstStatements = getVerifiedStatements("NVDA");
    const firstPeriod = firstStatements.pl!.periods[firstRevenue.period_ref]!;
    const firstSource = firstStatements.pl!.source_refs[firstRevenue.source_ref]!;
    const originalRevenue = firstRevenue.value;
    const originalPeriodEnd = firstPeriod.period_end;
    const originalFiledAt = firstSource.filed_at;

    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.facts)).toBe(true);
    expect(Object.isFrozen(firstRevenue)).toBe(true);
    expect(Object.isFrozen(firstStatements)).toBe(true);
    expect(Object.isFrozen(firstStatements.pl)).toBe(true);
    expect(Object.isFrozen(firstPeriod)).toBe(true);
    expect(Object.isFrozen(firstSource)).toBe(true);
    for (const mutate of [
      () => { (firstRevenue as { value: number }).value = 1; },
      () => { (firstPeriod as { period_end: string }).period_end = "1900-01-01"; },
      () => { (firstSource as { filed_at: string }).filed_at = "1900-01-01"; },
      () => { (firstStatements as { pl: null }).pl = null; },
    ]) expect(mutate).toThrow(TypeError);

    const second = getVerifiedFundamentals("NVDA")!;
    const secondStatements = getVerifiedStatements("NVDA");
    expect(second.facts.revenue!.value).toBe(originalRevenue);
    expect(secondStatements.pl!.periods[firstRevenue.period_ref]!.period_end).toBe(originalPeriodEnd);
    expect(secondStatements.pl!.source_refs[firstRevenue.source_ref]!.filed_at).toBe(originalFiledAt);
    expect(ARTIFACT_REVISION).toBe(manifestJson.artifact_revision);
  });

  it("keeps every published verified fact equal to its public source ledger receipt", () => {
    expect(publicLedger.candidate_sha256).toBe("57140b461d10a7d54c91a036aaf225a2b2b178041af98c5431ab79cc74cbe50a");
    for (const issuer of publicLedger.issuers) {
      expect(issuer.source.form).toBe(publicLedger.supported_fact_contract.form);
      expect(publicLedger.supported_fact_contract.surfaces).toEqual(["fundamentals", "statement"]);
      const record = (verifiedOverlay.records as any)[issuer.ticker];
      expect(record.identity.underlying_company).toBe(issuer.company);
      expect(record.identity.source).toMatchObject(issuer.source);
      for (const [name, receipt] of Object.entries(issuer.facts) as Array<[string, any]>) {
        const statementName = ["revenue", "net_income_parent"].includes(name) ? "pl"
          : ["total_assets", "total_liabilities"].includes(name) ? "bs" : "cf";
        for (const set of [record.fundamentals, record.statements[statementName]]) {
          const fact = set.facts[name];
          const period = set.periods[fact.period_ref];
          const source = set.source_refs[fact.source_ref];
          expect({
            value: fact.value,
            concept: fact.source_concept,
            period_type: period.fact_period_type,
            currency: fact.currency,
            unit: fact.unit,
            scale: fact.scale,
            period_start: period.period_start,
            period_end: period.period_end,
            fiscal_year: period.fiscal_year,
            accession_number: source.accession_number,
            form: source.form,
            filed_at: source.filed_at,
            filing_url: source.filing_url,
          }).toEqual({
            ...receipt,
            currency: publicLedger.supported_fact_contract.currency,
            unit: publicLedger.supported_fact_contract.unit,
            scale: publicLedger.supported_fact_contract.scale,
            period_start: receipt.period_type === "duration" ? issuer.period.start : null,
            period_end: issuer.period.end,
            fiscal_year: issuer.period.fiscal_year,
            ...issuer.source,
          });
        }
      }
    }
  });
});

describe("public data v2 validators", () => {
  it("accepts the exact empty verified overlay", () => {
    expect(validateVerifiedOverlay({ schema_version: "2.0", records: {} }))
      .toEqual({ schema_version: "2.0", records: {} });
  });

  it.each([
    { schema_version: "2.0", records: {}, extra: true },
    { schema_version: "2.0", records: { UNKNOWN: {} } },
    { schema_version: "2.0", records: { ABNB: { identity: {}, fundamentals: null, statements: { pl: null, bs: null, cf: null } } } },
  ])("rejects malformed overlays %#", (input) => {
    expect(() => validateVerifiedOverlay(input)).toThrow(TypeError);
  });

  it("rejects FCF and unsafe values from the verified fact set", () => {
    const baseFact = {
      kind: "verified_reported", value: 1, currency: "USD", unit: "currency", scale: 1,
      period_ref: "FY2025-duration", source_ref: "sec-1", source_concept: "Revenue",
    };
    const baseRecord: Record<string, any> = {
      identity: {
        underlying_company: "Airbnb, Inc.",
        source: {
          source_ref: "sec-1", form: "10-K", accession_number: "0000000000-25-000001",
          filed_at: "2026-01-01", filing_url: "https://www.sec.gov/Archives/example.htm",
          source_authority: "SEC EDGAR",
        },
      },
      fundamentals: {
        kind: "source_verified",
        periods: {
          "FY2025-duration": {
            period_ref: "FY2025-duration", fiscal_year: 2025, fiscal_month: 12,
            period_kind: "FY", fact_period_type: "duration", period_start: "2025-01-01", period_end: "2025-12-31",
          },
        },
        source_refs: {
          "sec-1": {
            source_ref: "sec-1", form: "10-K", accession_number: "0000000000-25-000001",
            filed_at: "2026-01-01", filing_url: "https://www.sec.gov/Archives/example.htm",
            source_authority: "SEC EDGAR",
          },
        },
        facts: { fcf: baseFact },
      },
      statements: { pl: null, bs: null, cf: null },
    };
    expect(() => validateVerifiedOverlay({ schema_version: "2.0", records: { ABNB: baseRecord } })).toThrow(TypeError);
    baseRecord.fundamentals.facts = { revenue: { ...baseFact, value: Number.MAX_SAFE_INTEGER + 1 } };
    expect(() => validateVerifiedOverlay({ schema_version: "2.0", records: { ABNB: baseRecord } })).toThrow(TypeError);
  });

  it("rejects unknown manifest fields and malformed hashes", () => {
    expect(() => validateSnapshotManifest({ schema_version: "2.0", extra: true })).toThrow(TypeError);
  });

  it.each([
    ["unknown ticker", (copy: any) => { copy.records.UNKNOWN = copy.records.NVDA; delete copy.records.NVDA; }],
    ["FCF", (copy: any) => { copy.records.NVDA.fundamentals.facts.fcf = copy.records.NVDA.fundamentals.facts.revenue; }],
    ["unsafe number", (copy: any) => { copy.records.NVDA.fundamentals.facts.revenue.value = Number.MAX_SAFE_INTEGER + 1; }],
    ["broken source ref", (copy: any) => { copy.records.NVDA.fundamentals.facts.revenue.source_ref = "missing"; }],
    ["duration/instant mismatch", (copy: any) => { copy.records.NVDA.fundamentals.facts.revenue.period_ref = "nvda-20260125-instant"; }],
    ["unknown fact property", (copy: any) => { copy.records.NVDA.fundamentals.facts.revenue.extra = true; }],
    ["fundamentals/statement divergence", (copy: any) => { copy.records.NVDA.fundamentals.facts.revenue.value += 1; }],
    ["empty verified fact set", (copy: any) => { copy.records.NVDA.statements.cf.facts = {}; }],
    ["inherited source reference", (copy: any) => { copy.records.NVDA.fundamentals.facts.revenue.source_ref = "toString"; }],
    ["prototype source reference", (copy: any) => { copy.records.NVDA.fundamentals.facts.revenue.source_ref = "__proto__"; }],
    ["inherited period reference", (copy: any) => { copy.records.NVDA.fundamentals.facts.revenue.period_ref = "constructor"; }],
    ["divergent resolved period", (copy: any) => { copy.records.NVDA.statements.pl.periods["nvda-20260125-duration"].period_start = "2024-01-01"; }],
    ["divergent resolved source", (copy: any) => { copy.records.NVDA.statements.pl.source_refs["nvda-20260125-10k"].filed_at = "2025-01-01"; }],
    ["unsupported currency", (copy: any) => { copy.records.NVDA.fundamentals.facts.revenue.currency = "ZZZ"; copy.records.NVDA.statements.pl.facts.revenue.currency = "ZZZ"; }],
    ["unsupported scale", (copy: any) => { copy.records.NVDA.fundamentals.facts.revenue.scale = 2; copy.records.NVDA.statements.pl.facts.revenue.scale = 2; }],
    ["invalid taxonomy concept", (copy: any) => { copy.records.NVDA.fundamentals.facts.revenue.source_concept = "not a concept"; copy.records.NVDA.statements.pl.facts.revenue.source_concept = "not a concept"; }],
    ["accession URL mismatch", (copy: any) => { copy.records.NVDA.identity.source.filing_url = copy.records.MSFT.identity.source.filing_url; }],
    ["invalid filing calendar date", (copy: any) => { copy.records.NVDA.identity.source.filed_at = "2026-02-30"; }],
    ["unsupported form", (copy: any) => { copy.records.NVDA.identity.source.form = "8-K"; }],
    ["invalid period calendar date", (copy: any) => { copy.records.NVDA.fundamentals.periods["nvda-20260125-duration"].period_end = "2026-02-30"; }],
  ])("rejects %s in a candidate overlay", (_name, mutate) => {
    const copy: any = structuredClone(verifiedOverlay);
    mutate(copy);
    expect(() => validateVerifiedOverlay(copy)).toThrow(TypeError);
  });

  it.each([
    ["malformed registry URL", (copy: any) => { copy.registry_source_url = "https://"; }],
    ["invalid publication date", (copy: any) => { copy.published_at = "2026-02-30T00:00:00Z"; }],
  ])("rejects %s in a manifest", (_name, mutate) => {
    const manifest = {
      schema_version: "2.0", artifact_revision: "revision", published_at: "2026-09-13T00:00:00Z",
      registry_as_of: "2026-09-12", registry_source_url: "https://docs.xstocks.fi/developers",
      financial_source_authority: "SEC EDGAR",
      registry_snapshot_sha256: "a".repeat(64), legacy_financial_snapshot_sha256: "b".repeat(64),
      verified_overlay_sha256: "c".repeat(64),
      record_counts: { registry: 154, eligible: 129, snapshot_available: 128, source_verified: 3 },
    };
    mutate(manifest);
    expect(() => validateSnapshotManifest(manifest)).toThrow(TypeError);
  });

  it("accepts semantic equality when JSON property order differs", () => {
    const copy: any = structuredClone(verifiedOverlay);
    const reverse = (value: any) => Object.fromEntries(Object.entries(value).reverse());
    copy.records.NVDA.statements.pl.facts.revenue = reverse(copy.records.NVDA.statements.pl.facts.revenue);
    copy.records.NVDA.statements.pl.periods["nvda-20260125-duration"] = reverse(copy.records.NVDA.statements.pl.periods["nvda-20260125-duration"]);
    copy.records.NVDA.statements.pl.source_refs["nvda-20260125-10k"] = reverse(copy.records.NVDA.statements.pl.source_refs["nvda-20260125-10k"]);
    expect(() => validateVerifiedOverlay(copy)).not.toThrow();
  });
});
