/**
 * Browser-safe view model of one company page (app IA section 4.4). The
 * build-only projection in `app/lib/company.server.ts` fills it from the
 * company maps, the registry and the annual history of SEC facts. It carries no
 * provider reference or supply value: products are listed together in map
 * order, never compared, ranked or combined.
 */
import type { ProviderRightsV1, VerifiedFactName } from "@benten/registry";
import type { AnnualFilingView, FiscalYearLabelView } from "@/features/dossier/dossier-view";

/** Who issues a product. xStocks come from the registry; PreStocks from the provider artifact. */
export type ProductProvider = "xstocks" | "prestocks";

/** What the product card says the holder owns, from the record's own fields (never from provider marketing text). */
export type ProductOwnership =
  | { readonly kind: "xstock" }
  | {
      readonly kind: "provider";
      readonly instrumentKind: ProviderRightsV1["instrument_kind"];
      readonly claimOnly: boolean;
      readonly equityOwnership: false | "unknown";
      readonly votingRights: false | "unknown";
    };

export type CompanyProductView = {
  /** `xstocks/{ticker}` or `{provider}/{id}`: the product's identity on this page. */
  readonly key: string;
  readonly provider: ProductProvider;
  /** Registry ticker (xStocks) or provider asset id (PreStocks): the product page's route key. */
  readonly routeKey: string;
  readonly symbol: string;
  readonly name: string;
  /** Exact mint, for the price slot; the card shows no address. */
  readonly mint: string;
  readonly ownership: ProductOwnership;
  /** Exact mint equality with the one fixed purchase route; never a ticker or name match. */
  readonly buyable: boolean;
};

/** One summarized fact: the newest `verified_reported` point of the annual history for its metric. */
export type CompanyFactRow = {
  readonly name: VerifiedFactName;
  readonly value: number;
  readonly currency: string;
  readonly label: FiscalYearLabelView;
  readonly filing: AnnualFilingView;
};

/** The company facts block: filing-verified SEC facts, the not-yet-verified note, or the private-company note. */
export type CompanyFactsView =
  | { readonly kind: "verified"; readonly ticker: string; readonly rows: readonly CompanyFactRow[]; readonly sources: readonly AnnualFilingView[] }
  | { readonly kind: "not_verified"; readonly ticker: string }
  | { readonly kind: "private" };

/** How the company map links these products, stated as facts about the map. */
export type CompanyLinkMethod =
  | { readonly kind: "reviewed"; readonly revision: number; readonly reviewedOn: string; readonly providerFetchedOn: string }
  | { readonly kind: "generated"; readonly revision: number; readonly generatedOn: string; readonly secCik: string; readonly checkedOn: string; readonly humanReview: "pending" | "approved" };

export type CompanyView = {
  readonly slug: string;
  readonly displayName: string;
  /** A US-listed company's SEC registrant name, shown only as "SEC registrant"; `null` for a private company. */
  readonly secRegistrant: string | null;
  readonly listingStatus: "private" | "us_listed";
  /** In map order: source, then provider, then identifier. Never a value order. */
  readonly products: readonly CompanyProductView[];
  readonly facts: CompanyFactsView;
  readonly method: CompanyLinkMethod;
};

/** Facts the company page summarizes; the product page keeps the full set. */
export const COMPANY_FACT_SUMMARY = ["revenue", "net_income_parent"] as const satisfies readonly VerifiedFactName[];
