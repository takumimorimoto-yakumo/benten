/**
 * The one dynamic import of the chart drawing island (Recharts). Every chart
 * on a page (the price and financials chart, the financial statements'
 * small charts) loads the island through here after hydration, so the
 * island stays one dynamic chunk that exactly one chunk imports, and no
 * document loads Recharts statically (see `tests/static-artifact.test.mjs`).
 */
import { useCallback, useEffect, useState } from "react";

export type ChartIsland = typeof import("@/features/chart-island");

/** One import per page visit; a failed import can be tried again. */
let islandImport: Promise<ChartIsland> | null = null;

export function loadChartIsland(): Promise<ChartIsland> {
  islandImport ??= import("@/features/chart-island").catch((error: unknown) => {
    islandImport = null;
    throw error;
  });
  return islandImport;
}

export type IslandState<T> = { readonly kind: "loading" } | { readonly kind: "ready"; readonly value: T } | { readonly kind: "error" };

/** The part of the island a chart draws with, once loaded; `retry` imports it again after an error. */
export function useChartIsland<T>(pick: (island: ChartIsland) => T): { state: IslandState<T>; retry: () => void } {
  const [state, setState] = useState<IslandState<T>>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    loadChartIsland().then(
      (island) => { if (active) setState({ kind: "ready", value: pick(island) }); },
      () => { if (active) setState({ kind: "error" }); },
    );
    return () => { active = false; };
    // `pick` selects a fixed export; only a retry imports again.
  }, [attempt]);
  const retry = useCallback(() => {
    setState({ kind: "loading" });
    setAttempt((value) => value + 1);
  }, []);
  return { state, retry };
}
