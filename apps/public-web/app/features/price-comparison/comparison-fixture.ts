/**
 * Labelled fixture facts for the Living Catalog's price comparison page
 * (development only). Specimen numbers, not market data; placeholder feed
 * ids that are not in the feed map. One instant, Friday 2026-09-25 06:45 in
 * New York, before the regular session.
 */
import type { LatestTrade } from "@/features/charts/chart-data";
import type { PythPriceResult } from "@/features/pricing/price-format";
import type { PriceComparisonEntry } from "./comparison-index-source";
import { PRICE_COMPARISON_SCHEDULES } from "./comparison-index";
import { comparisonFacts, type ComparisonFacts, type FeedReadInput } from "./comparison-model";

export const COMPARISON_FIXTURE_NOW_MS = Date.UTC(2026, 8, 25, 10, 45);
const PUBLISHED = COMPARISON_FIXTURE_NOW_MS / 1000 - 5;
const FIVE_DAYS_AGO = PUBLISHED - 5 * 24 * 3600;

/** The committed index's schedules: 0 is the US regular session, 1 every day, all hours. */
const ENTRY: PriceComparisonEntry = {
  ticker: "EXAMPLE",
  mint: "11111111111111111111111111111111",
  underlying: { feed_id: "0".repeat(63) + "1", pyth_symbol: "Equity.US.EXAMPLE/USD", schedule: 0 },
  token: { feed_id: "0".repeat(63) + "2", pyth_symbol: "Crypto.EXAMPLEX/USD", schedule: 1 },
};

function specimen(feed: { feed_id: string; pyth_symbol: string }, price: string, publishUnix: number, fresh: boolean): PythPriceResult {
  const [whole = "0", fraction = ""] = price.split(".");
  return {
    kind: "pyth_reference", feed_id: feed.feed_id, pyth_symbol: feed.pyth_symbol, role: feed === ENTRY.underlying ? "xstock_underlying_share" : "xstock_token",
    observed_at: new Date(COMPARISON_FIXTURE_NOW_MS).toISOString(), status: fresh ? "fresh" : "stale", price, confidence: "0.04000", exponent: -fraction.length,
    price_raw: `${whole}${fraction}`.replace(/^0+(?=\d)/, ""), confidence_raw: "4000", currency: "USD", publish_time: new Date(publishUnix * 1000).toISOString(), publish_time_unix: publishUnix,
    stale_after_seconds: 60, source: { network: "solana-mainnet", program: "rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ", account: "11111111111111111111111111111111", shard: 1, posted_slot: "1", verification: "full" },
    not_quote: true,
  } as PythPriceResult;
}

const TRADE: LatestTrade = { date: "2026-09-24", value: 201.5, per_share: 199.8, tx_signature: "1", pool: "11111111111111111111111111111112", slot: 1 };

function facts(underlyingRead: FeedReadInput, tokenRead: FeedReadInput, trade: LatestTrade | null = TRADE, nowMs: number | null = COMPARISON_FIXTURE_NOW_MS, entry: PriceComparisonEntry = ENTRY): ComparisonFacts {
  return comparisonFacts({ entry, schedules: PRICE_COMPARISON_SCHEDULES, underlyingRead, tokenRead, trade, nowMs });
}

export const COMPARISON_FIXTURES = {
  /** Both Pyth prices live: both differences are stated. */
  bothLive: facts(specimen(ENTRY.underlying, "200.00000", PUBLISHED, true), specimen(ENTRY.token!, "201.00000", PUBLISHED, true)),
  /** As observed on Solana on 2026-09-25: the underlying live, the token's account last updated days ago. */
  tokenAccountNotUpdated: facts(specimen(ENTRY.underlying, "200.00000", PUBLISHED, true), specimen(ENTRY.token!, "221.56220", FIVE_DAYS_AGO, false)),
  /** The underlying last updated at the previous close; nothing is compared with the token. */
  underlyingStale: facts(specimen(ENTRY.underlying, "200.00000", PUBLISHED - 14 * 3600, false), specimen(ENTRY.token!, "201.00000", PUBLISHED, true)),
  /** Reads failed; the trade has no value for one share. */
  unavailable: facts(null, null, { ...TRADE, per_share: null }),
  /** An xStock whose feed map has no token feed, while reading. */
  noTokenFeed: facts(undefined, undefined, null, COMPARISON_FIXTURE_NOW_MS, { ...ENTRY, token: null }),
} as const;

/** A live price for the reference check line. */
export const REFERENCE_CHECK_FIXTURE = specimen(ENTRY.underlying, "200.00000", PUBLISHED, true) as Extract<PythPriceResult, { status: "fresh" }>;
