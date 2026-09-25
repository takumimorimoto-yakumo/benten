/**
 * Living Catalog, charts section (development only; see
 * app/lib/dev-catalog-flag.ts). Every state of the price and financials
 * chart, from the labelled fixture (`features/charts/chart-fixture.ts`):
 * company (price and figures), figures only, price only, loading, island
 * error, a price file that cannot be read, an empty range and gaps.
 * `?locale=` shows another locale.
 */
import { useSearchParams } from "react-router";
import { SiteShell } from "@/components/site/site-shell";
import { Card, CardContent } from "@/components/ui/card";
import type { ChartData, PriceFileRef, PricePoint } from "@/features/charts/chart-data";
import { fixtureChartData } from "@/features/charts/chart-fixture";
import { ChartSection } from "@/features/charts/chart-section";
import { DEFAULT_LOCALE, isPublicWebLocale } from "@/i18n/locales";

/** Placeholder identity: not a registry token. */
const TOKEN = { symbol: "EXAMPLEx", mint: "11111111111111111111111111111111", pool: "11111111111111111111111111111112" };
const COMPANY = "Example Fixture";
const FULL = fixtureChartData(TOKEN);
const FIGURES_ONLY: ChartData = { price: null, financials: FULL.financials };
const PRICE_ONLY: ChartData = { price: FULL.price, financials: null };
const NO_VALUES: ChartData = {
  price: { ...FULL.price!, points: FULL.price!.points.slice(0, 5).map((point): PricePoint => ({ date: point.date, value: null, reason: "no_single_swap_in_search_window" })), as_of: FULL.price!.points[4]!.date },
  financials: null,
};

/** A price file reference to a file no build writes: the section's price file error state. */
const MISSING_FILE: ChartData = {
  price: null,
  priceFile: {
    ticker: "EXAMPLE", symbol: TOKEN.symbol, mint: TOKEN.mint, listed_on: FULL.price!.listed_on, as_of: FULL.price!.as_of, pools: FULL.price!.pools,
    file: "/data/prices/EXAMPLE.0000000000000000.json", days: FULL.price!.points.length, latest: null,
  } satisfies PriceFileRef,
  financials: FULL.financials,
};

function Specimen({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function DevCatalogCharts() {
  const [params] = useSearchParams();
  const requested = params.get("locale");
  const locale = isPublicWebLocale(requested) ? requested : DEFAULT_LOCALE;
  return (
    <SiteShell locale={locale} page={{ kind: "home" }} parentHref="/_catalog">
      <div className="flex flex-col gap-10">
        <h1 className="text-3xl font-semibold tracking-tight">Living Catalog: charts</h1>
        <Specimen title="Company: price and annual figures (with gap days and two figure gaps)">
          <ChartSection data={FULL} variant="company" symbol={TOKEN.symbol} company={COMPANY} provider="xstocks" locale={locale} />
        </Specimen>
        <Specimen title="Company: annual figures only (no price series yet)">
          <ChartSection data={FIGURES_ONLY} variant="company" symbol={TOKEN.symbol} company={COMPANY} provider="xstocks" locale={locale} />
        </Specimen>
        <Specimen title="Product: price only (a provider token without filings)">
          <Card><CardContent><ChartSection data={PRICE_ONLY} variant="product" symbol={TOKEN.symbol} company={COMPANY} provider="prestocks" locale={locale} /></CardContent></Card>
        </Specimen>
        <Specimen title="Loading (the island is not loaded yet)">
          <ChartSection data={FULL} variant="company" symbol={TOKEN.symbol} company={COMPANY} provider="xstocks" locale={locale} catalogState="loading" />
        </Specimen>
        <Specimen title="Error (the island failed to load)">
          <ChartSection data={FULL} variant="company" symbol={TOKEN.symbol} company={COMPANY} provider="xstocks" locale={locale} catalogState="error" />
        </Specimen>
        <Specimen title="Price file error (the daily prices could not be read; the table links the file)">
          <ChartSection data={MISSING_FILE} variant="company" symbol={TOKEN.symbol} company={COMPANY} provider="xstocks" locale={locale} />
        </Specimen>
        <Specimen title="Empty: no day in the range has a value">
          <ChartSection data={NO_VALUES} variant="product" symbol={TOKEN.symbol} company={COMPANY} provider="xstocks" locale={locale} />
        </Specimen>
      </div>
    </SiteShell>
  );
}
