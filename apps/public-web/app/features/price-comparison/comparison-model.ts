/**
 * The facts the price comparison panel shows for one xStock, from three
 * sources read independently: the Pyth feed for one underlying share
 * (`Equity.US.<ticker>/USD`), the Pyth feed for the token itself
 * (`Crypto.<ticker>X/USD`) and the last on-chain trade in Benten's bundled
 * series. Pure: no I/O, no React.
 *
 * Two differences are stated, each only when its inputs make it a fact:
 *
 *  - token feed vs underlying feed: only when both Pyth prices are live
 *    (published within the stale window, so at most that far apart). Two
 *    prices published hours or days apart are not compared; the reason is
 *    stated instead. The token feed is compared as Pyth publishes it: Benten
 *    has not verified whether its unit is before or after the token's
 *    display multiplier, and the panel says so.
 *  - last on-chain trade vs underlying feed: the trade's value for one
 *    underlying share (its price per token divided by the display multiplier
 *    in effect at that trade) against the shown underlying price, with both
 *    times. No value for one share means no difference.
 *
 * A difference is `a / b - 1` of two observations. It says nothing about
 * what either will be.
 */
import { priceDisplayState, type PriceDisplayState, type PythPriceResult } from "@/features/pricing/price-format";
import type { LatestTrade } from "@/features/charts/chart-data";
import type { ComparisonFeed, PriceComparisonEntry } from "./comparison-index-source";
import { scheduleSessionAt, type PythSchedule, type ScheduleSession } from "./pyth-schedule";

/** One feed's read: `undefined` while it is being read, `null` when the read failed. */
export type FeedReadInput = PythPriceResult | null | undefined;

export type FeedFacts = {
  readonly feed: ComparisonFeed;
  /** `null` while the feed is being read. */
  readonly display: PriceDisplayState | null;
  /** What Pyth's published schedule says at this instant; `null` if the schedule could not be read. */
  readonly session: ScheduleSession | null;
};

export type TradeFacts = {
  readonly date: string;
  /** USDC per token, before the display multiplier. */
  readonly perToken: number;
  /** USDC for one underlying share, or `null` when the multiplier at that trade is unknown. */
  readonly perShare: number | null;
};

export type TokenGap =
  | { readonly kind: "shown"; readonly ratio: number }
  | { readonly kind: "notCompared"; readonly reason: "reading" | "noTokenFeed" | "tokenNotLive" | "underlyingNotLive" };

export type TradeGap =
  | { readonly kind: "shown"; readonly ratio: number; readonly pythPublishUnix: number }
  | { readonly kind: "notCompared"; readonly reason: "reading" | "noPerShare" | "underlyingNotShown" };

export type ComparisonFacts = {
  readonly ticker: string;
  readonly underlying: FeedFacts;
  readonly token: FeedFacts | null;
  readonly trade: TradeFacts | null;
  readonly tokenGap: TokenGap;
  /** `null` when Benten has no on-chain trade series for the token. */
  readonly tradeGap: TradeGap | null;
};

function feedFacts(feed: ComparisonFeed, read: FeedReadInput, schedule: PythSchedule | null, nowMs: number | null): FeedFacts {
  // Without a time of reading (before hydration) neither a price state nor a session is a fact yet.
  if (nowMs === null) return { feed, display: null, session: null };
  return {
    feed,
    display: read === undefined ? null : priceDisplayState(read, nowMs),
    session: schedule ? scheduleSessionAt(schedule, nowMs) : null,
  };
}

/** The price of a live display, as a number; `null` for any other state. */
function livePrice(display: PriceDisplayState | null): number | null {
  if (display?.kind !== "live") return null;
  const value = Number(display.price.price);
  return value > 0 ? value : null;
}

/** The price of a shown display (live, or with its last update time), as a number. */
function shownPrice(display: PriceDisplayState | null): { value: number; publishUnix: number } | null {
  if (display?.kind !== "live" && display?.kind !== "stale") return null;
  const value = Number(display.price.price);
  return value > 0 ? { value, publishUnix: display.price.publish_time_unix } : null;
}

export function comparisonFacts(input: {
  readonly entry: PriceComparisonEntry;
  readonly schedules: readonly (PythSchedule | null)[];
  readonly underlyingRead: FeedReadInput;
  readonly tokenRead: FeedReadInput;
  readonly trade: LatestTrade | null;
  /** When the reads were judged; `null` before the first read (server render, hydration). */
  readonly nowMs: number | null;
}): ComparisonFacts {
  const { entry, schedules, nowMs } = input;
  const underlying = feedFacts(entry.underlying, input.underlyingRead, schedules[entry.underlying.schedule] ?? null, nowMs);
  const token = entry.token ? feedFacts(entry.token, input.tokenRead, schedules[entry.token.schedule] ?? null, nowMs) : null;

  let tokenGap: TokenGap;
  if (!token) tokenGap = { kind: "notCompared", reason: "noTokenFeed" };
  else if (!underlying.display || !token.display) tokenGap = { kind: "notCompared", reason: "reading" };
  else {
    const base = livePrice(underlying.display);
    const other = livePrice(token.display);
    if (other === null) tokenGap = { kind: "notCompared", reason: "tokenNotLive" };
    else if (base === null) tokenGap = { kind: "notCompared", reason: "underlyingNotLive" };
    else tokenGap = { kind: "shown", ratio: other / base - 1 };
  }

  const trade = input.trade ? { date: input.trade.date, perToken: input.trade.value, perShare: input.trade.per_share } : null;
  let tradeGap: TradeGap | null = null;
  if (trade) {
    const base = shownPrice(underlying.display);
    if (trade.perShare === null) tradeGap = { kind: "notCompared", reason: "noPerShare" };
    else if (!underlying.display) tradeGap = { kind: "notCompared", reason: "reading" };
    else if (!base) tradeGap = { kind: "notCompared", reason: "underlyingNotShown" };
    else tradeGap = { kind: "shown", ratio: trade.perShare / base.value - 1, pythPublishUnix: base.publishUnix };
  }

  return { ticker: entry.ticker, underlying, token, trade, tokenGap, tradeGap };
}
