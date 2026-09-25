/**
 * Presentation-only formatting helpers.
 *
 * These never round away information silently beyond digit grouping and a
 * fixed decimal cap, and never convert, scale, or reinterpret a snapshot
 * value. A value that is absent is rendered as an em dash, never as 0.
 */

/** Rendered in place of a missing value. */
export const EMPTY_VALUE = "—";

const LARGE_MAGNITUDE_THRESHOLD = 1000;
const LARGE_MAX_FRACTION_DIGITS = 0;
const SMALL_MAX_FRACTION_DIGITS = 4;

/**
 * How a snapshot value is read, decided by its field rather than its magnitude.
 *
 * - `quantity`: an amount or count; numbers get digit grouping.
 * - `identifier`: a label that happens to be numeric, such as a fiscal year;
 *   numbers are never grouped, so 2026 stays "2026" and not "2,026".
 */
export type ValueKind = "quantity" | "identifier";

/**
 * Format a finite number. Quantities get digit grouping; identifiers do not.
 * Non-finite input returns the em dash.
 */
export function formatNumber(value: number, kind: ValueKind = "quantity"): string {
  if (!Number.isFinite(value)) return EMPTY_VALUE;
  const maximumFractionDigits =
    Math.abs(value) >= LARGE_MAGNITUDE_THRESHOLD
      ? LARGE_MAX_FRACTION_DIGITS
      : SMALL_MAX_FRACTION_DIGITS;
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
    useGrouping: kind === "quantity",
  }).format(value);
}

/**
 * Format a snapshot value of unknown type for display.
 *
 * Numbers are grouped unless `kind` is `identifier`, strings are passed through verbatim, booleans are
 * lowercased, and null/undefined become the em dash. Nothing else is
 * inferred.
 */
export function formatValue(value: unknown, kind: ValueKind = "quantity"): string {
  if (value === null || value === undefined || value === "") return EMPTY_VALUE;
  if (typeof value === "number") return formatNumber(value, kind);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return value;
  return String(value);
}

/** Shorten a base58 address for display. The full value stays in the `title` attribute. */
const ADDRESS_HEAD_CHARS = 6;
const ADDRESS_TAIL_CHARS = 6;

export function shortenAddress(address: string): string {
  if (address.length <= ADDRESS_HEAD_CHARS + ADDRESS_TAIL_CHARS + 1) return address;
  return `${address.slice(0, ADDRESS_HEAD_CHARS)}…${address.slice(-ADDRESS_TAIL_CHARS)}`;
}
