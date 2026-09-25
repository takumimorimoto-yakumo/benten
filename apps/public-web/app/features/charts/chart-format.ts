/**
 * Text of the charts' figures: axis ticks, readout values and the
 * comparison percentage. Presentation only; the exact values stay in the data.
 */
import { formatCompactCurrency, formatCompactCurrencyAligned } from "@/i18n/format";
import type { PublicWebLocale } from "@/i18n/locales";

/** A day's value in USDC per token, in cents (shown with the dollar sign of the stablecoin's unit). */
export function usdText(value: number, locale: PublicWebLocale): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

/** A price axis tick: whole dollars. */
export function priceTickText(value: number, locale: PublicWebLocale): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

/** A money axis tick, shortened ("$150B"). */
export function moneyText(value: number, locale: PublicWebLocale): string {
  return formatCompactCurrency(value, "USD", locale);
}

/**
 * A reported figure in the readout and the table, shortened to the same
 * number of significant digits every time ("$5.010B", "$9.714B"); the exact
 * amount is in the `data` value and on the filing.
 */
export function figureText(value: number, locale: PublicWebLocale): string {
  return formatCompactCurrencyAligned(value, "USD", locale);
}

/** A time axis tick: the year alone on a range of several years, month and year on a shorter one (UTC). */
export function xTickText(ms: number, byYear: boolean, locale: PublicWebLocale): string {
  const options: Intl.DateTimeFormatOptions = byYear ? { timeZone: "UTC", year: "numeric" } : { timeZone: "UTC", month: "short", year: "2-digit" };
  return new Intl.DateTimeFormat(locale, options).format(new Date(ms));
}

/** A signed percentage with two decimals ("+0.42%", "-1.10%", "0.00%"). */
export function signedPercentText(ratio: number, locale: PublicWebLocale): string {
  return new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" }).format(ratio);
}
