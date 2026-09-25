import { describe, expect, it } from "vitest";

import {
  formatBpsAsPercent,
  formatPriceImpactPct,
  formatRawUnits,
  formatScaledUnits,
  groupDecimalForLocale,
  parseDecimal,
  parseUsdcInput,
} from "./amount";
import { PURCHASE_CONFIG } from "./config";

describe("parseUsdcInput", () => {
  it.each([
    ["1", 1_000_000n],
    ["1.5", 1_500_000n],
    ["0.000001", 1n],
    ["  2.25  ", 2_250_000n],
    ["007.010000", 7_010_000n],
    ["10", 10_000_000n],
    ["9.999999", 9_999_999n],
  ])("parses %j to %s raw units", (text, raw) => {
    expect(parseUsdcInput(text)).toEqual({ ok: true, raw });
  });

  it("uses the 10 USDC per-transaction cap as the default limit", () => {
    expect(PURCHASE_CONFIG.maxUsdcInRaw).toBe(10_000_000n);
    expect(parseUsdcInput("10")).toEqual({ ok: true, raw: 10_000_000n });
    expect(parseUsdcInput("10.000001")).toEqual({ ok: false, error: "overLimit" });
    expect(parseUsdcInput("100")).toEqual({ ok: false, error: "overLimit" });
    expect(parseUsdcInput("1000000000000000000000000")).toEqual({ ok: false, error: "overLimit" });
  });

  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["-1", "format"],
    ["+1", "format"],
    ["1e3", "format"],
    ["1E-6", "format"],
    ["1,000", "format"],
    ["1,5", "format"],
    ["1.", "format"],
    [".5", "format"],
    ["1.2.3", "format"],
    ["0x10", "format"],
    ["Infinity", "format"],
    ["NaN", "format"],
    ["1 000", "format"],
    ["١", "format"],
    ["1.0000001", "precision"],
    ["0.1234567", "precision"],
    ["0", "zero"],
    ["0.000000", "zero"],
    ["000", "zero"],
  ])("rejects %j as %s", (text, error) => {
    expect(parseUsdcInput(text)).toEqual({ ok: false, error });
  });

  it("checks the balance only when it is known, after the cap", () => {
    expect(parseUsdcInput("2", 1_999_999n)).toEqual({ ok: false, error: "overBalance" });
    expect(parseUsdcInput("2", 2_000_000n)).toEqual({ ok: true, raw: 2_000_000n });
    expect(parseUsdcInput("2", null)).toEqual({ ok: true, raw: 2_000_000n });
    expect(parseUsdcInput("200", 1n)).toEqual({ ok: false, error: "overLimit" });
  });

  it("never goes through a float (precision beyond 2^53 survives)", () => {
    expect(parseUsdcInput("90071992.547409", 10n ** 30n, 10n ** 30n)).toEqual({ ok: true, raw: 90_071_992_547_409n });
    expect(parseUsdcInput("9007199254740993", 10n ** 30n, 10n ** 30n)).toEqual({ ok: true, raw: 9_007_199_254_740_993_000_000n });
  });
});

describe("formatRawUnits", () => {
  it.each([
    [1_000_000n, 6, "1.00"],
    [1_500_000n, 6, "1.50"],
    [1n, 6, "0.000001"],
    [441_982n, 8, "0.00441982"],
    [100_000_000n, 8, "1.00"],
    [0n, 6, "0.00"],
    [-2_250n, 6, "-0.00225"],
  ])("formats %s with %i decimals as %s", (raw, decimals, text) => {
    expect(formatRawUnits(raw, decimals)).toBe(text);
  });
});

describe("formatScaledUnits", () => {
  it("multiplies raw units by the multiplier and truncates toward zero", () => {
    // 441982 * 1.001701196801074 = 442733.9... -> truncated to 442733 base units.
    expect(formatScaledUnits(441_982n, 8, "1.001701196801074")).toBe("0.00442733");
    expect(formatScaledUnits(1n, 8, "1.9999")).toBe("0.00000001");
    expect(formatScaledUnits(3n, 8, "0.5")).toBe("0.00000001");
    expect(formatScaledUnits(100_000_000n, 8, "1")).toBe("1.00");
  });

  it("accepts exponent notation and rejects unusable multipliers", () => {
    expect(formatScaledUnits(100_000_000n, 8, "1.5e0")).toBe("1.50");
    expect(formatScaledUnits(100_000_000n, 8, "0")).toBeNull();
    expect(formatScaledUnits(100_000_000n, 8, "-1")).toBeNull();
    expect(formatScaledUnits(100_000_000n, 8, "abc")).toBeNull();
    expect(formatScaledUnits(100_000_000n, 8, "1e999")).toBeNull();
  });
});

describe("decimal helpers", () => {
  it("parses decimals without floating point", () => {
    expect(parseDecimal("1.25")).toEqual({ negative: false, digits: 125n, scale: 2 });
    expect(parseDecimal("1.2e-7")).toEqual({ negative: false, digits: 12n, scale: 8 });
    expect(parseDecimal("12e2")).toEqual({ negative: false, digits: 1200n, scale: 0 });
    expect(parseDecimal("-0")).toEqual({ negative: false, digits: 0n, scale: 0 });
    expect(parseDecimal("")).toBeNull();
  });

  it("shows price impact with two decimals or as below 0.01%", () => {
    expect(formatPriceImpactPct("0")).toEqual({ kind: "below" });
    expect(formatPriceImpactPct("0.009999")).toEqual({ kind: "below" });
    expect(formatPriceImpactPct("1.2e-7")).toEqual({ kind: "below" });
    expect(formatPriceImpactPct("0.01")).toEqual({ kind: "value", text: "0.01" });
    expect(formatPriceImpactPct("0.125")).toEqual({ kind: "value", text: "0.13" });
    expect(formatPriceImpactPct("-2.5")).toEqual({ kind: "value", text: "-2.50" });
    expect(formatPriceImpactPct("n/a")).toBeNull();
  });

  it("formats basis points as a percentage", () => {
    expect(formatBpsAsPercent(100)).toBe("1.00");
    expect(formatBpsAsPercent(5)).toBe("0.05");
    expect(formatBpsAsPercent(1_250)).toBe("12.50");
  });

  it("groups only the integer part for display", () => {
    expect(groupDecimalForLocale("1234567.891", "en")).toBe("1,234,567.891");
    expect(groupDecimalForLocale("1234.5", "ja")).toBe("1,234.5");
    expect(groupDecimalForLocale("12", "ko")).toBe("12");
    expect(groupDecimalForLocale("not a number", "en")).toBe("not a number");
  });
});
