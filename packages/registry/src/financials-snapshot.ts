import rawSnapshot from "./financials-snapshot.json" with { type: "json" };
import { type StatementName } from "./public-financial-fields.js";
import xstocksData from "./xstocks.json" with { type: "json" };
import {
  isValidLegacySnapshotAsOf,
  validateLegacyFinancialsSnapshot,
} from "./legacy-validation.js";

export interface SnapshotRecord {
  as_of: string;
  data: Record<string, unknown>;
}

export interface FinancialsSnapshotRecord {
  as_of: string;
  statements: Partial<Record<StatementName, Record<string, unknown> | null>>;
}

export interface FinancialsSnapshot {
  schema_version: 1;
  fundamentals: Record<string, SnapshotRecord>;
  financials: Record<string, FinancialsSnapshotRecord>;
}

const KNOWN_TICKERS = new Set(
  (xstocksData as Array<{ ticker: string; fundamentals_available: boolean }>)
    .filter((entry) => entry.fundamentals_available)
    .map((entry) => entry.ticker),
);

export function isValidSnapshotAsOf(value: unknown): value is string {
  return isValidLegacySnapshotAsOf(value);
}

export function validateFinancialsSnapshot(input: unknown): FinancialsSnapshot {
  return validateLegacyFinancialsSnapshot(input, KNOWN_TICKERS);
}

const snapshot = validateFinancialsSnapshot(rawSnapshot);

export function getFundamentalsSnapshot(ticker: string): SnapshotRecord | null {
  return snapshot.fundamentals[ticker] ?? null;
}

export function getFinancialsSnapshot(ticker: string): FinancialsSnapshotRecord | null {
  return snapshot.financials[ticker] ?? null;
}
