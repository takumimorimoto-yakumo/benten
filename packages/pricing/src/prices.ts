/**
 * Pyth reference prices for the feeds in the reviewed feed map, read from
 * their Solana price accounts (`getMultipleAccounts`, base64) through a
 * caller-supplied read-only transport. A reference price is not a quote: it
 * is not an executable price, a route or an offer.
 *
 * For each feed every listed shard account is read; the account must be
 * owned by the Pyth receiver program, decode as a fully verified update and
 * carry the expected feed id. The newest valid publish time wins. When no
 * account qualifies the result carries a reason and no value.
 */

import { PRICING_CONFIG } from "./config.js";
import { formatExact, fromScaledInteger } from "./decimal.js";
import { FEED_MAP, feedEntry, type FeedMapEntry, type FeedRole } from "./feed-map.js";
import { decodePriceUpdate, type DecodedPriceUpdate } from "./price-update.js";

export type PriceUnavailableReason =
  | "not_in_feed_map"
  | "no_price_account"
  | "malformed_price_account"
  | "future_publish_time"
  | "upstream_unavailable"
  | "upstream_timeout";

interface PriceBase {
  kind: "pyth_reference";
  feed_id: string;
  pyth_symbol: string | null;
  role: FeedRole | null;
  /** When the price accounts were read (ISO 8601 UTC). */
  observed_at: string;
}

export type PythPriceResult =
  | (PriceBase & {
    status: "fresh" | "stale";
    /** `price_raw × 10^exponent`, exact. */
    price: string;
    confidence: string;
    exponent: number;
    price_raw: string;
    confidence_raw: string;
    currency: "USD";
    publish_time: string;
    publish_time_unix: number;
    stale_after_seconds: number;
    source: {
      network: "solana-mainnet";
      program: string;
      account: string;
      shard: number;
      posted_slot: string;
      verification: "full";
    };
    not_quote: true;
  })
  | (PriceBase & { status: "unavailable"; reason: PriceUnavailableReason });

/** A read-only accounts transport: base64 data and program owner per address, `null` when absent. */
export type PriceAccountsRpc = (addresses: string[]) => Promise<Array<{ owner: string; data: Uint8Array } | null>>;

/** What one read established about one feed, before staleness is judged. */
export type PriceObservation =
  | { ok: true; update: DecodedPriceUpdate; account: string; shard: number; observedAtMs: number }
  | { ok: false; reason: PriceUnavailableReason; observedAtMs: number };

export class PriceRpcError extends Error {
  constructor(readonly reason: "upstream_unavailable" | "upstream_timeout") {
    super(reason);
    this.name = "PriceRpcError";
  }
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/** Pick the newest valid update among one feed's shard accounts. */
export function observeFeed(
  entry: FeedMapEntry,
  accounts: ReadonlyArray<{ owner: string; data: Uint8Array } | null>,
  observedAtMs: number,
): PriceObservation {
  let best: { update: DecodedPriceUpdate; account: string; shard: number } | null = null;
  let sawAccount = false;
  let malformed = false;
  let future = false;
  for (const [index, ref] of entry.price_accounts.entries()) {
    const account = accounts[index];
    if (!account) continue;
    sawAccount = true;
    const update = account.owner === FEED_MAP.source.receiver_program ? decodePriceUpdate(account.data) : null;
    if (!update || update.feedId !== entry.feed_id) {
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

/** Turn an observation into the public result, judging staleness at `nowMs`. */
export function priceResult(feedId: string, observation: PriceObservation | null, nowMs: number): PythPriceResult {
  const entry = feedEntry(feedId);
  const base = {
    kind: "pyth_reference" as const,
    feed_id: feedId,
    pyth_symbol: entry?.pyth_symbol ?? null,
    role: entry?.role ?? null,
    observed_at: iso(observation?.observedAtMs ?? nowMs),
  };
  if (!entry) return { ...base, status: "unavailable", reason: "not_in_feed_map" };
  if (!observation) return { ...base, status: "unavailable", reason: "upstream_unavailable" };
  if (!observation.ok) return { ...base, status: "unavailable", reason: observation.reason };
  const { update } = observation;
  const publishUnix = Number(update.publishTime);
  const ageSeconds = nowMs / 1000 - publishUnix;
  return {
    ...base,
    status: ageSeconds > PRICING_CONFIG.staleAfterSeconds ? "stale" : "fresh",
    price: formatExact(fromScaledInteger(update.price, update.exponent)),
    confidence: formatExact(fromScaledInteger(update.confidence, update.exponent)),
    exponent: update.exponent,
    price_raw: update.price.toString(),
    confidence_raw: update.confidence.toString(),
    currency: entry.quote_currency,
    publish_time: iso(publishUnix * 1000),
    publish_time_unix: publishUnix,
    stale_after_seconds: PRICING_CONFIG.staleAfterSeconds,
    source: {
      network: FEED_MAP.source.network,
      program: FEED_MAP.source.receiver_program,
      account: observation.account,
      shard: observation.shard,
      posted_slot: update.postedSlot.toString(),
      verification: "full",
    },
    not_quote: true,
  };
}

/**
 * Read the price accounts of `feedIds` (all already in the feed map) in one
 * transport call and return one observation per feed. A transport failure
 * becomes the same closed reason for every feed.
 */
export async function observeFeeds(feedIds: readonly string[], rpc: PriceAccountsRpc, now: () => number): Promise<Map<string, PriceObservation>> {
  const entries = feedIds.map((feedId) => {
    const entry = feedEntry(feedId);
    if (!entry) throw new Error("observeFeeds takes only feed-map feed ids");
    return entry;
  });
  const addresses = entries.flatMap((entry) => entry.price_accounts.map((ref) => ref.address));
  const observations = new Map<string, PriceObservation>();
  let accounts: Array<{ owner: string; data: Uint8Array } | null>;
  try {
    accounts = await rpc(addresses);
    if (accounts.length !== addresses.length) throw new PriceRpcError("upstream_unavailable");
  } catch (error) {
    const reason = error instanceof PriceRpcError ? error.reason : "upstream_unavailable";
    const observedAtMs = now();
    for (const entry of entries) observations.set(entry.feed_id, { ok: false, reason, observedAtMs });
    return observations;
  }
  const observedAtMs = now();
  let offset = 0;
  for (const entry of entries) {
    const slice = accounts.slice(offset, offset + entry.price_accounts.length);
    offset += entry.price_accounts.length;
    observations.set(entry.feed_id, observeFeed(entry, slice, observedAtMs));
  }
  return observations;
}

/** Whether a fresh result is still fresh at `nowMs` (for a client holding it a while). */
export function isFresh(result: PythPriceResult, nowMs: number): boolean {
  return result.status === "fresh" && nowMs / 1000 - result.publish_time_unix <= result.stale_after_seconds;
}
