import { isStatementName, STATEMENT_NAMES, type StatementName } from "./public-financial-fields.js";
import { normalizeTickerIdentifier, resolveMint, resolveTicker } from "./registry-lookup.js";
import type { XStockEntry } from "./types.js";

export type RequestedAssetIdentifier =
  | { kind: "ticker"; value: string }
  | { kind: "mint"; value: string };

export type FinancialRequestResolution =
  | { ok: true; entry: XStockEntry; requested: RequestedAssetIdentifier; statements: StatementName[] }
  | { ok: false; reason: "invalid_input"; requested: null }
  | { ok: false; reason: "unknown_ticker" | "unknown_mint"; requested: RequestedAssetIdentifier }
  | { ok: false; reason: "not_eligible"; entry: XStockEntry; requested: RequestedAssetIdentifier }
  | { ok: false; reason: "invalid_statement"; entry: XStockEntry; requested: RequestedAssetIdentifier };

export interface FinancialRequestOptions {
  isValidMint: (mint: string) => boolean;
}

export function resolveFinancialRequest(
  input: unknown,
  options: FinancialRequestOptions,
): FinancialRequestResolution {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, reason: "invalid_input", requested: null };
  }
  const record = input as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.some((key) => key !== "ticker" && key !== "mint" && key !== "statement")) {
    return { ok: false, reason: "invalid_input", requested: null };
  }
  const hasTicker = Object.hasOwn(record, "ticker");
  const hasMint = Object.hasOwn(record, "mint");
  if (hasTicker === hasMint) return { ok: false, reason: "invalid_input", requested: null };

  let entry: XStockEntry | null;
  let requested: RequestedAssetIdentifier;
  if (hasTicker) {
    if (typeof record.ticker !== "string") return { ok: false, reason: "invalid_input", requested: null };
    const ticker = normalizeTickerIdentifier(record.ticker) ?? record.ticker.trim();
    requested = { kind: "ticker", value: ticker };
    entry = resolveTicker(record.ticker);
    if (!entry) return { ok: false, reason: "unknown_ticker", requested };
  } else {
    if (typeof record.mint !== "string") return { ok: false, reason: "invalid_input", requested: null };
    const mint = record.mint.trim();
    let validMint = false;
    try {
      validMint = options.isValidMint(mint);
    } catch {
      validMint = false;
    }
    if (!validMint) return { ok: false, reason: "invalid_input", requested: null };
    requested = { kind: "mint", value: mint };
    entry = resolveMint(mint);
    if (!entry) return { ok: false, reason: "unknown_mint", requested };
  }

  if (!entry.fundamentals_available) {
    return { ok: false, reason: "not_eligible", entry, requested };
  }
  if (record.statement !== undefined && !isStatementName(record.statement)) {
    return { ok: false, reason: "invalid_statement", entry, requested };
  }
  return {
    ok: true,
    entry,
    requested,
    statements: record.statement === undefined ? [...STATEMENT_NAMES] : [record.statement as StatementName],
  };
}
