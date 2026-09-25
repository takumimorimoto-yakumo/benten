import type { ProviderAssetsArtifactV1, ProviderName } from "./provider-assets-validation.js";
import type { XStockEntry } from "./types.js";

export type CompanyListingStatus = "private" | "us_listed";
export type CompanyExclusionReason = "fund_not_single_company" | "not_reviewed" | "not_offered";

export interface CompanyMapProviderInstrumentV1 {
  source: "provider_assets";
  provider: ProviderName;
  provider_asset_id: string;
  mint: string;
  binding_basis: "provider_company_claim";
  provider_company_id: string;
}

export interface CompanyMapXStockInstrumentV1 {
  source: "xstocks_registry";
  ticker: string;
  mint: string;
  binding_basis: "issuer_product_name";
}

export type CompanyMapInstrumentV1 = CompanyMapProviderInstrumentV1 | CompanyMapXStockInstrumentV1;

export interface CompanyMapCompanyV1 {
  slug: string;
  display_name: string;
  listing_status: CompanyListingStatus;
  instruments: CompanyMapInstrumentV1[];
}

export type CompanyMapExclusionV1 =
  | { source: "provider_assets"; provider: ProviderName; provider_asset_id: string; reason: CompanyExclusionReason }
  | { source: "xstocks_registry"; ticker: string; reason: CompanyExclusionReason };

export interface CompanyMapIssuerProductCheckV1 {
  ticker: string;
  url: string;
  checked_on: string;
}

export interface CompanyMapV1 {
  schema_version: "benten.company-map.v1";
  revision: number;
  reviewed_at: string;
  review: { reviewer: string; method: "manual_source_review"; issuer_product_checks: CompanyMapIssuerProductCheckV1[] };
  bound_sources: { provider_assets_revision: string; xstocks_registry_sha256: string };
  companies: CompanyMapCompanyV1[];
  excluded: CompanyMapExclusionV1[];
}

export declare function validateCompanyMap(
  input: unknown,
  sources: { providerAssets: ProviderAssetsArtifactV1; xstocks: readonly XStockEntry[] },
): CompanyMapV1;
