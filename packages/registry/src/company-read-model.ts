/**
 * Static read model for the company maps.
 *
 * Two artifacts link instruments to companies, and nothing else does:
 *
 * - `company-map-v1.json`, reviewed by hand: the private companies and the
 *   PreStocks instruments that name them, plus the registry rows recorded as
 *   exclusions (`not_offered` for the rows withheld from the product);
 * - `listed-company-map-v1.json`, generated from the registry and SEC EDGAR
 *   identity and then reviewed: one US-listed company per filing-eligible
 *   xStock (`map_review` says whether that review has happened).
 *
 * A company record lists its instruments in the map's fixed order. Being
 * listed together never makes two instruments interchangeable: each keeps its
 * own provider, rights claim and unknowns, and no value is compared or
 * combined across them. Every lookup is exact; nothing here matches names.
 */
import companyMapJson from "./company-map-v1.json" with { type: "json" };
import listedCompanyMapJson from "./listed-company-map-v1.json" with { type: "json" };
import xstocksData from "./xstocks.json" with { type: "json" };
import {
  validateCompanyMap,
  type CompanyListingStatus,
  type CompanyMapV1,
} from "./company-map-validation.js";
import { validateListedCompanyMap, type ListedCompanyMapV1 } from "./listed-company-map-validation.js";
import { findProviderAsset, providerAssets, type ProviderAssetEntryV1 } from "./provider-read-model.js";
import { resolveTicker } from "./registry-lookup.js";
import type { XStockEntry } from "./types.js";

export type {
  CompanyExclusionReason,
  CompanyListingStatus,
  CompanyMapCompanyV1,
  CompanyMapExclusionV1,
  CompanyMapInstrumentV1,
  CompanyMapIssuerProductCheckV1,
  CompanyMapV1,
} from "./company-map-validation.js";
export type {
  ListedCompanyDisplayNameBasis,
  ListedCompanyExclusionReason,
  ListedCompanyExclusionV1,
  ListedCompanyInstrumentV1,
  ListedCompanyMapV1,
  ListedCompanyV1,
} from "./listed-company-map-validation.js";

export type CompanySlug = string;

/** Whether a person has reviewed the map row that defines the company. */
export type CompanyMapReview = "reviewed" | "pending";

export type CompanyInstrument =
  | { source: "provider_assets"; binding_basis: "provider_company_claim"; entry: ProviderAssetEntryV1 }
  | { source: "xstocks_registry"; binding_basis: "issuer_product_name"; entry: XStockEntry };

export interface CompanyRecord {
  slug: CompanySlug;
  /** The name people read (for a US-listed company: not the SEC spelling). */
  display_name: string;
  /** A US-listed company's SEC registrant name as EDGAR writes it, shown only as "SEC registrant"; `null` for a private company. */
  sec_registrant_name: string | null;
  listing_status: CompanyListingStatus;
  map_review: CompanyMapReview;
  instruments: readonly CompanyInstrument[];
}

export interface CompanyReference {
  slug: CompanySlug;
  display_name: string;
}

export interface CompanyListItem {
  slug: CompanySlug;
  display_name: string;
  listing_status: CompanyListingStatus;
  map_review: CompanyMapReview;
  instrument_count: number;
}

export interface ListCompaniesInput {
  /** Keep only companies with this listing status. */
  listing_status?: CompanyListingStatus;
  /**
   * Keep only companies with at least one instrument whose exact mint this
   * predicate accepts. Purchasability belongs to the purchase package, so the
   * caller passes its predicate (for example `isPurchasableMint`).
   */
  purchasable_mint?: (mint: string) => boolean;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

const registry = xstocksData as XStockEntry[];

/** Fail closed at module load, like the provider and snapshot artifacts. */
export const companyMap: CompanyMapV1 = deepFreeze(
  validateCompanyMap(companyMapJson, { providerAssets, xstocks: registry }),
);
export const listedCompanyMap: ListedCompanyMapV1 = deepFreeze(
  validateListedCompanyMap(listedCompanyMapJson, { xstocks: registry, reviewedMap: companyMap }),
);

type MapInstrument = CompanyMapV1["companies"][number]["instruments"][number];

function resolveInstrument(instrument: MapInstrument): CompanyInstrument {
  if (instrument.source === "provider_assets") {
    const entry = findProviderAsset(instrument.provider, instrument.provider_asset_id);
    if (!entry) throw new TypeError("company map provider instrument does not resolve");
    return { source: "provider_assets", binding_basis: "provider_company_claim", entry };
  }
  // Product allowlist, so a row withheld from the product can never be a company's instrument.
  const entry = resolveTicker(instrument.ticker);
  if (!entry || entry.ticker !== instrument.ticker) throw new TypeError("company map xStock instrument does not resolve");
  return { source: "xstocks_registry", binding_basis: "issuer_product_name", entry };
}

type MapCompany = {
  slug: string;
  display_name: string;
  sec_registrant_name: string | null;
  listing_status: CompanyListingStatus;
  instruments: readonly MapInstrument[];
  map_review: CompanyMapReview;
};

const listedReview: CompanyMapReview = listedCompanyMap.generation.human_review.status === "approved" ? "reviewed" : "pending";

/** Every company of both maps, in slug order (alphabetical, never by any value). */
const mapCompanies: readonly MapCompany[] = [
  ...companyMap.companies.map((company) => ({ ...company, sec_registrant_name: null, map_review: "reviewed" as const })),
  ...listedCompanyMap.companies.map((company) => ({ ...company, sec_registrant_name: company.evidence.sec_registrant_name, map_review: listedReview })),
].sort((left, right) => (left.slug < right.slug ? -1 : left.slug > right.slug ? 1 : 0));

for (let index = 1; index < mapCompanies.length; index += 1) {
  if (mapCompanies[index - 1]!.slug === mapCompanies[index]!.slug) throw new TypeError("duplicate company slug across maps");
}

const records: ReadonlyMap<CompanySlug, CompanyRecord> = new Map(mapCompanies.map((company) => [
  company.slug,
  deepFreeze({
    slug: company.slug,
    display_name: company.display_name,
    sec_registrant_name: company.sec_registrant_name,
    listing_status: company.listing_status,
    map_review: company.map_review,
    instruments: company.instruments.map(resolveInstrument),
  }),
]));

const byProviderAsset = new Map<string, CompanyReference>();
const byXStock = new Map<string, CompanyReference>();
for (const company of mapCompanies) {
  const reference = deepFreeze({ slug: company.slug, display_name: company.display_name });
  for (const instrument of company.instruments) {
    if (instrument.source === "provider_assets") {
      byProviderAsset.set(JSON.stringify([instrument.provider, instrument.provider_asset_id]), reference);
    } else {
      byXStock.set(instrument.ticker, reference);
    }
  }
}

const LIST_INPUT_KEYS = new Set(["listing_status", "purchasable_mint"]);

/**
 * Every mapped company in slug order (alphabetical, never by any value),
 * optionally filtered. A malformed filter throws rather than widening the list.
 */
export function listCompanies(input: ListCompaniesInput = {}): readonly CompanyListItem[] {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || Object.keys(input).some((key) => !LIST_INPUT_KEYS.has(key))) {
    throw new TypeError("invalid company list filter");
  }
  const { listing_status: listing, purchasable_mint: purchasable } = input;
  if (listing !== undefined && listing !== "private" && listing !== "us_listed") {
    throw new TypeError("invalid company list filter");
  }
  if (purchasable !== undefined && typeof purchasable !== "function") throw new TypeError("invalid company list filter");
  const items: CompanyListItem[] = [];
  for (const record of records.values()) {
    if (listing !== undefined && record.listing_status !== listing) continue;
    if (purchasable !== undefined && !record.instruments.some((instrument) => purchasable(
      instrument.source === "xstocks_registry" ? instrument.entry.mint : instrument.entry.mint_or_contract,
    ) === true)) continue;
    items.push({
      slug: record.slug,
      display_name: record.display_name,
      listing_status: record.listing_status,
      map_review: record.map_review,
      instrument_count: record.instruments.length,
    });
  }
  return items;
}

/** Exact, case-sensitive slug lookup; no trimming, prefix or fuzzy match. */
export function findCompany(slug: unknown): CompanyRecord | undefined {
  return typeof slug === "string" ? records.get(slug) : undefined;
}

/** The company a map links to one provider instrument, if any. */
export function companyForProviderAsset(provider: unknown, id: unknown): CompanyReference | undefined {
  if (typeof provider !== "string" || typeof id !== "string") return undefined;
  return byProviderAsset.get(JSON.stringify([provider, id]));
}

/** The company a map links to one xStock by its exact registry ticker, if any. */
export function companyForXStock(ticker: unknown): CompanyReference | undefined {
  return typeof ticker === "string" ? byXStock.get(ticker) : undefined;
}
