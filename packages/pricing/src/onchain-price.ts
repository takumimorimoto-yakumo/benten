/**
 * Pure arithmetic for on-chain executed prices: the USDC paid or received
 * for an xStock in one pool swap, from the pool vaults' raw balance changes.
 *
 * The producer script (`scripts/onchain-prices`) and the bundled-series
 * validator both compute prices here, so a stored price is always the exact
 * truncated quotient of the stored raw amounts. Nothing here reads the
 * network, and nothing converts through a floating-point number.
 */

import { parseDecimal } from "./decimal.js";

/** Fraction digits of a stored on-chain price; further digits are truncated, never rounded up. */
export const ONCHAIN_PRICE_FRACTION_DIGITS = 6;

const INTEGER_TEXT = /^-?\d{1,40}$/;

function pow10(exponent: number): bigint {
  return 10n ** BigInt(exponent);
}

function magnitude(text: string, what: string): bigint {
  if (!INTEGER_TEXT.test(text)) throw new Error(`${what} must be an integer string`);
  const value = BigInt(text);
  const absolute = value < 0n ? -value : value;
  if (absolute === 0n) throw new Error(`${what} must be nonzero`);
  return absolute;
}

function decimalsOf(value: number, what: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 18) throw new Error(`${what} must be an integer in 0..18`);
  return value;
}

/** `numerator / denominator` as decimal text with exactly `fractionDigits` digits, truncated toward zero. Both positive. */
function quotientText(numerator: bigint, denominator: bigint, fractionDigits: number): string {
  const scaled = (numerator * pow10(fractionDigits)) / denominator;
  const divisor = pow10(fractionDigits);
  const integer = scaled / divisor;
  return fractionDigits === 0 ? integer.toString() : `${integer}.${(scaled % divisor).toString().padStart(fractionDigits, "0")}`;
}

export interface SwapAmounts {
  /** Signed raw change of the pool's USDC vault, base-10 integer string. */
  usdcRaw: string;
  /** Signed raw change of the pool's xStock vault, base-10 integer string. */
  xstockRaw: string;
  usdcDecimals: number;
  xstockDecimals: number;
}

/**
 * USDC per unscaled xStock token: |USDC raw| / 10^usdcDecimals divided by
 * |xStock raw| / 10^xstockDecimals. The Token-2022 Scaled UI multiplier is
 * not applied, so the value is the price of raw amounts, whatever the
 * multiplier was at the time of the trade.
 */
export function usdcPerUnscaledToken(amounts: SwapAmounts): string {
  const usdc = magnitude(amounts.usdcRaw, "usdcRaw");
  const xstock = magnitude(amounts.xstockRaw, "xstockRaw");
  const usdcDecimals = decimalsOf(amounts.usdcDecimals, "usdcDecimals");
  const xstockDecimals = decimalsOf(amounts.xstockDecimals, "xstockDecimals");
  return quotientText(usdc * pow10(xstockDecimals), xstock * pow10(usdcDecimals), ONCHAIN_PRICE_FRACTION_DIGITS);
}

/**
 * USDC per displayed xStock unit, which the issuer defines as one underlying
 * share: the unscaled price divided by the Scaled UI multiplier in effect at
 * the trade. `multiplier` is the decimal text of that multiplier.
 */
export function usdcPerUnderlyingShare(amounts: SwapAmounts, multiplier: string): string {
  const parsed = parseDecimal(multiplier);
  if (!parsed || parsed.digits <= 0n) throw new Error("multiplier must be a positive decimal");
  const usdc = magnitude(amounts.usdcRaw, "usdcRaw");
  const xstock = magnitude(amounts.xstockRaw, "xstockRaw");
  const usdcDecimals = decimalsOf(amounts.usdcDecimals, "usdcDecimals");
  const xstockDecimals = decimalsOf(amounts.xstockDecimals, "xstockDecimals");
  // price / (digits / 10^scale) = usdc·10^xd·10^scale / (xstock·10^ud·digits); a negative scale is folded into the denominator.
  const scaleUp = parsed.scale >= 0 ? pow10(parsed.scale) : 1n;
  const scaleDown = parsed.scale < 0 ? pow10(-parsed.scale) : 1n;
  return quotientText(usdc * pow10(xstockDecimals) * scaleUp, xstock * pow10(usdcDecimals) * parsed.digits * scaleDown, ONCHAIN_PRICE_FRACTION_DIGITS);
}

const DATE_TEXT = /^(\d{4})-(\d{2})-(\d{2})$/;
const CLOCK_TEXT = /^(\d{2}):(\d{2})$/;
const NEW_YORK = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function newYorkWallClock(epochMs: number): string {
  const parts = Object.fromEntries(NEW_YORK.formatToParts(new Date(epochMs)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

/**
 * The UTC instant of wall-clock `clock` (`HH:MM`) on `date` (`YYYY-MM-DD`)
 * in America/New_York, daylight saving time included, as
 * `YYYY-MM-DDTHH:MM:SSZ`. Throws for a malformed date or clock.
 */
export function newYorkTimeToUtc(date: string, clock: string): string {
  const day = DATE_TEXT.exec(date);
  const time = CLOCK_TEXT.exec(clock);
  if (!day || !time) throw new Error("date must be YYYY-MM-DD and clock HH:MM");
  const [year, month, dayOfMonth] = [Number(day[1]), Number(day[2]), Number(day[3])];
  const [hour, minute] = [Number(time[1]), Number(time[2])];
  if (hour > 23 || minute > 59) throw new Error("clock out of range");
  const wanted = `${date} ${clock}`;
  // Eastern time is UTC-4 (EDT) or UTC-5 (EST); exactly one of the two reads back as the wanted wall clock.
  for (const offsetHours of [4, 5]) {
    const epochMs = Date.UTC(year, month - 1, dayOfMonth, hour + offsetHours, minute);
    if (newYorkWallClock(epochMs) === wanted) return new Date(epochMs).toISOString().replace(".000Z", "Z");
  }
  throw new Error(`no America/New_York instant for ${wanted}`);
}

/** The exchange session calendar a daily series is anchored to (weekdays minus full closures). */
export interface SessionCalendar {
  exchange: string;
  time_zone: "America/New_York";
  regular_close: string;
  early_close: string;
  full_closures: string[];
  early_closes: string[];
}

export interface SessionDate {
  /** Trading date in America/New_York, `YYYY-MM-DD`. */
  date: string;
  /** Session close wall clock in America/New_York, `HH:MM`. */
  close: string;
}

/**
 * Every session date from `from` to `to` inclusive: Monday to Friday, minus
 * the calendar's full closures, closing at the early close on the listed
 * early-close dates and at the regular close otherwise.
 */
export function sessionDates(calendar: SessionCalendar, from: string, to: string): SessionDate[] {
  if (!DATE_TEXT.test(from) || !DATE_TEXT.test(to)) throw new Error("from and to must be YYYY-MM-DD");
  const closed = new Set(calendar.full_closures);
  const early = new Set(calendar.early_closes);
  const dates: SessionDate[] = [];
  for (let epochMs = Date.parse(`${from}T00:00:00Z`); epochMs <= Date.parse(`${to}T00:00:00Z`); epochMs += 86_400_000) {
    const date = new Date(epochMs).toISOString().slice(0, 10);
    const weekday = new Date(epochMs).getUTCDay();
    if (weekday === 0 || weekday === 6 || closed.has(date)) continue;
    dates.push({ date, close: early.has(date) ? calendar.early_close : calendar.regular_close });
  }
  return dates;
}
