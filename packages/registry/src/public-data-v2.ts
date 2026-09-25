import legacySnapshotJson from "./financials-snapshot.json" with { type: "json" };
import manifestJson from "./snapshot-manifest.json" with { type: "json" };
import verifiedOverlayJson from "./verified-facts-v2.json" with { type: "json" };
import verifiedAnnualJson from "./verified-facts-annual-v1.json" with { type: "json" };
import xstocksJson from "./xstocks.json" with { type: "json" };
import { getFinancialsSnapshot, getFundamentalsSnapshot } from "./financials-snapshot.js";
import {
  FINANCIAL_STATEMENT_FIELDS,
  type FundamentalsField,
  type StatementName,
} from "./public-financial-fields.js";
import { resolveMint, resolveTicker } from "./registry-lookup.js";
import type { XStockEntry } from "./types.js";
import {
  validateSnapshotManifest as validateSnapshotManifestSchema,
  validateVerifiedOverlay as validateVerifiedOverlaySchema,
  type VerifiedFactSet,
} from "./artifact-validation.js";
import {
  countAnnualYears,
  validateVerifiedAnnualHistory as validateVerifiedAnnualHistorySchema,
  type AnnualHistoryRecord,
} from "./annual-history-validation.js";
import {
  STATEMENT_DETAIL_NAMES,
  countStatementYears,
  validateVerifiedStatementHistories as validateVerifiedStatementHistoriesSchema,
  type StatementDetailName,
  type StatementHistoryRecord,
} from "./statement-history-validation.js";
import { STATEMENT_HISTORY_INPUTS } from "./statement-history-data.js";
import {
  countAvailableFundamentals,
  coverageAvailabilityFromRecords,
  verifiedRecordHasFacts,
} from "./coverage-state.js";

export type ReleaseProfile = "mint_core" | "wallet_enhanced";
export type AssetIdentifierInput = { ticker: string; mint?: never } | { mint: string; ticker?: never };
export type LegacyScalar = string | number | null;
export type LegacyFundamentalsField = FundamentalsField;
export type LegacyPlField = (typeof FINANCIAL_STATEMENT_FIELDS.pl)[number];
export type LegacyBsField = (typeof FINANCIAL_STATEMENT_FIELDS.bs)[number];
export type LegacyCfField = (typeof FINANCIAL_STATEMENT_FIELDS.cf)[number];

export interface AssetIdentity {
  symbol: string;
  ticker: string;
  token_name: string;
  underlying_company: string | null;
  underlying_company_source_ref: string | null;
  mint: string;
  issuer: string;
  issuer_verified: boolean;
  token_program: "spl-token" | "token-2022" | "unknown";
  registry_as_of: string;
  registry_source_url: string;
}

export interface CoverageState {
  filing_eligibility: "eligible" | "not_eligible";
  snapshot_status: "available" | "no_data";
  source_status: "source_verified" | "legacy_snapshot" | "not_applicable";
  capabilities: Record<"fundamentals" | StatementName, "available" | "no_data">;
  exclusion_reason: XStockEntry["exclusion_reason"];
}

export interface LegacySnapshotBlock<K extends string = string> {
  kind: "legacy_snapshot";
  legacy_as_of: string;
  observed_period: {
    fiscal_year: number | null;
    fiscal_month: number | null;
    period_kind: "FY" | null;
    period_start: null;
    period_end: null;
  };
  currency: null;
  unit: null;
  fact_kind: "unknown";
  source_refs: [];
  values: Record<K, LegacyScalar>;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

const registry = xstocksJson as XStockEntry[];
const eligibleTickers = new Set(registry.filter((entry) => entry.fundamentals_available).map((entry) => entry.ticker));
const overlay = deepFreeze(validateVerifiedOverlaySchema(verifiedOverlayJson, eligibleTickers));
const manifest = validateSnapshotManifestSchema(manifestJson);
const legacySnapshot = legacySnapshotJson as {
  fundamentals: Record<string, { as_of: string; data: Record<string, LegacyScalar> }>;
  financials: Record<string, { as_of: string; statements: Record<StatementName, Record<string, LegacyScalar> | null> }>;
};

const annualHistory = deepFreeze(validateVerifiedAnnualHistorySchema(verifiedAnnualJson, eligibleTickers));
const statementHistories = deepFreeze(validateVerifiedStatementHistoriesSchema(STATEMENT_HISTORY_INPUTS, annualHistory));
const statementYears = Object.values(countStatementYears(statementHistories)).reduce((total, count) => total + count, 0);

const sourceVerifiedCount = Object.values(overlay.records).filter(verifiedRecordHasFacts).length;
if (
  manifest.record_counts.registry !== registry.length
  || manifest.record_counts.eligible !== eligibleTickers.size
  || manifest.record_counts.snapshot_available !== countAvailableFundamentals(registry, legacySnapshot.fundamentals, overlay.records)
  || manifest.record_counts.source_verified !== sourceVerifiedCount
  || manifest.record_counts.annual_years !== countAnnualYears(annualHistory)
  || manifest.record_counts.statement_years !== statementYears
) throw new TypeError("Snapshot manifest counts do not match bundled artifacts");

/**
 * The newest-year overlay and the multi-year artifact must agree: every overlay
 * fact reappears in the annual year with the same period end, as a verified
 * reported value with the same value, concept, filing, and duration start.
 */
function assertOverlayInAnnualHistory(): void {
  for (const [ticker, record] of Object.entries(overlay.records)) {
    const set = record.fundamentals;
    if (!set) continue;
    const history = annualHistory.records[ticker];
    for (const [name, fact] of Object.entries(set.facts)) {
      const period = set.periods[fact.period_ref]!;
      const source = set.source_refs[fact.source_ref]!;
      const year = history?.years.find((candidate) => candidate.period_end === period.period_end);
      const annual = year?.facts[name as keyof typeof year.facts];
      const annualSource = annual ? history!.sources[annual.source_ref] : undefined;
      if (!year || !annual || annual.status !== "verified_reported"
        || annual.value !== fact.value || annual.source_concept !== fact.source_concept
        || annualSource?.accession_number !== source.accession_number || annualSource.filing_url !== source.filing_url
        || (period.fact_period_type === "duration" && year.period_start !== period.period_start)) {
        throw new TypeError("Annual history diverges from the newest-year verified overlay");
      }
    }
  }
}
assertOverlayInAnnualHistory();

export const ARTIFACT_REVISION = manifest.artifact_revision;
export const RELEASE_PROFILE: ReleaseProfile = "mint_core";
export const REGISTRY_AS_OF = manifest.registry_as_of;
export const REGISTRY_SOURCE_URL = manifest.registry_source_url;

export function resolveAssetIdentifier(input: unknown): XStockEntry | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const record = input as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 1) return undefined;
  if (keys[0] === "ticker" && typeof record.ticker === "string") {
    return resolveTicker(record.ticker) ?? undefined;
  }
  if (keys[0] === "mint" && typeof record.mint === "string") {
    return resolveMint(record.mint) ?? undefined;
  }
  return undefined;
}

export function getAssetIdentity(entry: XStockEntry): AssetIdentity {
  const verified = overlay.records[entry.ticker];
  return {
    symbol: entry.symbol,
    ticker: entry.ticker,
    token_name: entry.name,
    underlying_company: verified?.identity.underlying_company ?? null,
    underlying_company_source_ref: verified?.identity.source.source_ref ?? null,
    mint: entry.mint,
    issuer: entry.issuer,
    issuer_verified: entry.issuer_verified,
    token_program: "unknown",
    registry_as_of: REGISTRY_AS_OF,
    registry_source_url: REGISTRY_SOURCE_URL,
  };
}

export function getCoverageState(entry: XStockEntry): CoverageState {
  const fundamentals = getFundamentalsSnapshot(entry.ticker);
  const financials = getFinancialsSnapshot(entry.ticker);
  const statements = financials?.statements;
  const verified = overlay.records[entry.ticker];
  const availability = coverageAvailabilityFromRecords(fundamentals, financials, verified);
  const hasLegacyFinancials = Boolean(fundamentals || statements && Object.values(statements).some(Boolean));
  return {
    filing_eligibility: entry.fundamentals_available ? "eligible" : "not_eligible",
    snapshot_status: availability.snapshot_status,
    source_status: verifiedRecordHasFacts(verified)
      ? "source_verified"
      : hasLegacyFinancials ? "legacy_snapshot" : "not_applicable",
    capabilities: availability.capabilities,
    exclusion_reason: entry.exclusion_reason,
  };
}

export function getVerifiedFundamentals(ticker: string): VerifiedFactSet | null {
  return overlay.records[ticker]?.fundamentals ?? null;
}

export function getVerifiedStatements(ticker: string): Record<StatementName, VerifiedFactSet | null> {
  return overlay.records[ticker]?.statements ?? { pl: null, bs: null, cf: null };
}

/** One ticker's validated multi-year annual record, or null. */
export function getAnnualHistoryRecord(ticker: string): AnnualHistoryRecord | null {
  return annualHistory.records[ticker] ?? null;
}

export const ANNUAL_FIRST_FISCAL_YEAR = annualHistory.first_fiscal_year;

/** One ticker's validated line items of one statement (C-FIN-03 revision 2.2), or null. */
export function getStatementHistoryRecord(ticker: string, statement: StatementDetailName): StatementHistoryRecord | null {
  if (!STATEMENT_DETAIL_NAMES.includes(statement)) return null;
  return statementHistories[statement].records[ticker] ?? null;
}

function legacyBlock(asOf: string, values: Record<string, LegacyScalar>, statement: boolean): LegacySnapshotBlock {
  const fiscalYear = statement ? values.fiscal_year : values.metrics_fiscal_year;
  const fiscalMonth = statement ? values.fiscal_month : null;
  return {
    kind: "legacy_snapshot",
    legacy_as_of: asOf,
    observed_period: {
      fiscal_year: typeof fiscalYear === "number" ? fiscalYear : null,
      fiscal_month: typeof fiscalMonth === "number" ? fiscalMonth : null,
      period_kind: statement && values.period_kind === "FY" ? "FY" : null,
      period_start: null,
      period_end: null,
    },
    currency: null,
    unit: null,
    fact_kind: "unknown",
    source_refs: [],
    values: { ...values },
  };
}

export function getLegacyFundamentals(ticker: string): LegacySnapshotBlock<LegacyFundamentalsField> | null {
  const row = getFundamentalsSnapshot(ticker);
  return row ? legacyBlock(row.as_of, row.data as Record<string, LegacyScalar>, false) as LegacySnapshotBlock<LegacyFundamentalsField> : null;
}

export function getLegacyStatements(ticker: string): {
  pl: LegacySnapshotBlock<LegacyPlField> | null;
  bs: LegacySnapshotBlock<LegacyBsField> | null;
  cf: LegacySnapshotBlock<LegacyCfField> | null;
} {
  const row = getFinancialsSnapshot(ticker);
  return {
    pl: row?.statements.pl ? legacyBlock(row.as_of, row.statements.pl as Record<string, LegacyScalar>, true) as LegacySnapshotBlock<LegacyPlField> : null,
    bs: row?.statements.bs ? legacyBlock(row.as_of, row.statements.bs as Record<string, LegacyScalar>, true) as LegacySnapshotBlock<LegacyBsField> : null,
    cf: row?.statements.cf ? legacyBlock(row.as_of, row.statements.cf as Record<string, LegacyScalar>, true) as LegacySnapshotBlock<LegacyCfField> : null,
  };
}

export function getLegacyStatementsAsOf(ticker: string): string | null {
  return getFinancialsSnapshot(ticker)?.as_of ?? null;
}

/** Validate an overlay against this exact bundled registry allowlist. */
export function validateVerifiedOverlay(input: unknown) {
  return validateVerifiedOverlaySchema(input, eligibleTickers);
}

/** Validate the four statement artifacts against the bundled annual history. */
export function validateVerifiedStatementHistories(inputs: unknown) {
  return validateVerifiedStatementHistoriesSchema(inputs, annualHistory);
}

/** Validate an annual artifact against this exact bundled registry allowlist. */
export function validateVerifiedAnnualHistory(input: unknown) {
  return validateVerifiedAnnualHistorySchema(input, eligibleTickers);
}

export function validateSnapshotManifest(input: unknown) {
  return validateSnapshotManifestSchema(input);
}
