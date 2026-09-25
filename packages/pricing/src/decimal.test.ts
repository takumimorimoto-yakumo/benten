import { describe, expect, it } from "vitest";

import { add, formatExact, formatTruncated, fromScaledInteger, multiply, parseDecimal } from "./decimal.js";

describe("decimal", () => {
  it("formats Pyth scaled integers exactly", () => {
    expect(formatExact(fromScaledInteger(22_383_505n, -5))).toBe("223.83505");
    expect(formatExact(fromScaledInteger(-1_500n, -3))).toBe("-1.5");
    expect(formatExact(fromScaledInteger(12n, 2))).toBe("1200");
    expect(formatExact(fromScaledInteger(5n, -8))).toBe("0.00000005");
  });

  it("parses decimal and exponent text without floating point", () => {
    expect(parseDecimal("1.001701196801074")).toEqual({ digits: 1_001_701_196_801_074n, scale: 15 });
    expect(formatExact(parseDecimal("1e-7")!)).toBe("0.0000001");
    expect(formatExact(parseDecimal("10")!)).toBe("10");
    for (const bad of ["", "1.", ".5", "1,000", "0x10", "1e999", "NaN"]) expect(parseDecimal(bad)).toBeNull();
  });

  it("multiplies, adds and truncates toward zero", () => {
    const value = multiply(parseDecimal("1.999")!, parseDecimal("1")!);
    expect(formatTruncated(value, 2)).toBe("1.99");
    expect(formatTruncated(parseDecimal("-1.999")!, 2)).toBe("-1.99");
    expect(formatTruncated(parseDecimal("-0.001")!, 2)).toBe("0.00");
    expect(formatTruncated(parseDecimal("3")!, 2)).toBe("3.00");
    expect(formatExact(add(parseDecimal("0.1")!, parseDecimal("0.25")!))).toBe("0.35");
  });
});
