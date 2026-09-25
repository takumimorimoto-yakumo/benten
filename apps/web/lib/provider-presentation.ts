/**
 * Presentation helpers for non-xStocks provider assets.
 *
 * Provider reference values arrive as contract `DecimalString`s and are never
 * parsed into a JavaScript number here: the only transformation applied is
 * lossless digit grouping of the integer part. A value that does not match the
 * canonical decimal form is rendered exactly as the artifact stores it.
 */
import type { ProviderAssetEntryV1, ProviderReferenceKind } from "@benten/registry";
import type { Locale } from "@/lib/i18n/config";
import { messagesFor } from "@/lib/i18n/messages";

const DECIMAL_STRING = /^(0|[1-9][0-9]*)(\.[0-9]+)?$/;

/** Insert thousands separators into the integer part without touching any digit. */
export function groupDecimalString(value: string): string {
  if (!DECIMAL_STRING.test(value)) return value;
  const [integer, fraction] = value.split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

/** Calendar date of an RFC 3339 timestamp; the artifact stores UTC instants. */
export function utcDatePart(timestamp: string): string {
  return timestamp.slice(0, 10);
}

export function providerName(entry: ProviderAssetEntryV1, locale: Locale): string {
  return messagesFor(locale).providers.names[entry.provider];
}

export function referenceKindLabel(kind: ProviderReferenceKind, locale: Locale): string {
  return messagesFor(locale).providers.referenceKinds[kind];
}

/** Restriction codes are provider-supplied strings; an unreviewed code degrades to its raw form. */
export function restrictionLabel(code: string, locale: Locale): string {
  const labels = messagesFor(locale).providers.restrictions as Record<string, string | undefined>;
  return labels[code] ?? code.replaceAll("_", " ");
}

/** The single reference Benten shows in the home summary row, if the provider publishes one. */
export function summaryReference(entry: ProviderAssetEntryV1): string | null {
  const mark = entry.references.find((reference) => reference.kind === "prestock_mark_reference");
  return mark ? groupDecimalString(mark.value) : null;
}
