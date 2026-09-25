/**
 * The single place for pricing constants. The price reader, the facts API
 * route, the public-Web ingress and the valuation code import from here.
 * This module has no runtime dependency, so ingress and browser code can
 * import it without loading anything else.
 */

/** The one same-origin path Pyth reference prices are served on. */
export const PRICES_PATH = "/api/prices";

export const PRICING_CONFIG = {
  /**
   * A price whose publish time is older than this is `stale`: shown with its
   * time, never used for a valuation. The on-chain accounts of the feeds
   * that are kept current were measured updating about every 10 seconds
   * (2026-09-24), so a minute without an update means the feed stopped.
   */
  staleAfterSeconds: 60,
  /** A price published more than this far in the future of the reader's clock is rejected. */
  maxFutureSkewSeconds: 30,
  /** Feed ids accepted in one `/api/prices` request (two price accounts each). */
  maxFeedsPerRequest: 32,
  /** Per-instance cache lifetime of one read price account. */
  cacheTtlMs: 5_000,
  /** Upstream RPC timeout of one price read. */
  upstreamTimeoutMs: 5_000,
  /** Largest accepted upstream response body, in bytes. */
  maxUpstreamResponseBytes: 256 * 1024,
  /** Fraction digits of a valuation amount; further digits are truncated, never rounded up. */
  valueFractionDigits: 2,
} as const;
