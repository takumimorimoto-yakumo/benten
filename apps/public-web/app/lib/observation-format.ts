/**
 * Presentation of observation times and exact decimal amounts for the
 * Holdings and Activity tabs. Times are the reader's local time with its zone
 * (`timeZoneLabel`, the same form in every locale), so "Read from Solana at ..." and a Pyth publish time can be compared
 * at a glance. Amounts are formatted from their decimal strings; nothing is
 * converted through a floating-point number.
 */
import { formatTimeWithZone } from "@/i18n/format";
import type { PublicWebLocale } from "@/i18n/locales";

/** Seconds in one calendar day, to decide whether a time needs its date. */
const DAY_SECONDS = 24 * 60 * 60;
const DECIMAL = /^-?\d+(?:\.\d+)?$/;
/** Cents: a valuation is shown to this many digits. */
const USD_FRACTION_DIGITS = 2;

/** A time of day, with the date when it is not today in the reader's zone. */
export function formatObservationTime(epochMs: number, locale: PublicWebLocale, nowMs: number = Date.now()): string {
  const sameDay = new Date(epochMs).toDateString() === new Date(nowMs).toDateString() && Math.abs(nowMs - epochMs) < DAY_SECONDS * 1000;
  return formatTimeWithZone(epochMs, locale, sameDay ? { hour: "2-digit", minute: "2-digit", second: "2-digit" } : { dateStyle: "medium", timeStyle: "short" });
}

type ExactFormat = Intl.NumberFormat & { format(value: string): string };

function exact(locale: PublicWebLocale, options: Intl.NumberFormatOptions): ExactFormat {
  // A decimal string is formatted exactly (ECMA-402 Intl.NumberFormat v3); it is never parsed to a double.
  return new Intl.NumberFormat(locale, options) as ExactFormat;
}

/** A valuation already truncated to cents by `@benten/pricing`: shown with every digit it has. */
export function formatUsdValue(value: string, locale: PublicWebLocale): string {
  if (!DECIMAL.test(value)) return value;
  return exact(locale, { style: "currency", currency: "USD", minimumFractionDigits: USD_FRACTION_DIGITS, maximumFractionDigits: USD_FRACTION_DIGITS, roundingMode: "trunc" } as Intl.NumberFormatOptions).format(value);
}

/** An exact token amount (decimal string) with digit grouping, every fraction digit kept. */
export function formatTokenAmount(value: string, locale: PublicWebLocale): string {
  if (!DECIMAL.test(value)) return value;
  const fraction = value.split(".")[1]?.length ?? 0;
  return exact(locale, { minimumFractionDigits: fraction, maximumFractionDigits: fraction }).format(value);
}
