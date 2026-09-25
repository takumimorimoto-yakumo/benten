/**
 * Which Pyth feed a product shows, from the committed index derived from the
 * reviewed feed map (`pyth-feed-index.json`; drift-tested against
 * `@benten/pricing`'s validated `FEED_MAP`). Lookups are exact mint or exact
 * ticker equality; nothing is matched by name, prefix or case folding.
 */
import feedIndex from "./pyth-feed-index.json";
import type { PythFeedIndex, PythFeedIndexEntry } from "./pyth-feed-index-source";

export type PythFeed = PythFeedIndexEntry;

const INDEX = feedIndex as PythFeedIndex;
const BY_MINT = new Map(INDEX.entries.map((entry) => [entry.mint, entry]));
const BY_TICKER = new Map(INDEX.entries.filter((entry) => entry.ticker !== null).map((entry) => [entry.ticker!, entry]));

/** The feed shown for a product mint, or `null` when the reviewed map binds none. */
export function pythFeedForMint(mint: string): PythFeed | null {
  return BY_MINT.get(mint) ?? null;
}

/** The feed shown for an xStock registry ticker (exact, canonical case), or `null`. */
export function pythFeedForTicker(ticker: string): PythFeed | null {
  return BY_TICKER.get(ticker) ?? null;
}

/**
 * The feed that may value a holding of `mint` (the feed map's
 * `valuation.use`), or `null`. It is always the feed shown for that product.
 */
export function valuationFeedForMint(mint: string): PythFeed | null {
  const feed = BY_MINT.get(mint);
  return feed?.values_holdings ? feed : null;
}

/** Whether the reviewed map binds any feed to `mint` (a feed that may not value a holding counts). */
export function hasPythFeed(mint: string): boolean {
  return BY_MINT.has(mint);
}

/** The feed map revision the index was derived from. */
export const PYTH_FEED_MAP_REVISION = INDEX.feed_map_revision;
