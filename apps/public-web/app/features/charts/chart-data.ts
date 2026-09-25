/**
 * The data contract of the price and financials charts (company and product
 * pages). Browser-safe: plain types, no I/O. The field names are the ones
 * the two data sources publish, so the adapters below stay thin:
 *
 *  - daily on-chain trade prices of an xStock, built from executed swaps in
 *    one reviewed xStock/USDC pool on Solana (`@benten/pricing/onchain-daily`);
 *  - annual SEC figures of a US-listed company (the registry's
 *    `getAnnualFactSeries`), each value tied to the annual report (10-K,
 *    20-F or 40-F) that covers it.
 *
 * A price point is never a quote, a NAV or a Pyth value: it is what one
 * executed swap paid. A figure is drawn only when its status is
 * `verified_reported`; an `unverified_or_derived` figure is listed as not
 * verified against the filing, and an excluded fact has no point.
 *
 * The daily prices of a real series are not in the page: the page carries a
 * `PriceFileRef` (identity, dates, pool, the last day with a value) and the
 * section reads the days from the ticker's static file after hydration (see
 * `price-file.ts`). Only fixture data carries its days inline.
 */
import type { OnchainDailySeries, OnchainUnavailableReason } from "@benten/pricing/onchain-daily";

/** One calendar day, `YYYY-MM-DD` (an NYSE session date in New York for a real series). */
export type IsoDate = string;

/**
 * Why a day in the price series has no value: exactly the reasons the
 * on-chain series gives for a session without a verified trade.
 *  - `no_single_swap_in_search_window`: no transaction near the close in the pool was shown to be exactly one swap;
 *  - `verification_budget_exhausted`: there were more transactions near the close than the build checks;
 *  - `ledger_instructions_unavailable`: the ledger did not return the details of the transactions to check;
 *  - `signature_page_limit`: the pool's transaction list near the close was longer than the build reads.
 */
const GAP_REASONS = {
  no_single_swap_in_search_window: true,
  verification_budget_exhausted: true,
  ledger_instructions_unavailable: true,
  signature_page_limit: true,
} as const satisfies Record<OnchainUnavailableReason, true>;
export type PriceGapReason = keyof typeof GAP_REASONS;
/** Checked against the source's reason type: a reason added there fails the type check here. */
export const PRICE_GAP_REASONS = Object.keys(GAP_REASONS) as readonly PriceGapReason[];

/**
 * One day of the on-chain trade price.
 *
 * `value` is in USDC per token: the executed swap's USDC amount over its
 * token amount, before the token's display multiplier (Token-2022 Scaled UI
 * amount). It is therefore not the price of one underlying share; the chart
 * says so next to the line. `tx_signature`, `pool` and `slot` identify the
 * executed swap (the one swap nearest the NYSE close in `pool`). A day
 * without a verified trade carries its reason.
 */
export type PricePoint =
  | {
      readonly date: IsoDate;
      readonly value: number;
      readonly tx_signature: string;
      readonly pool: string;
      readonly slot: number;
    }
  | {
      readonly date: IsoDate;
      readonly value: null;
      readonly reason: PriceGapReason;
    };

export type ObservedPricePoint = Extract<PricePoint, { readonly value: number }>;

/**
 * One pool the swaps are from: its address and the DEX that runs it. The
 * read model gives the DEX's id (`orca`); the build replaces it with its
 * display name (`price-files.server.ts`), so no DEX name is client code.
 */
export type PricePool = { readonly address: string; readonly dex: string };

/** What a price series is, without its days. */
export type PriceSeriesHeader = {
  /** The token the swaps bought or sold (display symbol and exact mint). */
  readonly symbol: string;
  readonly mint: string;
  /** First day of the series (the first session after its pool existed): the chart draws no price before it. */
  readonly listed_on: IsoDate;
  /** Last day the series covers. */
  readonly as_of: IsoDate;
  /** Every pool the points come from, for the source note and the readout. */
  readonly pools: readonly PricePool[];
};

export type PriceSeries = PriceSeriesHeader & {
  /** Ascending by date, one entry per day (per session for a real series) from `listed_on` to `as_of`. */
  readonly points: readonly PricePoint[];
  /** Set only on fixture data: the page then says so. */
  readonly fixture?: true;
};

/**
 * The last trade of a series, for the Pyth comparison: its price per token
 * and, when the display multiplier in effect at that trade is known, its
 * value in USDC for one underlying share (`per_share`), else `null`.
 */
export type LatestTrade = ObservedPricePoint & { readonly per_share: number | null };

/**
 * A price series the page does not carry: where its days are (`file`, a
 * same-origin static JSON file), how many there are, and its last trade (for
 * the Pyth comparison, which the page shows before the file loads).
 */
export type PriceFileRef = PriceSeriesHeader & {
  readonly ticker: string;
  readonly file: string;
  readonly days: number;
  readonly latest: LatestTrade | null;
};

/** The annual figures the charts draw (left axis), by their registry fact names. */
export const FINANCIAL_METRICS = ["revenue", "net_income_parent"] as const;
export type FinancialMetric = (typeof FINANCIAL_METRICS)[number];

/**
 * How a figure was established, as the registry states it. Only
 * `verified_reported` is drawn; an `unverified_or_derived` point is listed as
 * "not verified against the filing" and never drawn. A fact the registry
 * excludes has no point at all.
 */
export const FINANCIAL_STATUSES = ["verified_reported", "unverified_or_derived"] as const;
export type FinancialStatus = (typeof FINANCIAL_STATUSES)[number];

/**
 * One annual figure of one fiscal year, with the filing that states it. The
 * fields are the subset of the registry's `AnnualFactPoint`
 * (`getAnnualFactSeries`) the charts read, so a registry point is one of
 * these once its metric is one the chart draws.
 */
export type FinancialPoint = {
  readonly fiscal_year: number;
  /** Calendar month (1-12) the fiscal year ends in. */
  readonly fiscal_month: number;
  /** First day of the fiscal year (the bar spans the year); `null` when the source gives none. */
  readonly period_start: IsoDate | null;
  readonly period_end: IsoDate;
  readonly metric: FinancialMetric;
  readonly value: number;
  readonly unit: "USD";
  readonly status: FinancialStatus;
  /** The annual report: SEC accession number, form, filing date and document URL. */
  readonly accession: string;
  readonly form: string;
  readonly filed: IsoDate;
  readonly filing_url: string;
};

export type FinancialSeries = {
  /** Fiscal-year ascending. */
  readonly points: readonly FinancialPoint[];
  readonly fixture?: true;
};

/**
 * What one chart receives. Either part may be missing: a company without an
 * xStock price series gets a financials-only chart, a private company's
 * token gets a price-only chart. With neither, no chart is shown.
 *
 * The price is either inline (`price`: fixture data) or in a static file
 * (`priceFile`: real series), never both.
 */
export type ChartData = {
  readonly price: PriceSeries | null;
  readonly priceFile?: PriceFileRef | null;
  readonly financials: FinancialSeries | null;
};

/** The price series header of a chart, inline or in a file; `null` without a price. */
export function priceHeader(data: ChartData): PriceSeriesHeader | null {
  return data.price ?? data.priceFile ?? null;
}

/** A figure that may be drawn: reported exactly by its filing, with a finite value. */
export function isDrawableFigure(point: FinancialPoint): boolean {
  return point.status === "verified_reported" && Number.isFinite(point.value);
}

/** Whether a chart has anything to show at all. */
export function hasChartData(data: ChartData | null): data is ChartData {
  if (!data) return false;
  return (data.price?.points.length ?? 0) > 0 || (data.priceFile?.days ?? 0) > 0 || (data.financials?.points.length ?? 0) > 0;
}

/* -------------------------------------------------------------------------- */
/* Adapters from the two read models.                                         */
/* -------------------------------------------------------------------------- */

/**
 * The chart's price series from the on-chain daily read model of one xStock
 * (`onchainDailySeries(ticker)`, called from `app/lib/price-files.server.ts`).
 *
 * The value is `usdcPerUnscaledToken` (USDC per token, before the display
 * multiplier), converted from its exact decimal string: the one value every
 * observed session has. The per-share value exists only where the multiplier
 * in effect at the trade is known, so it is not drawn; the Pyth comparison
 * uses it for the last trade alone (`PriceFileRef.latest.per_share`).
 */
export function priceSeriesFromReadModel(model: OnchainDailySeries): PriceSeries {
  const points = model.points.map((point): PricePoint => {
    if (point.status === "unavailable" || point.usdcPerUnscaledToken === null || !point.signature || point.slot === null) {
      return { date: point.date, value: null, reason: point.reason ?? "ledger_instructions_unavailable" };
    }
    return { date: point.date, value: Number(point.usdcPerUnscaledToken), tx_signature: point.signature, pool: point.pool, slot: point.slot };
  });
  return { symbol: model.symbol, mint: model.mint, listed_on: model.firstDate, as_of: model.lastDate, pools: [{ address: model.pool.address, dex: model.pool.dex }], points };
}

/** A registry annual fact point (`AnnualFactPoint`), as far as the chart reads it: any metric. */
export type AnnualFactPointInput = Omit<FinancialPoint, "metric" | "status" | "unit"> & { readonly metric: string; readonly status: string; readonly unit: string };

function isFinancialPoint(point: AnnualFactPointInput): point is AnnualFactPointInput & Pick<FinancialPoint, "metric" | "status" | "unit"> {
  return (FINANCIAL_METRICS as readonly string[]).includes(point.metric)
    && (FINANCIAL_STATUSES as readonly string[]).includes(point.status)
    && point.unit === "USD";
}

/**
 * The chart's figures from the registry's annual series of one company:
 * `financialSeriesFromAnnualFacts(getAnnualFactSeries(ticker, { metrics: [...FINANCIAL_METRICS] }))`
 * (called from `app/lib/chart.server.ts`). Keeps the metrics the chart
 * draws, in USD, in the registry's fiscal-year order, and copies only the
 * fields of `FinancialPoint`: nothing else of a registry point reaches the
 * page's loader data.
 */
export function financialSeriesFromAnnualFacts(points: readonly AnnualFactPointInput[]): FinancialSeries | null {
  const kept: FinancialPoint[] = points.filter(isFinancialPoint).map((point) => ({
    fiscal_year: point.fiscal_year,
    fiscal_month: point.fiscal_month,
    period_start: point.period_start,
    period_end: point.period_end,
    metric: point.metric,
    value: point.value,
    unit: point.unit,
    status: point.status,
    accession: point.accession,
    form: point.form,
    filed: point.filed,
    filing_url: point.filing_url,
  }));
  return kept.length ? { points: kept } : null;
}
