/**
 * Presentation-only formatting. Nothing here converts, scales, rounds away
 * information, or reinterprets a value: a missing value is an em dash, never 0.
 */
import { FORMAT_CONFIG, SENTENCE_SEPARATOR, TIME_ZONE_LABEL_CONFIG } from "./format-config";
import type { PublicWebLocale } from "./locales";

export const EMPTY_VALUE = "—";

/**
 * How a numeric value is read, decided by its field rather than its magnitude.
 * An `identifier` (such as a fiscal year) is never digit-grouped: 2026, not 2,026.
 */
export type ValueKind = "quantity" | "identifier";

/** Snapshot values are either whole reported amounts or small ratios. */
const FRACTION_DIGITS = { atOrAboveThousand: 0, belowThousand: 4 } as const;
const THOUSAND = 1000;

export function formatNumber(value: number, locale: PublicWebLocale, kind: ValueKind = "quantity"): string {
  if (!Number.isFinite(value)) return EMPTY_VALUE;
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: Math.abs(value) >= THOUSAND ? FRACTION_DIGITS.atOrAboveThousand : FRACTION_DIGITS.belowThousand,
    useGrouping: kind === "quantity",
  }).format(value);
}

/** Format an unvalidated snapshot scalar without inferring any meaning. */
export function formatScalar(value: string | number | boolean | null | undefined, locale: PublicWebLocale, kind: ValueKind = "quantity"): string {
  if (value === null || value === undefined || value === "") return EMPTY_VALUE;
  if (typeof value === "number") return formatNumber(value, locale, kind);
  if (typeof value === "boolean") return String(value);
  return value;
}

/** An exact reported amount in its reported currency, with every digit shown. */
export function formatExactCurrency(value: number, currency: string, locale: PublicWebLocale): string {
  if (!Number.isFinite(value)) return EMPTY_VALUE;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "code",
    maximumFractionDigits: FRACTION_DIGITS.atOrAboveThousand,
  }).format(value);
}

/**
 * A reported amount shortened for reading ("$215.9B" in English), in the
 * locale's own compact units and currency symbol, to
 * `FORMAT_CONFIG.compactAmountSignificantDigits` significant digits. Used
 * only where the exact amount is one link away (the evidence page).
 */
export function formatCompactCurrency(value: number, currency: string, locale: PublicWebLocale): string {
  if (!Number.isFinite(value)) return EMPTY_VALUE;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    notation: "compact",
    maximumSignificantDigits: FORMAT_CONFIG.compactAmountSignificantDigits,
  }).format(value);
}

/**
 * `formatCompactCurrency` with the significant digits held at exactly
 * `FORMAT_CONFIG.compactAmountSignificantDigits`, trailing zeros kept
 * ("$5.010B" beside "$9.714B"), so every figure in a table reads to the same
 * precision. Axis ticks keep the shorter form.
 */
export function formatCompactCurrencyAligned(value: number, currency: string, locale: PublicWebLocale): string {
  if (!Number.isFinite(value)) return EMPTY_VALUE;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    notation: "compact",
    minimumSignificantDigits: FORMAT_CONFIG.compactAmountSignificantDigits,
    maximumSignificantDigits: FORMAT_CONFIG.compactAmountSignificantDigits,
  }).format(value);
}

function isoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

/** A calendar date from a source record, shown in UTC so it never shifts a day. */
export function formatSourceDate(value: string, locale: PublicWebLocale): string {
  const date = isoDate(value);
  return date ? new Intl.DateTimeFormat(locale, { timeZone: "UTC", dateStyle: "medium" }).format(date) : value;
}

/**
 * The month and year a fiscal year ends, from its exact period end ("Jan 2026"
 * in English). Issuers number their years differently, so a fiscal year is
 * named by this month alone (`fiscalYearLabel` in `fiscal-year.ts`).
 */
export function formatPeriodEndMonth(periodEnd: string, locale: PublicWebLocale): string {
  const date = isoDate(periodEnd);
  return date ? new Intl.DateTimeFormat(locale, { timeZone: "UTC", year: "numeric", month: "short" }).format(date) : periodEnd;
}

/** A locale-appropriate list ("a, b, and c"); the items keep their given order. */
export function formatList(items: readonly string[], locale: PublicWebLocale): string {
  return new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(items);
}

/** Whole sentences run together as one paragraph, with the locale's space between them (none in Japanese and Chinese). */
export function joinSentences(sentences: readonly string[], locale: PublicWebLocale): string {
  return sentences.join(SENTENCE_SEPARATOR[locale]);
}

/** A locale-appropriate list split into its items and the separators between them, for lists of links. */
export function formatListParts(items: readonly string[], locale: PublicWebLocale): readonly { type: "element" | "literal"; value: string }[] {
  return new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).formatToParts(items);
}

/** Characters kept from each end of a shortened address; the full address stays in `title` and on its record page. */
const ADDRESS_HEAD_CHARS = 6;
const ADDRESS_TAIL_CHARS = 6;

/** A display-only short form of an address. Never used in a link, a data attribute, or a copied value. */
export function shortenAddress(address: string): string {
  if (address.length <= ADDRESS_HEAD_CHARS + ADDRESS_TAIL_CHARS + 1) return address;
  return `${address.slice(0, ADDRESS_HEAD_CHARS)}…${address.slice(-ADDRESS_TAIL_CHARS)}`;
}

const DECIMAL_STRING = /^(0|[1-9][0-9]*)(\.[0-9]+)?$/;

/**
 * A provider's decimal string with digit grouping in its integer part only.
 * The value is never parsed into a number, so no digit is rounded or dropped;
 * a string that is not a plain decimal is shown exactly as stored.
 */
export function formatDecimalString(value: string): string {
  if (!DECIMAL_STRING.test(value)) return value;
  const [integer, fraction] = value.split(".");
  const grouped = integer!.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

/** The calendar date (UTC) of an RFC 3339 instant; provider artifacts store UTC instants. */
export function utcDatePart(timestamp: string): string {
  return timestamp.slice(0, 10);
}

function zoneNamePart(epochMs: number, form: "short" | "shortOffset"): string {
  const parts = new Intl.DateTimeFormat(TIME_ZONE_LABEL_CONFIG.abbreviationLocale, { timeZoneName: form }).formatToParts(epochMs);
  return parts.find((part) => part.type === "timeZoneName")?.value ?? "";
}

/**
 * The reader's time zone at `epochMs`, named the same way in every locale
 * (`TIME_ZONE_LABEL_CONFIG`): an abbreviation such as "EDT" or "UTC" where
 * one exists, otherwise the offset ("UTC+9").
 */
export function timeZoneLabel(epochMs: number): string {
  const { abbreviationPattern, offsetPrefix, utcLabel } = TIME_ZONE_LABEL_CONFIG;
  const short = zoneNamePart(epochMs, "short");
  if (abbreviationPattern.test(short) && short !== offsetPrefix) return short;
  const offset = zoneNamePart(epochMs, "shortOffset");
  return offset.startsWith(offsetPrefix) ? `${utcLabel}${offset.slice(offsetPrefix.length)}` : offset || utcLabel;
}

/** A date and/or time in the locale's own form, followed by `timeZoneLabel` ("09:37:05 UTC+9"). */
export function formatTimeWithZone(epochMs: number, locale: PublicWebLocale, options: Intl.DateTimeFormatOptions): string {
  return `${new Intl.DateTimeFormat(locale, options).format(epochMs)} ${timeZoneLabel(epochMs)}`;
}
