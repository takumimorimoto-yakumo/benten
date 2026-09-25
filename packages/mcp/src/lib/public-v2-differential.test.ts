import { describe, expect, it } from "vitest";
import { productXStocks, readPublicFinancials, readPublicFundamentals, xstocks } from "@benten/registry";
import { isValidSolanaAddress } from "./solana-address.js";
import { getFinancialsV2, getFundamentalsV2, listXstocksV2 } from "./public-v2.js";

const options = { isValidMint: isValidSolanaAddress };

describe("MCP v2 versus shared public read model", () => {
  it("matches every registry ticker and mint fundamental structured payload", () => {
    for (const entry of xstocks) {
      for (const identifier of [{ ticker: entry.ticker }, { mint: entry.mint }]) {
        expect(getFundamentalsV2(identifier).structured.data, `${entry.ticker} fundamentals`)
          .toEqual(readPublicFundamentals(identifier, options));
      }
    }
  });

  it("matches every registry financial structured payload and each statement", () => {
    for (const entry of xstocks) {
      for (const statement of [undefined, "pl", "bs", "cf"] as const) {
        const input = { ticker: entry.ticker, ...(statement ? { statement } : {}) };
        expect(getFinancialsV2(input).structured.data, `${entry.ticker} ${statement ?? "all"}`)
          .toEqual(readPublicFinancials(input, options));
      }
    }
  });

  it("keeps list and unknown-selector results bounded", () => {
    expect((listXstocksV2().structured.data as { items: unknown[] }).items).toHaveLength(productXStocks.length);
    for (const input of [{ ticker: "NOPE" }, { mint: "11111111111111111111111111111111" }]) {
      expect(getFundamentalsV2(input).structured.data).toEqual(readPublicFundamentals(input, options));
      expect(getFinancialsV2(input).structured.data).toEqual(readPublicFinancials(input, options));
    }
  });

  it("preserves malformed MCP selector echo in structured and legacy text for both financial tools", () => {
    const cases = [
      [{ mint: "bad" }, "bad"],
      [{ ticker: "NVDA", mint: "bad" }, "NVDA"],
    ] as const;
    for (const [input, requested] of cases) {
      for (const call of [getFundamentalsV2, getFinancialsV2]) {
        const result = call(input);
        expect(result.structured.data).toMatchObject({
          found: false, reason: "invalid_input", requested_identifier: requested,
        });
        expect(result.text.data).toMatchObject({
          found: false, reason: "invalid_input", ticker: requested,
        });
      }
    }
  });
});
