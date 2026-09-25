/**
 * Display rules of the price comparison panel. The single place for these
 * values; freshness itself comes with every price from the server
 * (`stale_after_seconds`).
 */
export const PRICE_COMPARISON_CONFIG = {
  /**
   * How often the panel reads both Pyth feeds again while it is shown. Equal
   * to the browser price client's reuse time, so each refresh is one call.
   */
  refreshMs: 15_000,
  /** Fraction digits of a USDC amount of the on-chain trade (cents). */
  usdcFractionDigits: 2,
} as const;
