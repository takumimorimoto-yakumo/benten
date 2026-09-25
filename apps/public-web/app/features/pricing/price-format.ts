/**
 * Pure presentation rules for one Pyth reference price: which state it is
 * in at a given time, and its figures as text. No I/O, no React.
 *
 * States (app IA sections 4.4, 6.2 and 7):
 *  - `live`: published within the price's own stale window;
 *  - `stale`: older, shown with "Last Pyth update {time}" and never used
 *    for a value (a weekend must not blank the page);
 *  - `tooOld`: older than `maxDisplayAgeHours`, only the update time is shown;
 *  - `noFeed`: Pyth publishes no price account on Solana for this feed;
 *  - `unavailable`: the read failed, the account could not be read, or the
 *    value is not a positive number. Nothing is shown in its place.
 */
import type { PricesResponse } from "@benten/pricing/response";
import { formatTimeWithZone } from "@/i18n/format";
import type { PublicWebLocale } from "@/i18n/locales";
import { PRICE_DISPLAY_CONFIG } from "./price-config";

export type PythPriceResult = PricesResponse["prices"][number];
type AvailablePrice = Extract<PythPriceResult, { status: "fresh" | "stale" }>;

export type PriceDisplayState =
  | { readonly kind: "live" | "stale"; readonly price: AvailablePrice }
  | { readonly kind: "tooOld"; readonly price: AvailablePrice }
  | { readonly kind: "noFeed" }
  | { readonly kind: "unavailable" };

/**
 * Server reasons that mean no Pyth price exists on Solana for this feed, so
 * trying again cannot help: shown as "no feed", never as a passing failure.
 */
const NO_FEED_REASONS: ReadonlySet<string> = new Set(["not_in_feed_map", "no_price_account"]);

const POSITIVE_DECIMAL = /^(\d+)(?:\.(\d+))?$/;

/** The state of one read result at `nowMs`. A missing result is unavailable. */
export function priceDisplayState(result: PythPriceResult | null, nowMs: number): PriceDisplayState {
  if (result?.status === "unavailable" && NO_FEED_REASONS.has(result.reason)) return { kind: "noFeed" };
  if (!result || result.status === "unavailable") return { kind: "unavailable" };
  if (!POSITIVE_DECIMAL.test(result.price) || !/[1-9]/.test(result.price) || BigInt(result.price_raw) <= 0n) return { kind: "unavailable" };
  const ageSeconds = nowMs / 1000 - result.publish_time_unix;
  if (ageSeconds > PRICE_DISPLAY_CONFIG.maxDisplayAgeHours * 3600) return { kind: "tooOld", price: result };
  const live = result.status === "fresh" && ageSeconds <= result.stale_after_seconds;
  return { kind: live ? "live" : "stale", price: result };
}

/** Whether a price is live right now (a stale price is shown, never used for a value). */
export function isLivePrice(result: PythPriceResult | null, nowMs: number): boolean {
  return priceDisplayState(result, nowMs).kind === "live";
}

/** Basis points in one whole. */
const BPS_PER_WHOLE = 10_000n;

/** Why a read price may not value a holding. */
export type PriceNotUsableReason = "unavailable" | "no_feed" | "stale" | "too_old" | "confidence_too_wide";

/**
 * The one rule for using a Pyth reference price in a value (app IA 6.2): the
 * price must be live (`isLivePrice`: within its stale window, so never older
 * than `maxDisplayAgeHours` either) and its confidence interval must be
 * within `maxValueConfidenceBps` of the price. Anything else is shown (or
 * not) by `priceDisplayState`, and values nothing.
 */
export function priceForValue(result: PythPriceResult | null, nowMs: number): { readonly usable: true; readonly price: AvailablePrice } | { readonly usable: false; readonly reason: PriceNotUsableReason } {
  const display = priceDisplayState(result, nowMs);
  switch (display.kind) {
    case "noFeed": return { usable: false, reason: "no_feed" };
    case "unavailable": return { usable: false, reason: "unavailable" };
    case "tooOld": return { usable: false, reason: "too_old" };
    case "stale": return { usable: false, reason: "stale" };
    case "live": break;
  }
  if (!isLivePrice(result, nowMs)) return { usable: false, reason: "stale" };
  const { price } = display;
  if (BigInt(price.confidence_raw) * BPS_PER_WHOLE > BigInt(price.price_raw) * BigInt(PRICE_DISPLAY_CONFIG.maxValueConfidenceBps)) return { usable: false, reason: "confidence_too_wide" };
  return { usable: true, price };
}

/** `digits / 10^scale` from a non-negative decimal string. */
function decimalParts(text: string): { digits: bigint; scale: number } {
  const match = POSITIVE_DECIMAL.exec(text);
  if (!match) throw new Error("not a non-negative decimal");
  const fraction = match[2] ?? "";
  return { digits: BigInt(`${match[1]}${fraction}`), scale: fraction.length };
}

/** Round a non-negative decimal to `fractionDigits`, half up (`"up"`: always away from zero). */
export function roundDecimal(text: string, fractionDigits: number, mode: "halfUp" | "up"): string {
  const { digits, scale } = decimalParts(text);
  let scaled: bigint;
  if (scale <= fractionDigits) scaled = digits * 10n ** BigInt(fractionDigits - scale);
  else {
    const divisor = 10n ** BigInt(scale - fractionDigits);
    const quotient = digits / divisor;
    const remainder = digits % divisor;
    const roundUp = mode === "up" ? remainder > 0n : remainder * 2n >= divisor;
    scaled = roundUp ? quotient + 1n : quotient;
  }
  if (fractionDigits === 0) return scaled.toString();
  const padded = scaled.toString().padStart(fractionDigits + 1, "0");
  return `${padded.slice(0, -fractionDigits)}.${padded.slice(-fractionDigits)}`;
}

function usdDigits(price: string): number {
  return decimalParts(price).digits >= 10n ** BigInt(decimalParts(price).scale) ? PRICE_DISPLAY_CONFIG.usdFractionDigits : PRICE_DISPLAY_CONFIG.smallUsdFractionDigits;
}

function usdText(value: string, fractionDigits: number, locale: PublicWebLocale): string {
  // A decimal string keeps every digit through Intl (no floating-point conversion).
  return new Intl.NumberFormat(locale, { style: "currency", currency: "USD", minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }).format(value as unknown as number);
}

/** The main figure: the price rounded to cents (or to six digits below one dollar). */
export function priceText(price: AvailablePrice, locale: PublicWebLocale): string {
  const digits = usdDigits(price.price);
  return usdText(roundDecimal(price.price, digits, "halfUp"), digits, locale);
}

/**
 * The confidence interval at the price's precision, rounded up so it is never
 * understated, and at least one unit of that precision so it never reads as 0.
 */
export function confidenceText(price: AvailablePrice, locale: PublicWebLocale): string {
  const digits = usdDigits(price.price);
  let rounded = roundDecimal(price.confidence, digits, "up");
  if (!/[1-9]/.test(rounded)) rounded = roundDecimal(`0.${"0".repeat(digits - 1)}1`, digits, "up");
  return usdText(rounded, digits, locale);
}

/** `NVDA/USD` from `Equity.US.NVDA/USD`: the Pyth symbol without its asset-class prefix. */
export function feedName(pythSymbol: string): string {
  return pythSymbol.slice(pythSymbol.lastIndexOf(".") + 1);
}

/** Time of day with seconds and zone, for a live price. */
export function liveTimeText(unixSeconds: number, locale: PublicWebLocale): string {
  return formatTimeWithZone(unixSeconds * 1000, locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** Date and time with zone, for a price that is not live. */
export function updateTimeText(unixSeconds: number, locale: PublicWebLocale): string {
  return formatTimeWithZone(unixSeconds * 1000, locale, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
