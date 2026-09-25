/** Pure public-data semantics shared by Web and MCP transport presenters. */
import { annualHistoryBlock, parseAnnualYearRange, type AnnualHistoryBlock, type AnnualYearRange } from "./annual-history-read-model.js";
import { resolveFinancialRequest, type FinancialRequestOptions } from "./financial-request.js";
import { statementHistoryBlock, statementHistoryHasYears, type StatementHistoryBlock } from "./statement-history-read-model.js";
import { STATEMENT_DETAIL_NAMES, type StatementDetailName } from "./statement-history-validation.js";
import {
  getAssetIdentity,
  getCoverageState,
  getLegacyFundamentals,
  getLegacyStatements,
  getVerifiedFundamentals,
  getVerifiedStatements,
  resolveAssetIdentifier,
  type AssetIdentity,
  type CoverageState,
} from "./public-data-v2.js";
import type { StatementName } from "./public-financial-fields.js";
import { productXStockEntries } from "./registry-lookup.js";
import type { ExclusionReason, XStockEntry } from "./types.js";

type ReadErrorReason = "invalid_input" | "unknown_ticker" | "unknown_mint" | "not_eligible" | "no_data" | "invalid_statement";

export interface PublicReadError {
  found: false;
  reason: ReadErrorReason;
  requested_identifier: string | null;
  identity: AssetIdentity | null;
  coverage: CoverageState | null;
  retryable: false;
}

export type FundamentalsReadResult = PublicReadError | {
  found: true;
  identity: AssetIdentity;
  coverage: CoverageState;
  verified_facts: ReturnType<typeof getVerifiedFundamentals>;
  legacy_snapshot: ReturnType<typeof getLegacyFundamentals>;
  /** Present only when a fiscal-year range was requested. */
  annual_history?: AnnualHistoryBlock;
};

type StatementRead = {
  availability: "available" | "no_data";
  verified_facts: ReturnType<typeof getVerifiedStatements>[StatementName];
  legacy_snapshot: ReturnType<typeof getLegacyStatements>[StatementName];
};

export type FinancialsReadResult = PublicReadError | {
  found: true;
  identity: AssetIdentity;
  coverage: CoverageState;
  statements: Partial<Record<StatementName, StatementRead>>;
  /** Present only when a fiscal-year range was requested; limited to the selected statements. */
  annual_history?: AnnualHistoryBlock;
  /**
   * Revision 2.2, present only when a fiscal-year range was requested: the
   * fiscal-year x line-item tables of the selected statement, or of all four
   * (`pl`, `bs`, `cf`, `per_share`) when no statement was selected.
   */
  statement_history?: StatementHistoryBlock;
};

export type CatalogReadResult = PublicReadError | {
  found: true;
  items: Array<{ identity: AssetIdentity; coverage: CoverageState }>;
};

function readError(
  reason: ReadErrorReason,
  requested: string | null,
  entry?: XStockEntry,
): PublicReadError {
  return {
    found: false,
    reason,
    requested_identifier: requested,
    identity: entry ? getAssetIdentity(entry) : null,
    coverage: entry ? getCoverageState(entry) : null,
    retryable: false,
  };
}

/**
 * One exact ticker or mint, with no transport or RPC assumptions. Passing
 * `history` (a fiscal-year range; `{}` for every year) adds `annual_history`.
 */
export function readPublicFundamentals(
  input: unknown,
  options: FinancialRequestOptions,
  history?: AnnualYearRange,
): FundamentalsReadResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) return readError("invalid_input", null);
  if (history !== undefined && !parseAnnualYearRange(history).ok) return readError("invalid_input", null);
  const keys = Object.keys(input);
  if (keys.length !== 1 || (keys[0] !== "ticker" && keys[0] !== "mint")) {
    return readError("invalid_input", null);
  }
  const resolution = resolveFinancialRequest(input, options);
  if (!resolution.ok) {
    return readError(resolution.reason, resolution.requested?.value ?? null,
      "entry" in resolution ? resolution.entry : undefined);
  }
  const { entry } = resolution;
  const legacy = getLegacyFundamentals(entry.ticker);
  const verified = getVerifiedFundamentals(entry.ticker);
  const annual = history !== undefined ? annualHistoryBlock(entry.ticker, history) : undefined;
  if (!legacy && !verified && !annual?.points.length) return readError("no_data", resolution.requested.value, entry);
  return {
    found: true,
    identity: getAssetIdentity(entry),
    coverage: getCoverageState(entry),
    verified_facts: verified,
    legacy_snapshot: legacy,
    ...(annual ? { annual_history: annual } : {}),
  };
}

/** Preserve exact identifier-before-statement error precedence. */
export function readPublicFinancials(
  input: unknown,
  options: FinancialRequestOptions,
  history?: AnnualYearRange,
): FinancialsReadResult {
  if (history !== undefined && !parseAnnualYearRange(history).ok) return readError("invalid_input", null);
  const resolution = resolveFinancialRequest(input, options);
  if (!resolution.ok) {
    return readError(resolution.reason, resolution.requested?.value ?? null,
      "entry" in resolution ? resolution.entry : undefined);
  }
  const { entry, statements: names } = resolution;
  const legacy = getLegacyStatements(entry.ticker);
  const verified = getVerifiedStatements(entry.ticker);
  const annual = history !== undefined ? annualHistoryBlock(entry.ticker, history, names) : undefined;
  const detailNames: StatementDetailName[] = names.length === 1 ? [...names] : [...STATEMENT_DETAIL_NAMES];
  const detail = history !== undefined ? statementHistoryBlock(entry.ticker, history, detailNames) : undefined;
  if (!Object.values(legacy).some(Boolean) && !Object.values(verified).some(Boolean) && !annual?.points.length
    && !(detail && statementHistoryHasYears(detail))) {
    return readError("no_data", resolution.requested.value, entry);
  }
  const statements = Object.fromEntries(names.map((name) => [name, {
    availability: legacy[name] || verified[name] ? "available" : "no_data",
    verified_facts: verified[name],
    legacy_snapshot: legacy[name],
  }])) as Partial<Record<StatementName, StatementRead>>;
  return {
    found: true,
    identity: getAssetIdentity(entry),
    coverage: getCoverageState(entry),
    statements,
    ...(annual ? { annual_history: annual } : {}),
    ...(detail ? { statement_history: detail } : {}),
  };
}

/** Return public identity and coverage only; never ship financial rows in browse data. */
export function listPublicAssets(input: unknown = {}): CatalogReadResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) return readError("invalid_input", null);
  const record = input as Record<string, unknown>;
  const allowed = new Set(["ticker", "mint", "covered_only", "exclusion_reason"]);
  if (Object.keys(record).some((key) => !allowed.has(key))) return readError("invalid_input", null);
  const hasTicker = Object.hasOwn(record, "ticker");
  const hasMint = Object.hasOwn(record, "mint");
  if (hasTicker && hasMint) return readError("invalid_input", null);
  if (hasTicker && typeof record.ticker !== "string") return readError("invalid_input", null);
  if (hasMint && typeof record.mint !== "string") return readError("invalid_input", null);
  if (Object.hasOwn(record, "covered_only") && typeof record.covered_only !== "boolean") return readError("invalid_input", null);
  if (Object.hasOwn(record, "exclusion_reason") && (
    typeof record.exclusion_reason !== "string"
    || !["etf", "non_sec_listing", "private", "preferred"].includes(record.exclusion_reason)
  )) {
    return readError("invalid_input", null);
  }
  const hasSelector = hasTicker || hasMint;
  const selected = hasSelector ? resolveAssetIdentifier(hasTicker
    ? { ticker: record.ticker } : { mint: record.mint }) : undefined;
  // Withheld registry rows never reach a list: see `isWithheldFromProduct`.
  let entries: readonly XStockEntry[] = hasSelector ? selected ? [selected] : [] : productXStockEntries;
  if (record.covered_only) entries = entries.filter((entry) => entry.fundamentals_available);
  if (record.exclusion_reason !== undefined) {
    entries = entries.filter((entry) => entry.exclusion_reason === record.exclusion_reason as ExclusionReason);
  }
  return { found: true, items: entries.map((entry) => ({ identity: getAssetIdentity(entry), coverage: getCoverageState(entry) })) };
}
