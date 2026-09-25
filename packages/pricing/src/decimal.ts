/**
 * Exact decimal arithmetic for prices and valuations, on `bigint` only. A
 * value is `digits / 10^scale`. Nothing here converts through a
 * floating-point number.
 */

export interface Decimal {
  digits: bigint;
  scale: number;
}

const DECIMAL_TEXT = /^(-)?(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i;
/** Guard against absurd exponents in a decimal string read from outside. */
const MAX_EXPONENT = 64;

function pow10(exponent: number): bigint {
  return 10n ** BigInt(exponent);
}

/** An integer scaled by a power of ten, as Pyth publishes prices (`value × 10^exponent`). */
export function fromScaledInteger(value: bigint, exponent: number): Decimal {
  return exponent >= 0 ? { digits: value * pow10(exponent), scale: 0 } : { digits: value, scale: -exponent };
}

/** Parse a finite decimal string (optionally in exponent form). `null` for anything else. */
export function parseDecimal(text: string): Decimal | null {
  const match = DECIMAL_TEXT.exec(text);
  if (!match) return null;
  const [, sign, integerDigits, fractionDigits = "", exponentText] = match;
  const exponent = exponentText === undefined ? 0 : Number(exponentText);
  if (!Number.isInteger(exponent) || Math.abs(exponent) > MAX_EXPONENT) return null;
  const magnitude = BigInt(`${integerDigits}${fractionDigits}`);
  return fromScaledInteger(sign === "-" ? -magnitude : magnitude, exponent - fractionDigits.length);
}

export function multiply(left: Decimal, right: Decimal): Decimal {
  return { digits: left.digits * right.digits, scale: left.scale + right.scale };
}

export function add(left: Decimal, right: Decimal): Decimal {
  const scale = Math.max(left.scale, right.scale);
  return { digits: left.digits * pow10(scale - left.scale) + right.digits * pow10(scale - right.scale), scale };
}

export const ZERO: Decimal = { digits: 0n, scale: 0 };

/** Exact decimal text with no trailing fraction zeros (`1.50` is `1.5`, `2.0` is `2`). */
export function formatExact(value: Decimal): string {
  const negative = value.digits < 0n;
  const magnitude = negative ? -value.digits : value.digits;
  const divisor = pow10(value.scale);
  const integer = magnitude / divisor;
  const fraction = value.scale === 0 ? "" : (magnitude % divisor).toString().padStart(value.scale, "0").replace(/0+$/, "");
  const body = fraction === "" ? integer.toString() : `${integer}.${fraction}`;
  return negative && magnitude !== 0n ? `-${body}` : body;
}

/**
 * Decimal text with exactly `fractionDigits` digits, truncated toward zero so
 * a shown amount never overstates the exact value.
 */
export function formatTruncated(value: Decimal, fractionDigits: number): string {
  const negative = value.digits < 0n;
  const magnitude = negative ? -value.digits : value.digits;
  const truncated = value.scale <= fractionDigits
    ? magnitude * pow10(fractionDigits - value.scale)
    : magnitude / pow10(value.scale - fractionDigits);
  const divisor = pow10(fractionDigits);
  const integer = truncated / divisor;
  const body = fractionDigits === 0 ? integer.toString() : `${integer}.${(truncated % divisor).toString().padStart(fractionDigits, "0")}`;
  return negative && truncated !== 0n ? `-${body}` : body;
}
