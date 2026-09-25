import type { Locale } from "@/lib/i18n/config";

export const EMPTY_VALUE = "—";

export function formatNumberForLocale(value: number, locale: Locale): string {
  if (!Number.isFinite(value)) return EMPTY_VALUE;
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 4,
  }).format(value);
}

export function formatLegacyNumber(value: number, locale: Locale): string {
  return Number.isFinite(value) ? new Intl.NumberFormat(locale).format(value) : EMPTY_VALUE;
}

export function formatCurrencyForLocale(value: number, currency: string, locale: Locale): string {
  const abbreviation = Math.abs(value) >= 1_000_000_000 ? { divisor: 1_000_000_000, suffix: "B" } : Math.abs(value) >= 1_000_000 ? { divisor: 1_000_000, suffix: "M" } : null;
  const displayed = abbreviation ? value / abbreviation.divisor : value;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 3,
    minimumFractionDigits: abbreviation ? 3 : 0,
  }).format(displayed) + (abbreviation?.suffix ?? "");
}

function isoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

export function formatSourceDate(value: string, locale: Locale): string {
  const date = isoDate(value);
  return date ? new Intl.DateTimeFormat(locale, { timeZone: "UTC", dateStyle: "medium" }).format(date) : value;
}

/** Join already-localized phrases with the locale's list conjunction ("a, b and c"). */
export function formatConjunction(items: readonly string[], locale: Locale): string {
  return new Intl.ListFormat(locale, { type: "conjunction" }).format(items);
}

/**
 * Split a locale list into one piece per item, each carrying the separator that
 * follows it, so that every item can be rendered as its own element.
 */
export function listItemsWithSeparators(items: readonly string[], locale: Locale): { item: string; separator: string }[] {
  const parts = new Intl.ListFormat(locale, { type: "conjunction" }).formatToParts(items);
  const pieces: { item: string; separator: string }[] = [];
  for (const part of parts) {
    if (part.type === "element") pieces.push({ item: part.value, separator: "" });
    else if (pieces.length) pieces[pieces.length - 1].separator += part.value;
  }
  return pieces;
}
