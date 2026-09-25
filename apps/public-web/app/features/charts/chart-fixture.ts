/**
 * FIXTURE, NOT MARKET OR FILING DATA. A deterministic NVIDIA-shaped chart
 * data set for building and reviewing the charts before the real series
 * land: about 450 days of on-chain trade prices from an xStock listing in
 * mid-2025, and eleven fiscal years of annual figures ending in late
 * January. Every number, signature, accession number and slot is generated
 * here; none is NVIDIA's, and the links lead to generic pages.
 *
 * Imported by the build-time chart source (only when the fixture flag is on)
 * and by the development-only Living Catalog; never by a page component.
 */
import { FINANCIAL_METRICS, type ChartData, type FinancialPoint, type IsoDate, type PriceGapReason, type PricePoint, type PriceSeries } from "./chart-data";

/** Small deterministic generator (mulberry32), so the fixture is the same on every build. */
function generator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function fakeSignature(random: () => number): string {
  return Array.from({ length: 88 }, () => BASE58[Math.floor(random() * BASE58.length)]).join("");
}

export function isoDay(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10);
}

export const DAY_MS = 86_400_000;

export const FIXTURE_LISTED_ON: IsoDate = "2025-06-30";
export const FIXTURE_AS_OF: IsoDate = "2026-09-23";
/** The fixture's pool is labelled as a sample, not as a DEX. */
export const FIXTURE_DEX = "fixture";

/** Days without a value, to exercise gaps: a few days without a single swap and two the ledger left unreadable. */
const FIXTURE_GAPS: Readonly<Record<IsoDate, PriceGapReason>> = {
  "2025-07-05": "no_single_swap_in_search_window",
  "2025-07-06": "no_single_swap_in_search_window",
  "2025-11-27": "ledger_instructions_unavailable",
  "2026-03-14": "verification_budget_exhausted",
};

export function fixturePriceSeries(options: { readonly symbol: string; readonly mint: string; readonly pool: string; readonly start?: number; readonly seed?: number }): PriceSeries {
  const random = generator(options.seed ?? 20250630);
  const first = Date.parse(`${FIXTURE_LISTED_ON}T00:00:00Z`);
  const last = Date.parse(`${FIXTURE_AS_OF}T00:00:00Z`);
  const points: PricePoint[] = [];
  let value = options.start ?? 150;
  for (let day = first, index = 0; day <= last; day += DAY_MS, index += 1) {
    // A drifting random walk with a slow swing, in USDC per token.
    value *= 1 + (random() - 0.485) * 0.024 + Math.sin(index / 38) * 0.0025;
    const date = isoDay(day);
    const gap = FIXTURE_GAPS[date];
    points.push(gap
      ? { date, value: null, reason: gap }
      : { date, value: Math.round(value * 100) / 100, tx_signature: fakeSignature(random), pool: options.pool, slot: 350_000_000 + index * 216_000 + Math.floor(random() * 1000) });
  }
  return { symbol: options.symbol, mint: options.mint, listed_on: FIXTURE_LISTED_ON, as_of: FIXTURE_AS_OF, pools: [{ address: options.pool, dex: FIXTURE_DEX }], points, fixture: true };
}

/** The last Sunday of January of a year: the shape of a 52/53-week fiscal year end. */
export function lastSundayOfJanuary(year: number): number {
  const end = Date.UTC(year, 0, 31);
  return end - new Date(end).getUTCDay() * DAY_MS;
}

/** Fixture revenue (USD) by fiscal year: an invented growth curve, not a reported amount. */
export const FIXTURE_REVENUE_BILLIONS = [4.2, 5.6, 7.9, 9.3, 8.7, 13.1, 21.4, 22.6, 48.8, 97.5, 151.0] as const;
/** Fixture net income as a share of fixture revenue. */
export const FIXTURE_MARGINS = [0.11, 0.2, 0.28, 0.31, 0.24, 0.27, 0.35, 0.17, 0.46, 0.52, 0.5] as const;
export const FIXTURE_FIRST_YEAR = 2016;
/** Days from a fixture fiscal year end to its fixture filing. */
export const FIXTURE_FILING_LAG_DAYS = 25;

/** Figures that are gaps in the fixture: one fact the registry excludes (no point), one value not verified against the filing. */
const FIXTURE_EXCLUDED = { fiscalYear: 2016, metric: "net_income_parent" } as const;
export const FIXTURE_UNVERIFIED = { fiscalYear: 2020, metric: "revenue" } as const;

export function fixtureFinancialPoints(): FinancialPoint[] {
  const points: FinancialPoint[] = [];
  FIXTURE_REVENUE_BILLIONS.forEach((revenue, index) => {
    const fiscalYear = FIXTURE_FIRST_YEAR + index;
    const endMs = lastSundayOfJanuary(fiscalYear);
    const startMs = lastSundayOfJanuary(fiscalYear - 1) + DAY_MS;
    const accession = `0000000000-${String(fiscalYear).slice(2)}-${String(index + 1).padStart(6, "0")}`;
    const values = { revenue: revenue * 1e9, net_income_parent: Math.round(revenue * FIXTURE_MARGINS[index]! * 10) / 10 * 1e9 };
    for (const metric of FINANCIAL_METRICS) {
      if (fiscalYear === FIXTURE_EXCLUDED.fiscalYear && metric === FIXTURE_EXCLUDED.metric) continue;
      const unverified = fiscalYear === FIXTURE_UNVERIFIED.fiscalYear && metric === FIXTURE_UNVERIFIED.metric;
      points.push({
        fiscal_year: fiscalYear,
        fiscal_month: 1,
        period_start: isoDay(startMs),
        period_end: isoDay(endMs),
        metric,
        value: values[metric],
        unit: "USD",
        status: unverified ? "unverified_or_derived" : "verified_reported",
        accession,
        form: "10-K",
        filed: isoDay(endMs + FIXTURE_FILING_LAG_DAYS * DAY_MS),
        filing_url: "https://www.sec.gov/search-filings",
      });
    }
  });
  return points;
}

/** The whole fixture of one company page: price series and annual figures. */
export function fixtureChartData(options: { readonly symbol: string; readonly mint: string; readonly pool: string }): ChartData {
  return { price: fixturePriceSeries(options), financials: { points: fixtureFinancialPoints(), fixture: true } };
}
