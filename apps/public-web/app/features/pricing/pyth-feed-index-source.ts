/**
 * Derivation of the browser's Pyth feed index from the reviewed feed map
 * (`@benten/pricing`, `pyth-feeds-v1.json`). Pure and dependency-free, so the
 * build tool (`tools/write-pyth-feed-index.mts`) and the drift test share it.
 *
 * The feed map is about 135 KB and pulls in the registry for validation; the
 * index keeps only what a page needs to show one reference price per
 * product: the product mint (and xStock ticker), the one feed shown for it,
 * that feed's Pyth symbol, its role, and whether the feed map lets it value
 * a holding of the product. Nothing is matched by name: a product finds its
 * feed by exact mint or exact ticker equality.
 */

export type PythFeedRole = "xstock_underlying_share" | "xstock_token" | "private_company_index";

export type PythFeedIndexEntry = {
  readonly mint: string;
  /** The xStock registry ticker; `null` for a provider instrument. */
  readonly ticker: string | null;
  readonly feed_id: string;
  readonly pyth_symbol: string;
  readonly role: PythFeedRole;
  /** The feed map's `valuation.use`: this feed may value a holding of `mint` (Holdings, app IA 6.2). */
  readonly values_holdings: boolean;
};

export type PythFeedIndex = {
  readonly schema_version: "benten.public-web.pyth-feed-index.v1";
  readonly feed_map_revision: string;
  readonly entries: readonly PythFeedIndexEntry[];
};

/** The shape of a feed map entry this derivation reads. */
export type FeedMapEntryLike = {
  readonly feed_id: string;
  readonly pyth_symbol: string;
  readonly role: PythFeedRole;
  readonly valuation: { readonly use: boolean };
  readonly binding: { readonly kind: "xstock"; readonly mint: string; readonly ticker: string } | { readonly kind: "prestocks"; readonly mint: string; readonly provider_asset_id: string };
};

/**
 * Which feed a product page shows when its mint has more than one: the
 * underlying share first (it is the one the feed map lets value a holding),
 * then a private-company index, then a feed for the token itself. The feed
 * that may value a holding must be the one shown, so a Holdings value and
 * the price beside it always come from the same feed; the derivation fails
 * otherwise.
 */
export const DISPLAY_ROLE_ORDER: readonly PythFeedRole[] = ["xstock_underlying_share", "private_company_index", "xstock_token"];

export function derivePythFeedIndex(revision: string, entries: readonly FeedMapEntryLike[]): PythFeedIndex {
  const byMint = new Map<string, FeedMapEntryLike>();
  for (const entry of entries) {
    const current = byMint.get(entry.binding.mint);
    if (current && current.role === entry.role) throw new Error(`feed map binds two ${entry.role} feeds to one mint`);
    if (!current || DISPLAY_ROLE_ORDER.indexOf(entry.role) < DISPLAY_ROLE_ORDER.indexOf(current.role)) byMint.set(entry.binding.mint, entry);
  }
  for (const entry of entries) {
    if (entry.valuation.use && byMint.get(entry.binding.mint) !== entry) throw new Error("the feed that values a holding is not the feed shown for its product");
  }
  const index = [...byMint.values()]
    .map((entry): PythFeedIndexEntry => ({
      mint: entry.binding.mint,
      ticker: entry.binding.kind === "xstock" ? entry.binding.ticker : null,
      feed_id: entry.feed_id,
      pyth_symbol: entry.pyth_symbol,
      role: entry.role,
      values_holdings: entry.valuation.use,
    }))
    .sort((left, right) => (left.mint < right.mint ? -1 : left.mint > right.mint ? 1 : 0));
  return { schema_version: "benten.public-web.pyth-feed-index.v1", feed_map_revision: revision, entries: index };
}
