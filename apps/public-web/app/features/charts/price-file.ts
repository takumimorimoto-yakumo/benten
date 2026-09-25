/**
 * The daily price file of one ticker (`/data/prices/{TICKER}.{digest}.json`, see `app/lib/data-files.ts`): its
 * shape, the strict reader the chart section uses after hydration, and the
 * hook that loads it. Browser-safe; the build writes the files from the same
 * `PriceSeries` the page's `PriceFileRef` describes (`app/lib/chart.server.ts`).
 *
 * The reader fails closed: a file whose schema, identity, dates, pool or day
 * count differs from the page's reference, or with any unknown key or
 * non-finite value, is an error, never a partial series.
 */
import { useCallback, useEffect, useState } from "react";
import { PRICE_GAP_REASONS, type PriceFileRef, type PriceGapReason, type PricePoint, type PriceSeries } from "./chart-data";
import { PRICE_FILE_SCHEMA_VERSION } from "./price-file-config";

/** What the file holds: the schema, the ticker and the series with its days. */
export type PriceFile = {
  readonly schema_version: typeof PRICE_FILE_SCHEMA_VERSION;
  readonly ticker: string;
  readonly series: PriceSeries;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;

function record(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]) ? (value as Record<string, unknown>) : null;
}

function point(value: unknown, pools: readonly string[]): PricePoint | null {
  const observed = record(value, ["date", "value", "tx_signature", "pool", "slot"]);
  if (observed) {
    const { date, value: price, tx_signature: signature, pool, slot } = observed;
    if (typeof date !== "string" || !DATE.test(date)) return null;
    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return null;
    if (typeof signature !== "string" || !SIGNATURE.test(signature)) return null;
    if (typeof pool !== "string" || !pools.includes(pool)) return null;
    if (!Number.isSafeInteger(slot) || (slot as number) < 0) return null;
    return { date, value: price, tx_signature: signature, pool, slot: slot as number };
  }
  const gap = record(value, ["date", "value", "reason"]);
  if (!gap || typeof gap.date !== "string" || !DATE.test(gap.date) || gap.value !== null) return null;
  if (!(PRICE_GAP_REASONS as readonly unknown[]).includes(gap.reason)) return null;
  return { date: gap.date, value: null, reason: gap.reason as PriceGapReason };
}

/**
 * The series of a price file, when it is exactly the series `ref` describes;
 * `null` on any difference.
 */
export function parsePriceFile(value: unknown, ref: PriceFileRef): PriceSeries | null {
  const file = record(value, ["schema_version", "ticker", "series"]);
  if (!file || file.schema_version !== PRICE_FILE_SCHEMA_VERSION || file.ticker !== ref.ticker) return null;
  const series = record(file.series, ["symbol", "mint", "listed_on", "as_of", "pools", "points"]);
  if (!series || series.symbol !== ref.symbol || series.mint !== ref.mint || series.listed_on !== ref.listed_on || series.as_of !== ref.as_of) return null;
  if (!Array.isArray(series.pools) || series.pools.length !== ref.pools.length) return null;
  for (const [index, raw] of series.pools.entries()) {
    const pool = record(raw, ["address", "dex"]);
    if (!pool || pool.address !== ref.pools[index]!.address || pool.dex !== ref.pools[index]!.dex) return null;
  }
  const addresses = ref.pools.map((pool) => pool.address);
  if (!Array.isArray(series.points) || series.points.length !== ref.days) return null;
  const points: PricePoint[] = [];
  for (const raw of series.points) {
    const parsed = point(raw, addresses);
    if (!parsed || (points.length > 0 && parsed.date <= points.at(-1)!.date)) return null;
    points.push(parsed);
  }
  if (points[0]?.date !== ref.listed_on || points.at(-1)?.date !== ref.as_of) return null;
  return { symbol: ref.symbol, mint: ref.mint, listed_on: ref.listed_on, as_of: ref.as_of, pools: ref.pools.map((pool) => ({ address: pool.address, dex: pool.dex })), points };
}

export type PriceFileState =
  | { readonly kind: "none" }
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly series: PriceSeries }
  | { readonly kind: "error" };

/** One read per file per page visit; a failed read can be tried again. */
const reads = new Map<string, Promise<unknown>>();

function readPriceFile(path: string): Promise<unknown> {
  let read = reads.get(path);
  if (!read) {
    read = fetch(path, { credentials: "same-origin", headers: { accept: "application/json" } })
      .then((response) => {
        if (!response.ok) throw new Error(`price file ${path}: HTTP ${response.status}`);
        return response.json() as Promise<unknown>;
      })
      .catch((error: unknown) => {
        reads.delete(path);
        throw error;
      });
    reads.set(path, read);
  }
  return read;
}

/**
 * The days of `ref`'s price file, read after hydration (`none` without a
 * reference). Before hydration and during the read the state is `loading`,
 * so the prerendered page and the first client render agree.
 */
export function usePriceFile(ref: PriceFileRef | null): { state: PriceFileState; retry: () => void } {
  const [state, setState] = useState<PriceFileState>(ref ? { kind: "loading" } : { kind: "none" });
  const [attempt, setAttempt] = useState(0);
  const path = ref?.file ?? null;
  useEffect(() => {
    if (!ref || !path) return;
    let active = true;
    readPriceFile(path).then(
      (value) => {
        if (!active) return;
        const series = parsePriceFile(value, ref);
        setState(series ? { kind: "ready", series } : { kind: "error" });
      },
      () => { if (active) setState({ kind: "error" }); },
    );
    return () => { active = false; };
    // The reference is loader data: its file names it, and only a retry reads again.
  }, [path, attempt]);
  const retry = useCallback(() => {
    if (!path) return;
    setState({ kind: "loading" });
    setAttempt((value) => value + 1);
  }, [path]);
  return { state, retry };
}
