import type { CompanyMapV1 } from "./company-map-validation.js";
import type { XStockEntry } from "./types.js";

export type ListedCompanyExclusionReason =
  | "cik_unresolved"
  | "ticker_on_multiple_ciks"
  | "cik_shared_by_registry_tokens"
  | "companyfacts_unavailable"
  | "sec_entity_name_unusable"
  | "sec_name_sources_disagree"
  | "slug_collision"
  | "submissions_unavailable";

/** Where a listed company's display name comes from. */
export type ListedCompanyDisplayNameBasis = "registry_token_name" | "reviewed_override" | "sec_registrant_fallback";

export interface ListedCompanyInstrumentV1 {
  source: "xstocks_registry";
  ticker: string;
  mint: string;
  binding_basis: "issuer_product_name";
}

export interface ListedCompanyV1 {
  slug: string;
  display_name: string;
  display_name_basis: ListedCompanyDisplayNameBasis;
  listing_status: "us_listed";
  instruments: [ListedCompanyInstrumentV1];
  evidence: {
    sec_cik: string;
    /** The CIK's own SEC registrant name, as EDGAR writes it. Shown only as "SEC registrant". */
    sec_registrant_name: string;
    /** The registrant name of the CIK's latest XBRL filing (`companyfacts.entityName`), kept as evidence. */
    sec_entity_name: string | null;
    sec_ticker_title: string | null;
    registry_token_name: string;
  };
}

export interface ListedCompanyExclusionV1 {
  source: "xstocks_registry";
  ticker: string;
  reason: ListedCompanyExclusionReason;
  evidence: {
    sec_ciks: string[];
    sec_entity_name: string | null;
    sec_ticker_title: string | null;
    registry_token_name: string;
    shared_with_tickers: string[];
  };
}

export interface ListedCompanyMapV1 {
  schema_version: "benten.listed-company-map.v1";
  revision: number;
  generated_at: string;
  generation: {
    method: "registry_ticker_sec_cik_entity_name";
    generator: "scripts/companies/build-listed-company-map.mjs";
    generated_by: string;
    human_review:
      | { status: "pending"; reviewer: null; reviewed_at: null }
      | { status: "approved"; reviewer: string; reviewed_at: string };
    verification: {
      method: string;
      checked_on: string;
      checked_by: string;
      counts: {
        map_companies: number;
        map_cik_matches_sec: number;
        verified_facts_records: number;
        verified_facts_cik_and_accession_match: number;
      };
    };
  };
  bound_sources: {
    xstocks_registry_sha256: string;
    sec_company_tickers_cache_sha256: string;
    sec_companyfacts_cache_sha256: string;
    sec_submissions_cache_sha256: string;
    display_names_sha256: string;
  };
  companies: ListedCompanyV1[];
  excluded: ListedCompanyExclusionV1[];
}

export declare function validateListedCompanyMap(
  input: unknown,
  sources: { xstocks: readonly XStockEntry[]; reviewedMap: CompanyMapV1 },
): ListedCompanyMapV1;
