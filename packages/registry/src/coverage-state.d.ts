import type { FinancialsSnapshotRecord, SnapshotRecord } from "./financials-snapshot.js";
import type { VerifiedOverlayRecord } from "./artifact-validation.js";
import type { XStockEntry } from "./types.js";

export type CapabilityAvailability = "available" | "no_data";
export declare function availabilityFromSources(legacyPresent: boolean, verifiedPresent: boolean): CapabilityAvailability;
export declare function verifiedRecordHasFacts(record: VerifiedOverlayRecord | undefined): boolean;
export declare function coverageAvailabilityFromRecords(
  legacyFundamentals: SnapshotRecord | null | undefined,
  legacyFinancials: FinancialsSnapshotRecord | null | undefined,
  verifiedRecord: VerifiedOverlayRecord | undefined,
): {
  snapshot_status: CapabilityAvailability;
  capabilities: Record<"fundamentals" | "pl" | "bs" | "cf", CapabilityAvailability>;
};
export declare function countAvailableFundamentals(
  registry: readonly XStockEntry[],
  legacyFundamentals: Readonly<Record<string, unknown>>,
  overlayRecords: Readonly<Record<string, VerifiedOverlayRecord>>,
): number;
