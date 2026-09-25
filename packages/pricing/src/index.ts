/**
 * Pyth reference prices for Benten's supported products, and reference
 * valuations of holdings over them. Reads only: nothing here holds a key,
 * signs or sends anything.
 *
 * Why on-chain accounts and not the Hermes HTTP API: since 2026-08-26 every
 * Hermes request needs a Pyth API key, and this repository takes no key.
 * The Pyth receiver program's price accounts on Solana are public and are
 * read with an ordinary `getMultipleAccounts`.
 */

export { PRICES_PATH, PRICING_CONFIG } from "./config.js";
export { FEED_MAP, feedEntry, feedsForMint, validateFeedMap, valuationFeedForMint } from "./feed-map.js";
export type { ConversionBasis, FeedBinding, FeedMapEntry, FeedMapV1, FeedRole, PriceAccountRef } from "./feed-map.js";
export { decodePriceUpdate } from "./price-update.js";
export type { DecodedPriceUpdate } from "./price-update.js";
export { PriceRpcError, isFresh, observeFeed, observeFeeds, priceResult } from "./prices.js";
export type { PriceAccountsRpc, PriceObservation, PriceUnavailableReason, PythPriceResult } from "./prices.js";
export { PRICES_DISCLAIMER, parsePricesResponse } from "./response.js";
export type { PricesResponse } from "./response.js";
export { valueHolding, valueHoldings } from "./valuation.js";
export { referenceValue, sumReferenceValues } from "./value.js";
export type { ReferenceValue, ValueHoldingFacts, ValuePrice } from "./value.js";
export type { HoldingValuation, ValuationHoldingInput, ValuationSummary, ValuationUnavailableReason } from "./valuation.js";
