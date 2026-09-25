/**
 * Build-only source of the charts' data (company and product pages). Runs in
 * route loaders during prerendering and in the Vite build that writes the
 * price files; no series file enters a client chunk.
 *
 * A US-listed company's page gets the company's annual SEC figures (by exact
 * ticker, the allowlisted identity the loader already validated; never by
 * name). An xStock with a bundled on-chain daily series
 * (`@benten/pricing/onchain-daily`, looked up by its exact registry ticker
 * and checked against the exact mint) gets a `PriceFileRef` on its company
 * and product pages; its days are published once, as
 * `/data/prices/{TICKER}.{digest}.json` (`price-files.server.ts`), and read by the page after
 * hydration. Five locales of a page therefore share one file, and no
 * document or `.data` file carries a daily series.
 *
 * In a local review build with the fixture flag, the NVIDIA company page and
 * the NVDA product page get the labelled fixture (inline) instead.
 */
import { getAnnualFactSeries } from "@benten/registry";
import { NVDAX_USDC_POOL } from "@benten/purchase/route";
import { FINANCIAL_METRICS, financialSeriesFromAnnualFacts, type ChartData } from "../features/charts/chart-data";
import type { CompanyView } from "../features/references/company-view";
import { fixtureChartData } from "../features/charts/chart-fixture";
import { CHART_FIXTURE_ENABLED } from "./chart-fixture-flag.js";
import { xStockPriceFileRef, type XStockIdentity } from "./price-files.server.js";

/** The one xStock the fixture stands in for. */
const FIXTURE_TICKER = "NVDA";

/**
 * Price series of one xStock, with the annual figures of its company on a
 * company page (`figures: true`); a product page shows the price alone.
 */
export function xStockChartData(xstock: XStockIdentity | null, { figures }: { readonly figures: boolean }): ChartData | null {
  if (!xstock) return null;
  if (CHART_FIXTURE_ENABLED && xstock.ticker === FIXTURE_TICKER) {
    const fixture = fixtureChartData({ symbol: xstock.symbol, mint: xstock.mint, pool: NVDAX_USDC_POOL.toBase58() });
    return figures ? fixture : { price: fixture.price, financials: null };
  }
  const priceFile = xStockPriceFileRef(xstock);
  const financials = figures ? financialSeriesFromAnnualFacts(getAnnualFactSeries(xstock.ticker, { metrics: [...FINANCIAL_METRICS] })) : null;
  return priceFile || financials ? { price: null, priceFile, financials } : null;
}

/** Price series of one provider token (a private company's PreStocks token). No filings: price only. */
export function providerChartData(token: { readonly provider: string; readonly id: string; readonly mint: string } | null): ChartData | null {
  if (!token) return null;
  // No on-chain daily series covers a provider token yet: no chart.
  return null;
}

/**
 * A company page's chart: a US-listed company's first xStock with the
 * company's figures; a private company's first provider token, price only.
 */
export function companyChartData(view: CompanyView): ChartData | null {
  const xstock = view.products.find((product) => product.provider === "xstocks");
  if (view.listingStatus === "us_listed") return xStockChartData(xstock ? { ticker: xstock.routeKey, symbol: xstock.symbol, mint: xstock.mint } : null, { figures: true });
  const token = view.products.find((product) => product.provider !== "xstocks");
  return providerChartData(token ? { provider: token.provider, id: token.routeKey, mint: token.mint } : null);
}
