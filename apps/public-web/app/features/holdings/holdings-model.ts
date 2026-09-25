/**
 * Holdings view model (app IA sections 6.1 to 6.3): one observation of the
 * connected wallet, the Pyth reference prices read for it, and the reviewed
 * product labels, turned into rows. Pure; no I/O.
 *
 * Which feed may value a holding comes from the reviewed feed index
 * (`valuationFeedForMint`), and whether its price may be used from the one
 * rule every page shares (`priceForValue`: live, and a confidence interval
 * within the configured share of the price). A price that is shown but not
 * usable (stale, too old, too wide) values nothing. The arithmetic is
 * `@benten/pricing/value`'s, the same as the facts API's valuation. The total
 * exists only when the read was complete and every covered holding has a
 * value. No cost basis, so no profit or loss anywhere.
 */
import type { HoldingsObservation, ProductHolding } from "@benten/holdings/read-holdings";
import type { ValuationUnavailableReason } from "@benten/pricing";
import { referenceValue, sumReferenceValues, type ReferenceValue } from "@benten/pricing/value";
import { hasPythFeed, priceForValue, valuationFeedForMint, type PriceNotUsableReason, type PriceRead, type PythFeed } from "@/features/pricing";

/** Reviewed labels and links of one supported product, built at prerender from the registry. */
export type HoldingsProduct = {
  readonly mint: string;
  readonly symbol: string;
  /** Company name where the company map links one, otherwise the registry's token name. */
  readonly name: string;
  /** This locale's product page. */
  readonly href: string;
  /** This locale's buy flow, only for a product with a verified route. */
  readonly buyHref: string | null;
};

export type HoldingValueReason = ValuationUnavailableReason | "price_confidence_too_wide" | "price_too_old";

export type HoldingRow = {
  readonly mint: string;
  readonly product: HoldingsProduct;
  readonly rawAmount: string;
  /** `null` when the mint (or the multiplier in effect) could not be read. */
  readonly displayAmount: string | null;
  readonly accounts: number;
  readonly frozenAccounts: number;
  readonly delegatedAccounts: number;
  /** Value at the Pyth reference price, USD, truncated to cents; `null` with `valueReason` otherwise. */
  readonly value: string | null;
  readonly valueReason: HoldingValueReason | null;
  /** The feed that may value this holding, whose price the row shows; `null` when there is none. */
  readonly feed: PythFeed | null;
  /** That feed's read, `null` while it has not been read. */
  readonly priceRead: PriceRead | null;
};

export type HoldingsView = {
  readonly rows: readonly HoldingRow[];
  /** Only when the read was complete and every row has a value. */
  readonly total: { readonly value: string; readonly oldestPriceUnix: number; readonly newestPriceUnix: number } | null;
  /** Rows without a value, when that is why there is no total. */
  readonly withoutValue: number;
  readonly readComplete: boolean;
  readonly otherAccounts: number;
  /** The part of `otherAccounts` that could not be read. */
  readonly unreadableAccounts: number;
  readonly frozenAccounts: number;
  readonly delegatedAccounts: number;
};

type ReadObservation = Extract<HoldingsObservation, { status: "available" | "partial" }>;

/** The feeds that may value the observed holdings, unique, in feed id order. */
export function valuationFeeds(holdings: readonly Pick<ProductHolding, "mint">[]): PythFeed[] {
  const feeds = new Map<string, PythFeed>();
  for (const holding of holdings) {
    const feed = valuationFeedForMint(holding.mint);
    if (feed) feeds.set(feed.feed_id, feed);
  }
  return [...feeds.values()].sort((left, right) => byCodePoint(left.feed_id, right.feed_id));
}

const PRICE_REASON: Record<PriceNotUsableReason, HoldingValueReason> = {
  unavailable: "price_unavailable",
  no_feed: "price_unavailable",
  stale: "price_stale",
  too_old: "price_too_old",
  confidence_too_wide: "price_confidence_too_wide",
};

function byCodePoint(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

type Valued = Extract<ReferenceValue, { status: "valued" }> & { readonly publishTimeUnix: number };

/** One holding's value, or why it has none. */
function valueOf(holding: ProductHolding, feed: PythFeed | null, read: PriceRead | null, nowMs: number): Valued | { readonly status: "none"; readonly reason: HoldingValueReason } {
  if (!feed) return { status: "none", reason: hasPythFeed(holding.mint) ? "unit_basis_unverified" : "no_price_feed" };
  const usable = priceForValue(read?.result ?? null, nowMs);
  if (!usable.usable) return { status: "none", reason: PRICE_REASON[usable.reason] };
  const computed = referenceValue(holding, usable.price);
  if (computed.status === "unavailable") return { status: "none", reason: computed.reason };
  return { ...computed, publishTimeUnix: usable.price.publish_time_unix };
}

/**
 * Build the view. `products` must hold every supported product mint (the
 * reader returns only those); a holding without one is a build defect and
 * throws rather than showing an unlabelled token.
 */
export function buildHoldingsView(
  observation: ReadObservation,
  products: ReadonlyMap<string, HoldingsProduct>,
  prices: ReadonlyMap<string, PriceRead>,
  nowMs: number,
): HoldingsView {
  const valued: Valued[] = [];
  const rows = observation.holdings.map((holding): HoldingRow => {
    const product = products.get(holding.mint);
    if (!product) throw new Error("a supported holding has no reviewed product label");
    const feed = valuationFeedForMint(holding.mint);
    const priceRead = feed ? prices.get(feed.feed_id) ?? null : null;
    const result = valueOf(holding, feed, priceRead, nowMs);
    if (result.status === "valued") valued.push(result);
    return {
      mint: holding.mint,
      product,
      rawAmount: holding.rawAmount,
      displayAmount: holding.displayAmount,
      accounts: holding.accounts.length,
      frozenAccounts: holding.frozenAccounts,
      delegatedAccounts: holding.delegatedAccounts,
      value: result.status === "valued" ? result.value : null,
      valueReason: result.status === "valued" ? null : result.reason,
      feed,
      priceRead,
    };
  }).sort((left, right) => byCodePoint(left.product.symbol, right.product.symbol));

  const complete = observation.status === "available" && rows.length > 0 && valued.length === rows.length;
  const priceTimes = valued.map((entry) => entry.publishTimeUnix);
  const total = complete
    ? { value: sumReferenceValues(valued.map((entry) => entry.exact)), oldestPriceUnix: Math.min(...priceTimes), newestPriceUnix: Math.max(...priceTimes) }
    : null;

  return {
    rows,
    total,
    withoutValue: rows.filter((row) => row.value === null).length,
    readComplete: observation.status === "available",
    otherAccounts: observation.coverage.otherAccounts,
    unreadableAccounts: observation.coverage.unreadableAccounts,
    frozenAccounts: rows.reduce((sum, row) => sum + row.frozenAccounts, 0),
    delegatedAccounts: rows.reduce((sum, row) => sum + row.delegatedAccounts, 0),
  };
}
