/**
 * Text of a statement value by its line's unit: short in the table and on
 * chart axes ("$215.9B", "$2.94", "24.53B", "55.8%"), exact in the readout.
 * Presentation only; the exact value stays in the data and in each cell's
 * `data` element. An absent value is the em dash, never 0.
 */
import { EMPTY_VALUE, formatCompactCurrency, formatExactCurrency, formatNumber } from "@/i18n/format";
import type { PublicWebLocale } from "@/i18n/locales";
import { STATEMENTS_CONFIG } from "./statement-config";
import { statementsMessagesFor } from "@/i18n/statements-messages";
import { isStatementItem, type StatementUnit } from "./statement-data";

const DIGITS = STATEMENTS_CONFIG.digits;

export function shortValueText(value: number | null, unit: StatementUnit, locale: PublicWebLocale): string {
  if (value === null || !Number.isFinite(value)) return EMPTY_VALUE;
  switch (unit) {
    case "usd":
      return new Intl.NumberFormat(locale, { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", notation: "compact", minimumFractionDigits: DIGITS.amountFraction, maximumFractionDigits: DIGITS.amountFraction }).format(value);
    case "usd_per_share":
      return new Intl.NumberFormat(locale, { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", minimumFractionDigits: DIGITS.perShare, maximumFractionDigits: DIGITS.perShare }).format(value);
    case "shares":
      return new Intl.NumberFormat(locale, { notation: "compact", maximumSignificantDigits: DIGITS.sharesSignificant }).format(value);
    case "ratio":
      return new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: DIGITS.ratio, maximumFractionDigits: DIGITS.ratio }).format(value);
  }
}

export function exactValueText(value: number, unit: StatementUnit, locale: PublicWebLocale): string {
  if (!Number.isFinite(value)) return EMPTY_VALUE;
  switch (unit) {
    case "usd":
      return formatExactCurrency(value, "USD", locale);
    case "usd_per_share":
      return new Intl.NumberFormat(locale, { style: "currency", currency: "USD", currencyDisplay: "code", minimumFractionDigits: DIGITS.perShare, maximumFractionDigits: DIGITS.perShareExact }).format(value);
    case "shares":
      return formatNumber(value, locale);
    case "ratio":
      return new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: DIGITS.ratioExact, maximumFractionDigits: DIGITS.ratioExact }).format(value);
  }
}

/** An axis tick: the short form, with a ratio in whole percent. */
export function axisTickText(value: number, unit: StatementUnit, locale: PublicWebLocale): string {
  if (unit === "ratio") return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(value);
  if (unit === "usd") return formatCompactCurrency(value, "USD", locale);
  if (unit === "usd_per_share") return new Intl.NumberFormat(locale, { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", maximumFractionDigits: DIGITS.perShare }).format(value);
  return shortValueText(value, unit, locale);
}

/** A line's name in the locale: the catalog's name, or the registry's own English label for a line the catalog does not name yet. */
export function lineLabel(item: string, fallback: string | undefined, locale: PublicWebLocale): string {
  return isStatementItem(item) ? statementsMessagesFor(locale).lines[item] : fallback ?? item;
}
