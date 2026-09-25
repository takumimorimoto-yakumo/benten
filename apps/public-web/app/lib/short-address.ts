/** Characters kept at each end of a shortened address or signature. */
const SHORT_HEAD_CHARS = 6;
const SHORT_TAIL_CHARS = 6;

/**
 * Shorten a base58 address or signature for display; the full value stays
 * available through Copy and `title`. Shared by the purchase panel and the
 * header wallet, so one address reads the same everywhere.
 */
export function shortenAddress(value: string): string {
  if (value.length <= SHORT_HEAD_CHARS + SHORT_TAIL_CHARS + 1) return value;
  return `${value.slice(0, SHORT_HEAD_CHARS)}…${value.slice(-SHORT_TAIL_CHARS)}`;
}
