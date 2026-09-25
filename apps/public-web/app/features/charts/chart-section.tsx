/**
 * `ChartSection`: the on-chain trade price of a token and the annual SEC
 * figures of its company in one chart (company pages), or the price alone
 * (product pages). The heart of Benten's xStock view: how the token has
 * traded on Solana since its listing, against ten years of what the company
 * reported.
 *
 * The section itself is static-safe: heading, legend, source note, readout
 * and data table are prerendered from loader data. The drawing (Recharts)
 * is a separate island that this section imports after hydration, so no
 * page loads Recharts before it needs it, and no other page loads it at all.
 * The range control exists only once the page is interactive (the table
 * shows the default range until then).
 *
 * A real price series is not in the page: the section reads its days from
 * the ticker's static file (`data.priceFile`, see `price-file.ts`) after
 * hydration, alongside the island. Until both are there the plot keeps its
 * loading state; the table lists the figures and links the price file.
 *
 * States: loading (reserved plot height, "Loading the chart..."), no
 * JavaScript (the table carries the figures and links the price file),
 * error (the island or the price file failed to load: a message and Try
 * again), an empty range, gaps (days without a value, fiscal years without a
 * reported figure), financials only (no price series yet) and price only (a
 * token without a company filing).
 *
 * The whole section carries `data-term="onchain-trade-price"`: the one place
 * besides the Pyth block where a page may say "price" (app IA section 7).
 */
import { useCallback, useId, useMemo, useState, type KeyboardEvent } from "react";
import { RefreshCwIcon } from "lucide-react";
import { PURCHASE_CONFIG } from "@benten/purchase/config";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "@/components/external-link";
import type { ChartPlotProps } from "@/features/chart-island";
import { chartsMessagesFor } from "@/i18n/charts-messages";
import { formatNumber, formatSourceDate, joinSentences, shortenAddress } from "@/i18n/format";
import { fiscalYearLabel } from "@/i18n/fiscal-year";
import type { PublicWebLocale } from "@/i18n/locales";
import { useHydrated } from "@/lib/use-hydrated";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { CHART_CONFIG, type ChartRange } from "./chart-config";
import { useChartIsland, type ChartIsland } from "./load-chart-island";
import { hasChartData, isDrawableFigure, priceHeader, type ChartData } from "./chart-data";
import { moneyText, priceTickText, xTickText } from "./chart-format";
import { availableRanges, chartModel, labelsByYear, type ChartModel, type ChartSelection } from "./chart-model";
import { ChartReadout } from "./chart-readout";
import { ChartTables } from "./chart-table";
import { usePriceFile } from "./price-file";
import { PythComparison } from "./pyth-comparison";

type Plot = (props: ChartPlotProps) => React.ReactNode;

type PlotState = { readonly kind: "loading" } | { readonly kind: "ready"; readonly Plot: Plot } | { readonly kind: "error" };

const pickPlot = (island: ChartIsland): Plot => island.ChartPlot;

function usePlot(): { state: PlotState; retry: () => void } {
  const { state, retry } = useChartIsland(pickPlot);
  return { state: state.kind === "ready" ? { kind: "ready", Plot: state.value } : state, retry };
}

export type ChartSectionProps = {
  readonly data: ChartData;
  /** `company`: price and figures; `product`: the price with the Pyth comparison. */
  readonly variant: "company" | "product";
  /** The token's display symbol (NVDAx), and its company's display name when it has one. */
  readonly symbol: string;
  readonly company: string | null;
  /** The token is an xStock (its listing is an xStock listing) or another provider's token. */
  readonly provider: "xstocks" | "prestocks";
  readonly locale: PublicWebLocale;
  /** Development-only Living Catalog: force a plot state instead of loading the island. */
  readonly catalogState?: "loading" | "error";
};

function RangeControl({ ranges, range, onChange, locale }: { ranges: readonly ChartRange[]; range: ChartRange; onChange: (range: ChartRange) => void; locale: PublicWebLocale }) {
  const copy = chartsMessagesFor(locale).range;
  return (
    <div role="group" aria-label={copy.label} data-chart-range="" className="inline-flex rounded-lg bg-muted p-0.5">
      {ranges.map((value) => (
        <Button
          key={value}
          type="button"
          size="sm"
          variant={value === range ? "outline" : "ghost"}
          aria-pressed={value === range}
          aria-label={copy.long[value]}
          data-chart-range-option={value}
          className="min-h-(--touch-target-min) min-w-(--touch-target-min) md:min-h-0"
          onClick={() => onChange(value)}
        >
          {copy.short[value]}
        </Button>
      ))}
    </div>
  );
}

function Legend({ model, symbol, locale }: { model: ChartModel; symbol: string; locale: PublicWebLocale }) {
  const copy = chartsMessagesFor(locale).legend;
  return (
    <ul aria-label={copy.label} data-chart-legend="" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {model.drawsPrice ? (
        <li className="flex items-center gap-2"><span aria-hidden="true" className="h-0.5 w-4 bg-(--chart-price)" />{copy.price(symbol)}</li>
      ) : null}
      {model.drawsFigures ? (
        <>
          <li className="flex items-center gap-2"><span aria-hidden="true" className="size-3 border border-(--chart-revenue-edge) bg-(--chart-revenue)" />{copy.revenue}</li>
          <li className="flex items-center gap-2"><span aria-hidden="true" className="size-3 bg-(--chart-net-income)" />{copy.netIncome}</li>
        </>
      ) : null}
      {model.showsListing ? (
        <li className="flex items-center gap-2"><span aria-hidden="true" className="size-3 border border-dashed border-(--chart-seam) bg-(--chart-before-listing)" />{copy.beforeListing}</li>
      ) : null}
    </ul>
  );
}

/** "Price: executed swaps on Solana (Orca pool ...). Financials: SEC filings." Each pool names its DEX and links to its account on Solana Explorer. */
function SourceNote({ data, locale }: { data: ChartData; locale: PublicWebLocale }) {
  const copy = chartsMessagesFor(locale);
  const header = priceHeader(data);
  const pools = header?.pools ?? [];
  return (
    <figcaption data-chart-source="" className="flex flex-col gap-0.5 text-sm text-muted-foreground">
      {header ? (
        <p>
          {copy.source.priceBefore}
          {pools.map((pool, index) => (
            <span key={pool.address}>
              {index > 0 ? ", " : null}
              {copy.readout.pool(pool.dex)}{" "}
              <ExternalLink href={PURCHASE_CONFIG.explorerAddressUrl(pool.address)} newTabLabel={copy.opensNewTab} className="font-normal text-muted-foreground">{shortenAddress(pool.address)}</ExternalLink>
            </span>
          ))}
          {copy.source.priceAfter}
        </p>
      ) : null}
      {data.financials ? <p>{copy.source.financials}</p> : null}
    </figcaption>
  );
}

/** The plot's accessible name: what it shows, over which days and years, and where the same data is readable. */
function plotSummary(model: ChartModel, symbol: string, company: string | null, locale: PublicWebLocale): string {
  const copy = chartsMessagesFor(locale).summary;
  const parts: string[] = [];
  const prices = model.prices.filter((row) => row.point.value !== null);
  if (prices.length) parts.push(copy.price(symbol, formatSourceDate(prices[0]!.point.date, locale), formatSourceDate(prices.at(-1)!.point.date, locale)));
  const years = model.years.filter((year) => Object.values(year.figures).some((figure) => figure && isDrawableFigure(figure)));
  if (years.length && company) parts.push(copy.figures(company, fiscalYearLabel(years[0]!.periodEnd, locale), fiscalYearLabel(years.at(-1)!.periodEnd, locale)));
  parts.push(copy.table);
  return joinSentences(parts, locale);
}

/** Keyboard: Left and Right step through the days (or, without a price, the figures), Home and End jump to the ends. */
function stepSelection(model: ChartModel, selection: ChartSelection | null, key: string): ChartSelection | null {
  if (model.drawsPrice) {
    const last = model.prices.length - 1;
    const current = selection?.kind === "price" ? selection.index : last;
    const next = key === "ArrowLeft" ? current - 1 : key === "ArrowRight" ? current + 1 : key === "Home" ? 0 : key === "End" ? last : null;
    return next === null ? null : { kind: "price", index: Math.min(Math.max(next, 0), last) };
  }
  const figures = model.years.flatMap((year) => (["revenue", "net_income_parent"] as const).filter((metric) => year.figures[metric]).map((metric) => ({ kind: "figure", fiscalYear: year.fiscalYear, metric }) as const));
  if (!figures.length) return null;
  const at = selection?.kind === "figure" ? figures.findIndex((figure) => figure.fiscalYear === selection.fiscalYear && figure.metric === selection.metric) : figures.length - 1;
  const next = key === "ArrowLeft" ? at - 1 : key === "ArrowRight" ? at + 1 : key === "Home" ? 0 : key === "End" ? figures.length - 1 : null;
  return next === null ? null : figures[Math.min(Math.max(next, 0), figures.length - 1)]!;
}

export function ChartSection({ data: given, variant, symbol, company, provider, locale, catalogState }: ChartSectionProps) {
  const copy = chartsMessagesFor(locale);
  const headingId = useId();
  const hydrated = useHydrated();
  const reducedMotion = useMediaQuery(CHART_CONFIG.media.reducedMotion);
  const compact = useMediaQuery(CHART_CONFIG.media.compact);
  const { state: file, retry: retryFile } = usePriceFile(given.price ? null : given.priceFile ?? null);
  // The chart's data once the price file (if any) is read; until then, the figures alone.
  const data = useMemo<ChartData>(() => (file.kind === "ready" ? { ...given, price: file.series } : given), [given, file]);
  const ranges = availableRanges(data);
  const [range, setRange] = useState<ChartRange>(ranges.includes(CHART_CONFIG.defaultRange) ? CHART_CONFIG.defaultRange : ranges[0]!);
  const [selection, setSelection] = useState<ChartSelection | null>(null);
  const model = useMemo(() => chartModel(data, range), [data, range]);
  const { state: island, retry: retryIsland } = usePlot();
  const loaded: PlotState = island.kind === "error" || file.kind === "error" ? { kind: "error" } : file.kind === "loading" ? { kind: "loading" } : island;
  const state: PlotState = catalogState ? { kind: catalogState } : loaded;
  const retry = useCallback(() => {
    if (island.kind === "error") retryIsland();
    if (file.kind === "error") retryFile();
  }, [island.kind, file.kind, retryIsland, retryFile]);

  const changeRange = useCallback((next: ChartRange) => {
    setRange(next);
    setSelection(null);
  }, []);
  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const next = stepSelection(model, selection, event.key);
    if (!next) return;
    event.preventDefault();
    setSelection(next);
  }, [model, selection]);

  const format = useMemo(() => ({
    xTick: (ms: number) => xTickText(ms, labelsByYear(model.startMs, model.endMs), locale),
    // A fiscal year under its bars: the full label where it fits, the axis form on a phone.
    fiscalYearTick: (periodEnd: string) => fiscalYearLabel(periodEnd, locale, compact ? "axis" : "full"),
    priceTick: (value: number) => priceTickText(value, locale),
    moneyTick: (value: number) => moneyText(value, locale),
  }), [model, locale, compact]);

  if (!hasChartData(data)) return null;
  const header = priceHeader(data);
  const heading = variant === "product" || !data.financials
    ? copy.heading.product(symbol)
    : header ? copy.heading.company(symbol, company ?? symbol) : copy.heading.companyFigures(company ?? symbol);
  const listedDate = header ? formatSourceDate(header.listed_on, locale) : null;
  const listedLabel = listedDate ? (provider === "xstocks" ? copy.listed.xstock(listedDate) : copy.listed.token(symbol, listedDate)) : null;
  // A price file still being read is not an empty range: the plot shows its loading state.
  const empty = !model.drawsPrice && !model.drawsFigures && file.kind !== "loading";
  const fixture = data.price?.fixture === true || data.financials?.fixture === true;
  const drawn = state.kind === "ready" && !empty;

  return (
    <section aria-labelledby={headingId} data-term="onchain-trade-price" data-chart-section={variant} data-chart-state={empty ? "empty" : state.kind} className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id={headingId} className="text-xl font-semibold tracking-tight text-balance">{heading}</h2>
        {hydrated && ranges.length > 1 ? <RangeControl ranges={ranges} range={range} onChange={changeRange} locale={locale} /> : null}
      </div>
      {fixture ? <p data-chart-fixture="" className="rounded-lg border border-dashed px-3 py-2 text-sm font-medium">{copy.fixture}</p> : null}
      {variant === "product" && header ? <PythComparison data={data} company={company} locale={locale} /> : null}
      <figure className="m-0 flex min-w-0 flex-col gap-3">
        <div
          data-chart-plot=""
          role="img"
          aria-label={plotSummary(model, symbol, company, locale)}
          tabIndex={drawn ? 0 : undefined}
          onKeyDown={drawn ? onKeyDown : undefined}
          className={cn("relative h-(--chart-plot-height) min-w-0", drawn && "rounded-md")}
        >
          {empty ? (
            <p className="flex h-full items-center justify-center rounded-md bg-muted px-4 text-center text-sm text-muted-foreground">{copy.state.emptyRange}</p>
          ) : state.kind === "ready" ? (
            <state.Plot
              model={model}
              selection={selection}
              onSelect={setSelection}
              animate={!reducedMotion}
              compact={compact}
              format={format}
              listedLabel={compact ? null : listedLabel}
            />
          ) : state.kind === "error" ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 rounded-md bg-muted px-4 text-center">
              <p className="text-sm">{copy.state.error}</p>
              <Button type="button" variant="outline" className="min-h-(--touch-target-min) md:min-h-0" onClick={retry}>
                <RefreshCwIcon aria-hidden="true" />
                {copy.state.retry}
              </Button>
            </div>
          ) : (
            <div data-chart-reserve="" className="flex h-full items-center justify-center rounded-md bg-muted px-4 text-center">
              {hydrated ? <p role="status" className="text-sm text-muted-foreground">{copy.state.loading}</p> : <noscript><p className="text-sm text-muted-foreground">{copy.state.needsJavaScript}</p></noscript>}
            </div>
          )}
        </div>
        {/* On a phone the listing label is not drawn in the plot; it stays readable here. */}
        {compact && model.showsListing && listedLabel ? <p className="text-sm text-muted-foreground">{listedLabel}</p> : null}
        <ChartReadout model={model} selection={selection} symbol={symbol} pools={header?.pools ?? []} locale={locale} interactive={drawn} />
        <Legend model={model} symbol={symbol} locale={locale} />
        {/* The line is per token, before the display multiplier: never read as one share's price. */}
        {header ? <p data-chart-unit="" className="max-w-prose text-sm text-muted-foreground">{copy.state.perToken(symbol)}</p> : null}
        {model.gapDays > 0 ? <p className="text-sm text-muted-foreground">{copy.state.gaps(formatNumber(model.gapDays, locale))}</p> : null}
        {variant === "company" && !header ? <p className="text-sm text-muted-foreground">{copy.state.noPriceSeries(symbol)}</p> : null}
        {data.financials && !model.drawsFigures && model.drawsPrice && variant === "company" ? <p className="text-sm text-muted-foreground">{copy.state.noFiguresInRange}</p> : null}
        <SourceNote data={data} locale={locale} />
      </figure>
      <ChartTables model={model} symbol={header ? symbol : null} priceFile={given.price ? null : given.priceFile ?? null} locale={locale} />
    </section>
  );
}
