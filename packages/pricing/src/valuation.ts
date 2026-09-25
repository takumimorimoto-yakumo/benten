/**
 * Reference valuation of supported product holdings with Pyth prices.
 *
 * `value = raw ÷ 10^decimals × Scaled UI multiplier × underlying share price`
 * for an xStock whose feed map entry allows valuation
 * (`xstock_scaled_ui_amount`; the evidence is recorded in the feed map).
 * Everything else is reported with a reason and no value:
 *
 *  - no valuation feed, or a feed whose unit basis is unverified (every
 *    PreStocks instrument and every xStock token feed);
 *  - a price that is stale or unavailable;
 *  - a holding without its decimals, its Scaled UI extension or the
 *    multiplier in effect (a missing multiplier is never taken as 1).
 *
 * A valuation is a reference, not a quote or an offer. There is no cost
 * basis, so there is no profit or loss. A summary gives a total only when
 * every holding was valued and the holdings read itself was complete;
 * otherwise it gives the valued subtotal, labelled incomplete.
 */

import type { Decimal } from "./decimal.js";
import { FEED_MAP, valuationFeedForMint } from "./feed-map.js";
import { isFresh, type PythPriceResult } from "./prices.js";
import { referenceValue, sumReferenceValues } from "./value.js";

/** The holding facts a valuation needs. Field meanings match `@benten/holdings`. */
export interface ValuationHoldingInput {
  mint: string;
  rawAmount: string;
  decimals: number | null;
  hasScaledUiAmount: boolean | null;
  scaledUiMultiplier: string | null;
}

export type ValuationUnavailableReason =
  | "no_price_feed"
  | "unit_basis_unverified"
  | "price_unavailable"
  | "price_stale"
  | "holding_metadata_unavailable"
  | "multiplier_unavailable";

interface ValuationBase {
  kind: "pyth_reference_valuation";
  mint: string;
  currency: "USD";
  source: "pyth";
  not_quote: true;
}

export type HoldingValuation =
  | (ValuationBase & {
    status: "valued";
    /** Truncated to `PRICING_CONFIG.valueFractionDigits`; never overstated. */
    value: string;
    /** Underlying shares represented: raw ÷ 10^decimals × multiplier, exact. */
    share_equivalent: string;
    unit_basis: "one_underlying_share";
    conversion_basis: "xstock_scaled_ui_amount";
    scaled_ui_multiplier: string;
    price: { feed_id: string; price: string; publish_time: string };
  })
  | (ValuationBase & { status: "unavailable"; value: null; reason: ValuationUnavailableReason; feed_id: string | null });

/** Mints that have Pyth feeds, none of which may value a holding. */
const FEED_BLOCKED_MINTS: ReadonlySet<string> = new Set(
  FEED_MAP.entries.filter((entry) => !entry.valuation.use && !valuationFeedForMint(entry.binding.mint)).map((entry) => entry.binding.mint),
);

function unavailable(mint: string, reason: ValuationUnavailableReason, feedId: string | null): HoldingValuation {
  return { kind: "pyth_reference_valuation", mint, currency: "USD", source: "pyth", not_quote: true, status: "unavailable", value: null, reason, feed_id: feedId };
}

/**
 * Value one holding with the price results available (keyed by feed id).
 * `nowMs` re-judges freshness, so a price held for a while cannot value a
 * holding after it went stale.
 */
export function valueHolding(holding: ValuationHoldingInput, prices: ReadonlyMap<string, PythPriceResult>, nowMs: number): HoldingValuation {
  return valueHoldingExact(holding, prices, nowMs).valuation;
}

function valueHoldingExact(
  holding: ValuationHoldingInput,
  prices: ReadonlyMap<string, PythPriceResult>,
  nowMs: number,
): { valuation: HoldingValuation; exact: Decimal | null } {
  const feed = valuationFeedForMint(holding.mint);
  if (!feed) {
    // Either no feed at all, or only feeds whose unit basis is unverified.
    const blocked = FEED_BLOCKED_MINTS.has(holding.mint);
    return { valuation: unavailable(holding.mint, blocked ? "unit_basis_unverified" : "no_price_feed", null), exact: null };
  }
  const price = prices.get(feed.feed_id);
  if (!price || price.status === "unavailable") return { valuation: unavailable(holding.mint, "price_unavailable", feed.feed_id), exact: null };
  if (!isFresh(price, nowMs)) return { valuation: unavailable(holding.mint, "price_stale", feed.feed_id), exact: null };
  const computed = referenceValue(holding, price);
  if (computed.status === "unavailable") return { valuation: unavailable(holding.mint, computed.reason, feed.feed_id), exact: null };
  return {
    valuation: {
      kind: "pyth_reference_valuation",
      mint: holding.mint,
      currency: "USD",
      source: "pyth",
      not_quote: true,
      status: "valued",
      value: computed.value,
      share_equivalent: computed.shareEquivalent,
      unit_basis: "one_underlying_share",
      conversion_basis: "xstock_scaled_ui_amount",
      scaled_ui_multiplier: computed.multiplier,
      price: { feed_id: feed.feed_id, price: price.price, publish_time: price.publish_time },
    },
    exact: computed.exact,
  };
}

export interface ValuationSummary {
  kind: "pyth_reference_valuation_summary";
  currency: "USD";
  holdings: number;
  valued: number;
  /** `true` only when the holdings read was complete and every holding was valued. */
  complete: boolean;
  /** The total, only when `complete`; otherwise `null`. */
  total: string | null;
  /** Sum of the valued holdings. Not a total unless `complete`. */
  valued_subtotal: string;
  /** No cost basis is known, so no profit or loss is computed. */
  cost_basis: null;
  profit_loss: null;
  not_quote: true;
}

/** Value every holding and summarize, without presenting partial coverage as a total. */
export function valueHoldings(
  holdings: readonly ValuationHoldingInput[],
  prices: ReadonlyMap<string, PythPriceResult>,
  options: { holdingsComplete: boolean; nowMs: number },
): { valuations: HoldingValuation[]; summary: ValuationSummary } {
  const exacts: Decimal[] = [];
  const valuations = holdings.map((holding) => {
    const { valuation, exact } = valueHoldingExact(holding, prices, options.nowMs);
    if (exact) exacts.push(exact);
    return valuation;
  });
  const valued = exacts.length;
  const complete = options.holdingsComplete && valued === holdings.length;
  const subtotalText = sumReferenceValues(exacts);
  return {
    valuations,
    summary: {
      kind: "pyth_reference_valuation_summary",
      currency: "USD",
      holdings: holdings.length,
      valued,
      complete,
      total: complete ? subtotalText : null,
      valued_subtotal: subtotalText,
      cost_basis: null,
      profit_loss: null,
      not_quote: true,
    },
  };
}
