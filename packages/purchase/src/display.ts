/**
 * Display strings for the purchase panel. Integer arithmetic only (through
 * `amount.ts`); grouping is applied to display values, never to
 * raw lines, so raw lines can be compared with a wallet or explorer exactly.
 */

import { formatRawUnits, formatScaledUnits, groupDecimalForLocale } from "./amount";
import { NVDAX_DECIMALS, USDC_DECIMALS } from "./route";
import type { MultiplierReading } from "./purchase-machine";

const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1_000;

export function usdcText(raw: bigint, locale: string): string {
  return groupDecimalForLocale(formatRawUnits(raw, USDC_DECIMALS), locale);
}

/** A pay token's display amount from raw units with its decimals (grouped for the locale). */
export function tokenText(raw: bigint, decimals: number, locale: string): string {
  return groupDecimalForLocale(formatRawUnits(raw, decimals), locale);
}

/** NVDAx display amount with the read multiplier, or `null` when only raw units can be shown. */
export function nvdaxText(raw: bigint, multiplier: MultiplierReading | null, locale: string): string | null {
  if (!multiplier) return null;
  const scaled = formatScaledUnits(raw, NVDAX_DECIMALS, multiplier.value);
  return scaled === null ? null : groupDecimalForLocale(scaled, locale);
}

/** Absolute local wall-clock time, 24-hour, with seconds. */
export function clockText(epochMs: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date(epochMs));
}

/** Countdown as `m:ss`, rounded up so it never shows 0:00 while time is left. */
export function countdownText(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / MS_PER_SECOND));
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** Whole minutes of a duration, for the "stopped checking after N minutes" copy. */
export function minutesText(durationMs: number): string {
  return String(Math.round(durationMs / (SECONDS_PER_MINUTE * MS_PER_SECOND)));
}
