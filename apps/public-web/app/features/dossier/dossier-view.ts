/**
 * Browser-safe Dossier view model and field layout. The build-only projection
 * in `app/lib/dossier.server.ts` fills this shape from the public registry;
 * components render it without reading the registry or any snapshot.
 */
import type { AnnualExclusionReason, AnnualFactStatus, AnnualProvenance, FundamentalsField, UnverifiedReason, VerifiedFactName } from "@benten/registry";
import type { ValueKind } from "@/i18n/format";

export type ExclusionKey = "etf" | "non_sec_listing" | "private" | "preferred" | "unspecified";

export type FilingSourceView = {
  readonly sourceRef: string;
  readonly form: string;
  readonly accessionNumber: string;
  readonly filedAt: string;
  readonly filingUrl: string;
  readonly authority: string;
};

/**
 * A fiscal year of the annual history: `fiscal_year` is the internal key,
 * `period_end` names it on the page. Issuers number their years differently,
 * so a page shows only the month the year ends ("Year ended Feb 2026", through
 * `fiscalYearLabel` in `i18n/fiscal-year.ts`), never the number.
 */
export type FiscalYearLabelView = {
  readonly fiscalYear: number;
  readonly periodEnd: string;
};

/** One annual filing cited by the annual history. */
export type AnnualFilingView = {
  readonly form: string;
  readonly accessionNumber: string;
  readonly filedAt: string;
  readonly filingUrl: string;
};

/** One metric in one fiscal year of the annual history, copied from the read model. */
export type AnnualPointView = {
  readonly name: VerifiedFactName;
  readonly value: number;
  readonly currency: string;
  readonly status: AnnualFactStatus;
  /** Set for `verified_reported` values only. */
  readonly provenance: AnnualProvenance | null;
  readonly concept: string | null;
  /** Set for `unverified_or_derived` values only. */
  readonly reason: UnverifiedReason | null;
  readonly filing: AnnualFilingView;
  readonly restatement: { readonly originalValue: number; readonly originalConcept: string; readonly originalFiling: Omit<AnnualFilingView, "form"> } | null;
};

/** One row of a year's table: the value, the reason it is not shown, or neither. */
export type AnnualCellView = {
  readonly name: VerifiedFactName;
  readonly point: AnnualPointView | null;
  readonly excluded: AnnualExclusionReason | null;
};

export type AnnualYearView = {
  readonly label: FiscalYearLabelView;
  readonly periodStart: string | null;
  readonly annualReport: AnnualFilingView | null;
  /** In `VERIFIED_FACT_ORDER`. */
  readonly cells: readonly AnnualCellView[];
};

export type VerifiedFactRow = {
  readonly name: VerifiedFactName;
  readonly value: number;
  readonly currency: string;
  readonly unit: string;
  readonly scale: number;
  readonly concept: string;
  readonly period: {
    readonly fiscalYear: number;
    readonly type: "duration" | "instant";
    readonly start: string | null;
    readonly end: string;
  };
  /** From the annual history year with this period end, so every page names the year the same way. */
  readonly label: FiscalYearLabelView;
  readonly source: FilingSourceView;
};

export type DossierPurchaseSupport = "fixed_route" | "unsupported";

export type DossierView = {
  readonly identity: {
    readonly ticker: string;
    readonly symbol: string;
    readonly tokenName: string;
    readonly underlyingCompany: string | null;
    /** The company's readable name from the company map, when one links this xStock. */
    readonly companyDisplayName: string | null;
    /** The SEC registrant the company map binds this xStock to; shown only as "SEC registrant". */
    readonly secRegistrant: { readonly name: string; readonly cik: string } | null;
    readonly mint: string;
    readonly issuer: string;
    readonly issuerVerified: boolean;
    readonly decimals: number;
    readonly registryAsOf: string;
    readonly registrySourceUrl: string;
  };
  readonly coverage: {
    readonly filingEligible: boolean;
    readonly sourceStatus: "source_verified" | "legacy_snapshot" | "not_applicable";
    readonly exclusion: ExclusionKey | null;
  };
  /** Ordered verified rows plus the distinct filings they cite; null when none exist. */
  readonly verified: { readonly rows: readonly VerifiedFactRow[]; readonly sources: readonly FilingSourceView[] } | null;
  /** The annual history, newest year first (never empty); null when the ticker has none. */
  readonly annual: { readonly years: readonly AnnualYearView[] } | null;
  readonly legacy: {
    readonly asOf: string;
    readonly values: Readonly<Record<FundamentalsField, string | number | null>>;
  } | null;
  readonly purchase: DossierPurchaseSupport;
};

/** Display order of verified facts. Exhaustive over the registry's fact names. */
export const VERIFIED_FACT_ORDER = [
  "revenue",
  "net_income_parent",
  "total_assets",
  "total_liabilities",
  "operating_cf",
] as const satisfies readonly VerifiedFactName[];

type MissingVerifiedFact = Exclude<VerifiedFactName, (typeof VERIFIED_FACT_ORDER)[number]>;
const verifiedOrderIsExhaustive: MissingVerifiedFact extends never ? true : never = true;
void verifiedOrderIsExhaustive;

/**
 * How each legacy field is read. Exhaustive over the public field contract so a
 * new field cannot ship without deciding whether it is an amount or a label.
 */
export const LEGACY_VALUE_KINDS = {
  company_name: "identifier",
  metrics_fiscal_year: "identifier",
  revenue: "quantity",
  op_income: "quantity",
  gross_profit: "quantity",
  net_income_parent: "quantity",
  total_assets: "quantity",
  total_equity: "quantity",
  total_liabilities: "quantity",
  long_term_debt: "quantity",
  operating_cf: "quantity",
  investing_cf: "quantity",
  fcf: "quantity",
} as const satisfies Record<FundamentalsField, ValueKind>;

/** Legacy field grouping. Every field appears in exactly one group (tested). */
export const LEGACY_GROUPS = [
  { key: "entity", fields: ["company_name", "metrics_fiscal_year"] },
  { key: "income", fields: ["revenue", "gross_profit", "op_income", "net_income_parent"] },
  { key: "balance", fields: ["total_assets", "total_liabilities", "total_equity", "long_term_debt"] },
  { key: "cashflow", fields: ["operating_cf", "investing_cf", "fcf"] },
] as const satisfies ReadonlyArray<{ key: "entity" | "income" | "balance" | "cashflow"; fields: readonly FundamentalsField[] }>;

/** Fact sections appear for filing-eligible tokens that have at least one financial record. */
export function hasFinancialSections(view: DossierView): boolean {
  return view.coverage.filingEligible && (view.verified !== null || view.annual !== null || view.legacy !== null);
}
