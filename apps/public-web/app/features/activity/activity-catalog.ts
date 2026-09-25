/**
 * The labels Activity needs for the fixed purchase route, built at prerender
 * (`app/lib/portfolio-catalog.server.ts`) and passed to the page.
 */

/** One token of the fixed route, as Activity labels it. */
export type ActivityToken = {
  readonly mint: string;
  readonly symbol: string;
  readonly decimals: number;
  /** A Token-2022 Scaled UI mint: raw ÷ 10^decimals is not its display amount. */
  readonly scaledUi: boolean;
};

export type ActivityCatalog = {
  readonly tokens: readonly ActivityToken[];
  /** The product page per output mint (a record's heading links there). */
  readonly productHrefs: Readonly<Record<string, string>>;
  /** The fixed pool the route swaps through. */
  readonly routeId: string;
};

export const EMPTY_ACTIVITY_CATALOG: ActivityCatalog = { tokens: [], productHrefs: {}, routeId: "" };
