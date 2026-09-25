/**
 * What one chart draws for one range: the visible days and fiscal years, the
 * axis domains and ticks, and where the xStock listing falls. Pure and
 * browser-safe; the static section and the drawing island share it, so the
 * data table and the plot always show the same points.
 */
import { CHART_CONFIG, CHART_RANGES, type ChartRange } from "./chart-config";
import { isDrawableFigure, type ChartData, type FinancialMetric, type FinancialPoint, type IsoDate, type LatestTrade, type PricePoint } from "./chart-data";

const DAY_MS = 86_400_000;

/** Milliseconds at 00:00 UTC of an ISO date (`YYYY-MM-DD`); NaN when malformed. */
export function dayMs(date: IsoDate): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : Number.NaN;
}

function addMonthsUtc(ms: number, months: number): number {
  const date = new Date(ms);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate());
}

export type PriceRow = { readonly t: number; readonly point: PricePoint };

export type FiscalYearView = {
  readonly fiscalYear: number;
  /** The fiscal year's own span (not clipped to the range). */
  readonly startMs: number;
  readonly endMs: number;
  readonly periodEnd: IsoDate;
  readonly figures: Readonly<Record<FinancialMetric, FinancialPoint | null>>;
};

export type ChartModel = {
  readonly range: ChartRange;
  readonly startMs: number;
  readonly endMs: number;
  /** Days in the range, with or without a value. */
  readonly prices: readonly PriceRow[];
  /** Fiscal years that overlap the range, oldest first. */
  readonly years: readonly FiscalYearView[];
  /** Listing day of the token, when the chart has a price series. */
  readonly listedOnMs: number | null;
  /** The range starts before the listing, so the chart marks where the price begins. */
  readonly showsListing: boolean;
  readonly priceDomain: readonly [number, number] | null;
  readonly moneyDomain: readonly [number, number] | null;
  /** Days in the range without a value. */
  readonly gapDays: number;
  readonly drawsPrice: boolean;
  readonly drawsFigures: boolean;
};

/** What a drawn chart shows in its range: the price line only, the annual figures only, or both (names the readout's hint). */
export type ChartContent = "price" | "figures" | "both";

export function chartContent(model: Pick<ChartModel, "drawsPrice" | "drawsFigures">): ChartContent {
  if (model.drawsPrice && model.drawsFigures) return "both";
  return model.drawsPrice ? "price" : "figures";
}

/** Ranges worth offering: a financials-only chart has only the whole history. */
export function availableRanges(data: ChartData): readonly ChartRange[] {
  return data.price && data.price.points.length > 0 ? CHART_RANGES : ["all"];
}

function fiscalYears(data: ChartData): FiscalYearView[] {
  const byYear = new Map<number, FinancialPoint[]>();
  for (const point of data.financials?.points ?? []) byYear.set(point.fiscal_year, [...(byYear.get(point.fiscal_year) ?? []), point]);
  const years = [...byYear.entries()].sort(([a], [b]) => a - b);
  const views: FiscalYearView[] = [];
  for (const [fiscalYear, points] of years) {
    const periodEnd = points[0]!.period_end;
    const endMs = dayMs(periodEnd);
    if (!Number.isFinite(endMs)) continue;
    const given = points.find((point) => point.period_start)?.period_start;
    const previous = views.at(-1);
    // Without a stated start, the year begins the day after the previous one ended (or one year before its end).
    const startMs = given ? dayMs(given) : previous ? previous.endMs + DAY_MS : addMonthsUtc(endMs, -12) + DAY_MS;
    const figure = (metric: FinancialMetric) => points.find((point) => point.metric === metric) ?? null;
    views.push({ fiscalYear, startMs, endMs, periodEnd, figures: { revenue: figure("revenue"), net_income_parent: figure("net_income_parent") } });
  }
  return views;
}

function paddedDomain(low: number, high: number, padding: number): readonly [number, number] {
  const span = high - low || Math.abs(high) || 1;
  return [low - span * padding, high + span * padding];
}

/** The model of one range. */
export function chartModel(data: ChartData, range: ChartRange): ChartModel {
  const allYears = fiscalYears(data);
  const points = data.price?.points ?? [];
  const priceEnd = data.price ? dayMs(data.price.as_of) : Number.NaN;
  const yearsEnd = allYears.at(-1)?.endMs ?? Number.NaN;
  const endMs = Math.max(...[priceEnd, yearsEnd].filter(Number.isFinite));
  const listedOnMs = data.price ? dayMs(data.price.listed_on) : null;
  const months = CHART_CONFIG.rangeMonths[range];
  const earliest = Math.min(...[allYears[0]?.startMs, listedOnMs ?? undefined].filter((value): value is number => typeof value === "number" && Number.isFinite(value)));
  const startMs = months === null ? earliest : Math.max(earliest, addMonthsUtc(endMs, -months));

  const prices = points.map((point) => ({ t: dayMs(point.date), point })).filter((row) => row.t >= startMs && row.t <= endMs);
  const years = allYears.filter((year) => year.endMs >= startMs && year.startMs <= endMs);

  const values = prices.flatMap((row) => (row.point.value === null ? [] : [row.point.value]));
  const priceDomain = values.length ? paddedDomain(Math.min(...values), Math.max(...values), CHART_CONFIG.priceDomainPadding) : null;
  const figures = years.flatMap((year) => Object.values(year.figures).filter((figure): figure is FinancialPoint => figure !== null && isDrawableFigure(figure)).map((figure) => figure.value));
  const moneyLow = Math.min(0, ...figures);
  const moneyHigh = Math.max(0, ...figures);
  const moneySpan = moneyHigh - moneyLow || 1;
  const moneyDomain = figures.length
    ? ([moneyLow < 0 ? moneyLow - moneySpan * CHART_CONFIG.moneyDomainPadding : 0, moneyHigh + moneySpan * CHART_CONFIG.moneyDomainPadding] as const)
    : null;

  return {
    range,
    startMs,
    endMs,
    prices,
    years,
    listedOnMs,
    showsListing: listedOnMs !== null && listedOnMs > startMs && listedOnMs <= endMs,
    priceDomain,
    moneyDomain,
    gapDays: prices.length - values.length,
    drawsPrice: values.length > 0,
    drawsFigures: figures.length > 0,
  };
}

/** Month steps tried for x axis ticks, smallest first. */
const TICK_MONTH_STEPS = [1, 3, 6, 12, 24, 36, 60] as const;

/** First-of-month (UTC) ticks inside the range, at the smallest step that keeps at most `maxTicks`. */
export function xTicks(startMs: number, endMs: number, maxTicks: number): number[] {
  const start = new Date(startMs);
  const firstMonth = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1);
  for (const step of TICK_MONTH_STEPS) {
    // Walk month starts; keep those on the step's grid (quarter starts, Januaries of every n-th year).
    const ticks: number[] = [];
    for (let tick = firstMonth; tick <= endMs; tick = addMonthsUtc(tick, 1)) {
      if (tick < startMs) continue;
      const date = new Date(tick);
      const onGrid = step < 12 ? date.getUTCMonth() % step === 0 : date.getUTCMonth() === 0 && date.getUTCFullYear() % (step / 12) === 0;
      if (onGrid) ticks.push(tick);
    }
    if (ticks.length <= maxTicks) return ticks;
  }
  return [startMs, endMs];
}

/** One x axis tick: a calendar tick (`periodEnd: null`), or a fiscal year under its bars. */
export type XAxisTick = { readonly t: number; readonly periodEnd: IsoDate | null };

/**
 * The x axis ticks of one range. A chart that draws figures for two or more
 * fiscal years is labelled by fiscal year (the bars are what the axis names):
 * one tick in the middle of each labelled year's visible span, every n-th
 * year counted back from the newest, so the newest year is always labelled.
 * Any other chart gets calendar ticks (`xTicks`).
 */
export function xAxisTicks(model: ChartModel, maxTicks: number): XAxisTick[] {
  const years = model.drawsFigures ? model.years.filter((year) => Object.values(year.figures).some((figure) => figure !== null && isDrawableFigure(figure))) : [];
  if (years.length < 2) return xTicks(model.startMs, model.endMs, maxTicks).map((t) => ({ t, periodEnd: null }));
  const step = Math.ceil(years.length / Math.max(1, maxTicks));
  const ticks: XAxisTick[] = [];
  for (let index = years.length - 1; index >= 0; index -= step) {
    const year = years[index]!;
    const start = Math.max(year.startMs, model.startMs);
    const end = Math.min(year.endMs, model.endMs);
    ticks.unshift({ t: Math.round((start + end) / 2), periodEnd: year.periodEnd });
  }
  return ticks;
}

/** The day nearest to `t` among the range's days, or `null` when the range has none. */
export function nearestPriceIndex(prices: readonly PriceRow[], t: number): number | null {
  if (prices.length === 0) return null;
  let low = 0;
  let high = prices.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (prices[middle]!.t < t) low = middle + 1;
    else high = middle;
  }
  if (low > 0 && Math.abs(prices[low - 1]!.t - t) <= Math.abs(prices[low]!.t - t)) return low - 1;
  return low;
}

/** The last day with a value (for the comparison with a Pyth reference price). */
export function latestTrade(data: ChartData): (PricePoint & { readonly value: number }) | null {
  const points = data.price?.points ?? [];
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index]!;
    if (point.value !== null) return point;
  }
  return null;
}

/**
 * The last trade the price comparison panel compares with Pyth: from the
 * page's price file reference, or (fixture data) the inline series, whose
 * sample value stands for one share.
 */
export function comparableTrade(data: ChartData): LatestTrade | null {
  if (data.priceFile) return data.priceFile.latest;
  const inline = data.price?.fixture ? latestTrade(data) : null;
  return inline ? { ...inline, per_share: inline.value } : null;
}

/** What the chart shows as selected: one day, or one figure of one fiscal year. */
export type ChartSelection =
  | { readonly kind: "price"; readonly index: number }
  | { readonly kind: "figure"; readonly fiscalYear: number; readonly metric: FinancialMetric };

/** Round steps (1, 2, 2.5, 5 times a power of ten) for y axis ticks. */
const NICE_STEP_FACTORS = [1, 2, 2.5, 5, 10] as const;

/** At most `count` round ticks inside `[low, high]`, including 0 when it is in range. */
export function niceTicks(low: number, high: number, count: number): number[] {
  const span = high - low;
  if (!(span > 0) || count < 2) return [low];
  const rough = span / (count - 1);
  const power = 10 ** Math.floor(Math.log10(rough));
  for (const factor of NICE_STEP_FACTORS) {
    const step = factor * power;
    const ticks: number[] = [];
    for (let tick = Math.ceil(low / step) * step; tick <= high + step * 1e-9; tick += step) ticks.push(Number(tick.toPrecision(12)));
    if (ticks.length <= count) return ticks;
  }
  return [low, high];
}

/** Whether the range is long enough that its time axis is labelled by year alone. */
export function labelsByYear(startMs: number, endMs: number): boolean {
  return endMs - startMs > CHART_CONFIG.yearLabelMinYears * 365 * DAY_MS;
}
