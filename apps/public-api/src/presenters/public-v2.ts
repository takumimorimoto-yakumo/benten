import {
  ARTIFACT_REVISION,
  RELEASE_PROFILE,
  readPublicFinancials,
  readPublicFundamentals,
  type AnnualYearRange,
} from "@benten/registry";
import { DISCLAIMER } from "../constants.js";
import { isValidSolanaAddress } from "../solana-address.js";

type JsonObject = Record<string, unknown>;
type AssetIdentifier = { ticker: string; mint?: never } | { mint: string; ticker?: never };

export type ParsedV2Query =
  | { ok: true; identifier: AssetIdentifier; statement?: string; history?: AnnualYearRange }
  | { ok: false; reason: "invalid_input" };

const RANGE_KEYS = ["fiscal_year_from", "fiscal_year_to"] as const;

export interface PublicResult {
  schema_version: "2.0";
  artifact_revision: string;
  release_profile: "mint_core" | "wallet_enhanced";
  data: JsonObject;
  disclaimer: typeof DISCLAIMER;
}

function publicResult(data: object): PublicResult {
  return {
    schema_version: "2.0",
    artifact_revision: ARTIFACT_REVISION,
    release_profile: RELEASE_PROFILE,
    data: data as JsonObject,
    disclaimer: DISCLAIMER,
  };
}

function errorData(reason: string, requested: string | null, retryable = false): JsonObject {
  return { found: false, reason, requested_identifier: requested, identity: null, coverage: null, retryable };
}

export function parseV2Query(searchParams: URLSearchParams, financials = false): ParsedV2Query {
  const allowed = new Set<string>(financials ? ["ticker", "mint", "statement", ...RANGE_KEYS] : ["ticker", "mint", ...RANGE_KEYS]);
  for (const key of searchParams.keys()) {
    if (!allowed.has(key) || searchParams.getAll(key).length !== 1) {
      return { ok: false, reason: "invalid_input" };
    }
  }

  const ticker = searchParams.get("ticker");
  const mint = searchParams.get("mint");
  if ((ticker === null) === (mint === null)) return { ok: false, reason: "invalid_input" };
  if ((ticker ?? mint ?? "").trim().length === 0) return { ok: false, reason: "invalid_input" };
  if (mint !== null && !isValidSolanaAddress(mint.trim())) return { ok: false, reason: "invalid_input" };

  // A fiscal-year bound is exactly four ASCII digits; either bound alone requests history.
  let history: AnnualYearRange | undefined;
  for (const key of RANGE_KEYS) {
    const raw = searchParams.get(key);
    if (raw === null) continue;
    if (!/^\d{4}$/.test(raw)) return { ok: false, reason: "invalid_input" };
    history = { ...history, [key]: Number(raw) };
  }

  const statement = searchParams.get("statement");
  const extra = { ...(statement !== null ? { statement } : {}), ...(history ? { history } : {}) };
  return ticker !== null
    ? { ok: true, identifier: { ticker }, ...extra }
    : { ok: true, identifier: { mint: mint! }, ...extra };
}

export function fundamentalsResult(searchParams: URLSearchParams): PublicResult {
  const parsed = parseV2Query(searchParams);
  return parsed.ok
    ? publicResult(readPublicFundamentals(parsed.identifier, { isValidMint: isValidSolanaAddress }, parsed.history))
    : publicResult(errorData(parsed.reason, null));
}

export function financialsResult(searchParams: URLSearchParams): PublicResult {
  const parsed = parseV2Query(searchParams, true);
  return parsed.ok
    ? publicResult(readPublicFinancials({
      ...parsed.identifier,
      ...(parsed.statement !== undefined ? { statement: parsed.statement } : {}),
    }, { isValidMint: isValidSolanaAddress }, parsed.history))
    : publicResult(errorData(parsed.reason, null));
}

export function statusForPublicResult(result: PublicResult): number {
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
