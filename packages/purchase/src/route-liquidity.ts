/**
 * The liquidity each pinned pool held when its route was checked, from the
 * read-only mainnet observation recorded with the routes table
 * (`routes-observed.json`, written by `scripts/routes/add-routes.mjs`). Shown
 * as information beside the route; it is a past reading, never a live value,
 * and nothing decides with it.
 */
import observed from "./routes-observed.json" with { type: "json" };

import type { ProductTicker } from "./routes-table";

export interface RouteLiquidityReading {
  /** Pool liquidity in USD at the reading, rounded as recorded. */
  readonly usd: number;
  /** The UTC date of the reading (`YYYY-MM-DD`). */
  readonly observedOn: string;
}

const READINGS = observed as Readonly<Record<string, { readonly liquidityUsd: number; readonly observedOn: string }>>;

/**
 * The recorded reading of a table product's pool, or `null` when none was
 * recorded or the record is malformed: the reading is information only, so a
 * page without one leaves the line out instead of failing to render. A
 * routes-table test requires a reading for every listed product.
 */
export function routeLiquidity(ticker: ProductTicker): RouteLiquidityReading | null {
  const record = Object.hasOwn(READINGS, ticker) ? READINGS[ticker] : undefined;
  if (!record || typeof record.liquidityUsd !== "number" || !Number.isFinite(record.liquidityUsd) || record.liquidityUsd <= 0) return null;
  if (typeof record.observedOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(record.observedOn)) return null;
  return { usd: record.liquidityUsd, observedOn: record.observedOn };
}
