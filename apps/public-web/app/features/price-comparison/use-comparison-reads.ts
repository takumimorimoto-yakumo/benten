/**
 * Both Pyth feeds of one comparison as React state, read through the shared
 * same-origin price client (one call for both), read again every
 * `PRICE_COMPARISON_CONFIG.refreshMs` while shown, and re-judged at the time
 * of each read. Nothing is read before hydration.
 */
import { useCallback, useEffect, useState } from "react";
import { sharedPriceClient, type PriceClient } from "@/features/pricing/price-client";
import type { PythPriceResult } from "@/features/pricing/price-format";
import { PRICE_COMPARISON_CONFIG } from "./comparison-config";

export type ComparisonReads = {
  /** By feed id: `undefined` while not read yet, `null` when the read failed. */
  readonly results: ReadonlyMap<string, PythPriceResult | null>;
  /** When the last reads were judged; `null` before the first read completes. */
  readonly nowMs: number | null;
  readonly retry: () => void;
};

export function useComparisonReads(feedIds: readonly string[], client: PriceClient = sharedPriceClient()): ComparisonReads {
  const key = feedIds.join(",");
  const [results, setResults] = useState<ReadonlyMap<string, PythPriceResult | null>>(new Map());
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (!key) return;
    let active = true;
    const ids = key.split(",");
    const read = (force: boolean) =>
      Promise.all(ids.map((feedId) => client.read(feedId, { force }).then((entry) => [feedId, entry.result] as const))).then((entries) => {
        if (!active) return;
        setResults(new Map(entries));
        setNowMs(Date.now());
      });
    void read(generation > 0);
    const timer = window.setInterval(() => void read(true), PRICE_COMPARISON_CONFIG.refreshMs);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [key, client, generation]);

  const retry = useCallback(() => {
    setResults(new Map());
    setGeneration((value) => value + 1);
  }, []);

  return { results, nowMs, retry };
}
