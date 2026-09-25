import type {
  AssetIdentity,
  CoverageState,
  LegacySnapshotBlock,
  ReleaseProfile,
  VerifiedFactSet,
  VerifiedReportedFact,
} from "@benten/registry";

export type ResultReason =
  | "invalid_input"
  | "unknown_ticker"
  | "unknown_mint"
  | "not_eligible"
  | "no_data"
  | "invalid_statement"
  | "service_unavailable";

export type AssetIdentityResult = AssetIdentity;
export type CoverageResult = CoverageState;
export type VerifiedFacts = VerifiedFactSet;
export type VerifiedFact = VerifiedReportedFact;
export type LegacySnapshot = LegacySnapshotBlock;

export type FinancialResultData = {
  found: true;
  identity: AssetIdentity;
  coverage: CoverageState;
  verified_facts: VerifiedFactSet | null;
  legacy_snapshot: LegacySnapshotBlock | null;
} | {
  found: false;
  reason: ResultReason;
  requested_identifier: string | null;
  identity: AssetIdentity | null;
  coverage: CoverageState | null;
  retryable: boolean;
};

export interface FinancialResult {
  schema_version: "2.0";
  artifact_revision: string;
  release_profile: ReleaseProfile;
  data: FinancialResultData;
  disclaimer: string;
}

export function isFoundResult(result: FinancialResult): result is FinancialResult & { data: Extract<FinancialResultData, { found: true }> } {
  return result.data.found;
}
