import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import annualJson from "./verified-facts-annual-v1.json" with { type: "json" };
import overlayJson from "./verified-facts-v2.json" with { type: "json" };
import conceptTable from "./verified-fact-concepts.json" with { type: "json" };
import {
  STATEMENT_DETAIL_NAMES,
  getAnnualFactSeries,
  getStatementRows,
  getStatementSeries,
  readPublicFinancials,
  readPublicFundamentals,
  statementHistoryBlock,
  validateVerifiedAnnualHistory,
  validateVerifiedStatementHistories,
  type CalculatedStatementCell,
  type ReportedStatementCell,
  type StatementDetailName,
} from "./index.js";
import {
  CALCULATED_ITEMS,
  STATEMENT_ITEMS,
  STATEMENT_ITEM_NAMES,
  STATEMENT_ROWS,
  statementArtifactFile,
} from "./statement-history-validation.js";
import { STATEMENT_HISTORY_INPUTS } from "./statement-history-data.js";

const options = { isValidMint: () => true };
const sourceDir = import.meta.dirname;
const inputs = () => structuredClone(STATEMENT_HISTORY_INPUTS) as Record<StatementDetailName, any>;
const firstYear = (all: Record<StatementDetailName, any>, statement: StatementDetailName, ticker = "NVDA") =>
  all[statement].records[ticker].years[0];

describe("statement item table", () => {
  it("keeps the five annual facts unchanged and adds forty reviewed line items", () => {
    expect(Object.keys(conceptTable.facts)).toEqual(["revenue", "net_income_parent", "total_assets", "total_liabilities", "operating_cf"]);
    expect(STATEMENT_ITEM_NAMES).toHaveLength(40);
    expect(Object.keys(STATEMENT_ITEMS).sort()).toEqual([...STATEMENT_ITEM_NAMES].sort());
  });

  it("places every item in exactly one statement row list, with the annual facts in their statements", () => {
    expect(STATEMENT_ROWS.pl).toEqual(expect.arrayContaining(["revenue", "net_income_parent"]));
    expect(STATEMENT_ROWS.bs).toEqual(expect.arrayContaining(["total_assets", "total_liabilities"]));
    expect(STATEMENT_ROWS.cf).toEqual(expect.arrayContaining(["operating_cf"]));
    const all = STATEMENT_DETAIL_NAMES.flatMap((statement) => STATEMENT_ROWS[statement]);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(45);
  });

  it("keeps component and look-alike concepts out of the allowlists", () => {
    const concepts = (name: string) => [...STATEMENT_ITEMS[name]!.concepts];
    expect(concepts("capex")).not.toContain("us-gaap:PaymentsToAcquireProductiveAssets");
    expect(concepts("ppe")).not.toContain("us-gaap:NoncurrentAssets");
    expect(concepts("net_income")).not.toContain("us-gaap:NetIncomeLossAvailableToCommonStockholdersBasic");
    expect(concepts("equity_parent")).not.toContain("us-gaap:StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest");
    expect(concepts("cash_and_equivalents")).not.toContain("us-gaap:CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents");
    expect(concepts("debt_issued")).not.toContain("us-gaap:ProceedsFromIssuanceOfDebt");
  });

  it("defines each calculated item from two reported items with an explicit formula", () => {
    expect(Object.keys(CALCULATED_ITEMS)).toEqual([
      "gross_margin", "operating_margin", "net_margin", "return_on_equity", "return_on_assets",
      "equity_ratio", "current_ratio", "free_cash_flow",
    ]);
    expect(CALCULATED_ITEMS.free_cash_flow).toMatchObject({ operation: "subtract", formula: "operating_cf - capex", unit: "USD" });
    expect(CALCULATED_ITEMS.gross_margin).toMatchObject({ operation: "divide", formula: "gross_profit / revenue", unit: "ratio" });
    // The legacy compatibility key keeps its own name; the calculated item never reuses it.
    expect(Object.keys(CALCULATED_ITEMS)).not.toContain("fcf");
  });
});

describe("statement artifacts", () => {
  it("leaves the annual artifact byte-identical (regression)", () => {
    const bytes = readFileSync(join(sourceDir, "verified-facts-annual-v1.json"));
    expect(createHash("sha256").update(bytes).digest("hex"))
      .toBe("34ec46415b1c1251ca119e93ceb6ad6a93b5af205d8f08e7bd872c7e09f8eaff");
  });

  it("validates all four bundled statement artifacts against the annual history", () => {
    const annual = validateVerifiedAnnualHistory(structuredClone(annualJson));
    expect(() => validateVerifiedStatementHistories(inputs())).not.toThrow();
    for (const statement of STATEMENT_DETAIL_NAMES) {
      const history = inputs()[statement];
      expect(history.statement).toBe(statement);
      expect(Object.keys(history.records).every((ticker) => Object.hasOwn(annual.records, ticker))).toBe(true);
      expect(statementArtifactFile(statement)).toBe(`verified-statements-annual-v1-${statement}.json`);
    }
  });

  it.each([
    ["an unknown year property", (all: any) => { firstYear(all, "pl").estimate = 1; }],
    ["an unknown fact property", (all: any) => { firstYear(all, "pl").facts.gross_profit.forecast = 1; }],
    ["an unlisted concept", (all: any) => { firstYear(all, "pl").facts.gross_profit.source_concept = "us-gaap:Revenues"; }],
    ["a fact of another statement", (all: any) => { firstYear(all, "pl").facts.capex = firstYear(all, "pl").facts.gross_profit; }],
    ["a year that is not a published annual year", (all: any) => { firstYear(all, "pl").period_end = "2016-02-01"; }],
    ["a different annual report", (all: any) => { firstYear(all, "bs").annual_report_ref = null; }],
    ["a fractional dollar value", (all: any) => { firstYear(all, "pl").facts.gross_profit.value += 0.5; }],
    ["a per-share value with five decimals", (all: any) => { firstYear(all, "per_share").facts.eps_basic.value = 1.23456; }],
    ["an unverified value that names a filing", (all: any) => {
      firstYear(all, "pl").facts.gross_profit = { status: "unverified_or_derived", value: 1, reason: "derived_by_source", source_ref: "x" };
    }],
    ["an unknown unverified reason", (all: any) => {
      firstYear(all, "pl").facts.gross_profit = { status: "unverified_or_derived", value: 1, reason: "estimated" };
    }],
    ["an annual-report provenance written out", (all: any) => {
      Object.assign(firstYear(all, "pl").facts.gross_profit, { provenance: "annual_report", source_ref: firstYear(all, "pl").annual_report_ref });
    }],
    ["a cover date before the period end", (all: any) => { firstYear(all, "per_share").facts.shares_outstanding.as_of = "2015-01-01"; }],
    ["a cover count without its date", (all: any) => { delete firstYear(all, "per_share").facts.shares_outstanding.as_of; }],
    ["a filing record that differs from the annual record", (all: any) => {
      const record = all.pl.records.NVDA;
      const ref = Object.keys(record.sources)[0]!;
      record.sources[ref].filed_at = "2099-01-01";
    }],
    ["an uncited filing", (all: any) => {
      const record = all.pl.records.NVDA;
      const source = structuredClone(Object.values(record.sources)[0]) as any;
      source.source_ref = "nvda-extra";
      source.accession_number = "0000000000-00-000001";
      source.filing_url = "https://www.sec.gov/Archives/edgar/data/1/000000000000000001/x.htm";
      record.sources["nvda-extra"] = source;
    }],
    ["disagreeing year starts across statements", (all: any) => {
      const year = all.cf.records.NVDA.years.at(-1);
      year.period_start = year.period_start.replace(/-\d\d$/, (day: string) => `-${String(Number(day.slice(1)) === 1 ? 2 : 1).padStart(2, "0")}`);
    }],
    ["an unknown ticker", (all: any) => { all.pl.records.ZZZZ = all.pl.records.NVDA; }],
  ])("rejects %s", (_label, mutate) => {
    const all = inputs();
    mutate(all);
    expect(() => validateVerifiedStatementHistories(all)).toThrow(TypeError);
  });
});

describe("getStatementSeries", () => {
  it("returns a fiscal-year x item table whose reported cells cite SEC filings", () => {
    const series = getStatementSeries("NVDA", "pl")!;
    expect(series).toMatchObject({ ticker: "NVDA", statement: "pl", first_fiscal_year: 2016, fiscal_year_from: null, fiscal_year_to: null });
    expect(series.rows.map((row) => row.item)).toEqual(getStatementRows("pl").map((row) => row.item));
    expect(series.years.length).toBeGreaterThanOrEqual(9);
    const years = series.years.map((year) => year.fiscal_year);
    expect(years).toEqual([...years].sort((a, b) => a - b));
    for (const year of series.years) {
      for (const cell of Object.values(year.cells)) {
        if (cell!.kind !== "reported") continue;
        expect(cell!.filing.filing_url).toMatch(/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\//);
        expect(cell!.filing.filed >= year.period_end).toBe(true);
        if (cell!.status === "verified_reported") expect(cell!.source_concept).toMatch(/^(us-gaap|ifrs-full|dei):/);
        else expect(cell!.reason).not.toBeNull();
      }
    }
  });

  it("carries the five annual points unchanged (regression)", () => {
    for (const statement of ["pl", "bs", "cf"] as const) {
      const series = getStatementSeries("MSFT", statement)!;
      for (const point of getAnnualFactSeries("MSFT")) {
        if (point.statement !== statement) continue;
        const cell = series.years.find((year) => year.period_end === point.period_end)!.cells[point.metric] as ReportedStatementCell;
        expect(cell).toMatchObject({
          value: point.value, status: point.status, source_concept: point.source_concept, provenance: point.provenance,
          period_start: point.period_start, period_end: point.period_end,
          filing: { accession: point.accession, filed: point.filed, filing_url: point.filing_url },
        });
      }
    }
  });

  it("includes all 505 newest-year v2 facts as verified cells with the same filing (regression)", () => {
    let count = 0;
    for (const [ticker, record] of Object.entries(overlayJson.records) as [string, any][]) {
      const set = record.fundamentals;
      if (!set) continue;
      for (const [name, fact] of Object.entries(set.facts) as [string, any][]) {
        const period = set.periods[fact.period_ref];
        const source = set.source_refs[fact.source_ref];
        const statement = { revenue: "pl", net_income_parent: "pl", total_assets: "bs", total_liabilities: "bs", operating_cf: "cf" }[name] as StatementDetailName;
        const cell = getStatementSeries(ticker, statement)!.years
          .find((year) => year.period_end === period.period_end)?.cells[name] as ReportedStatementCell | undefined;
        expect(cell, `${ticker} ${name}`).toMatchObject({
          status: "verified_reported", value: fact.value, source_concept: fact.source_concept,
          filing: { accession: source.accession_number, filing_url: source.filing_url },
        });
        count += 1;
      }
    }
    expect(count).toBe(505);
  });

  it("computes calculated cells from same-year reported cells and records the formula and inputs", () => {
    const series = getStatementSeries("MSFT", "cf")!;
    const year = series.years.find((candidate) => candidate.period_end === "2024-06-30")!;
    const fcf = year.cells.free_cash_flow as CalculatedStatementCell;
    const ocf = year.cells.operating_cf as ReportedStatementCell;
    const capex = year.cells.capex as ReportedStatementCell;
    expect(fcf).toMatchObject({
      kind: "calculated", status: "calculated", formula: "operating_cf - capex", unit: "USD",
      value: ocf.value - capex.value, period_start: year.period_start, period_end: "2024-06-30",
    });
    expect(fcf.inputs.map((input) => input.item)).toEqual(["operating_cf", "capex"]);
    expect(fcf.inputs[1]).toMatchObject({ value: capex.value, accession: capex.filing.accession });
    const pl = getStatementSeries("MSFT", "pl")!.years.find((candidate) => candidate.period_end === "2024-06-30")!;
    const margin = pl.cells.gross_margin as CalculatedStatementCell;
    expect(margin.value).toBeCloseTo((pl.cells.gross_profit!.value) / (pl.cells.revenue!.value), 6);
    expect(Number(margin.value.toFixed(6))).toBe(margin.value);
    expect(margin.input_status).toBe("verified_reported");
  });

  it("marks a calculated cell unverified when any input is unverified", () => {
    let checked = 0;
    for (const ticker of Object.keys(annualJson.records)) {
      for (const statement of STATEMENT_DETAIL_NAMES) {
        for (const year of getStatementSeries(ticker, statement)!.years) {
          for (const cell of Object.values(year.cells)) {
            if (cell!.kind !== "calculated") continue;
            const inputs = cell!.inputs.map((input) => year.cells[input.item] ?? null);
            const statuses = cell!.inputs.map((input) => input.status);
            expect(cell!.input_status).toBe(statuses.every((status) => status === "verified_reported") ? "verified_reported" : "unverified_or_derived");
            // Inputs from another statement are still reported cells of the same fiscal year.
            for (const input of inputs) if (input) expect(input.kind).toBe("reported");
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(5000);
  });

  it("omits a ratio whose denominator is not positive", () => {
    for (const ticker of Object.keys(annualJson.records)) {
      for (const year of getStatementSeries(ticker, "pl")!.years) {
        const equity = getStatementSeries(ticker, "bs")!.years.find((candidate) => candidate.period_end === year.period_end)?.cells.equity_parent;
        if (equity && equity.value <= 0) expect(year.cells.return_on_equity).toBeUndefined();
      }
    }
  });

  it("dates a cover-page share count with its cover date", () => {
    const series = getStatementSeries("MSFT", "per_share")!;
    const year = series.years.find((candidate) => candidate.period_end === "2024-06-30")!;
    const shares = year.cells.shares_outstanding as ReportedStatementCell;
    expect(shares.unit).toBe("shares");
    expect(shares.as_of! > "2024-06-30").toBe(true);
    expect(shares.period_start).toBeNull();
    expect((year.cells.eps_diluted as ReportedStatementCell).unit).toBe("USD_per_share");
  });

  it("filters by an inclusive fiscal-year range and fails closed on bad input", () => {
    const series = getStatementSeries("NVDA", "bs", { fiscal_year_from: 2020, fiscal_year_to: 2022 })!;
    expect(series.years.map((year) => year.fiscal_year)).toEqual([2020, 2021, 2022]);
    expect(series).toMatchObject({ fiscal_year_from: 2020, fiscal_year_to: 2022 });
    expect(getStatementSeries("NVDA", "bs", { fiscal_year_from: 2023, fiscal_year_to: 2020 })).toBeNull();
    expect(getStatementSeries("NVDA", "notes" as StatementDetailName)).toBeNull();
    expect(getStatementSeries("nvda", "pl")).toBeNull();
    expect(getStatementSeries("SPY", "pl")).toBeNull();
  });
});

describe("public financials read model", () => {
  it("keeps default results free of statement history (revision 2.0 byte identity)", () => {
    const result = readPublicFinancials({ ticker: "NVDA" }, options);
    expect(result).not.toHaveProperty("statement_history");
    expect(readPublicFundamentals({ ticker: "NVDA" }, options, {})).not.toHaveProperty("statement_history");
  });

  it("adds the selected statement, or all four, when a fiscal-year range is supplied", () => {
    const one = readPublicFinancials({ ticker: "NVDA", statement: "cf" }, options, { fiscal_year_from: 2020 }) as any;
    expect(Object.keys(one.statement_history.statements)).toEqual(["cf"]);
    expect(one.statement_history.statements.cf.years.every((year: any) => year.fiscal_year >= 2020)).toBe(true);
    const all = readPublicFinancials({ ticker: "NVDA" }, options, {}) as any;
    expect(Object.keys(all.statement_history.statements)).toEqual(["pl", "bs", "cf", "per_share"]);
    expect(all.statement_history).toEqual(statementHistoryBlock("NVDA", {}));
  });
});
