import {
  ARTIFACT_REVISION,
  REGISTRY_AS_OF,
  REGISTRY_SOURCE_URL,
  RELEASE_PROFILE,
  STATEMENT_NAMES,
  getAssetIdentity,
  getCoverageState,
  listPublicAssets,
  readPublicFinancials,
  readPublicFundamentals,
  getLegacyStatementsAsOf,
  normalizeTickerIdentifier,
  resolveAssetIdentifier,
  type AnnualYearRange,
  type StatementName,
} from "@benten/registry";
import { DISCLAIMER } from "./envelope.js";
import { isValidSolanaAddress } from "./solana-address.js";

export type AssetIdentifier = { ticker?: string; mint?: string };
export type ListInput = {
  covered_only?: boolean;
  exclusion_reason?: "etf" | "non_sec_listing" | "private" | "preferred";
  ticker?: string;
  mint?: string;
};

type JsonObject = Record<string, unknown>;

export interface PublicResult {
  [key: string]: unknown;
  schema_version: "2.0";
  artifact_revision: string;
  release_profile: "mint_core" | "wallet_enhanced";
  data: JsonObject;
  disclaimer: typeof DISCLAIMER;
}

export interface ToolPresentation {
  structured: PublicResult;
  text: JsonObject;
}

const LEGACY_WARNING =
  "Exact filing date, unit, source, and reported-versus-calculated status are unverified for every value under /data.";
const ABSENT_WARNING = "No current bundled legacy row exists under /data.";
const NOT_APPLICABLE_WARNING = "This tool does not return legacy financial values under /data.";

function publicResult(data: object): PublicResult {
  return {
    schema_version: "2.0",
    artifact_revision: ARTIFACT_REVISION,
    release_profile: RELEASE_PROFILE,
    data: data as JsonObject,
    disclaimer: DISCLAIMER,
  };
}

function requestedTicker(input: string): string {
  return normalizeTickerIdentifier(input) ?? input.trim();
}

function requestedIdentifier(input?: { ticker?: string; mint?: string }) {
  if (input?.ticker !== undefined) return { kind: "ticker" as const, value: requestedTicker(input.ticker) };
  if (input?.mint !== undefined) return { kind: "mint" as const, value: input.mint.trim() };
  return null;
}

function expandVerifiedFacts(factSet: any): JsonObject[] {
  if (!factSet) return [];
  return Object.entries(factSet.facts).map(([name, fact]: [string, any]) => {
    const period = factSet.periods[fact.period_ref];
    const source = factSet.source_refs[fact.source_ref];
    if (!period || !source) throw new TypeError("verified fact reference is unresolved");
    return {
      name,
      value: fact.value,
      currency: fact.currency,
      unit: fact.unit,
      scale: fact.scale,
      source_concept: fact.source_concept,
      period,
      source,
    };
  });
}

function metadata(
  input: { ticker?: string; mint?: string } | undefined,
  identity: unknown,
  coverage: unknown,
  legacyStatus: "legacy_snapshot" | "absent" | "not_applicable",
  verifiedFundamentals: unknown = null,
  verifiedStatements: Record<StatementName, unknown> = { pl: null, bs: null, cf: null },
) {
  const legacy_data = legacyStatus === "legacy_snapshot"
    ? { status: legacyStatus, scope: "/data", warning: LEGACY_WARNING }
    : legacyStatus === "absent"
      ? { status: legacyStatus, scope: "/data", warning: ABSENT_WARNING }
      : { status: legacyStatus, scope: "/data", warning: NOT_APPLICABLE_WARNING };
  return {
    artifact_revision: ARTIFACT_REVISION,
    release_profile: RELEASE_PROFILE,
    requested_identifier: requestedIdentifier(input),
    identity,
    coverage,
    legacy_data,
    verified_subset: {
      fundamentals: expandVerifiedFacts(verifiedFundamentals),
      statements: {
        pl: expandVerifiedFacts(verifiedStatements.pl),
        bs: expandVerifiedFacts(verifiedStatements.bs),
        cf: expandVerifiedFacts(verifiedStatements.cf),
      },
    },
  };
}

function textEnvelope(data: unknown, as_of: string, source: string, bentenV2: JsonObject): JsonObject {
  return { data, as_of, source, disclaimer: DISCLAIMER, _benten_v2: bentenV2 };
}

/** Copy the requested multi-year blocks into the text metadata, exactly as structured. */
function withAnnualHistory(bentenV2: JsonObject, data: { annual_history?: unknown; statement_history?: unknown }): JsonObject {
  return {
    ...bentenV2,
    ...(data.annual_history === undefined ? {} : { annual_history: structuredClone(data.annual_history) }),
    ...(data.statement_history === undefined ? {} : { statement_history: structuredClone(data.statement_history) }),
  };
}

/** A fiscal-year range when either bound was supplied, else undefined (newest year only). */
export function requestedRange(input: { fiscal_year_from?: number; fiscal_year_to?: number }): AnnualYearRange | undefined {
  if (input.fiscal_year_from === undefined && input.fiscal_year_to === undefined) return undefined;
  return {
    ...(input.fiscal_year_from !== undefined ? { fiscal_year_from: input.fiscal_year_from } : {}),
    ...(input.fiscal_year_to !== undefined ? { fiscal_year_to: input.fiscal_year_to } : {}),
  };
}

function errorData(
  reason: "invalid_input" | "unknown_ticker" | "unknown_mint" | "not_eligible" | "no_data" | "invalid_statement" | "service_unavailable",
  requested: string | null,
  identity: unknown = null,
  coverage: unknown = null,
  retryable = false,
): JsonObject {
  return { found: false, reason, requested_identifier: requested, identity, coverage, retryable };
}

function legacyTextErrorReason(reason: string): string {
  return reason === "not_eligible" ? "not_covered" : reason;
}

/**
 * MCP keeps its historical invalid-selector echo in both text and structured
 * output. Web rejects malformed queries before its presenter and uses null.
 * This transport compatibility exception must not leak into the pure model.
 */
function invalidIdentifier(input: AssetIdentifier, financial = false): ToolPresentation {
  const requested = input.ticker !== undefined ? requestedTicker(input.ticker) : input.mint?.trim() ?? null;
  const data = errorData("invalid_input", requested);
  const legacy = financial
    ? { found: false, ticker: requested, reason: "invalid_input", exclusion_reason: null }
    : { found: false, ticker: requested, reason: "invalid_input", fundamentals_available: null, exclusion_reason: null };
  return {
    structured: publicResult(data),
    text: textEnvelope(legacy, REGISTRY_AS_OF, "Benten registry snapshot", metadata(input, null, null, "absent")),
  };
}

export function listXstocksV2(input: ListInput = {}): ToolPresentation {
  if (input.ticker !== undefined && input.mint !== undefined) {
    const requested = requestedTicker(input.ticker);
    const data = errorData("invalid_input", requested);
    return {
      structured: publicResult(data),
      text: textEnvelope(data, REGISTRY_AS_OF, "Benten registry snapshot", metadata(input, null, null, "not_applicable")),
    };
  }
  const selected = input.ticker !== undefined || input.mint !== undefined
    ? resolveAssetIdentifier(input.ticker !== undefined ? { ticker: input.ticker } : { mint: input.mint! })
    : undefined;
  const data = listPublicAssets(input);
  if (!data.found) return { structured: publicResult(data), text: textEnvelope(data,
    REGISTRY_AS_OF, "Benten registry snapshot", metadata(input, null, null, "not_applicable")) };
  const v1Items = data.items.map(({ identity, coverage }) => ({
    symbol: identity.symbol,
    ticker: identity.ticker,
    name: identity.token_name,
    mint: identity.mint,
    issuer_verified: identity.issuer_verified,
    fundamentals_available: coverage.filing_eligibility === "eligible",
    exclusion_reason: coverage.exclusion_reason,
  }));
  const structured = publicResult(data);
  return {
    structured,
    text: textEnvelope(v1Items, REGISTRY_AS_OF, "Benten registry snapshot",
      metadata(input, selected ? getAssetIdentity(selected) : null,
        selected ? getCoverageState(selected) : null, "not_applicable")),
  };
}

export function getFundamentalsV2(input: AssetIdentifier, range?: AnnualYearRange): ToolPresentation {
  const data = readPublicFundamentals(input, { isValidMint: isValidSolanaAddress }, range);
  if (!data.found && data.reason === "invalid_input") return invalidIdentifier(input);
  if (!data.found && (data.reason === "unknown_mint" || data.reason === "unknown_ticker")) {
    const reason = data.reason;
    const requested = data.requested_identifier;
    const legacyRequested = input.ticker !== undefined ? input.ticker : requested;
    return { structured: publicResult(data), text: textEnvelope(
      { found: false, ticker: legacyRequested, reason, fundamentals_available: null, exclusion_reason: null },
      REGISTRY_AS_OF, "Benten registry snapshot", metadata(input, null, null, "absent"),
    ) };
  }
  if (!data.found && data.reason === "not_eligible") {
    const identity = data.identity!;
    const coverage = data.coverage!;
    return { structured: publicResult(data), text: textEnvelope(
      { found: false, ticker: identity.ticker, reason: "not_covered", fundamentals_available: false, exclusion_reason: coverage.exclusion_reason },
      REGISTRY_AS_OF, "Benten registry snapshot", metadata(input, identity, coverage, "absent"),
    ) };
  }
  if (!data.found && data.reason === "no_data") {
    const identity = data.identity!;
    const coverage = data.coverage!;
    return { structured: publicResult(data), text: textEnvelope(
      { found: false, ticker: identity.ticker, reason: "no_data", fundamentals_available: true, exclusion_reason: null },
      REGISTRY_AS_OF, "Benten financial snapshot; no current bundled row",
      metadata(input, identity, coverage, "absent"),
    ) };
  }
  if (!data.found) return invalidIdentifier(input);
  const { identity, coverage, verified_facts: verified, legacy_snapshot: legacy } = data;
  return {
    structured: publicResult(data),
    text: textEnvelope(
      { found: true, ...(legacy?.values ?? {}) },
      legacy?.legacy_as_of ?? REGISTRY_AS_OF,
      legacy ? "Benten legacy financial snapshot; filing source, unit, and fact kind unverified" : "Benten financial snapshot; no current bundled row",
      withAnnualHistory(metadata(input, identity, coverage, legacy ? "legacy_snapshot" : "absent", verified), data),
    ),
  };
}

export function getFinancialsV2(input: AssetIdentifier & { statement?: string }, range?: AnnualYearRange): ToolPresentation {
  const data = readPublicFinancials(input, { isValidMint: isValidSolanaAddress }, range);
  if (!data.found && data.reason === "invalid_input") return invalidIdentifier(input, true);
  if (!data.found && (data.reason === "unknown_mint" || data.reason === "unknown_ticker")) {
    const legacyRequested = input.ticker !== undefined ? input.ticker : data.requested_identifier;
    return { structured: publicResult(data), text: textEnvelope(
      { found: false, ticker: legacyRequested, reason: data.reason, exclusion_reason: null },
      REGISTRY_AS_OF, "Benten registry snapshot", metadata(input, null, null, "absent"),
    ) };
  }
  if (!data.found && data.reason === "not_eligible") {
    const identity = data.identity!;
    const coverage = data.coverage!;
    return { structured: publicResult(data), text: textEnvelope(
      { found: false, ticker: identity.ticker, reason: legacyTextErrorReason("not_eligible"), exclusion_reason: coverage.exclusion_reason },
      REGISTRY_AS_OF, "Benten registry snapshot", metadata(input, identity, coverage, "absent"),
    ) };
  }
  if (!data.found && data.reason === "invalid_statement") {
    const identity = data.identity!;
    const coverage = data.coverage!;
    return { structured: publicResult(data), text: textEnvelope(
      { found: false, ticker: identity.ticker, reason: "invalid_statement", exclusion_reason: null },
      REGISTRY_AS_OF, "Benten registry snapshot", metadata(input, identity, coverage, "absent"),
    ) };
  }
  if (!data.found && data.reason === "no_data") {
    const identity = data.identity!;
    const coverage = data.coverage!;
    return { structured: publicResult(data), text: textEnvelope(
      { found: false, ticker: identity.ticker, reason: "no_data", exclusion_reason: null },
      REGISTRY_AS_OF, "Benten financial snapshot; no current bundled row",
      metadata(input, identity, coverage, "absent"),
    ) };
  }
  if (!data.found) return invalidIdentifier(input, true);
  const { identity, coverage, statements } = data;
  const names = Object.keys(statements) as StatementName[];
  const legacyAsOf = getLegacyStatementsAsOf(identity.ticker);
  const selectedVerified = Object.fromEntries(
    STATEMENT_NAMES.map((name) => [name, statements[name]?.verified_facts ?? null]),
  ) as Record<StatementName, unknown>;
  const legacyRows = Object.fromEntries(names.map((name) => [name, statements[name]?.legacy_snapshot?.values ?? null]));
  return {
    structured: publicResult(data),
    text: textEnvelope(
      { found: true, ticker: identity.ticker, statements: legacyRows },
      legacyAsOf ?? REGISTRY_AS_OF,
      legacyAsOf ? "Benten legacy financial snapshot; filing source, unit, and fact kind unverified" : "Benten financial snapshot; no current bundled row",
      withAnnualHistory(metadata(input, identity, coverage, legacyAsOf ? "legacy_snapshot" : "absent", null, selectedVerified), data),
    ),
  };
}

export function getWalletHoldingsV2(address: string): ToolPresentation {
  if (!isValidSolanaAddress(address)) {
    const invalid = errorData("invalid_input", address);
    return {
      structured: publicResult(invalid),
      text: textEnvelope(invalid, REGISTRY_AS_OF, "Solana read-only wallet lookup",
        metadata(undefined, null, null, "not_applicable")),
    };
  }
  const data = {
    available: false,
    reason: "wallet_correctness_unverified",
    retryable: false,
    release_profile: "mint_core",
  };
  return {
    structured: publicResult(data),
    text: textEnvelope(data, REGISTRY_AS_OF, "Solana read-only wallet lookup",
      metadata(undefined, null, null, "not_applicable")),
  };
}

export function serviceUnavailable(): ToolPresentation {
  const data = errorData("service_unavailable", null, null, null, true);
  return {
    structured: publicResult(data),
    text: textEnvelope(data, "unknown", "Benten", metadata(undefined, null, null, "not_applicable")),
  };
}
