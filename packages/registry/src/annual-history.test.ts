import { describe, expect, it } from "vitest";
import annualJson from "./verified-facts-annual-v1.json" with { type: "json" };
import overlayJson from "./verified-facts-v2.json" with { type: "json" };
import conceptTable from "./verified-fact-concepts.json" with { type: "json" };
import {
  ANNUAL_FIRST_FISCAL_YEAR,
  getAnnualFactSeries,
  getAnnualHistory,
  parseAnnualYearRange,
  readPublicFinancials,
  readPublicFundamentals,
  validateVerifiedAnnualHistory,
} from "./index.js";
import { fiscalYearForPeriodEnd } from "./annual-history-validation.js";

const options = { isValidMint: () => true };
const clone = () => structuredClone(annualJson) as any;

describe("annual history artifact", () => {
  it("starts at FY2016 and carries every eligible issuer it can cite", () => {
    expect(ANNUAL_FIRST_FISCAL_YEAR).toBe(2016);
    expect(Object.keys(annualJson.records).length).toBeGreaterThanOrEqual(120);
  });

  it("reproduces every newest-year overlay fact exactly (regression)", () => {
    for (const [ticker, record] of Object.entries(overlayJson.records) as [string, any][]) {
      const set = record.fundamentals;
      for (const [name, fact] of Object.entries(set.facts) as [string, any][]) {
        const period = set.periods[fact.period_ref];
        const source = set.source_refs[fact.source_ref];
        const point = getAnnualFactSeries(ticker, { metrics: [name as any] })
          .find((candidate) => candidate.period_end === period.period_end);
        expect(point, `${ticker} ${name}`).toMatchObject({
          value: fact.value,
          status: "verified_reported",
          source_concept: fact.source_concept,
          accession: source.accession_number,
          filed: source.filed_at,
          filing_url: source.filing_url,
          period_start: period.period_start,
        });
      }
    }
  });

  it("labels each year by the calendar year in which it ends", () => {
    expect(fiscalYearForPeriodEnd("2026-01-25")).toBe(2026);
    expect(fiscalYearForPeriodEnd("2026-01-03")).toBe(2025);
    expect(fiscalYearForPeriodEnd("2025-09-27")).toBe(2025);
    for (const record of Object.values(annualJson.records)) {
      for (const year of record.years) expect(year.fiscal_year).toBe(fiscalYearForPeriodEnd(year.period_end));
    }
  });
});

describe("annual read model", () => {
  it("returns an ascending NVDA revenue series with the chart point fields", () => {
    const series = getAnnualFactSeries("NVDA", { metrics: ["revenue"] });
    expect(series.map((point) => point.fiscal_year)).toEqual([2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]);
    const last = series.at(-1)!;
    expect(last).toEqual({
      fiscal_year: 2026,
      fiscal_month: 1,
      period_start: "2025-01-27",
      period_end: "2026-01-25",
      metric: "revenue",
      statement: "pl",
      value: 215938000000,
      unit: "USD",
      scale: 1,
      status: "verified_reported",
      source_concept: "us-gaap:Revenues",
      provenance: "annual_report",
      reason: null,
      accession: "0001045810-26-000021",
      form: "10-K",
      filed: "2026-02-25",
      filing_url: "https://www.sec.gov/Archives/edgar/data/1045810/000104581026000021/nvda-20260125.htm",
      restatement: null,
    });
  });

  it("filters by fiscal-year range and status", () => {
    const range = getAnnualFactSeries("NVDA", { fiscal_year_from: 2020, fiscal_year_to: 2022 });
    expect(new Set(range.map((point) => point.fiscal_year))).toEqual(new Set([2020, 2021, 2022]));
    const verifiedOnly = getAnnualFactSeries("WMT", { statuses: ["verified_reported"] });
    expect(verifiedOnly.every((point) => point.status === "verified_reported")).toBe(true);
  });

  it("marks a derived total liabilities value as unverified and cites the year's annual report", () => {
    const point = getAnnualFactSeries("WMT", { metrics: ["total_liabilities"] })[0]!;
    expect(point).toMatchObject({ status: "unverified_or_derived", reason: "derived_by_source", source_concept: null, provenance: null });
    const year = getAnnualHistory("WMT", { fiscal_year_from: point.fiscal_year, fiscal_year_to: point.fiscal_year })[0]!;
    expect(point.accession).toBe(year.annual_report!.accession_number);
  });

  it("joins a restated value to both its later filing and the original annual report", () => {
    const restated = Object.keys(annualJson.records).flatMap((ticker) => getAnnualFactSeries(ticker))
      .find((point) => point.provenance === "restated_in_later_report")!;
    expect(restated.restatement).not.toBeNull();
    expect(restated.restatement!.original_value).not.toBe(restated.value);
    expect(restated.restatement!.original_filed < restated.filed).toBe(true);
  });

  it("returns an evidence table year with its annual report and exclusions", () => {
    const [year] = getAnnualHistory("NVDA", { fiscal_year_from: 2025, fiscal_year_to: 2025 });
    expect(year!.annual_report!.form).toBe("10-K");
    expect(Object.keys(year!.points)).toEqual(["revenue", "net_income_parent", "total_assets", "total_liabilities", "operating_cf"]);
    expect(year!.excluded).toEqual({});
  });

  it("returns no history for an unknown or uncovered ticker", () => {
    expect(getAnnualHistory("NOT-A-TICKER")).toEqual([]);
    expect(getAnnualFactSeries("ASML")).toEqual([]);
  });

  it.each([
    [{ fiscal_year_from: 2020 }, true],
    [{}, true],
    [{ fiscal_year_from: 2022, fiscal_year_to: 2020 }, false],
    [{ fiscal_year_from: 2020.5 }, false],
    [{ fiscal_year_from: "2020" }, false],
    [{ fiscal_year_to: 1800 }, false],
    [{ year: 2020 }, false],
    [null, false],
  ])("parses fiscal-year range %j as ok=%s", (input, ok) => {
    expect(parseAnnualYearRange(input).ok).toBe(ok);
  });
});

describe("annual history in public read results", () => {
  it("omits annual_history unless a range is requested", () => {
    const plain = readPublicFundamentals({ ticker: "NVDA" }, options);
    expect(plain.found && "annual_history" in plain).toBe(false);
    const withHistory = readPublicFundamentals({ ticker: "NVDA" }, options, { fiscal_year_from: 2024 });
    expect(withHistory.found && withHistory.annual_history).toMatchObject({
      first_fiscal_year: 2016, fiscal_year_from: 2024, fiscal_year_to: null,
    });
    if (!withHistory.found) throw new Error("expected NVDA");
    expect(new Set(withHistory.annual_history!.points.map((point) => point.fiscal_year))).toEqual(new Set([2024, 2025, 2026]));
  });

  it("limits financial history to the selected statement", () => {
    const result = readPublicFinancials({ ticker: "NVDA", statement: "bs" }, options, {});
    if (!result.found) throw new Error("expected NVDA");
    expect(new Set(result.annual_history!.points.map((point) => point.metric))).toEqual(new Set(["total_assets", "total_liabilities"]));
  });

  it("fails closed on an invalid range before resolving the identifier", () => {
    expect(readPublicFundamentals({ ticker: "NVDA" }, options, { fiscal_year_from: 2025, fiscal_year_to: 2020 }))
      .toMatchObject({ found: false, reason: "invalid_input" });
    expect(readPublicFinancials({ ticker: "NVDA" }, options, { fiscal_year_to: "2020" } as any))
      .toMatchObject({ found: false, reason: "invalid_input" });
  });
});

describe("annual history validation", () => {
  const nvdaYear = (artifact: any) => artifact.records.NVDA.years.at(-1);
  it("accepts the bundled artifact", () => {
    expect(() => validateVerifiedAnnualHistory(annualJson)).not.toThrow();
  });
  it.each<[string, (artifact: any) => void]>([
    ["unknown ticker", (a) => { a.records.ZZZZ = a.records.NVDA; }],
    ["unknown year property", (a) => { nvdaYear(a).estimate = 1; }],
    ["concept outside the allowlist", (a) => { nvdaYear(a).facts.revenue.source_concept = "us-gaap:ProfitLoss"; }],
    ["unsafe value", (a) => { nvdaYear(a).facts.revenue.value = 2 ** 60; }],
    ["non-USD currency", (a) => { nvdaYear(a).facts.revenue.currency = "EUR"; }],
    ["wrong fiscal-year label", (a) => { nvdaYear(a).fiscal_year = 2025; }],
    ["year before the window", (a) => { a.first_fiscal_year = 2027; }],
    ["duration that is not a year", (a) => { nvdaYear(a).period_start = "2025-07-01"; }],
    ["annual-report provenance citing another filing", (a) => { nvdaYear(a).facts.revenue.source_ref = a.records.NVDA.years.at(-2).annual_report_ref; }],
    ["unverified value with a concept", (a) => { nvdaYear(a).facts.total_liabilities = { status: "unverified_or_derived", value: 1, currency: "USD", source_ref: nvdaYear(a).annual_report_ref, reason: "derived_by_source", source_concept: "us-gaap:Liabilities" }; }],
    ["unknown unverified reason", (a) => { nvdaYear(a).facts.total_liabilities = { status: "unverified_or_derived", value: 1, currency: "USD", source_ref: nvdaYear(a).annual_report_ref, reason: "estimated" }; }],
    ["uncited filing", (a) => { a.records.NVDA.sources.extra = { ...a.records.NVDA.sources[nvdaYear(a).annual_report_ref], source_ref: "extra", accession_number: "0001045810-99-000001", filing_url: "https://www.sec.gov/Archives/edgar/data/1045810/000104581099000001/x.htm" }; }],
    ["filing made before the period ended", (a) => { a.records.NVDA.sources[nvdaYear(a).annual_report_ref].filed_at = "2025-01-01"; }],
    ["non-canonical filing URL", (a) => { a.records.NVDA.sources[nvdaYear(a).annual_report_ref].filing_url = "https://example.com/x.htm"; }],
    ["unsupported form", (a) => { a.records.NVDA.sources[nvdaYear(a).annual_report_ref].form = "10-Q"; }],
    ["descending years", (a) => { a.records.NVDA.years.reverse(); }],
    ["exclusion that duplicates a fact", (a) => { nvdaYear(a).excluded.revenue = "not_in_source"; }],
    ["empty year", (a) => { nvdaYear(a).facts = {}; }],
  ])("rejects %s", (_name, mutate) => {
    const artifact = clone();
    mutate(artifact);
    expect(() => validateVerifiedAnnualHistory(artifact)).toThrow(TypeError);
  });

  it("keeps the concept table ordered with the directly reported totals first", () => {
    expect(conceptTable.facts.revenue.concepts[0]!.concept).toBe("us-gaap:Revenues");
    expect(conceptTable.facts.net_income_parent.excluded_concepts.map((entry) => entry.concept)).toContain("us-gaap:ProfitLoss");
    expect(conceptTable.facts.total_liabilities.excluded_concepts.map((entry) => entry.concept)).toContain("us-gaap:LiabilitiesAndStockholdersEquity");
  });
});
