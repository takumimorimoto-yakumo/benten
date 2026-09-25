/**
 * Multi-year annual facts, projected for charts, evidence tables, Web, and MCP.
 *
 * Every point is copied from the validated annual artifact and joined to exactly
 * the filing it cites. Nothing is derived, estimated, or ranked here.
 */
import {
  ANNUAL_FACT_NAMES,
  ANNUAL_FACT_PERIOD_TYPE,
  ANNUAL_FACT_STATEMENT,
  type AnnualExclusionReason,
  type AnnualFilingSource,
  type AnnualForm,
  type AnnualProvenance,
  type UnverifiedReason,
} from "./annual-history-validation.js";
import type { VerifiedFactName } from "./artifact-validation.js";
import { ANNUAL_FIRST_FISCAL_YEAR, getAnnualHistoryRecord } from "./public-data-v2.js";
import type { StatementName } from "./public-financial-fields.js";

export type AnnualFactStatus = "verified_reported" | "unverified_or_derived";

/** Inclusive fiscal-year bounds. Omitted bounds are open. */
export interface AnnualYearRange {
  fiscal_year_from?: number;
  fiscal_year_to?: number;
}

export interface AnnualRestatementPoint {
  original_value: number;
  original_source_concept: string;
  original_accession: string;
  original_filed: string;
  original_filing_url: string;
}

/**
 * One metric in one fiscal year. `unit` is the ISO 4217 currency of `value`
 * (scale 1). `status` separates values that the cited filing reports exactly
 * from values that it does not; an `unverified_or_derived` point cites the
 * fiscal year's annual report only as the filing that covers the year.
 */
export interface AnnualFactPoint {
  fiscal_year: number;
  fiscal_month: number;
  period_start: string | null;
  period_end: string;
  metric: VerifiedFactName;
  statement: StatementName;
  value: number;
  unit: "USD";
  scale: 1;
  status: AnnualFactStatus;
  source_concept: string | null;
  provenance: AnnualProvenance | null;
  reason: UnverifiedReason | null;
  accession: string;
  form: AnnualForm;
  filed: string;
  filing_url: string;
  restatement: AnnualRestatementPoint | null;
}

/** One fiscal year for an evidence table: the year's filing, its points, and exclusions. */
export interface AnnualYearRead {
  fiscal_year: number;
  fiscal_month: number;
  period_start: string | null;
  period_end: string;
  annual_report: AnnualFilingSource | null;
  points: Partial<Record<VerifiedFactName, AnnualFactPoint>>;
  excluded: Partial<Record<VerifiedFactName, AnnualExclusionReason>>;
}

export interface AnnualHistoryBlock {
  first_fiscal_year: number;
  fiscal_year_from: number | null;
  fiscal_year_to: number | null;
  points: AnnualFactPoint[];
}

const MIN_YEAR = 1900;
const MAX_YEAR = 3000;

/** Exact integer bounds only; anything else is invalid input. */
export function parseAnnualYearRange(input: unknown): { ok: true; range: AnnualYearRange } | { ok: false } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false };
  const record = input as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== "fiscal_year_from" && key !== "fiscal_year_to")) return { ok: false };
  const range: AnnualYearRange = {};
  for (const key of ["fiscal_year_from", "fiscal_year_to"] as const) {
    if (!Object.hasOwn(record, key) || record[key] === undefined) continue;
    const value = record[key];
    if (typeof value !== "number" || !Number.isInteger(value) || value < MIN_YEAR || value > MAX_YEAR) return { ok: false };
    range[key] = value;
  }
  if (range.fiscal_year_from !== undefined && range.fiscal_year_to !== undefined
    && range.fiscal_year_from > range.fiscal_year_to) return { ok: false };
  return { ok: true, range };
}

function inRange(fiscalYear: number, range: AnnualYearRange): boolean {
  return (range.fiscal_year_from === undefined || fiscalYear >= range.fiscal_year_from)
    && (range.fiscal_year_to === undefined || fiscalYear <= range.fiscal_year_to);
}

/** Validated years of one canonical ticker, joined to their filings. */
export function getAnnualHistory(ticker: string, range: AnnualYearRange = {}): AnnualYearRead[] {
  const record = getAnnualHistoryRecord(ticker);
  if (!record) return [];
  const source = (ref: string): AnnualFilingSource => {
    const filing = record.sources[ref];
    if (!filing) throw new TypeError("annual fact cites an unknown filing");
    return filing;
  };
  return record.years.filter((year) => inRange(year.fiscal_year, range)).map((year) => {
    const points: Partial<Record<VerifiedFactName, AnnualFactPoint>> = {};
    for (const metric of ANNUAL_FACT_NAMES) {
      const fact = year.facts[metric];
      if (!fact) continue;
      const filing = source(fact.source_ref);
      const verified = fact.status === "verified_reported";
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
      points[metric] = {
        fiscal_year: year.fiscal_year,
        fiscal_month: year.fiscal_month,
        period_start: ANNUAL_FACT_PERIOD_TYPE[metric] === "duration" ? year.period_start : null,
        period_end: year.period_end,
        metric,
        statement: ANNUAL_FACT_STATEMENT[metric],
        value: fact.value,
        unit: fact.currency,
        scale: 1,
        status: fact.status,
        source_concept: verified ? fact.source_concept : null,
        provenance: verified ? fact.provenance : null,
        reason: verified ? null : fact.reason,
        accession: filing.accession_number,
        form: filing.form,
        filed: filing.filed_at,
        filing_url: filing.filing_url,
        restatement,
      };
    }
    return {
      fiscal_year: year.fiscal_year,
      fiscal_month: year.fiscal_month,
      period_start: year.period_start,
      period_end: year.period_end,
      annual_report: year.annual_report_ref ? source(year.annual_report_ref) : null,
      points,
      excluded: { ...year.excluded },
    };
  });
}

export interface AnnualSeriesOptions extends AnnualYearRange {
  /** Restrict to these metrics; default all five. */
  metrics?: readonly VerifiedFactName[];
  /** Restrict to these statuses; default both. */
  statuses?: readonly AnnualFactStatus[];
}

/**
 * Flat, fiscal-year-ascending points for one canonical ticker. For a chart of
 * one metric pass `metrics: ["revenue"]`; for reported values only pass
 * `statuses: ["verified_reported"]`.
 */
export function getAnnualFactSeries(ticker: string, options: AnnualSeriesOptions = {}): AnnualFactPoint[] {
  const metrics = new Set(options.metrics ?? ANNUAL_FACT_NAMES);
  const statuses = new Set(options.statuses ?? ["verified_reported", "unverified_or_derived"]);
  const points: AnnualFactPoint[] = [];
  for (const year of getAnnualHistory(ticker, options)) {
    for (const metric of ANNUAL_FACT_NAMES) {
      const point = year.points[metric];
      if (point && metrics.has(metric) && statuses.has(point.status)) points.push(point);
    }
  }
  return points;
}

/** The block attached to MCP and Web results when a year range is requested. */
export function annualHistoryBlock(
  ticker: string,
  range: AnnualYearRange,
  statements?: readonly StatementName[],
): AnnualHistoryBlock {
  const metrics = statements
    ? ANNUAL_FACT_NAMES.filter((name) => statements.includes(ANNUAL_FACT_STATEMENT[name]))
    : ANNUAL_FACT_NAMES;
  return {
    first_fiscal_year: ANNUAL_FIRST_FISCAL_YEAR,
    fiscal_year_from: range.fiscal_year_from ?? null,
    fiscal_year_to: range.fiscal_year_to ?? null,
    points: getAnnualFactSeries(ticker, { ...range, metrics }),
  };
}
