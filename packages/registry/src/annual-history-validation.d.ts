import type { VerifiedFactName } from "./artifact-validation.js";

export type AnnualForm = "10-K" | "20-F" | "40-F";
export type AnnualProvenance = "annual_report" | "restated_in_later_report" | "reported_in_later_report";
export type UnverifiedReason =
    | "derived_by_source"
    | "reported_under_unlisted_concept"
    | "value_not_reported_in_filings"
    | "implausible_revenue_concept"
    | "ambiguous_period"
    | "period_mismatch";
export type AnnualExclusionReason = "not_in_source" | "unsafe_value" | "no_annual_report_to_cite";

export interface AnnualFilingSource {
    source_ref: string;
    form: AnnualForm;
    accession_number: string;
    filed_at: string;
    filing_url: string;
    source_authority: "SEC EDGAR";
}
export interface AnnualRestatement {
    original_value: number;
    original_source_concept: string;
    original_source_ref: string;
}
export interface AnnualVerifiedFactRecord {
    status: "verified_reported";
    value: number;
    currency: "USD";
    source_concept: string;
    source_ref: string;
    provenance: AnnualProvenance;
    restatement?: AnnualRestatement;
}
export interface AnnualUnverifiedFactRecord {
    status: "unverified_or_derived";
    value: number;
    currency: "USD";
    source_ref: string;
    reason: UnverifiedReason;
}
export type AnnualFactRecord = AnnualVerifiedFactRecord | AnnualUnverifiedFactRecord;
export interface AnnualYearRecord {
    fiscal_year: number;
    fiscal_month: number;
    period_start: string | null;
    period_end: string;
    annual_report_ref: string | null;
    facts: Partial<Record<VerifiedFactName, AnnualFactRecord>>;
    excluded: Partial<Record<VerifiedFactName, AnnualExclusionReason>>;
}
export interface AnnualHistoryRecord {
    sources: Record<string, AnnualFilingSource>;
    years: AnnualYearRecord[];
}
export interface VerifiedAnnualHistoryV1 {
    schema_version: "1.0";
    first_fiscal_year: number;
    records: Record<string, AnnualHistoryRecord>;
}

export declare const ANNUAL_FACT_NAMES: readonly VerifiedFactName[];
export declare const ANNUAL_FORMS: readonly AnnualForm[];
export declare const ANNUAL_PROVENANCES: readonly AnnualProvenance[];
export declare const UNVERIFIED_REASONS: readonly UnverifiedReason[];
export declare const EXCLUSION_REASONS: readonly AnnualExclusionReason[];
export declare const ANNUAL_FACT_STATEMENT: Readonly<Record<VerifiedFactName, "pl" | "bs" | "cf">>;
export declare const ANNUAL_FACT_PERIOD_TYPE: Readonly<Record<VerifiedFactName, "duration" | "instant">>;
export declare function fiscalYearForPeriodEnd(periodEnd: string): number;
export declare function isIsoDate(value: unknown): value is string;
export declare function spanDays(start: string, end: string): number;
export declare function validateAnnualFilingSource(value: unknown, key: string): AnnualFilingSource;
export declare function validateVerifiedAnnualHistory(input: unknown, eligibleTickers?: ReadonlySet<string>): VerifiedAnnualHistoryV1;
export declare function countAnnualYears(history: VerifiedAnnualHistoryV1): number;
