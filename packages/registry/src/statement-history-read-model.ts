/**
 * Multi-year statement tables (C-FIN-03 revision 2.2): fiscal year x line item,
 * each cell joined to exactly the filing it cites.
 *
 * Reported cells are copied from the validated artifacts: the five annual facts
 * from the annual history, every other line item from the per-statement
 * artifacts. Calculated cells are computed here from reported cells of the same
 * fiscal year with the reviewed formulas in `verified-fact-concepts.json`; they
 * carry the formula and their inputs, and inherit `unverified_or_derived` from
 * any input. Nothing is estimated, forecast, ranked, or valued.
 */
import {
  ANNUAL_FACT_NAMES,
  type AnnualExclusionReason,
  type AnnualFilingSource,
  type AnnualForm,
  type AnnualProvenance,
  type UnverifiedReason,
} from "./annual-history-validation.js";
import {
  getAnnualHistory,
  parseAnnualYearRange,
  type AnnualFactPoint,
  type AnnualRestatementPoint,
  type AnnualYearRange,
} from "./annual-history-read-model.js";
import type { VerifiedFactName } from "./artifact-validation.js";
import { ANNUAL_FIRST_FISCAL_YEAR, getAnnualHistoryRecord, getStatementHistoryRecord } from "./public-data-v2.js";
import {
  CALCULATED_ITEMS,
  CORE_STATEMENT_ITEMS,
  STATEMENT_DETAIL_NAMES,
  STATEMENT_ITEMS,
  STATEMENT_ROWS,
  type StatementDetailName,
  type StatementFactRecord,
  type StatementYearRecord,
} from "./statement-history-validation.js";

export type { StatementDetailName } from "./statement-history-validation.js";
export type StatementReportedUnit = "USD" | "USD_per_share" | "shares";
export type StatementCellUnit = StatementReportedUnit | "ratio";
export type StatementReportedStatus = "verified_reported" | "unverified_or_derived";

/** One row of a statement table, in presentation order. */
export interface StatementRowDefinition {
  item: string;
  label: string;
  statement: StatementDetailName;
  kind: "reported" | "calculated";
  /** `USD` whole dollars, `USD_per_share` dollars per share, `shares` whole shares, `ratio` a fraction (0.25 = 25%). */
  unit: StatementCellUnit;
  /** Reported rows only. `cover_instant`: a count as of the annual report's cover date (`as_of`). */
  period_type: "duration" | "instant" | "cover_instant" | null;
  /** Calculated rows only, e.g. `"gross_profit / revenue"`. */
  formula: string | null;
  /** Calculated rows only: the two input items, in formula order. */
  inputs: [string, string] | null;
}

/** The SEC filing a cell cites. */
export interface StatementFilingRef {
  accession: string;
  form: AnnualForm;
  filed: string;
  filing_url: string;
}

/**
 * A reported value. `verified_reported`: the cited filing reports exactly this
 * value for exactly this period under `source_concept`. `unverified_or_derived`:
 * it does not (see `reason`); the cell then cites the fiscal year's annual
 * report only as the filing that covers the year.
 */
export interface ReportedStatementCell {
  item: string;
  kind: "reported";
  status: StatementReportedStatus;
  value: number;
  unit: StatementReportedUnit;
  /** Duration items: the fiscal year's start. Instant items: null. */
  period_start: string | null;
  period_end: string;
  /** `cover_instant` items only: the cover date the count is stated as of. */
  as_of: string | null;
  source_concept: string | null;
  provenance: AnnualProvenance | null;
  reason: UnverifiedReason | null;
  filing: StatementFilingRef;
  restatement: AnnualRestatementPoint | null;
}

/** One input of a calculated cell: the reported cell of the same fiscal year. */
export interface CalculatedInputRef {
  item: string;
  value: number;
  status: StatementReportedStatus;
  accession: string;
  filing_url: string;
}

/**
 * A value computed from two reported cells of the same fiscal year. Never
 * reported by a filing. `input_status` is `unverified_or_derived` when either
 * input is. A `divide` cell exists only when the denominator is greater than zero;
 * a ratio is rounded to six decimal places.
 */
export interface CalculatedStatementCell {
  item: string;
  kind: "calculated";
  status: "calculated";
  input_status: StatementReportedStatus;
  value: number;
  unit: "USD" | "ratio";
  period_start: string | null;
  period_end: string;
  formula: string;
  inputs: [CalculatedInputRef, CalculatedInputRef];
}

export type StatementCell = ReportedStatementCell | CalculatedStatementCell;

/** One fiscal year of one statement. */
export interface StatementYearColumn {
  fiscal_year: number;
  fiscal_month: number;
  period_start: string | null;
  period_end: string;
  annual_report: AnnualFilingSource | null;
  /** Keyed by row `item`; a row without a cell has no value for the year. */
  cells: Partial<Record<string, StatementCell>>;
  /** Source values withheld for the year, by item. */
  excluded: Partial<Record<string, AnnualExclusionReason>>;
}

/** A statement table: rows in presentation order, fiscal years ascending. */
export interface StatementSeries {
  ticker: string;
  statement: StatementDetailName;
  first_fiscal_year: number;
  fiscal_year_from: number | null;
  fiscal_year_to: number | null;
  rows: StatementRowDefinition[];
  years: StatementYearColumn[];
}

/** The block attached to MCP and Web financials results when a year range is requested. */
export interface StatementHistoryBlock {
  first_fiscal_year: number;
  fiscal_year_from: number | null;
  fiscal_year_to: number | null;
  statements: Partial<Record<StatementDetailName, { rows: StatementRowDefinition[]; years: StatementYearColumn[] }>>;
}

const RATIO_DECIMALS = 1e6;

/** Row definitions of one statement: reported rows, then calculated rows. */
export function getStatementRows(statement: StatementDetailName): StatementRowDefinition[] {
  if (!STATEMENT_DETAIL_NAMES.includes(statement)) return [];
  const reported = STATEMENT_ROWS[statement].map((item): StatementRowDefinition => {
    const spec = STATEMENT_ITEMS[item] ?? CORE_STATEMENT_ITEMS[item as VerifiedFactName]!;
    return {
      item, label: spec.label, statement, kind: "reported", unit: spec.unit,
      period_type: spec.periodType, formula: null, inputs: null,
    };
  });
  const calculated = Object.values(CALCULATED_ITEMS).filter((spec) => spec.statement === statement)
    .map((spec): StatementRowDefinition => ({
      item: spec.name, label: spec.label, statement, kind: "calculated", unit: spec.unit,
      period_type: null, formula: spec.formula, inputs: [spec.inputs[0], spec.inputs[1]],
    }));
  return [...reported, ...calculated];
}

function fromAnnualPoint(point: AnnualFactPoint): ReportedStatementCell {
  return {
    item: point.metric, kind: "reported", status: point.status, value: point.value, unit: "USD",
    period_start: point.period_start, period_end: point.period_end, as_of: null,
    source_concept: point.source_concept, provenance: point.provenance, reason: point.reason,
    filing: { accession: point.accession, form: point.form, filed: point.filed, filing_url: point.filing_url },
    restatement: point.restatement,
  };
}

function filingRef(source: AnnualFilingSource): StatementFilingRef {
  return { accession: source.accession_number, form: source.form, filed: source.filed_at, filing_url: source.filing_url };
}

function fromStatementFact(
  item: string,
  fact: StatementFactRecord,
  year: StatementYearRecord,
  periodStart: string | null,
  sources: Record<string, AnnualFilingSource>,
): ReportedStatementCell {
  const spec = STATEMENT_ITEMS[item]!;
  const source = (ref: string | null | undefined): AnnualFilingSource => {
    const filing = ref ? sources[ref] : undefined;
    if (!filing) throw new TypeError("statement fact cites an unknown filing");
    return filing;
  };
  const verified = fact.status === "verified_reported";
  const citedRef = verified && fact.source_ref ? fact.source_ref : year.annual_report_ref;
  const restatement = verified && fact.restatement ? (() => {
    const original = source(fact.restatement.original_source_ref);
    return {
      original_value: fact.restatement.original_value,
      original_source_concept: fact.restatement.original_source_concept,
      original_accession: original.accession_number,
      original_filed: original.filed_at,
      original_filing_url: original.filing_url,
    };
  })() : null;
  return {
    item, kind: "reported", status: fact.status, value: fact.value, unit: spec.unit,
    period_start: spec.periodType === "duration" ? periodStart : null,
    period_end: year.period_end,
    as_of: verified && fact.as_of ? fact.as_of : null,
    source_concept: verified ? fact.source_concept : null,
    provenance: verified ? fact.provenance ?? "annual_report" : null,
    reason: verified ? null : fact.reason,
    filing: filingRef(source(citedRef)),
    restatement,
  };
}

function calculate(
  item: string,
  cells: Partial<Record<string, StatementCell>>,
  periodStart: string | null,
  periodEnd: string,
): CalculatedStatementCell | null {
  const spec = CALCULATED_ITEMS[item]!;
  const [a, b] = spec.inputs.map((input) => cells[input]);
  if (!a || !b || a.kind !== "reported" || b.kind !== "reported") return null;
  let value: number;
  if (spec.operation === "divide") {
    if (!(b.value > 0)) return null;
    value = Math.round((a.value / b.value) * RATIO_DECIMALS) / RATIO_DECIMALS;
  } else {
    value = a.value - b.value;
    if (!Number.isSafeInteger(value)) return null;
  }
  if (!Number.isFinite(value)) return null;
  if (Object.is(value, -0)) value = 0;
  const durationInput = [a, b].some((cell) => cell.period_start !== null);
  const ref = (cell: ReportedStatementCell): CalculatedInputRef => ({
    item: cell.item, value: cell.value, status: cell.status,
    accession: cell.filing.accession, filing_url: cell.filing.filing_url,
  });
  return {
    item, kind: "calculated", status: "calculated",
    input_status: a.status === "verified_reported" && b.status === "verified_reported" ? "verified_reported" : "unverified_or_derived",
    value, unit: spec.unit,
    period_start: durationInput ? periodStart : null,
    period_end: periodEnd,
    formula: spec.formula,
    inputs: [ref(a), ref(b)],
  };
}

/**
 * Every reported cell of every statement for one fiscal year, keyed by item.
 * Calculated items may combine statements (return on equity uses PL and BS).
 */
function reportedCellsByYear(ticker: string, range: AnnualYearRange) {
  const annualYears = getAnnualHistory(ticker, range);
  const byEnd = new Map(annualYears.map((year) => [year.period_end, {
    year,
    periodStart: year.period_start,
    cells: {} as Partial<Record<string, ReportedStatementCell>>,
    excluded: { ...year.excluded } as Partial<Record<string, AnnualExclusionReason>>,
  }]));
  for (const year of annualYears) {
    const entry = byEnd.get(year.period_end)!;
    for (const name of ANNUAL_FACT_NAMES) {
      const point = year.points[name];
      if (point) entry.cells[name] = fromAnnualPoint(point);
    }
  }
  const records = STATEMENT_DETAIL_NAMES.map((statement) => getStatementHistoryRecord(ticker, statement));
  // The duration start of a year: the annual start, else the start any statement artifact states.
  for (const record of records) {
    for (const year of record?.years ?? []) {
      const entry = byEnd.get(year.period_end);
      if (entry && entry.periodStart === null && year.period_start !== null) entry.periodStart = year.period_start;
    }
  }
  for (const record of records) {
    if (!record) continue;
    for (const year of record.years) {
      const entry = byEnd.get(year.period_end);
      if (!entry) continue;
      for (const [item, fact] of Object.entries(year.facts)) {
        entry.cells[item] = fromStatementFact(item, fact, year, entry.periodStart, record.sources);
      }
      Object.assign(entry.excluded, year.excluded);
    }
  }
  return [...byEnd.values()];
}

function columnsFor(
  statement: StatementDetailName,
  rows: StatementRowDefinition[],
  entries: ReturnType<typeof reportedCellsByYear>,
): StatementYearColumn[] {
  const columns: StatementYearColumn[] = [];
  for (const entry of entries) {
    const cells: Partial<Record<string, StatementCell>> = {};
    const excluded: Partial<Record<string, AnnualExclusionReason>> = {};
    for (const row of rows) {
      const cell = row.kind === "reported"
        ? entry.cells[row.item]
        : calculate(row.item, entry.cells, entry.periodStart, entry.year.period_end);
      if (cell) cells[row.item] = cell;
      const reason = entry.excluded[row.item];
      if (reason && !cell) excluded[row.item] = reason;
    }
    if (Object.keys(cells).length === 0) continue;
    columns.push({
      fiscal_year: entry.year.fiscal_year,
      fiscal_month: entry.year.fiscal_month,
      period_start: entry.periodStart,
      period_end: entry.year.period_end,
      annual_report: entry.year.annual_report,
      cells,
      excluded,
    });
  }
  return columns;
}

/**
 * One statement of one canonical ticker as a fiscal-year x item table.
 * Returns null for an unknown statement, an invalid range, or a ticker with no
 * annual history. `years` is ascending and holds only years with a cell.
 */
export function getStatementSeries(
  ticker: string,
  statement: StatementDetailName,
  range: AnnualYearRange = {},
): StatementSeries | null {
  if (!STATEMENT_DETAIL_NAMES.includes(statement) || !parseAnnualYearRange(range).ok) return null;
  if (!getAnnualHistoryRecord(ticker)) return null;
  const rows = getStatementRows(statement);
  return {
    ticker,
    statement,
    first_fiscal_year: ANNUAL_FIRST_FISCAL_YEAR,
    fiscal_year_from: range.fiscal_year_from ?? null,
    fiscal_year_to: range.fiscal_year_to ?? null,
    rows,
    years: columnsFor(statement, rows, reportedCellsByYear(ticker, range)),
  };
}

/** The `statement_history` block for the selected statements (all four by default). */
export function statementHistoryBlock(
  ticker: string,
  range: AnnualYearRange,
  statements: readonly StatementDetailName[] = STATEMENT_DETAIL_NAMES,
): StatementHistoryBlock {
  const entries = getAnnualHistoryRecord(ticker) ? reportedCellsByYear(ticker, range) : [];
  const selected: StatementHistoryBlock["statements"] = {};
  for (const statement of STATEMENT_DETAIL_NAMES) {
    if (!statements.includes(statement)) continue;
    const rows = getStatementRows(statement);
    selected[statement] = { rows, years: columnsFor(statement, rows, entries) };
  }
  return {
    first_fiscal_year: ANNUAL_FIRST_FISCAL_YEAR,
    fiscal_year_from: range.fiscal_year_from ?? null,
    fiscal_year_to: range.fiscal_year_to ?? null,
    statements: selected,
  };
}

/** Whether any selected statement has at least one year in the block. */
export function statementHistoryHasYears(block: StatementHistoryBlock): boolean {
  return Object.values(block.statements).some((table) => (table?.years.length ?? 0) > 0);
}
