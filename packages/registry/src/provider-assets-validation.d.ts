export type ProviderName = "prestocks";
export type ProviderAssetKind = "prestock_provider_instrument";
export type ProviderEvidenceState = "candidate_unverified" | "verified_reference";
export type ProviderUnknownCode =
  | "source_as_of_unknown"
  | "currency_unknown"
  | "rights_unknown"
  | "company_binding_unknown"
  | "chain_identity_unknown"
  | "provider_catalog_mismatch"
  | "redistribution_pending"
  | "execution_quote_unavailable"
  | "asset_not_found";
export type ProviderUnknownBlock = "display" | "comparison" | "release";
export type ProviderReferenceKind =
  | "prestock_mark_reference"
  | "prestock_token_reference"
  | "prestock_implied_valuation_reference";

export interface ProviderSourceV1 {
  provider: ProviderName;
  source_url: string;
  observed_at: string;
  response_digest: string;
  schema_revision: string;
  redistribution_status: "approved" | "pending_terms_review";
}

export interface ProviderCompanyBindingV1 {
  company_id: string;
  company_name: string;
  binding_status: "public_source_verified" | "provider_claim_only" | "unknown";
  evidence_refs: string[];
}

export interface ProviderRightsV1 {
  status: "public_source_verified" | "provider_terms_observed" | "provider_claim_only" | "unknown";
  instrument_kind: "tracker_certificate" | "economic_exposure_instrument" | "unknown";
  equity_ownership: false | "unknown";
  voting_rights: false | "unknown";
  redemption_kind: "provider_terms" | "conditional" | "none" | "unknown";
  restrictions: string[];
  evidence_refs: string[];
  provider_statement: string;
  terms_url?: string;
}

export interface ProviderReferenceV1 {
  kind: ProviderReferenceKind;
  value: string;
  currency: string | null;
  provider_reported_as_of: string | null;
}

export interface ProviderSupplyReferenceV1 {
  value: string;
  basis: "provider_reported_supply";
  provider_reported_as_of: string | null;
}

export interface ProviderUnknownV1 {
  code: ProviderUnknownCode;
  blocks: ProviderUnknownBlock[];
}

export interface ProviderAssetEntryV1 {
  provider: ProviderName;
  provider_asset_id: string;
  asset_kind: ProviderAssetKind;
  symbol: string;
  display_name: string;
  mint_or_contract: string;
  evidence_state: ProviderEvidenceState;
  company_binding: ProviderCompanyBindingV1;
  rights: ProviderRightsV1;
  references: ProviderReferenceV1[];
  supply_reference?: ProviderSupplyReferenceV1;
  external_url: string;
  source_digest: string;
  unknowns: ProviderUnknownV1[];
  not_quote: true;
  not_authorization: true;
}

export interface ProviderAssetsArtifactV1 {
  schema_version: "provider-assets.v1";
  revision: string;
  fetched_at: string;
  sources: ProviderSourceV1[];
  entries: ProviderAssetEntryV1[];
}

export interface ProviderAssetsManifestV1 {
  schema_version: "provider-assets.v1";
  artifact: "provider-assets-v1.json";
  sha256: string;
  revision: string;
  fetched_at: string;
  counts: { prestocks: number };
}

export declare function decodeBase58(input: unknown): Uint8Array | null;
export declare function sha256Hex(input: string): string;
export declare function canonicalJson(value: unknown): string;
export declare function validateProviderAssets(input: unknown): ProviderAssetsArtifactV1;
export declare function validateProviderAssetsManifest(
  input: unknown,
  artifact: ProviderAssetsArtifactV1,
): ProviderAssetsManifestV1;
