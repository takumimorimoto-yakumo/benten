/**
 * Browser reads of Pyth reference prices from the same-origin
 * `GET /api/prices` (served by the facts API, which reads Pyth's price
 * accounts on Solana). No other host is ever called.
 *
 * Every price shown on a page goes through one client: requests made in the
 * same task are sent as one call (at most `PRICING_CONFIG.maxFeedsPerRequest`
 * feeds per call), a read is reused for `clientCacheMs`, and a read in flight
 * is shared. The response is parsed strictly (`parsePricesResponse`); any
 * transport, status or shape problem makes every feed of that call
 * unavailable. Nothing here invents a value.
 */
import { PRICES_PATH, PRICING_CONFIG } from "@benten/pricing/config";
import { parsePricesResponse } from "@benten/pricing/response";
import { PRICE_DISPLAY_CONFIG } from "./price-config";
import type { PythPriceResult } from "./price-format";

/** One feed's read: the server's result, or `null` when the read failed. */
export type PriceRead = { readonly result: PythPriceResult | null; readonly readAtMs: number };

export type PriceClient = {
  /** The last read of `feedId` if it is still within the cache time. */
  cached(feedId: string): PriceRead | null;
  /** Read `feedId` (from the cache when fresh enough, unless `force`). */
  read(feedId: string, options?: { force?: boolean }): Promise<PriceRead>;
};

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

export function createPriceClient(options: { fetchImpl?: Fetch; now?: () => number; schedule?: (run: () => void) => void } = {}): PriceClient {
  const fetchImpl: Fetch = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const now = options.now ?? Date.now;
  const schedule = options.schedule ?? ((run) => void Promise.resolve().then(run));
  const cache = new Map<string, PriceRead>();
  const inFlight = new Map<string, Promise<PriceRead>>();
  let queue: { feedId: string; resolve: (read: PriceRead) => void }[] = [];

  async function call(feedIds: string[]): Promise<Map<string, PythPriceResult | null>> {
    const results = new Map<string, PythPriceResult | null>(feedIds.map((feedId) => [feedId, null]));
    try {
      const query = feedIds.map((feedId) => `feed=${feedId}`).join("&");
      const response = await fetchImpl(`${PRICES_PATH}?${query}`, { method: "GET", headers: { accept: "application/json" }, credentials: "same-origin", cache: "no-store" });
      if (!response.ok) return results;
      const parsed = parsePricesResponse(await response.json(), feedIds);
      if (parsed) for (const price of parsed.prices) results.set(price.feed_id, price);
    } catch {
      // Network or parse failure: every feed of this call stays unavailable.
    }
    return results;
  }

  function flush() {
    const batch = queue;
    queue = [];
    const unique = [...new Set(batch.map((item) => item.feedId))];
    for (let start = 0; start < unique.length; start += PRICING_CONFIG.maxFeedsPerRequest) {
      const feedIds = unique.slice(start, start + PRICING_CONFIG.maxFeedsPerRequest);
      void call(feedIds).then((results) => {
        const readAtMs = now();
        for (const feedId of feedIds) cache.set(feedId, { result: results.get(feedId) ?? null, readAtMs });
        for (const item of batch) if (feedIds.includes(item.feedId)) item.resolve(cache.get(item.feedId)!);
      });
    }
  }

  function cached(feedId: string): PriceRead | null {
    const hit = cache.get(feedId);
    return hit && now() - hit.readAtMs < PRICE_DISPLAY_CONFIG.clientCacheMs ? hit : null;
  }

  return {
    cached,
    read(feedId, { force = false } = {}) {
      const hit = force ? null : cached(feedId);
      if (hit) return Promise.resolve(hit);
      const pending = inFlight.get(feedId);
      if (pending) return pending;
      const promise = new Promise<PriceRead>((resolve) => {
        if (queue.length === 0) schedule(flush);
        queue.push({ feedId, resolve });
      }).finally(() => inFlight.delete(feedId));
      inFlight.set(feedId, promise);
      return promise;
    },
  };
}

/** The one client the pages share in this browser tab. */
let shared: PriceClient | null = null;
export function sharedPriceClient(): PriceClient {
  shared ??= createPriceClient();
  return shared;
}
