import { describe, expect, it } from "vitest";
import { deepLinkQuery, readDeepLink } from "./deep-link";
import { PURCHASE_CONFIG } from "./config";

const amountOf = (search: string) => readDeepLink(search)?.amountText ?? null;

describe("buy-flow link amount", () => {
  it("accepts one amount that passes the field's checks and normalizes it", () => {
    expect(amountOf("?amount=5")).toBe("5.00");
    expect(amountOf("?amount=0.5&ref=chat")).toBe("0.50");
    expect(amountOf("?amount=10")).toBe("10.00");
    expect(amountOf("?amount=1.234567")).toBe("1.234567");
    expect(readDeepLink("?amount=5")).toEqual({ payToken: "USDC", amountText: "5.00" });
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
    expect(amountOf(search)).toBeNull();
  });

  it("writes the query the reader accepts", () => {
    expect(deepLinkQuery(5_000_000n)).toBe(`?${PURCHASE_CONFIG.deepLinkAmountParam}=5.00`);
    expect(amountOf(deepLinkQuery(PURCHASE_CONFIG.maxUsdcInRaw))).toBe("10.00");
  });
});

describe("buy-flow link pay token", () => {
  it("selects SOL or SKR by the exact lower-case id and reads the amount in that token's units", () => {
    expect(readDeepLink("?amount=0.02&pay=sol")).toEqual({ payToken: "SOL", amountText: "0.02" });
    expect(readDeepLink("?pay=skr&amount=100")).toEqual({ payToken: "SKR", amountText: "100.00" });
    expect(readDeepLink("?amount=5&pay=usdc")).toEqual({ payToken: "USDC", amountText: "5.00" });
    // SOL has 9 decimals; the USDC limit does not apply to a SOL or SKR amount (it is limited in USD terms when quoted).
    expect(readDeepLink("?amount=0.123456789&pay=sol")).toEqual({ payToken: "SOL", amountText: "0.123456789" });
    expect(readDeepLink("?amount=1000&pay=skr")).toEqual({ payToken: "SKR", amountText: "1000.00" });
  });

  it("keeps a valid pay token when the amount is invalid in its units", () => {
    expect(readDeepLink("?amount=0.0000000001&pay=sol")).toEqual({ payToken: "SOL", amountText: null });
    expect(readDeepLink("?amount=1.0000001&pay=skr")).toEqual({ payToken: "SKR", amountText: null });
    expect(readDeepLink("?pay=sol")).toEqual({ payToken: "SOL", amountText: null });
  });

  it.each([
    ["upper case", "?amount=1&pay=SOL"],
    ["mixed case", "?amount=1&pay=Sol"],
    ["unknown token", "?amount=1&pay=btc"],
    ["padded", "?amount=1&pay=%20sol"],
    ["empty", "?amount=1&pay="],
    ["repeated", "?amount=1&pay=sol&pay=sol"],
    ["two tokens", "?amount=1&pay=sol&pay=skr"],
  ])("ignores the whole link for a %s pay value", (_name, search) => {
    expect(readDeepLink(search)).toBeNull();
  });

  it("ignores a link without pay and without a valid amount, so a plain visit changes nothing", () => {
    for (const search of ["", "?", "?amount=11", "?amount=abc", "?amount=5&amount=6", "?other=1"]) {
      expect(readDeepLink(search), search).toBeNull();
    }
  });

  it("writes a pay-token query the reader accepts, and the original form for USDC", () => {
    expect(deepLinkQuery(20_000_000n, "SOL")).toBe("?amount=0.02&pay=sol");
    expect(deepLinkQuery(100_000_000n, "SKR")).toBe("?amount=100.00&pay=skr");
    expect(deepLinkQuery(5_000_000n, "USDC")).toBe("?amount=5.00");
    expect(readDeepLink(deepLinkQuery(20_000_000n, "SOL"))).toEqual({ payToken: "SOL", amountText: "0.02" });
  });
});
