/**
 * The bundled on-chain daily price series (`onchain-daily-v1.json`): for each
 * covered xStock, one executed swap in one reviewed xStock/USDC pool nearest
 * each NYSE session close, read from the public Solana ledger at build time.
 *
 * A point is an executed trade price, never a quote. The canonical value is
 * USDC per unscaled token (raw amount / 10^decimals, before the Token-2022
 * Scaled UI multiplier). A per-share value is present only where the
 * multiplier in effect at the trade is known.
 *
 * The artifact is validated when this module loads and the process fails
 * closed on any violation: unknown keys, a series whose mint, ticker or
 * decimals disagree with the registry-derived supported products, a pool that
 * is not the reviewed pool of its ticker, a date set that is not exactly the
 * calendar's sessions, a price that is not the exact truncated quotient of its
 * raw amounts, a per-share value outside the known-multiplier period, or
 * slots that do not increase. Lookups are exact; nothing matches by name.
 *
 * Import this module from `@benten/pricing/onchain-daily`; it is kept out of
 * the package index so browser bundles that do not show the series never load
 * the artifact.
 */

import dailyJson from "./onchain-daily-v1.json" with { type: "json" };
import poolsJson from "./onchain-pools-v1.json" with { type: "json" };
import { supportedProductForMint, SUPPORTED_PRODUCTS } from "@benten/solana/supported-products";
import { newYorkTimeToUtc, sessionDates, usdcPerUnderlyingShare, usdcPerUnscaledToken, type SessionCalendar } from "./onchain-price.js";

export const ONCHAIN_DAILY_SCHEMA_VERSION = "benten.onchain-daily.v1";
export const ONCHAIN_POOLS_SCHEMA_VERSION = "benten.onchain-pools.v1";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export const UNAVAILABLE_REASONS = [
  "no_single_swap_in_search_window",
  "verification_budget_exhausted",
  "ledger_instructions_unavailable",
  "signature_page_limit",
] as const;
export type OnchainUnavailableReason = (typeof UNAVAILABLE_REASONS)[number];

export interface OnchainPool {
  address: string;
  dex: string;
  program: string;
  xstock_vault: string;
  usdc_vault: string;
}

export interface MultiplierBasis {
  read_slot: number;
  read_at: string;
  stored_multiplier: string;
  next_multiplier: string;
  next_multiplier_effective_at: string;
  /** The multiplier known to be in effect from `known_from` until `read_at`; `null` when none is known. */
  known_multiplier: string | null;
  known_from: string | null;
}

export type OnchainDailyPointV1 =
  | {
    date: string;
    status: "observed";
    close_slot: number;
    usdc_per_unscaled_token: string;
    usdc_per_underlying_share: string | null;
    signature: string;
    slot: number;
    block_time: string;
    usdc_raw: string;
    xstock_raw: string;
  }
  | { date: string; status: "unavailable"; close_slot: number; reason: OnchainUnavailableReason };

export interface OnchainDailySeriesV1 {
  ticker: string;
  symbol: string;
  mint: string;
  xstock_decimals: number;
  usdc_mint: string;
  usdc_decimals: number;
  pool: OnchainPool;
  first_date: string;
  last_date: string;
  multiplier_basis: MultiplierBasis | null;
  points: OnchainDailyPointV1[];
}

export interface OnchainDailyV1 {
  schema_version: typeof ONCHAIN_DAILY_SCHEMA_VERSION;
  revision: string;
  generated_at: string;
  network: "solana-mainnet";
  statement: string;
  method: {
    close_slot: string;
    selection: string;
    single_swap_proof: string;
    price: string;
    per_share: string;
    min_usdc_raw: string;
    max_slot_distance: number;
  };
  session_calendar: SessionCalendar & { sources: Array<{ years: number[]; url: string; checked_at: string; finding: string }> };
  series: OnchainDailySeriesV1[];
}

export interface OnchainPoolEntry extends OnchainPool {
  ticker: string;
  symbol: string;
  xstock_mint: string;
  xstock_decimals: number;
  usdc_mint: string;
  usdc_decimals: number;
  created_at: string;
  selection: {
    rule: "longest_recent_activity";
    observed_at: string;
    /** Successful pool transactions in the 24 hours before each probe instant (a floor at 1000); `null` before the pool existed. */
    probes: Array<{ at: string; successful_24h: number | null }>;
  };
  checked_at: string;
}

export interface OnchainPoolsV1 {
  schema_version: typeof ONCHAIN_POOLS_SCHEMA_VERSION;
  checked_at: string;
  selection: { directory: string; rule: string };
  pools: OnchainPoolEntry[];
}

const ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const CLOCK = /^\d{2}:\d{2}$/;
const INTEGER = /^-?[1-9]\d{0,39}$/;
const PRICE = /^\d{1,12}\.\d{6}$/;
const MULTIPLIER = /^\d{1,6}(\.\d{1,20})?$/;

function fail(message: string): never {
  throw new Error(`invalid on-chain daily series: ${message}`);
}

function keysExactly(value: unknown, keys: readonly string[], where: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${where} must be an object`);
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(`${where} has unexpected keys`);
  return record;
}

function text(value: unknown, where: string, max = 512): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max) fail(`${where} must be a short string`);
  return value;
}

function matches(value: unknown, pattern: RegExp, where: string): string {
  if (typeof value !== "string" || !pattern.test(value)) fail(where);
  return value;
}

function slotNumber(value: unknown, where: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail(`${where} must be a slot`);
  return value as number;
}

function decimals(value: unknown, where: string): number {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 18) fail(where);
  return value as number;
}

function instantSeconds(value: unknown, where: string): number {
  const instant = matches(value, INSTANT, where);
  const ms = Date.parse(instant);
  if (!Number.isFinite(ms)) fail(where);
  return ms / 1000;
}

/** Validate a reviewed pool list. Throws on the first violation. */
export function validateOnchainPools(value: unknown): OnchainPoolsV1 {
  const list = keysExactly(value, ["schema_version", "checked_at", "selection", "pools"], "pool list");
  if (list.schema_version !== ONCHAIN_POOLS_SCHEMA_VERSION) fail("pool list schema_version");
  matches(list.checked_at, DATE, "pool list checked_at");
  const selection = keysExactly(list.selection, ["directory", "rule"], "pool list selection");
  text(selection.directory, "pool list selection.directory");
  text(selection.rule, "pool list selection.rule", 1024);
  if (!Array.isArray(list.pools) || list.pools.length === 0) fail("pool list pools");
  const tickers = new Set<string>();
  const addresses = new Set<string>();
  for (const [index, raw] of list.pools.entries()) {
    const where = `pools[${index}]`;
    const pool = keysExactly(raw, ["ticker", "symbol", "xstock_mint", "xstock_decimals", "usdc_mint", "usdc_decimals", "address", "dex", "program", "xstock_vault", "usdc_vault", "created_at", "selection", "checked_at"], where);
    const product = supportedProductForMint(pool.xstock_mint);
    if (!product || product.kind !== "xstock" || product.ticker !== pool.ticker || product.symbol !== pool.symbol) fail(`${where} is not a supported xStock`);
    decimals(pool.xstock_decimals, `${where}.xstock_decimals`);
    if (pool.usdc_mint !== USDC_MINT || pool.usdc_decimals !== 6) fail(`${where} quote is not USDC`);
    for (const key of ["address", "program", "xstock_vault", "usdc_vault"] as const) matches(pool[key], ADDRESS, `${where}.${key}`);
    text(pool.dex, `${where}.dex`, 64);
    instantSeconds(pool.created_at, `${where}.created_at`);
    matches(pool.checked_at, DATE, `${where}.checked_at`);
    const chosen = keysExactly(pool.selection, ["rule", "observed_at", "probes"], `${where}.selection`);
    if (chosen.rule !== "longest_recent_activity") fail(`${where}.selection.rule`);
    if (!Array.isArray(chosen.probes) || chosen.probes.length === 0) fail(`${where}.selection.probes`);
    for (const [probeIndex, probe] of chosen.probes.entries()) {
      const entry = keysExactly(probe, ["at", "successful_24h"], `${where}.selection.probes[${probeIndex}]`);
      instantSeconds(entry.at, `${where}.selection.probes[${probeIndex}].at`);
      if (entry.successful_24h !== null && (!Number.isSafeInteger(entry.successful_24h) || (entry.successful_24h as number) < 0 || (entry.successful_24h as number) > 1000)) fail(`${where}.selection.probes count`);
    }
    matches(chosen.observed_at, DATE, `${where}.selection.observed_at`);
    if (tickers.has(pool.ticker as string)) fail(`${where} is a second pool for ${pool.ticker}`);
    if (addresses.has(pool.address as string)) fail(`${where} repeats pool ${pool.address}`);
    tickers.add(pool.ticker as string);
    addresses.add(pool.address as string);
  }
  return list as unknown as OnchainPoolsV1;
}

function validateCalendar(value: unknown): OnchainDailyV1["session_calendar"] {
  const calendar = keysExactly(value, ["exchange", "time_zone", "regular_close", "early_close", "full_closures", "early_closes", "sources"], "session_calendar");
  if (calendar.exchange !== "NYSE" || calendar.time_zone !== "America/New_York") fail("session_calendar exchange");
  matches(calendar.regular_close, CLOCK, "session_calendar.regular_close");
  matches(calendar.early_close, CLOCK, "session_calendar.early_close");
  for (const key of ["full_closures", "early_closes"] as const) {
    if (!Array.isArray(calendar[key])) fail(`session_calendar.${key}`);
    for (const date of calendar[key] as unknown[]) matches(date, DATE, `session_calendar.${key}`);
  }
  if (!Array.isArray(calendar.sources) || calendar.sources.length === 0) fail("session_calendar.sources");
  for (const [index, source] of calendar.sources.entries()) {
    const entry = keysExactly(source, ["years", "url", "checked_at", "finding"], `session_calendar.sources[${index}]`);
    if (!Array.isArray(entry.years) || entry.years.some((year) => !Number.isInteger(year))) fail("session_calendar.sources years");
    if (typeof entry.url !== "string" || !entry.url.startsWith("https://")) fail("session_calendar.sources url");
    matches(entry.checked_at, DATE, "session_calendar.sources checked_at");
    text(entry.finding, "session_calendar.sources finding");
  }
  return calendar as unknown as OnchainDailyV1["session_calendar"];
}

function validateBasis(value: unknown, where: string): MultiplierBasis | null {
  if (value === null) return null;
  const basis = keysExactly(value, ["read_slot", "read_at", "stored_multiplier", "next_multiplier", "next_multiplier_effective_at", "known_multiplier", "known_from"], where);
  slotNumber(basis.read_slot, `${where}.read_slot`);
  const readAt = instantSeconds(basis.read_at, `${where}.read_at`);
  matches(basis.stored_multiplier, MULTIPLIER, `${where}.stored_multiplier`);
  matches(basis.next_multiplier, MULTIPLIER, `${where}.next_multiplier`);
  const effectiveAt = instantSeconds(basis.next_multiplier_effective_at, `${where}.next_multiplier_effective_at`);
  // The next multiplier is known to be in effect exactly when it took effect by the read.
  if (effectiveAt <= readAt) {
    if (basis.known_multiplier !== basis.next_multiplier || basis.known_from !== basis.next_multiplier_effective_at) fail(`${where} known multiplier`);
  } else if (basis.known_multiplier !== null || basis.known_from !== null) {
    fail(`${where} claims a multiplier that was not yet in effect`);
  }
  return basis as unknown as MultiplierBasis;
}

function validateSeries(value: unknown, index: number, calendar: SessionCalendar, method: OnchainDailyV1["method"], pools: OnchainPoolsV1): OnchainDailySeriesV1 {
  const where = `series[${index}]`;
  const series = keysExactly(value, ["ticker", "symbol", "mint", "xstock_decimals", "usdc_mint", "usdc_decimals", "pool", "first_date", "last_date", "multiplier_basis", "points"], where);
  const product = supportedProductForMint(series.mint);
  if (!product || product.kind !== "xstock" || product.ticker !== series.ticker || product.symbol !== series.symbol) fail(`${where} is not a supported xStock`);
  const reviewed = pools.pools.find((pool) => pool.ticker === series.ticker);
  if (!reviewed || reviewed.xstock_mint !== series.mint) fail(`${where} has no reviewed pool`);
  if (series.xstock_decimals !== reviewed.xstock_decimals || series.usdc_mint !== USDC_MINT || series.usdc_decimals !== reviewed.usdc_decimals) fail(`${where} decimals or quote`);
  const pool = keysExactly(series.pool, ["address", "dex", "program", "xstock_vault", "usdc_vault"], `${where}.pool`);
  for (const key of ["address", "dex", "program", "xstock_vault", "usdc_vault"] as const) {
    if (pool[key] !== reviewed[key]) fail(`${where}.pool.${key} is not the reviewed pool`);
  }
  const firstDate = matches(series.first_date, DATE, `${where}.first_date`);
  const lastDate = matches(series.last_date, DATE, `${where}.last_date`);
  const basis = validateBasis(series.multiplier_basis, `${where}.multiplier_basis`);
  const knownFrom = basis?.known_from ? Date.parse(basis.known_from) / 1000 : null;

  const sessions = sessionDates(calendar, firstDate, lastDate);
  if (sessions.length === 0 || sessions[0]!.date !== firstDate || sessions.at(-1)!.date !== lastDate) fail(`${where} first/last date is not a session`);
  const createdAt = Date.parse(reviewed.created_at) / 1000;
  const firstClose = Date.parse(newYorkTimeToUtc(sessions[0]!.date, sessions[0]!.close)) / 1000;
  if (firstClose <= createdAt) fail(`${where} starts before its pool existed`);
  const earlier = sessionDates(calendar, reviewed.created_at.slice(0, 10), firstDate).filter((session) => session.date < firstDate);
  if (earlier.some((session) => Date.parse(newYorkTimeToUtc(session.date, session.close)) / 1000 > createdAt)) fail(`${where} omits sessions after its pool existed`);
  if (!Array.isArray(series.points) || series.points.length !== sessions.length) fail(`${where} does not have one point per session`);

  const minUsdc = BigInt(method.min_usdc_raw);
  const signatures = new Set<string>();
  let previousCloseSlot = -1;
  let previousTradeSlot = -1;
  series.points.forEach((raw, pointIndex) => {
    const at = `${where}.points[${pointIndex}]`;
    const session = sessions[pointIndex]!;
    const status = (raw as { status?: unknown } | null)?.status;
    const point = status === "observed"
      ? keysExactly(raw, ["date", "status", "close_slot", "usdc_per_unscaled_token", "usdc_per_underlying_share", "signature", "slot", "block_time", "usdc_raw", "xstock_raw"], at)
      : keysExactly(raw, ["date", "status", "close_slot", "reason"], at);
    if (point.date !== session.date) fail(`${at}.date is not the session ${session.date}`);
    const closeSlot = slotNumber(point.close_slot, `${at}.close_slot`);
    if (closeSlot <= previousCloseSlot) fail(`${at}.close_slot does not increase`);
    previousCloseSlot = closeSlot;
    if (status !== "observed") {
      if (status !== "unavailable" || !(UNAVAILABLE_REASONS as readonly unknown[]).includes(point.reason)) fail(`${at} status or reason`);
      return;
    }
    const signature = matches(point.signature, SIGNATURE, `${at}.signature`);
    if (signatures.has(signature)) fail(`${at}.signature repeats`);
    signatures.add(signature);
    const slot = slotNumber(point.slot, `${at}.slot`);
    if (Math.abs(slot - closeSlot) >= method.max_slot_distance) fail(`${at}.slot is outside the search window`);
    if (slot <= previousTradeSlot) fail(`${at}.slot does not increase`);
    previousTradeSlot = slot;
    const blockTime = instantSeconds(point.block_time, `${at}.block_time`);
    const usdcRaw = matches(point.usdc_raw, INTEGER, `${at}.usdc_raw`);
    const xstockRaw = matches(point.xstock_raw, INTEGER, `${at}.xstock_raw`);
    if (usdcRaw.startsWith("-") === xstockRaw.startsWith("-")) fail(`${at} vault changes are not opposite`);
    const usdcAbs = BigInt(usdcRaw) < 0n ? -BigInt(usdcRaw) : BigInt(usdcRaw);
    if (usdcAbs < minUsdc) fail(`${at} is below the minimum USDC amount`);
    const amounts = { usdcRaw, xstockRaw, usdcDecimals: series.usdc_decimals as number, xstockDecimals: series.xstock_decimals as number };
    matches(point.usdc_per_unscaled_token, PRICE, `${at}.usdc_per_unscaled_token`);
    if (point.usdc_per_unscaled_token !== usdcPerUnscaledToken(amounts)) fail(`${at}.usdc_per_unscaled_token is not its raw amounts' price`);
    const expectedShare = knownFrom !== null && blockTime >= knownFrom ? usdcPerUnderlyingShare(amounts, basis!.known_multiplier!) : null;
    if (point.usdc_per_underlying_share !== expectedShare) fail(`${at}.usdc_per_underlying_share`);
  });
  return series as unknown as OnchainDailySeriesV1;
}

/** Validate an on-chain daily series artifact against a reviewed pool list. Throws on the first violation. */
export function validateOnchainDaily(value: unknown, pools: OnchainPoolsV1): OnchainDailyV1 {
  const artifact = keysExactly(value, ["schema_version", "revision", "generated_at", "network", "statement", "method", "session_calendar", "series"], "artifact");
  if (artifact.schema_version !== ONCHAIN_DAILY_SCHEMA_VERSION) fail("schema_version");
  text(artifact.revision, "revision", 64);
  instantSeconds(artifact.generated_at, "generated_at");
  if (artifact.network !== "solana-mainnet") fail("network");
  text(artifact.statement, "statement");
  const method = keysExactly(artifact.method, ["close_slot", "selection", "single_swap_proof", "price", "per_share", "min_usdc_raw", "max_slot_distance"], "method");
  for (const key of ["close_slot", "selection", "single_swap_proof", "price", "per_share"] as const) text(method[key], `method.${key}`);
  matches(method.min_usdc_raw, /^[1-9]\d{0,18}$/, "method.min_usdc_raw");
  if (!Number.isSafeInteger(method.max_slot_distance) || (method.max_slot_distance as number) <= 0) fail("method.max_slot_distance");
  const calendar = validateCalendar(artifact.session_calendar);
  if (!Array.isArray(artifact.series)) fail("series");
  const series = artifact.series.map((entry, index) => validateSeries(entry, index, calendar, method as unknown as OnchainDailyV1["method"], pools));
  const tickers = new Set<string>();
  for (const entry of series) {
    if (tickers.has(entry.ticker)) fail(`duplicate series ${entry.ticker}`);
    tickers.add(entry.ticker);
  }
  return artifact as unknown as OnchainDailyV1;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

/** The bundled, validated, frozen reviewed pool list. */
export const ONCHAIN_POOLS: OnchainPoolsV1 = deepFreeze(validateOnchainPools(poolsJson));
/** The bundled, validated, frozen series artifact. */
export const ONCHAIN_DAILY: OnchainDailyV1 = deepFreeze(validateOnchainDaily(dailyJson, ONCHAIN_POOLS));

// ---- read model --------------------------------------------------------------

/** One session of a series, in the shape charts and tools read. */
export interface OnchainDailyPoint {
  /** NYSE trading date in America/New_York, `YYYY-MM-DD`. */
  date: string;
  /** The session close the trade was searched around, UTC `YYYY-MM-DDTHH:MM:SSZ`. */
  sessionCloseUtc: string;
  status: "observed" | "unavailable";
  /** USDC per unscaled token (raw / 10^decimals), the canonical value; `null` when unavailable. */
  usdcPerUnscaledToken: string | null;
  /** USDC per underlying share (per displayed unit); `null` unless the multiplier at the trade is known. */
  usdcPerUnderlyingShare: string | null;
  signature: string | null;
  /** The reviewed pool address the trade is from (the series pool, also on unavailable points). */
  pool: string;
  slot: number | null;
  /** Block time of the trade, UTC `YYYY-MM-DDTHH:MM:SSZ`; `null` when unavailable. */
  blockTime: string | null;
  /** Signed raw vault changes of the trade (positive: into the pool); `null` when unavailable. */
  usdcRaw: string | null;
  xstockRaw: string | null;
  /** Why no trade is given; `null` when observed. */
  reason: OnchainUnavailableReason | null;
}

export interface OnchainDailySeries {
  ticker: string;
  symbol: string;
  mint: string;
  pool: OnchainPool;
  firstDate: string;
  lastDate: string;
  multiplierBasis: MultiplierBasis | null;
  points: readonly OnchainDailyPoint[];
}

const closeOf = (calendar: SessionCalendar, date: string) =>
  newYorkTimeToUtc(date, calendar.early_closes.includes(date) ? calendar.early_close : calendar.regular_close);

function readModel(series: OnchainDailySeriesV1): OnchainDailySeries {
  const points = series.points.map((point): OnchainDailyPoint => point.status === "observed"
    ? {
      date: point.date,
      sessionCloseUtc: closeOf(ONCHAIN_DAILY.session_calendar, point.date),
      status: "observed",
      usdcPerUnscaledToken: point.usdc_per_unscaled_token,
      usdcPerUnderlyingShare: point.usdc_per_underlying_share,
      signature: point.signature,
      pool: series.pool.address,
      slot: point.slot,
      blockTime: point.block_time,
      usdcRaw: point.usdc_raw,
      xstockRaw: point.xstock_raw,
      reason: null,
    }
    : {
      date: point.date,
      sessionCloseUtc: closeOf(ONCHAIN_DAILY.session_calendar, point.date),
      status: "unavailable",
      usdcPerUnscaledToken: null,
      usdcPerUnderlyingShare: null,
      signature: null,
      pool: series.pool.address,
      slot: null,
      blockTime: null,
      usdcRaw: null,
      xstockRaw: null,
      reason: point.reason,
    });
  return deepFreeze({
    ticker: series.ticker,
    symbol: series.symbol,
    mint: series.mint,
    pool: series.pool,
    firstDate: series.first_date,
    lastDate: series.last_date,
    multiplierBasis: series.multiplier_basis,
    points,
  });
}

const byTicker = new Map(ONCHAIN_DAILY.series.map((series) => [series.ticker, readModel(series)]));

/**
 * The daily series of one xStock by its exact registry ticker (`NVDA`, not
 * `NVDAx`), or `undefined` for any ticker without a bundled series.
 */
export function onchainDailySeries(ticker: unknown): OnchainDailySeries | undefined {
  if (typeof ticker !== "string") return undefined;
  const product = [...SUPPORTED_PRODUCTS.values()].find((entry) => entry.kind === "xstock" && entry.ticker === ticker);
  return product ? byTicker.get(ticker) : undefined;
}

/** Tickers with a bundled series, in artifact order. */
export function onchainDailyTickers(): string[] {
  return ONCHAIN_DAILY.series.map((series) => series.ticker);
}
