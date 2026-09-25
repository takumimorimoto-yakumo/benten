/**
 * Amount model for the purchase panel (design contract section 4).
 *
 * Every amount is an integer of raw base units held as `bigint`. User input is
 * parsed from its decimal string straight to `bigint`; display strings are
 * produced by integer arithmetic. Nothing here converts through a
 * floating-point number.
 */

import { PURCHASE_CONFIG } from "./config";
import { PAY_TOKEN_UNITS, USDC_DECIMALS, type PayTokenId } from "./token-units";

/** `notReady`: a sale amount cannot be checked yet (the balance, the display multiplier or the limit is not read). */
export type AmountError = "empty" | "format" | "precision" | "zero" | "overLimit" | "overBalance" | "notReady";

export type AmountParse = { ok: true; raw: bigint } | { ok: false; error: AmountError };

/** Plain digits with an optional `.` fraction. No sign, exponent, grouping or other separator. */
const DECIMAL_INPUT = /^(\d+)(?:\.(\d+))?$/;

/** Minimum fraction digits kept when trailing zeros are trimmed for display. */
const MIN_DISPLAY_FRACTION_DIGITS = 2;

function pow10(exponent: number): bigint {
  return 10n ** BigInt(exponent);
}

/**
 * Parse the USDC field. Accepts `^\d+(\.\d{1,6})?$` after trimming; rejects
 * empty, signed, exponent, grouped or over-precise input, zero, and anything
 * above the per-transaction limit. `balanceRaw`, when known, adds the
 * over-balance check (the limit check wins when both apply).
 */
export function parseUsdcInput(text: string, balanceRaw?: bigint | null, maxRaw: bigint = PURCHASE_CONFIG.maxUsdcInRaw): AmountParse {
  return parseTokenInput(text, USDC_DECIMALS, balanceRaw, maxRaw);
}

/**
 * Parse a pay-token field with `decimals` fraction digits at most. `maxRaw`
 * `null` skips the limit check here (a SOL or SKR amount is limited in USD
 * terms from the route quote at preview time). `balanceRaw`, when known, is
 * the spendable balance.
 */
export function parseTokenInput(text: string, decimals: number, balanceRaw?: bigint | null, maxRaw: bigint | null = null): AmountParse {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: false, error: "empty" };
  const match = DECIMAL_INPUT.exec(trimmed);
  if (!match) return { ok: false, error: "format" };
  const [, integerDigits, fractionDigits = ""] = match;
  if (fractionDigits.length > decimals) return { ok: false, error: "precision" };
  const raw = BigInt(integerDigits) * pow10(decimals) + BigInt(fractionDigits.padEnd(decimals, "0") || "0");
  if (raw === 0n) return { ok: false, error: "zero" };
  if (maxRaw !== null && raw > maxRaw) return { ok: false, error: "overLimit" };
  if (balanceRaw !== undefined && balanceRaw !== null && raw > balanceRaw) return { ok: false, error: "overBalance" };
  return { ok: true, raw };
}

/**
 * Parse an amount in `payToken` units: USDC with the per-transaction limit,
 * SOL or SKR without it (their limit applies in USD terms to the quote).
 * The one rule shared by the panel, the buy-flow link and the server quote.
 */
export function parsePayTokenInput(text: string, payToken: PayTokenId, balanceRaw?: bigint | null): AmountParse {
  const maxRaw = payToken === "USDC" ? PURCHASE_CONFIG.maxUsdcInRaw : null;
  return parseTokenInput(text, PAY_TOKEN_UNITS[payToken].decimals, balanceRaw, maxRaw);
}

/**
 * Parse a Token-2022 Scaled UI display amount (what the wallet shows, at most
 * `decimals` fraction digits) into raw units of the mint:
 * `raw = floor(display × 10^decimals ÷ multiplier)`, integer arithmetic only.
 * Truncating keeps the raw amount at or below what was typed, so
 * `formatScaledUnits(raw)` never exceeds the typed amount. `maxRaw` is
 * checked before `balanceRaw` (the limit wins when both apply). A multiplier
 * that is not a positive finite decimal gives `notReady`.
 */
export function parseScaledInput(text: string, decimals: number, multiplier: string, balanceRaw: bigint | null = null, maxRaw: bigint | null = null): AmountParse {
  const display = parseTokenInput(text, decimals);
  if (!display.ok) return display;
  const parsed = parseDecimal(multiplier);
  if (!parsed || parsed.negative || parsed.digits === 0n) return { ok: false, error: "notReady" };
  const raw = (display.raw * pow10(parsed.scale)) / parsed.digits;
  if (raw === 0n) return { ok: false, error: "zero" };
  if (maxRaw !== null && raw > maxRaw) return { ok: false, error: "overLimit" };
  if (balanceRaw !== null && raw > balanceRaw) return { ok: false, error: "overBalance" };
  return { ok: true, raw };
}

/**
 * Exact decimal string for `raw / 10^decimals`, trailing zeros trimmed to at
 * least two fraction digits (`1000000` with 6 decimals is `1.00`).
 */
export function formatRawUnits(raw: bigint, decimals: number): string {
  const negative = raw < 0n;
  const magnitude = negative ? -raw : raw;
  const divisor = pow10(decimals);
  const integer = magnitude / divisor;
  let fraction = (magnitude % divisor).toString().padStart(decimals, "0");
  while (fraction.length > MIN_DISPLAY_FRACTION_DIGITS && fraction.endsWith("0")) fraction = fraction.slice(0, -1);
  const body = decimals === 0 ? integer.toString() : `${integer.toString()}.${fraction}`;
  return negative ? `-${body}` : body;
}

/** A parsed finite decimal: `value = (negative ? -1 : 1) * digits / 10^scale`. */
export interface ParsedDecimal {
  negative: boolean;
  digits: bigint;
  scale: number;
}

const DECIMAL_TEXT = /^(-)?(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i;
/** Guard against absurd exponents in a decimal string read from outside. */
const MAX_DECIMAL_EXPONENT = 64;

/** Parse a decimal string (optionally in exponent form, as SDK decimals print) without floating point. */
export function parseDecimal(text: string): ParsedDecimal | null {
  const match = DECIMAL_TEXT.exec(text.trim());
  if (!match) return null;
  const [, sign, integerDigits, fractionDigits = "", exponentText] = match;
  const exponent = exponentText === undefined ? 0 : Number(exponentText);
  if (!Number.isInteger(exponent) || Math.abs(exponent) > MAX_DECIMAL_EXPONENT) return null;
  let digits = BigInt(`${integerDigits}${fractionDigits}`);
  let scale = fractionDigits.length - exponent;
  if (scale < 0) {
    digits *= pow10(-scale);
    scale = 0;
  }
  return { negative: sign === "-" && digits !== 0n, digits, scale };
}

/**
 * Scaled display amount for a Token-2022 Scaled UI Amount mint:
 * `raw × multiplier ÷ 10^decimals`, truncated toward zero to `decimals`
 * fraction digits so the display never overstates what arrived. Returns
 * `null` when the multiplier is not a positive finite decimal.
 */
export function formatScaledUnits(raw: bigint, decimals: number, multiplier: string): string | null {
  const parsed = parseDecimal(multiplier);
  if (!parsed || parsed.negative || parsed.digits === 0n) return null;
  const negative = raw < 0n;
  const magnitude = negative ? -raw : raw;
  // Truncating integer division keeps the result at or below the exact product.
  const scaledRaw = (magnitude * parsed.digits) / pow10(parsed.scale);
  return formatRawUnits(negative ? -scaledRaw : scaledRaw, decimals);
}

/** Hundredths of the value, rounded half up. */
function percentHundredths(value: ParsedDecimal): bigint {
  if (value.scale <= 2) return value.digits * pow10(2 - value.scale);
  const divisor = pow10(value.scale - 2);
  return (value.digits + divisor / 2n) / divisor;
}

/**
 * Price impact as shown in the panel: two decimals, or `below` when the
 * magnitude is smaller than 0.01%. `null` when the SDK value cannot be read.
 */
export function formatPriceImpactPct(text: string): { kind: "value"; text: string } | { kind: "below" } | null {
  const parsed = parseDecimal(text);
  if (!parsed) return null;
  const magnitude: ParsedDecimal = { ...parsed, negative: false };
  // Exact comparison with 0.01: digits / 10^scale < 1 / 100  <=>  digits * 100 < 10^scale.
  if (magnitude.digits * 100n < pow10(magnitude.scale)) return { kind: "below" };
  const hundredths = percentHundredths(magnitude);
  const text2 = `${hundredths / 100n}.${(hundredths % 100n).toString().padStart(2, "0")}`;
  return { kind: "value", text: parsed.negative ? `-${text2}` : text2 };
}

/** Basis points as a percentage with two decimals (`100` is `1.00`). */
export function formatBpsAsPercent(bps: number): string {
  const whole = Math.trunc(bps / 100);
  const hundredths = Math.abs(bps % 100);
  return `${whole}.${hundredths.toString().padStart(2, "0")}`;
}

/**
 * Group the integer part of a display decimal string for a locale. Only the
 * integer part is grouped (through `bigint`, never a float); the `.` fraction
 * is kept as is. Raw lines are never passed through this.
 */
export function groupDecimalForLocale(decimal: string, locale: string): string {
  const match = /^(-)?(\d+)(\.\d+)?$/.exec(decimal);
  if (!match) return decimal;
  const [, sign = "", integerDigits, fraction = ""] = match;
  return `${sign}${new Intl.NumberFormat(locale, { useGrouping: true }).format(BigInt(integerDigits))}${fraction}`;
}
