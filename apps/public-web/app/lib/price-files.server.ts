/**
 * Build-only source of the daily price files (`/data/prices/{TICKER}.{digest}.json`,
 * see `data-files.ts`)
 * and of the reference a page carries instead of the days. Shared by the
 * route loaders (through `chart.server.ts`) and the Vite build that writes
 * the files (`vite.config.ts`), so a page's reference and its file come from
 * one derivation.
 *
 * Depends only on the registry, the bundled on-chain series and the
 * browser-safe chart contract: the Vite config loads it directly.
 */
import { listPublicAssets } from "@benten/registry";
import { onchainDailySeries, onchainDailyTickers, type OnchainDailySeries } from "@benten/pricing/onchain-daily";
import { priceSeriesFromReadModel, type LatestTrade, type PriceFileRef, type PriceSeries } from "../features/charts/chart-data";
import type { PriceFile } from "../features/charts/price-file";
import { PRICE_FILE_SCHEMA_VERSION } from "../features/charts/price-file-config";
import { dataFile, type DataFileOutput } from "./data-files.server.js";

export type XStockIdentity = { readonly ticker: string; readonly symbol: string; readonly mint: string };

/**
 * Display names of the DEXes a reviewed pool may run on, by the series' DEX
 * id (`onchain-pools-v1.json`); an id without a name is shown as it is. Kept
 * on the build side: DEX names belong only to the purchase island's code.
 */
const DEX_NAMES: Readonly<Record<string, string>> = { orca: "Orca", "raydium-clmm": "Raydium CLMM", byreal: "Byreal" };

function withDexNames(series: PriceSeries): PriceSeries {
  return { ...series, pools: series.pools.map((pool) => ({ address: pool.address, dex: Object.hasOwn(DEX_NAMES, pool.dex) ? DEX_NAMES[pool.dex]! : pool.dex })) };
}

function bundledModel(xstock: XStockIdentity): OnchainDailySeries | null {
  const model = onchainDailySeries(xstock.ticker);
  return model && model.mint === xstock.mint && model.symbol === xstock.symbol ? model : null;
}

/**
 * The chart's price series of one xStock, by exact ticker and mint; `null`
 * when no series is bundled for it or the series is of another token.
 */
export function xStockPriceSeries(xstock: XStockIdentity): PriceSeries | null {
  const model = bundledModel(xstock);
  return model ? withDexNames(priceSeriesFromReadModel(model)) : null;
}

/**
 * The series' last verified trade, with its value for one underlying share
 * where the read model states one (the multiplier at that trade is known).
 */
function latestTrade(model: OnchainDailySeries, series: PriceSeries): LatestTrade | null {
  for (let index = series.points.length - 1; index >= 0; index -= 1) {
    const point = series.points[index]!;
    if (point.value === null) continue;
    const perShare = model.points[index]!.usdcPerUnderlyingShare;
    return { ...point, per_share: perShare === null ? null : Number(perShare) };
  }
  return null;
}

/**
 * What a page carries about one xStock's price series instead of its days;
 * `null` when no series is bundled for it.
 */
export function xStockPriceFileRef(xstock: XStockIdentity): PriceFileRef | null {
  const model = bundledModel(xstock);
  const file = priceFile(xstock);
  if (!model || !file) return null;
  const series = withDexNames(priceSeriesFromReadModel(model));
  return {
    ticker: xstock.ticker,
    symbol: series.symbol,
    mint: series.mint,
    listed_on: series.listed_on,
    as_of: series.as_of,
    pools: series.pools,
    file: file.path,
    days: series.points.length,
    latest: latestTrade(model, series),
  };
}

const files = new Map<string, DataFileOutput | null>();

/**
 * One xStock's price file: its bytes and its digest-named address, or `null`
 * when no series is bundled for it. The page's reference and the build's
 * file both come from here, so the address a page names is the file's.
 */
function priceFile(xstock: XStockIdentity): DataFileOutput | null {
  const key = `${xstock.ticker}\u0000${xstock.symbol}\u0000${xstock.mint}`;
  if (!files.has(key)) {
    const series = xStockPriceSeries(xstock);
    const file: PriceFile | null = series ? { schema_version: PRICE_FILE_SCHEMA_VERSION, ticker: xstock.ticker, series } : null;
    files.set(key, file ? dataFile("prices", xstock.ticker, file) : null);
  }
  return files.get(key)!;
}

/**
 * Every price file of the build: one per bundled series whose ticker has a
 * page (`tickers`, the published catalog's exact tickers with their token
 * identity). A series outside the catalog gets no file, so no page and no
 * file can disagree about which tickers have prices.
 */
export function priceFiles(tickers: readonly XStockIdentity[]): readonly DataFileOutput[] {
  const byTicker = new Map(tickers.map((identity) => [identity.ticker, identity]));
  const output: DataFileOutput[] = [];
  for (const ticker of onchainDailyTickers()) {
    const identity = byTicker.get(ticker);
    const file = identity ? priceFile(identity) : null;
    if (file) output.push(file);
  }
  return output;
}

/** The price files of the published catalog: what the client build writes (`vite.config.ts`). */
export function publishedPriceFiles(): readonly DataFileOutput[] {
  const catalog = listPublicAssets({});
  if (!catalog.found) throw new Error("public catalog is unavailable for the price files");
  return priceFiles(catalog.items.map(({ identity }) => ({ ticker: identity.ticker, symbol: identity.symbol, mint: identity.mint })));
}
