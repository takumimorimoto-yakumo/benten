/**
 * The chart drawing island: Recharts through the generated shadcn chart
 * component. It is reached only through the dynamic import in
 * `features/charts/load-chart-island.ts`, after hydration, and only on company
 * and product pages, so Recharts never enters a document's static graph
 * (see `tests/static-artifact.test.mjs`).
 *
 * It draws what the static section already describes: the fiscal-year bars
 * (each bar spans its whole fiscal year, revenue in the first half, net
 * income in the second), the price line from the listing day on, the
 * listing seam, and the selected day or figure. Pointing or tapping selects;
 * the section shows the selection in its readout, with the links.
 */
import { useCallback, type PointerEvent } from "react";
import { CartesianGrid, ComposedChart, DefaultZIndexes, Line, XAxis, YAxis, ZIndexLayer, usePlotArea, useXAxisInverseScale, useXAxisScale, useYAxisScale } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { CHART_CONFIG } from "@/features/charts/chart-config";
import { isDrawableFigure, type FinancialMetric } from "@/features/charts/chart-data";
import { nearestPriceIndex, niceTicks, xAxisTicks, type ChartModel, type ChartSelection, type FiscalYearView } from "@/features/charts/chart-model";
import { axisWidth } from "./axis";

export { StatementPlot, type StatementPlotProps } from "./statement-plot";

/**
 * Series colours: the chart role tokens in `static.css`, which are the
 * generated neutral chart tokens and the foreground in each theme, nothing
 * custom (app IA section 11).
 */
const CHART_SERIES = {
  price: { color: "var(--chart-price)" },
  revenue: { color: "var(--chart-revenue)" },
  revenueEdge: { color: "var(--chart-revenue-edge)" },
  netIncome: { color: "var(--chart-net-income)" },
} satisfies ChartConfig;

/** Recharts axis ids. */
const PRICE_AXIS = "price";
const MONEY_AXIS = "money";
/** Layers above the line: the selection marker, then the pointer surface. */
const MARKER_Z = DefaultZIndexes.line + 50;
const POINTER_Z = DefaultZIndexes.line + 60;
/** Layer below the bars: the part of the range before the listing. */
const LISTING_Z = DefaultZIndexes.area;

export type ChartPlotFormat = {
  readonly xTick: (ms: number) => string;
  /** A fiscal-year tick: the year named by the month it ends (`fiscalYearLabel`). */
  readonly fiscalYearTick: (periodEnd: string) => string;
  readonly priceTick: (value: number) => string;
  readonly moneyTick: (value: number) => string;
};

export type ChartPlotProps = {
  readonly model: ChartModel;
  readonly selection: ChartSelection | null;
  readonly onSelect: (selection: ChartSelection) => void;
  readonly animate: boolean;
  /** Below md: fewer ticks, narrower axes. */
  readonly compact: boolean;
  readonly format: ChartPlotFormat;
  /** "xStock listed on {date}", drawn at the listing seam when the range reaches before it. */
  readonly listedLabel: string | null;
};

type BarGeometry = { readonly fiscalYear: number; readonly metric: FinancialMetric; readonly x: number; readonly y: number; readonly width: number; readonly height: number };

/**
 * Revenue in the first half of the fiscal year's visible part, net income in
 * the second, with a gap at each side and between. A year the range cuts
 * keeps both bars inside what is shown.
 */
function barSpans(year: FiscalYearView, model: ChartModel): Record<FinancialMetric, readonly [number, number]> {
  const start = Math.max(year.startMs, model.startMs);
  const span = Math.min(year.endMs, model.endMs) - start;
  const gap = span * CHART_CONFIG.fiscalYearBarGap;
  const width = (span - gap * 3) / 2;
  const first = start + gap;
  const second = first + width + gap;
  return { revenue: [first, first + width], net_income_parent: [second, second + width] };
}

function useBars(model: ChartModel): BarGeometry[] {
  const x = useXAxisScale();
  const y = useYAxisScale(MONEY_AXIS);
  if (!x || !y || !model.moneyDomain) return [];
  const zero = y(0) as number;
  const bars: BarGeometry[] = [];
  for (const year of model.years) {
    const spans = barSpans(year, model);
    for (const metric of ["revenue", "net_income_parent"] as const) {
      const figure = year.figures[metric];
      if (!figure || !isDrawableFigure(figure)) continue;
      const left = x(spans[metric][0]) as number;
      const right = x(spans[metric][1]) as number;
      if (!(right > left)) continue;
      const top = y(figure.value) as number;
      bars.push({ fiscalYear: year.fiscalYear, metric, x: left, y: Math.min(top, zero), width: right - left, height: Math.abs(zero - top) });
    }
  }
  return bars;
}

function FiscalYearBars({ model, selection }: { model: ChartModel; selection: ChartSelection | null }) {
  const bars = useBars(model);
  return (
    <ZIndexLayer zIndex={DefaultZIndexes.bar}>
      <g data-chart-bars="" aria-hidden="true">
        {bars.map((bar) => {
          const selected = selection?.kind === "figure" && selection.fiscalYear === bar.fiscalYear && selection.metric === bar.metric;
          const revenue = bar.metric === "revenue";
          return (
            <rect
              key={`${bar.fiscalYear}-${bar.metric}`}
              data-chart-bar={`${bar.fiscalYear}-${bar.metric}`}
              x={bar.x}
              y={bar.y}
              width={bar.width}
              height={bar.height}
              fill={revenue ? "var(--color-revenue)" : "var(--color-netIncome)"}
              // The light revenue fill has a darker edge, so the bar keeps 3:1 against the background.
              stroke={selected ? "var(--color-price)" : revenue ? "var(--color-revenueEdge)" : "none"}
              strokeWidth={selected ? CHART_CONFIG.selectedBarWidth : CHART_CONFIG.barEdgeWidth}
            />
          );
        })}
      </g>
    </ZIndexLayer>
  );
}

/** The range before the listing: a quiet band and the seam where the price begins, with its label. */
function ListingSeam({ model, label }: { model: ChartModel; label: string | null }) {
  const x = useXAxisScale();
  const plot = usePlotArea();
  if (!x || !plot || !model.showsListing || model.listedOnMs === null) return null;
  const seam = x(model.listedOnMs) as number;
  return (
    <ZIndexLayer zIndex={LISTING_Z}>
      <g data-chart-listing="" aria-hidden="true">
        <rect x={plot.x} y={plot.y} width={Math.max(0, seam - plot.x)} height={plot.height} fill="var(--chart-before-listing)" />
        <line x1={seam} x2={seam} y1={plot.y} y2={plot.y + plot.height} stroke="var(--chart-seam)" strokeDasharray={CHART_CONFIG.listingSeamDash} />
        {label ? (
          <text x={seam - CHART_CONFIG.listingLabelOffset.x} y={plot.y + CHART_CONFIG.listingLabelOffset.y} textAnchor="end" className="fill-muted-foreground text-xs">{label}</text>
        ) : null}
      </g>
    </ZIndexLayer>
  );
}

function SelectionMarker({ model, selection }: { model: ChartModel; selection: ChartSelection | null }) {
  const x = useXAxisScale();
  const y = useYAxisScale(PRICE_AXIS);
  const plot = usePlotArea();
  if (!x || !plot || selection?.kind !== "price") return null;
  const row = model.prices[selection.index];
  if (!row) return null;
  const px = x(row.t) as number;
  const value = row.point.value;
  return (
    <ZIndexLayer zIndex={MARKER_Z}>
      <g data-chart-marker="" aria-hidden="true">
        <line x1={px} x2={px} y1={plot.y} y2={plot.y + plot.height} stroke="var(--muted-foreground)" />
        {value !== null && y ? <circle cx={px} cy={y(value) as number} r={CHART_CONFIG.activeDotRadius} fill="var(--color-price)" stroke="var(--background)" strokeWidth={CHART_CONFIG.activeDotRing} /> : null}
      </g>
    </ZIndexLayer>
  );
}

/** One transparent surface over the plot: pointing previews, tapping or clicking selects (the same selection). */
function PointerSurface({ model, onSelect }: { model: ChartModel; onSelect: (selection: ChartSelection) => void }) {
  const plot = usePlotArea();
  const invert = useXAxisInverseScale();
  const bars = useBars(model);
  const select = useCallback((event: PointerEvent<SVGRectElement>) => {
    if (!plot || !invert) return;
    const box = event.currentTarget.getBoundingClientRect();
    const px = plot.x + (event.clientX - box.left) * (plot.width / box.width);
    const py = plot.y + (event.clientY - box.top) * (plot.height / box.height);
    const bar = bars.find((candidate) => px >= candidate.x && px <= candidate.x + candidate.width && py >= candidate.y && py <= candidate.y + candidate.height);
    const t = Number(invert(px));
    if (bar && !(model.drawsPrice && selectsPriceFirst(bar, py))) return onSelect({ kind: "figure", fiscalYear: bar.fiscalYear, metric: bar.metric });
    const index = model.drawsPrice ? nearestPriceIndex(model.prices, t) : null;
    if (index !== null) return onSelect({ kind: "price", index });
    // No price in the range: the fiscal year under the pointer, by the half it falls in.
    const year = model.years.find((candidate) => t >= candidate.startMs && t <= candidate.endMs);
    if (!year) return;
    const metric: FinancialMetric = t < (year.startMs + year.endMs) / 2 ? "revenue" : "net_income_parent";
    if (year.figures[metric]) onSelect({ kind: "figure", fiscalYear: year.fiscalYear, metric });
  }, [plot, invert, bars, model, onSelect]);
  if (!plot) return null;
  return (
    <ZIndexLayer zIndex={POINTER_Z}>
      <rect
        data-chart-pointer=""
        x={plot.x}
        y={plot.y}
        width={plot.width}
        height={plot.height}
        fill="transparent"
        style={{ touchAction: "pan-y", cursor: "crosshair" }}
        onPointerMove={(event) => { if (event.pointerType === "mouse") select(event); }}
        onPointerDown={select}
      />
    </ZIndexLayer>
  );
}

/** Where a bar and the price line overlap, the upper part of a bar still selects the day (bars are wide, days are narrow). */
function selectsPriceFirst(bar: BarGeometry, py: number): boolean {
  return py < bar.y + Math.min(bar.height * CHART_CONFIG.barTopPriceZone.share, CHART_CONFIG.barTopPriceZone.maxPx);
}

export function ChartPlot({ model, selection, onSelect, animate, compact, format, listedLabel }: ChartPlotProps) {
  const rows = model.prices.length
    ? model.prices.map((row) => ({ t: row.t, value: row.point.value }))
    // A financials-only chart still needs rows at the range's ends for its time axis.
    : [{ t: model.startMs, value: null }, { t: model.endMs, value: null }];
  const moneyTicks = model.moneyDomain ? niceTicks(model.moneyDomain[0], model.moneyDomain[1], CHART_CONFIG.yTickCount) : [];
  const priceTicks = model.priceDomain ? niceTicks(model.priceDomain[0], model.priceDomain[1], CHART_CONFIG.yTickCount) : [];
  const axisTicks = xAxisTicks(model, compact ? CHART_CONFIG.xTickCount.compact : CHART_CONFIG.xTickCount.wide);
  const ticks = axisTicks.map((tick) => tick.t);
  const fiscalYearAt = new Map(axisTicks.flatMap((tick) => (tick.periodEnd === null ? [] : [[tick.t, tick.periodEnd] as const])));
  const xTickText = (ms: number) => {
    const periodEnd = fiscalYearAt.get(ms);
    return periodEnd === undefined ? format.xTick(ms) : format.fiscalYearTick(periodEnd);
  };
  return (
    <ChartContainer
      config={CHART_SERIES}
      className="aspect-auto h-(--chart-plot-height) w-full select-none"
          >
      <ComposedChart data={rows} margin={{ top: CHART_CONFIG.plotMarginTop, right: 0, bottom: 0, left: 0 }} accessibilityLayer={false}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={[model.startMs, model.endMs]}
          allowDataOverflow
          ticks={ticks}
          tickFormatter={xTickText}
          tickLine={false}
          axisLine={false}
          minTickGap={8}
        />
        <YAxis
          yAxisId={MONEY_AXIS}
          orientation="left"
          type="number"
          domain={model.moneyDomain ? [...model.moneyDomain] : [0, 1]}
          allowDataOverflow
          hide={!model.moneyDomain}
          ticks={moneyTicks}
          tickFormatter={format.moneyTick}
          tickLine={false}
          axisLine={false}
          width={axisWidth(moneyTicks.map(format.moneyTick))}
        />
        <YAxis
          yAxisId={PRICE_AXIS}
          orientation="right"
          type="number"
          domain={model.priceDomain ? [...model.priceDomain] : [0, 1]}
          allowDataOverflow
          hide={!model.priceDomain}
          ticks={priceTicks}
          tickFormatter={format.priceTick}
          tickLine={false}
          axisLine={false}
          width={axisWidth(priceTicks.map(format.priceTick))}
        />
        <ListingSeam model={model} label={listedLabel} />
        <FiscalYearBars model={model} selection={selection} />
        {model.drawsPrice ? (
          <>
            {/* The halo (the background colour, wider than the line) keeps the line readable where it crosses a bar, in light and dark. */}
            <Line yAxisId={PRICE_AXIS} dataKey="value" type="linear" stroke="var(--chart-price-halo)" strokeWidth={CHART_CONFIG.priceHaloWidth} strokeLinejoin={CHART_CONFIG.priceLineJoin} strokeLinecap={CHART_CONFIG.priceLineCap} dot={false} activeDot={false} connectNulls={false} isAnimationActive={false} legendType="none" />
            <Line yAxisId={PRICE_AXIS} dataKey="value" type="linear" stroke="var(--color-price)" strokeWidth={CHART_CONFIG.priceStrokeWidth} strokeLinejoin={CHART_CONFIG.priceLineJoin} strokeLinecap={CHART_CONFIG.priceLineCap} dot={false} activeDot={false} connectNulls={false} isAnimationActive={animate} animationDuration={CHART_CONFIG.animationMs} />
          </>
        ) : null}
        <SelectionMarker model={model} selection={selection} />
        <PointerSurface model={model} onSelect={onSelect} />
      </ComposedChart>
    </ChartContainer>
  );
}
