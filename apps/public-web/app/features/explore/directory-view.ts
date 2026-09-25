/**
 * Browser-safe view models of Explore (`/`) and the companies list
 * (`/companies`), app IA sections 4.2 and 4.3. The build-only projection in
 * `app/lib/directory.server.ts` fills them from the company maps and the
 * product registry. Rows carry no price or any other value, and every list
 * is alphabetical.
 */
import type { ProductProvider } from "@/features/references/company-view";

/** The three groups, in the order Explore and the list show them (private first: what broker apps do not offer). */
export const DIRECTORY_GROUPS = ["private", "us-listed", "funds"] as const;
export type DirectoryGroup = (typeof DIRECTORY_GROUPS)[number];

export type DirectoryProduct = { readonly symbol: string; readonly provider: ProductProvider };

/** One company row: it opens the company page. */
export type CompanyRow = {
  readonly slug: string;
  readonly name: string;
  readonly products: readonly DirectoryProduct[];
  /** A product of this company has the one fixed purchase route. */
  readonly buyInBenten: boolean;
};

/** One token without a company page: it opens the token's own page. */
export type TokenRow = {
  readonly ticker: string;
  readonly symbol: string;
  readonly name: string;
  readonly buyInBenten: boolean;
};

/** What a search suggestion shows. The target comes from the search index; this only labels it. */
export type SuggestionLabel = {
  readonly slug: string | null;
  readonly ticker: string | null;
  readonly name: string;
  readonly symbol: string;
  readonly group: DirectoryGroup;
  /** It carries the same `Buy in Benten` tag as its row in the lists. */
  readonly buyInBenten: boolean;
};

export type ExploreView = {
  /** The one buyable product, named from its registry record; null when no product has a route. */
  readonly buyable: { readonly symbol: string; readonly name: string } | null;
  readonly private: { readonly count: number; readonly rows: readonly CompanyRow[] };
  /** `rows` is the first few, A to Z; `count` is all of them. */
  readonly usListed: { readonly count: number; readonly rows: readonly CompanyRow[] };
  readonly funds: { readonly count: number; readonly examples: readonly string[] };
  readonly suggestions: readonly SuggestionLabel[];
};

export type CompaniesView = {
  readonly private: readonly CompanyRow[];
  readonly usListed: readonly CompanyRow[];
  /** US-listed tokens the generated map could not link to exactly one SEC company. */
  readonly unlinked: readonly TokenRow[];
  readonly funds: readonly TokenRow[];
};

/** Rows Explore shows from the US-listed group before "See all". */
export const EXPLORE_US_LISTED_ROWS = 5;
/** Fund names Explore gives as examples. */
export const EXPLORE_FUND_EXAMPLES = 3;

/** The letter a row files under in the A to Z list: its first letter, or `#` for a digit. */
export function directoryLetter(key: string): string {
  const first = key.normalize("NFKC").charAt(0).toUpperCase();
  return /[A-Z]/.test(first) ? first : "#";
}
