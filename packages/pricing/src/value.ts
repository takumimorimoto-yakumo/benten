/**
 * The arithmetic of a Pyth reference valuation, with no feed map: which feed
 * values a holding is decided by the caller (`valuation.ts` from the
 * validated feed map; the browser from its reviewed feed index), and this
 * module only turns one holding and one price into a value.
 *
 * `value = raw ÷ 10^decimals × Scaled UI multiplier × price`, exact on
 * `bigint`, truncated to `PRICING_CONFIG.valueFractionDigits` for display so
 * it is never overstated. A holding without its decimals, its Scaled UI
 * extension or the multiplier in effect has no value (a missing multiplier
 * is never taken as 1). This module has no runtime dependency beyond the
 * config and the decimal helpers, so browser code can import it.
 */

import { PRICING_CONFIG } from "./config.js";
import { ZERO, add, formatExact, formatTruncated, fromScaledInteger, multiply, parseDecimal, type Decimal } from "./decimal.js";

/** The holding facts a valuation needs. Field meanings match `@benten/holdings`. */
export interface ValueHoldingFacts {
  rawAmount: string;
  decimals: number | null;
  hasScaledUiAmount: boolean | null;
  scaledUiMultiplier: string | null;
}

/** One price as Pyth publishes it: `price_raw × 10^exponent`. */
export interface ValuePrice {
  price_raw: string;
  exponent: number;
}

export type ReferenceValue =
  | {
    status: "valued";
    /** Truncated to `PRICING_CONFIG.valueFractionDigits`. */
    value: string;
    /** Underlying shares represented: raw ÷ 10^decimals × multiplier, exact. */
    shareEquivalent: string;
    multiplier: string;
    /** The exact value, for summing without rounding each part. */
    exact: Decimal;
  }
  | { status: "unavailable"; reason: "holding_metadata_unavailable" | "multiplier_unavailable" };

const RAW_AMOUNT = /^\d+$/;

/** Value one holding at one price. */
export function referenceValue(holding: ValueHoldingFacts, price: ValuePrice): ReferenceValue {
  if (holding.decimals === null || holding.hasScaledUiAmount === null || !RAW_AMOUNT.test(holding.rawAmount)) {
    return { status: "unavailable", reason: "holding_metadata_unavailable" };
  }
  const multiplier = holding.hasScaledUiAmount && holding.scaledUiMultiplier !== null ? parseDecimal(holding.scaledUiMultiplier) : null;
  if (!multiplier || multiplier.digits <= 0n) return { status: "unavailable", reason: "multiplier_unavailable" };
  const shares = multiply({ digits: BigInt(holding.rawAmount), scale: holding.decimals }, multiplier);
  const exact = multiply(shares, fromScaledInteger(BigInt(price.price_raw), price.exponent));
  return {
    status: "valued",
    value: formatTruncated(exact, PRICING_CONFIG.valueFractionDigits),
    shareEquivalent: formatExact(shares),
    multiplier: formatExact(multiplier),
    exact,
  };
}

/** The sum of exact values, truncated like each value. */
export function sumReferenceValues(values: readonly Decimal[]): string {
  return formatTruncated(values.reduce(add, ZERO), PRICING_CONFIG.valueFractionDigits);
}
