/**
 * One product's Pyth reference price as a React state: the read result and
 * its display state, re-judged as time passes. Reads go through the shared
 * same-origin client; a live price that ages out of its stale window is read
 * once more, a price that was already stale is not polled. `usePythPrices`
 * is the same read for a list of feeds.
 */
import { useCallback, useEffect, useState } from "react";
import { sharedPriceClient, type PriceClient, type PriceRead } from "./price-client";
import { priceDisplayState, type PriceDisplayState } from "./price-format";
import type { PythFeed } from "./pyth-feeds";

export type PythPriceView =
  | { readonly kind: "noFeed" }
  | { readonly kind: "loading"; readonly feed: PythFeed }
  | { readonly kind: "ready"; readonly feed: PythFeed; readonly read: PriceRead; readonly display: PriceDisplayState; readonly nowMs: number };

/** Re-judge a shown price this often, so a live label turns into "Last Pyth update" on time. */
const REJUDGE_MS = 5_000;

/** The view of one feed's read (or of no read yet) at `nowMs`. */
export function pythPriceView(feed: PythFeed | null, read: PriceRead | null, nowMs: number): PythPriceView {
  if (!feed) return { kind: "noFeed" };
  if (!read) return { kind: "loading", feed };
  const at = nowMs || read.readAtMs;
  return { kind: "ready", feed, read, display: priceDisplayState(read.result, at), nowMs: at };
}

export type PythPricesState = {
  /** The reads of this `readKey` so far, by feed id. */
  readonly reads: ReadonlyMap<string, PriceRead>;
  /** Some feed of this `readKey` has not been read yet. */
  readonly loading: boolean;
  /** The time the reads are judged at; advances while they are shown. */
  readonly nowMs: number;
};

const NO_READS: ReadonlyMap<string, PriceRead> = new Map();

/**
 * Several feeds' prices at once, for a list that also needs them together
 * (Holdings and its total). The feeds are read, through the same shared
 * client as `usePythPrice` (one call per batch), whenever `readKey` changes,
 * bypassing the client cache so an explicit refresh shows new prices;
 * `readKey === null` reads nothing. While shown, the reads are re-judged
 * like `usePythPrice`'s, so a live price turns stale on time.
 */
export function usePythPrices(feeds: readonly PythFeed[], readKey: string | null, client: PriceClient = sharedPriceClient()): PythPricesState {
  const feedKey = [...new Set(feeds.map((feed) => feed.feed_id))].sort().join(",");
  const [state, setState] = useState<{ key: string | null; reads: ReadonlyMap<string, PriceRead> }>({ key: null, reads: NO_READS });
  const [nowMs, setNowMs] = useState(0);
  const stateKey = readKey === null ? null : `${readKey}|${feedKey}`;

  useEffect(() => {
    if (stateKey === null) return;
    let active = true;
    const feedIds = feedKey ? feedKey.split(",") : [];
    setState({ key: stateKey, reads: NO_READS });
    void Promise.all(feedIds.map((feedId) => client.read(feedId, { force: true }).then((read) => [feedId, read] as const))).then((entries) => {
      if (!active) return;
      setState({ key: stateKey, reads: new Map(entries) });
      setNowMs(Date.now());
    });
    return () => {
      active = false;
    };
  }, [stateKey, feedKey, client]);

  useEffect(() => {
    if (stateKey === null) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), REJUDGE_MS);
    return () => window.clearInterval(timer);
  }, [stateKey]);

  const reads = state.key === stateKey ? state.reads : NO_READS;
  const expected = feedKey ? feedKey.split(",").length : 0;
  return { reads, loading: stateKey !== null && reads.size < expected, nowMs };
}

export function usePythPrice(feed: PythFeed | null, client: PriceClient = sharedPriceClient()): { view: PythPriceView; retry: () => void } {
  const feedId = feed?.feed_id ?? null;
  const [read, setRead] = useState<PriceRead | null>(null);
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    if (!feedId) return;
    let active = true;
    setRead(client.cached(feedId));
    void client.read(feedId).then((next) => {
      if (active) {
        setRead(next);
        setNowMs(Date.now());
      }
    });
    return () => {
      active = false;
    };
  }, [feedId, client]);

  // Re-judge freshness while shown; read again once when a live price ages out.
  useEffect(() => {
    if (!feedId || !read) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setNowMs(now);
      const wasLive = priceDisplayState(read.result, read.readAtMs).kind === "live";
      if (wasLive && priceDisplayState(read.result, now).kind !== "live") {
        void client.read(feedId, { force: true }).then(setRead);
      }
    }, REJUDGE_MS);
    return () => window.clearInterval(timer);
  }, [feedId, read, client]);

  const retry = useCallback(() => {
    if (!feedId) return;
    setRead(null);
    void client.read(feedId, { force: true }).then((next) => {
      setRead(next);
      setNowMs(Date.now());
    });
  }, [feedId, client]);

  return { view: pythPriceView(feed, read, nowMs), retry };
}
