/**
 * Reading one Pyth feed from its Solana price accounts, with no feed map:
 * the caller names the feed id, its shard accounts and the receiver program
 * (`prices.ts` from the validated feed map; the purchase panel from its
 * pinned, drift-tested route constant). Only an account the receiver program
 * owns that decodes as a fully verified update for that feed id counts; the
 * newest publish time wins, and one published too far in the future of the
 * reader's clock is refused. This module has no runtime dependency beyond
 * the config and the decoder, so browser code can import it.
 */

import { PRICING_CONFIG } from "./config.js";
import { decodePriceUpdate, type DecodedPriceUpdate } from "./price-update.js";

export type PriceUnavailableReason =
  | "not_in_feed_map"
  | "no_price_account"
  | "malformed_price_account"
  | "future_publish_time"
  | "upstream_unavailable"
  | "upstream_timeout";

/** What one read established about one feed, before staleness is judged. */
export type PriceObservation =
  | { ok: true; update: DecodedPriceUpdate; account: string; shard: number; observedAtMs: number }
  | { ok: false; reason: PriceUnavailableReason; observedAtMs: number };

/** The accounts one feed is read from. */
export interface FeedAccounts {
  feedId: string;
  priceAccounts: ReadonlyArray<{ shard: number; address: string }>;
  /** The Pyth receiver program that must own each account. */
  receiverProgram: string;
}

/** Pick the newest valid update among one feed's shard accounts (`accounts` in `priceAccounts` order). */
export function observeFeedAccounts(
  feed: FeedAccounts,
  accounts: ReadonlyArray<{ owner: string; data: Uint8Array } | null>,
  observedAtMs: number,
): PriceObservation {
  let best: { update: DecodedPriceUpdate; account: string; shard: number } | null = null;
  let sawAccount = false;
  let malformed = false;
  let future = false;
  for (const [index, ref] of feed.priceAccounts.entries()) {
    const account = accounts[index];
    if (!account) continue;
    sawAccount = true;
    const update = account.owner === feed.receiverProgram ? decodePriceUpdate(account.data) : null;
    if (!update || update.feedId !== feed.feedId) {
      malformed = true;
      continue;
    }
    if (Number(update.publishTime) > observedAtMs / 1000 + PRICING_CONFIG.maxFutureSkewSeconds) {
      future = true;
      continue;
    }
    if (!best || update.publishTime > best.update.publishTime) best = { update, account: ref.address, shard: ref.shard };
  }
  if (best) return { ok: true, ...best, observedAtMs };
  const reason: PriceUnavailableReason = !sawAccount ? "no_price_account" : future ? "future_publish_time" : malformed ? "malformed_price_account" : "no_price_account";
  return { ok: false, reason, observedAtMs };
}

/** Whether a price published at `publishTimeUnix` (seconds) is stale at `nowMs` (`PRICING_CONFIG.staleAfterSeconds`). */
export function isStaleAt(publishTimeUnix: number, nowMs: number): boolean {
  return nowMs / 1000 - publishTimeUnix > PRICING_CONFIG.staleAfterSeconds;
}
