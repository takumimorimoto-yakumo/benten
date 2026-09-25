import { describe, expect, it } from "vitest";
import { deepLinkAmountText, deepLinkQuery } from "./deep-link";
import { PURCHASE_CONFIG } from "./config";

describe("buy-flow link amount", () => {
  it("accepts one amount that passes the field's checks and normalizes it", () => {
    expect(deepLinkAmountText("?amount=5")).toBe("5.00");
    expect(deepLinkAmountText("?amount=0.5&ref=chat")).toBe("0.50");
    expect(deepLinkAmountText("?amount=10")).toBe("10.00");
    expect(deepLinkAmountText("?amount=1.234567")).toBe("1.234567");
  });

  it.each([
    ["missing", ""],
    ["empty", "?amount="],
    ["zero", "?amount=0"],
    ["over the limit", "?amount=10.000001"],
    ["far over the limit", "?amount=1000"],
    ["negative", "?amount=-1"],
    ["exponent", "?amount=1e1"],
    ["grouped", "?amount=1,000"],
    ["too precise", "?amount=1.0000001"],
    ["not a number", "?amount=abc"],
    ["repeated", "?amount=1&amount=2"],
  ])("ignores a %s amount", (_name, search) => {
    expect(deepLinkAmountText(search)).toBeNull();
  });

  it("writes the query the reader accepts", () => {
    expect(deepLinkQuery(5_000_000n)).toBe(`?${PURCHASE_CONFIG.deepLinkAmountParam}=5.00`);
    expect(deepLinkAmountText(deepLinkQuery(PURCHASE_CONFIG.maxUsdcInRaw))).toBe("10.00");
  });
});
