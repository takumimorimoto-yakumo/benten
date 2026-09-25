/**
 * The committed price comparison index (`comparison-index.json`, derived
 * from the reviewed feed map and drift-tested against it) with its Pyth
 * schedules parsed once. Lookups are exact ticker equality only.
 */
import indexJson from "./comparison-index.json";
import type { PriceComparisonEntry, PriceComparisonIndex } from "./comparison-index-source";
import { parsePythSchedule, type PythSchedule } from "./pyth-schedule";

export const PRICE_COMPARISON_INDEX = indexJson as PriceComparisonIndex;

/** Parsed schedules, by the index's schedule number; `null` for one that does not parse (then no session is shown). */
export const PRICE_COMPARISON_SCHEDULES: readonly (PythSchedule | null)[] = PRICE_COMPARISON_INDEX.schedules.map(parsePythSchedule);

const BY_TICKER = new Map(PRICE_COMPARISON_INDEX.entries.map((entry) => [entry.ticker, entry]));

/** The comparison feeds of an xStock by its exact registry ticker, or `null`. */
export function comparisonEntryForTicker(ticker: string): PriceComparisonEntry | null {
  return BY_TICKER.get(ticker) ?? null;
}
