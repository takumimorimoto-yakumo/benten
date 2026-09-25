import { describe, expect, it } from "vitest";
import { excludedXStocks, isWithheldFromProduct, resolveFinancialRequest } from "./index.js";

const VALID_UNKNOWN_MINT = "11111111111111111111111111111111";
const validMint = (mint: string) => mint === VALID_UNKNOWN_MINT || mint.length >= 32;

describe("resolveFinancialRequest", () => {
  it("returns unknown_ticker before checking an invalid statement", () => {
    expect(resolveFinancialRequest({ ticker: "XXXX", statement: "quarterly" }, { isValidMint: validMint }))
      .toEqual({ ok: false, reason: "unknown_ticker", requested: { kind: "ticker", value: "XXXX" } });
  });

  it.each(["NVDA' OR '1'='1", "mſft", "ＮＶＤＡ"])("keeps legacy unknown ticker classification for %s", (ticker) => {
    expect(resolveFinancialRequest({ ticker, statement: "quarterly" }, { isValidMint: validMint }))
      .toEqual({ ok: false, reason: "unknown_ticker", requested: { kind: "ticker", value: ticker.trim() } });
  });

  it("returns unknown_mint before checking an invalid statement", () => {
    expect(resolveFinancialRequest({ mint: VALID_UNKNOWN_MINT, statement: "quarterly" }, { isValidMint: validMint }))
      .toEqual({ ok: false, reason: "unknown_mint", requested: { kind: "mint", value: VALID_UNKNOWN_MINT } });
  });

  it("returns a known entry with invalid_statement", () => {
    const result = resolveFinancialRequest({ ticker: "NVDA", statement: "quarterly" }, { isValidMint: validMint });
    expect(result).toMatchObject({ ok: false, reason: "invalid_statement", entry: { ticker: "NVDA" } });
  });

  it("returns eligibility before statement errors for every ineligible product entry", () => {
    expect(excludedXStocks).toHaveLength(25);
    const product = excludedXStocks.filter((entry) => !isWithheldFromProduct(entry));
    expect(product).toHaveLength(23);
    for (const entry of product) {
      for (const statement of ["", "quarterly"]) {
        expect(resolveFinancialRequest({ ticker: entry.ticker, statement }, { isValidMint: validMint }))
          .toEqual({
            ok: false,
            reason: "not_eligible",
            entry,
            requested: { kind: "ticker", value: entry.ticker },
          });
      }
    }
  });

  it("returns selected or all exact statement names", () => {
    expect(resolveFinancialRequest({ ticker: "NVDA", statement: "cf" }, { isValidMint: validMint }))
      .toMatchObject({ ok: true, entry: { ticker: "NVDA" }, statements: ["cf"] });
    expect(resolveFinancialRequest({ ticker: "NVDA" }, { isValidMint: validMint }))
      .toMatchObject({ ok: true, statements: ["pl", "bs", "cf"] });
    expect(resolveFinancialRequest({ ticker: "NVDA", statement: undefined }, { isValidMint: validMint }))
      .toMatchObject({ ok: true, statements: ["pl", "bs", "cf"] });
  });

  it.each([
    [{ ticker: "NVDA", mint: VALID_UNKNOWN_MINT }],
    [{ mint: "bad", statement: "quarterly" }],
    [{ ticker: "NVDA", extra: true }],
  ])("rejects malformed input before lookup %#", (input) => {
    expect(resolveFinancialRequest(input, { isValidMint: validMint })).toEqual({ ok: false, reason: "invalid_input", requested: null });
  });
});
