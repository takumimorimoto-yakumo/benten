import {
  ARTIFACT_REVISION,
  RELEASE_PROFILE,
  listProviderAssets,
  providerAssets,
  readPublicFinancials,
  readPublicFundamentals,
} from "@benten/registry";
import { PublicKey } from "@solana/web3.js";

import { DISCLAIMER } from "@/lib/disclaimer";

type JsonObject = Record<string, unknown>;
type AssetIdentifier = { ticker: string; mint?: never } | { mint: string; ticker?: never };
type PublicErrorReason =
  | "invalid_input"
  | "unknown_ticker"
  | "unknown_mint"
  | "not_eligible"
  | "no_data"
  | "invalid_statement"
  | "service_unavailable";

export interface PublicResult {
  schema_version: "2.0";
  artifact_revision: string;
  release_profile: "mint_core" | "wallet_enhanced";
  data: JsonObject;
  disclaimer: typeof DISCLAIMER;
}

export type ParsedV2Query =
  | { ok: true; identifier: AssetIdentifier; statement?: string }
  | { ok: false; reason: "invalid_input" };

function publicResult(data: object): PublicResult {
  return {
    schema_version: "2.0",
    artifact_revision: ARTIFACT_REVISION,
    release_profile: RELEASE_PROFILE,
    data: data as JsonObject,
    disclaimer: DISCLAIMER,
  };
}

function isValidSolanaMint(input: string): boolean {
  try {
    new PublicKey(input);
    return true;
  } catch {
    return false;
  }
}

function errorData(
  reason: PublicErrorReason,
  requested: string | null,
  identity: unknown = null,
  coverage: unknown = null,
  retryable = false,
): JsonObject {
  return { found: false, reason, requested_identifier: requested, identity, coverage, retryable };
}

/**
 * Parse the only supported v2 query shapes. Unknown or repeated parameters
 * fail before any registry lookup so routes remain a strict allowlist boundary.
 */
export function parseV2Query(searchParams: URLSearchParams, financials = false): ParsedV2Query {
  const allowed = financials ? new Set(["ticker", "mint", "statement"]) : new Set(["ticker", "mint"]);
  for (const key of searchParams.keys()) {
    if (!allowed.has(key) || searchParams.getAll(key).length !== 1) {
      return { ok: false, reason: "invalid_input" };
    }
  }

  const ticker = searchParams.get("ticker");
  const mint = searchParams.get("mint");
  if ((ticker === null) === (mint === null)) return { ok: false, reason: "invalid_input" };
  if ((ticker ?? mint ?? "").trim().length === 0) return { ok: false, reason: "invalid_input" };
  if (mint !== null && !isValidSolanaMint(mint.trim())) {
    return { ok: false, reason: "invalid_input" };
  }

  const statement = searchParams.get("statement");

  return ticker !== null
    ? { ok: true, identifier: { ticker }, ...(statement !== null ? { statement } : {}) }
    : { ok: true, identifier: { mint: mint! }, ...(statement !== null ? { statement } : {}) };
}

export function getFundamentalsV2(input: AssetIdentifier): PublicResult {
  return publicResult(readPublicFundamentals(input, { isValidMint: isValidSolanaMint }));
}

export function getFinancialsV2(input: unknown): PublicResult {
  return publicResult(readPublicFinancials(input, { isValidMint: isValidSolanaMint }));
}

export function invalidResult(reason: "invalid_input" | "invalid_statement"): PublicResult {
  return publicResult(errorData(reason, null));
}

export function serviceUnavailableResult(): PublicResult {
  return publicResult(errorData("service_unavailable", null, null, null, true));
}

export interface ProviderAssetsResult {
  schema_version: "provider-assets.v1";
  artifact: { revision: string; fetched_at: string };
  data: JsonObject;
  not_quote: true;
  disclaimer: typeof DISCLAIMER;
}

export type ParsedProviderQuery =
  | { ok: true; selector: Record<string, string> }
  | { ok: false; reason: "invalid_input" };

function providerResult(data: object): ProviderAssetsResult {
  return {
    schema_version: "provider-assets.v1",
    artifact: { revision: providerAssets.revision, fetched_at: providerAssets.fetched_at },
    data: data as JsonObject,
    not_quote: true,
    disclaimer: DISCLAIMER,
  };
}

/**
 * Parse the only supported provider-assets query shape. Unknown or repeated
 * parameters fail before any artifact lookup so the route stays a strict
 * allowlist boundary, exactly like the other v2 routes.
 */
export function parseProviderQuery(searchParams: URLSearchParams): ParsedProviderQuery {
  const allowed = new Set(["provider", "provider_asset_id", "mint_or_contract"]);
  const selector: Record<string, string> = {};
  for (const key of searchParams.keys()) {
    if (!allowed.has(key) || searchParams.getAll(key).length !== 1) {
      return { ok: false, reason: "invalid_input" };
    }
    const value = searchParams.get(key) ?? "";
    // Bound the selector before it reaches the read model: the artifact's own
    // identifier ceiling is 128 characters, so anything longer cannot match.
    if (value.length === 0 || value.length > 128) return { ok: false, reason: "invalid_input" };
    selector[key] = value;
  }
  return { ok: true, selector };
}

export function getProviderAssetsV2(selector: Record<string, string>): ProviderAssetsResult {
  return providerResult(listProviderAssets(selector));
}

export function providerInvalidResult(): ProviderAssetsResult {
  return providerResult({ found: false, reason: "invalid_input", requested_identifier: null, retryable: false });
}

export function providerServiceUnavailableResult(): ProviderAssetsResult {
  return providerResult({
    found: false, reason: "service_unavailable", requested_identifier: null, retryable: true,
  });
}

export function providerResultStatus(result: ProviderAssetsResult): number {
  if (result.data.found !== false) return 200;
  switch (result.data.reason) {
    case "invalid_input":
      return 400;
    case "asset_not_found":
      return 404;
    case "service_unavailable":
      return 503;
    default:
      return 200;
  }
}

export function publicResultStatus(result: PublicResult): number {
  if (result.data.found !== false) return 200;
  switch (result.data.reason) {
    case "invalid_input":
    case "invalid_statement":
      return 400;
    case "unknown_ticker":
    case "unknown_mint":
      return 404;
    case "service_unavailable":
      return 503;
    default:
      return 200;
  }
}
