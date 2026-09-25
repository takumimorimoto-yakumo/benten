/**
 * Presenter for the bundled on-chain daily price series.
 *
 * Every price here is the executed price of one swap in one reviewed
 * xStock/USDC pool on Solana, read from the public ledger when the artifact
 * was built. It is never a quote, a bid or ask, a reference price or a
 * valuation, and this module never reaches the network. Each point names its
 * transaction signature and pool, so any value can be re-derived from the
 * ledger.
 *
 * Inputs pass the registry allowlist (`resolveTicker` / `resolveMint`)
 * before the series is looked up by exact ticker.
 */
import { resolveMint, resolveTicker } from "@benten/registry";
import { ONCHAIN_DAILY, onchainDailySeries, onchainDailyTickers } from "@benten/pricing/onchain-daily";
import { DISCLAIMER } from "./envelope.js";

export const ONCHAIN_PRICES_SCHEMA_VERSION = "onchain-daily.v1";

export const ONCHAIN_PRICES_NOTE =
  "Each price is the executed price of one on-chain swap in the named xStock/USDC pool, read from the public Solana ledger (see signature and pool). It is not a quote, a bid or ask, or a reference price, and one swap near the session close does not represent the market for the whole day.";

export const ONCHAIN_PRICES_SOURCE =
  "Solana mainnet ledger: one successful single swap per NYSE session in a reviewed xStock/USDC pool, nearest the session close, read at build time";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface OnchainPricesInput {
  ticker?: string;
  mint?: string;
  from?: string;
  to?: string;
}

export interface OnchainPricesResult {
  [key: string]: unknown;
  schema_version: typeof ONCHAIN_PRICES_SCHEMA_VERSION;
  artifact: { revision: string; generated_at: string };
  data: Record<string, unknown>;
  source: typeof ONCHAIN_PRICES_SOURCE;
  note: typeof ONCHAIN_PRICES_NOTE;
  not_quote: true;
  disclaimer: typeof DISCLAIMER;
}

function result(data: object): OnchainPricesResult {
  return {
    schema_version: ONCHAIN_PRICES_SCHEMA_VERSION,
    artifact: { revision: ONCHAIN_DAILY.revision, generated_at: ONCHAIN_DAILY.generated_at },
    data: data as Record<string, unknown>,
    source: ONCHAIN_PRICES_SOURCE,
    note: ONCHAIN_PRICES_NOTE,
    not_quote: true,
    disclaimer: DISCLAIMER,
  };
}

type MissingReason = "invalid_input" | "unknown_ticker" | "unknown_mint" | "not_covered";

function missing(reason: MissingReason, requested: string | null): OnchainPricesResult {
  return result({
    found: false,
    reason,
    requested_identifier: requested,
    covered_tickers: onchainDailyTickers(),
    retryable: false,
  });
}

/** A real calendar date in `YYYY-MM-DD`, or `null`. */
function calendarDate(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (!DATE.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

export function getOnchainPriceHistory(input: OnchainPricesInput = {}): OnchainPricesResult {
  const hasTicker = input.ticker !== undefined;
  const hasMint = input.mint !== undefined;
  const requested = input.ticker ?? input.mint ?? null;
  if (hasTicker === hasMint) return missing("invalid_input", requested);
  const from = calendarDate(input.from);
  const to = calendarDate(input.to);
  if (from === null || to === null || (from !== undefined && to !== undefined && from > to)) return missing("invalid_input", requested);

  const entry = hasTicker ? resolveTicker(input.ticker!) : resolveMint(input.mint!);
  if (!entry) return missing(hasTicker ? "unknown_ticker" : "unknown_mint", requested);
  const series = onchainDailySeries(entry.ticker);
  if (!series || series.mint !== entry.mint) return missing("not_covered", requested);

  const points = series.points.filter((point) => (from === undefined || point.date >= from) && (to === undefined || point.date <= to));
  const observed = points.filter((point) => point.status === "observed").length;
  return result({
    found: true,
    identity: { ticker: series.ticker, symbol: series.symbol, mint: series.mint },
    pool: { address: series.pool.address, dex: series.pool.dex, program: series.pool.program },
    period: {
      from: points[0]?.date ?? null,
      to: points.at(-1)?.date ?? null,
      series_first_date: series.firstDate,
      series_last_date: series.lastDate,
    },
    price_basis: {
      canonical: "usdc_per_unscaled_token",
      canonical_statement: "USDC per unscaled token: the USDC vault change divided by the xStock vault change, each divided by 10^decimals; the Token-2022 Scaled UI multiplier is not applied.",
      per_share: "usdc_per_underlying_share",
      per_share_statement: "USDC per underlying share (per displayed unit): the unscaled price divided by the Scaled UI multiplier in effect at the trade. Given only where that multiplier is known; past multipliers are not stored on chain.",
      multiplier_known_from: series.multiplierBasis?.known_from ?? null,
      known_multiplier: series.multiplierBasis?.known_multiplier ?? null,
      session_close: "16:00 America/New_York, 13:00 on NYSE early-close days; NYSE full closures have no point",
    },
    coverage: { sessions: points.length, observed, unavailable: points.length - observed },
    points: points.map((point) => ({
      date: point.date,
      session_close_utc: point.sessionCloseUtc,
      status: point.status,
      usdc_per_unscaled_token: point.usdcPerUnscaledToken,
      usdc_per_underlying_share: point.usdcPerUnderlyingShare,
      reason: point.reason,
      source: point.status === "observed"
        ? {
          signature: point.signature,
          pool: point.pool,
          slot: point.slot,
          block_time: point.blockTime,
          usdc_raw: point.usdcRaw,
          xstock_raw: point.xstockRaw,
        }
        : null,
    })),
  });
}

export function onchainPricesServiceUnavailable(): OnchainPricesResult {
  return result({ found: false, reason: "service_unavailable", requested_identifier: null, covered_tickers: [], retryable: true });
}
