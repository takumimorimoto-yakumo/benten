/**
 * Derivation of the price comparison index from the reviewed Pyth feed map
 * (`@benten/pricing`, `pyth-feeds-v1.json`) and Pyth's published market
 * schedules. Pure and dependency-free, so the build tool
 * (`tools/write-price-comparison-index.mts`) and the drift test share it.
 *
 * One entry per xStock whose feed map binds an underlying-share feed
 * (`Equity.US.<ticker>/USD`): that feed and, where the feed map binds one,
 * the feed for the token itself (`Crypto.<ticker>X/USD`). Bindings come from
 * the feed map only, by exact mint; nothing is matched by name. Each feed
 * carries the index of its schedule string, copied verbatim from Pyth's
 * feed metadata.
 */

export type ComparisonFeed = {
  readonly feed_id: string;
  readonly pyth_symbol: string;
  /** Index into `PriceComparisonIndex.schedules`. */
  readonly schedule: number;
};

export type PriceComparisonEntry = {
  readonly ticker: string;
  readonly mint: string;
  readonly underlying: ComparisonFeed;
  readonly token: ComparisonFeed | null;
};

export type PriceComparisonIndex = {
  readonly schema_version: "benten.public-web.price-comparison-index.v1";
  readonly feed_map_revision: string;
  /**
   * When Pyth's feed metadata (the feed map's `source.feed_metadata_url`) was
   * read for the schedules. The URL itself is not carried: this index ships
   * to the browser, which reads prices only from the same-origin API.
   */
  readonly schedule_source: { readonly checked_at: string };
  /** Distinct Pyth schedule strings, verbatim. */
  readonly schedules: readonly string[];
  readonly entries: readonly PriceComparisonEntry[];
};

/** The shape of a feed map entry this derivation reads. */
export type ComparisonFeedMapEntry = {
  readonly feed_id: string;
  readonly pyth_symbol: string;
  readonly role: "xstock_underlying_share" | "xstock_token" | "private_company_index";
  readonly binding: { readonly kind: "xstock"; readonly mint: string; readonly ticker: string } | { readonly kind: "prestocks"; readonly mint: string; readonly provider_asset_id: string };
};

export function derivePriceComparisonIndex(input: {
  readonly revision: string;
  readonly entries: readonly ComparisonFeedMapEntry[];
  /** Pyth's schedule string for a feed id published under exactly `pythSymbol`; the derivation fails for a feed without one. */
  readonly scheduleOf: (feedId: string, pythSymbol: string) => string | undefined;
  readonly scheduleSource: { readonly checked_at: string };
}): PriceComparisonIndex {
  const schedules: string[] = [];
  const feed = (entry: ComparisonFeedMapEntry): ComparisonFeed => {
    const schedule = input.scheduleOf(entry.feed_id, entry.pyth_symbol);
    if (!schedule) throw new Error(`no Pyth schedule for ${entry.pyth_symbol}`);
    let index = schedules.indexOf(schedule);
    if (index < 0) index = schedules.push(schedule) - 1;
    return { feed_id: entry.feed_id, pyth_symbol: entry.pyth_symbol, schedule: index };
  };
  const byMint = new Map<string, { ticker: string; underlying?: ComparisonFeedMapEntry; token?: ComparisonFeedMapEntry }>();
  for (const entry of input.entries) {
    if (entry.binding.kind !== "xstock" || entry.role === "private_company_index") continue;
    const slot = byMint.get(entry.binding.mint) ?? { ticker: entry.binding.ticker };
    const key = entry.role === "xstock_underlying_share" ? "underlying" : "token";
    if (slot[key]) throw new Error(`feed map binds two ${entry.role} feeds to ${entry.binding.ticker}`);
    slot[key] = entry;
    byMint.set(entry.binding.mint, slot);
  }
  const entries = [...byMint.entries()]
    .filter(([, slot]) => slot.underlying)
    .sort(([, left], [, right]) => (left.ticker < right.ticker ? -1 : left.ticker > right.ticker ? 1 : 0))
    .map(([mint, slot]): PriceComparisonEntry => ({ ticker: slot.ticker, mint, underlying: feed(slot.underlying!), token: slot.token ? feed(slot.token) : null }));
  return { schema_version: "benten.public-web.price-comparison-index.v1", feed_map_revision: input.revision, schedule_source: input.scheduleSource, schedules, entries };
}
