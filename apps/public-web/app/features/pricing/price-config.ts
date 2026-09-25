/**
 * Display rules for the Pyth reference price on pages (app IA sections 6.2,
 * 6.3 and 7). The single place for these values; the component and its
 * client import from here. Freshness itself comes with every price from the
 * server (`stale_after_seconds`, `PRICING_CONFIG.staleAfterSeconds`).
 */
export const PRICE_DISPLAY_CONFIG = {
  /**
   * A price older than this is not shown at all, only its last update time.
   * US equity feeds pause while the market is closed, so a weekend or a
   * holiday weekend keeps a price shown with "Last Pyth update"; a feed that
   * has been silent for longer than four days is not shown (app IA 6.2).
   */
  maxDisplayAgeHours: 96,
  /**
   * A live price whose Pyth confidence interval is wider than this share of
   * the price, in basis points, values nothing (app IA 6.2, recommended 1%).
   * It is still shown with its confidence.
   */
  maxValueConfidenceBps: 100,
  /** How long one read price is reused in the browser before it is read again. */
  clientCacheMs: 15_000,
  /** Fraction digits of a USD price at or above one dollar (app IA 6.3: cents). */
  usdFractionDigits: 2,
  /** Fraction digits of a USD price below one dollar, so a small price never reads as 0.00. */
  smallUsdFractionDigits: 6,
} as const;
