import type { FinancialsSnapshotRecord, SnapshotRecord } from "./financials-snapshot.js";

export interface LegacyFinancialsSnapshot {
  schema_version: 1;
  fundamentals: Record<string, SnapshotRecord>;
  financials: Record<string, FinancialsSnapshotRecord>;
}

export declare function isValidLegacySnapshotAsOf(value: unknown): value is string;
export declare function validateLegacyFinancialsSnapshot(
  input: unknown,
  eligibleTickers: ReadonlySet<string>,
): LegacyFinancialsSnapshot;
