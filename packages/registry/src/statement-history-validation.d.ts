import type {
    AnnualExclusionReason,
    AnnualProvenance,
    UnverifiedReason,
    VerifiedAnnualHistoryV1,
} from "./annual-history-validation.js";
import type { VerifiedFactName } from "./artifact-validation.js";

export type StatementDetailName = "pl" | "bs" | "cf" | "per_share";
export type StatementItemUnit = "USD" | "USD_per_share" | "shares";
export type StatementItemPeriodType = "duration" | "instant" | "cover_instant";
export type CalculatedItemUnit = "USD" | "ratio";
export type CalculationOperation = "divide" | "subtract";

export interface StatementItemSpec {
    name: string;
    statement: StatementDetailName;
    periodType: StatementItemPeriodType;
    unit: StatementItemUnit;
    label: string;
    concepts: ReadonlySet<string>;
}
export interface CoreStatementItemSpec {
    name: VerifiedFactName;
    statement: "pl" | "bs" | "cf";
    periodType: "duration" | "instant";
    unit: "USD";
    label: string;
    concepts: ReadonlySet<string>;
}
export interface CalculatedItemSpec {
    name: string;
    statement: StatementDetailName;
    unit: CalculatedItemUnit;
    label: string;
    operation: CalculationOperation;
    inputs: [string, string];
    formula: string;
}

export interface StatementRestatement {
    original_value: number;
    original_source_concept: string;
    original_source_ref: string;
}
/**
 * A verified fact without `source_ref`/`provenance` cites the fiscal year's own
 * annual report with `annual_report` provenance. `as_of` is present only for
 * `cover_instant` items.
 */
export interface StatementVerifiedFactRecord {
    status: "verified_reported";
    value: number;
    source_concept: string;
    as_of?: string;
    source_ref?: string;
    provenance?: Exclude<AnnualProvenance, "annual_report">;
    restatement?: StatementRestatement;
}
/** An unverified fact always cites the fiscal year's own annual report. */
export interface StatementUnverifiedFactRecord {
    status: "unverified_or_derived";
    value: number;
    reason: UnverifiedReason;
}
export type StatementFactRecord = StatementVerifiedFactRecord | StatementUnverifiedFactRecord;
export interface StatementYearRecord {
    fiscal_year: number;
    fiscal_month: number;
    period_start: string | null;
    period_end: string;
    annual_report_ref: string | null;
    facts: Record<string, StatementFactRecord>;
    excluded: Record<string, AnnualExclusionReason>;
}
export interface StatementHistoryRecord {
    sources: Record<string, import("./annual-history-validation.js").AnnualFilingSource>;
    years: StatementYearRecord[];
}
export interface VerifiedStatementHistoryV1 {
    schema_version: "1.0";
    statement: StatementDetailName;
    first_fiscal_year: number;
    records: Record<string, StatementHistoryRecord>;
}
export type VerifiedStatementHistories = Record<StatementDetailName, VerifiedStatementHistoryV1>;

export declare const STATEMENT_DETAIL_NAMES: readonly StatementDetailName[];
export declare const STATEMENT_ITEM_UNITS: readonly StatementItemUnit[];
export declare const STATEMENT_ITEM_PERIOD_TYPES: readonly StatementItemPeriodType[];
export declare const CALCULATED_ITEM_UNITS: readonly CalculatedItemUnit[];
export declare const CALCULATION_OPERATIONS: readonly CalculationOperation[];
export declare const STATEMENT_ITEMS: Readonly<Record<string, StatementItemSpec>>;
export declare const CORE_STATEMENT_ITEMS: Readonly<Record<VerifiedFactName, CoreStatementItemSpec>>;
export declare const STATEMENT_ROWS: Readonly<Record<StatementDetailName, readonly string[]>>;
export declare const CALCULATED_ITEMS: Readonly<Record<string, CalculatedItemSpec>>;
export declare const STATEMENT_ITEM_NAMES: readonly string[];
export declare function statementArtifactFile(statement: StatementDetailName): string;
export declare function isStatementValue(unit: StatementItemUnit, value: unknown): value is number;
export declare function validateVerifiedStatementHistory(
    input: unknown,
    statement: StatementDetailName,
    annualHistory: VerifiedAnnualHistoryV1,
): VerifiedStatementHistoryV1;
export declare function validateVerifiedStatementHistories(
    inputs: unknown,
    annualHistory: VerifiedAnnualHistoryV1,
): VerifiedStatementHistories;
export declare function countStatementYears(histories: VerifiedStatementHistories): Record<StatementDetailName, number>;
