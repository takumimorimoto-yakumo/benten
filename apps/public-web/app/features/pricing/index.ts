/**
 * Public API of the Pyth reference price feature, for product pages,
 * company cards (Explore / company) and Holdings.
 *
 *   <PythReferencePrice mint={mint} locale={locale} />
 *   <PythReferencePrice ticker="NVDA" locale={locale} size="sm" />
 *
 * `usePythPrice(feed)` exposes the same read as state for a caller that
 * lays the figure out itself; `usePythPrices(feeds, readKey)` reads several
 * at once for a list that also needs them together (Holdings and its total).
 * `priceForValue` is the only test for using a price in a value: live
 * (`isLivePrice`) and within the confidence limit; anything else is shown,
 * never used.
 */
export { PythReferencePrice, PythReferencePriceView, resolvePythFeed, type PythReferencePriceProps } from "./pyth-reference-price";
export { usePythPrice, usePythPrices, pythPriceView, type PythPriceView, type PythPricesState } from "./use-pyth-price";
export { hasPythFeed, pythFeedForMint, pythFeedForTicker, valuationFeedForMint, PYTH_FEED_MAP_REVISION, type PythFeed } from "./pyth-feeds";
export { isLivePrice, priceForValue, priceDisplayState, type PriceNotUsableReason, priceText, confidenceText, feedName, type PriceDisplayState, type PythPriceResult } from "./price-format";
export { sharedPriceClient, createPriceClient, type PriceClient, type PriceRead } from "./price-client";
