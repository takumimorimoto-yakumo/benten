import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { readPublicFinancials, readPublicFundamentals, xstocks } from "@benten/registry";
import { getFinancialsV2, getFundamentalsV2, invalidResult, parseV2Query } from "@/lib/public-v2";

const options = { isValidMint: (mint: string): boolean => {
  try { new PublicKey(mint); return true; } catch { return false; }
} };

describe("Web v2 versus shared public read model", () => {
  it("matches every registry ticker and mint fundamental result", () => {
    for (const entry of xstocks) {
      for (const identifier of [{ ticker: entry.ticker }, { mint: entry.mint }]) {
        expect(getFundamentalsV2(identifier).data, `${entry.ticker} fundamentals`)
          .toEqual(readPublicFundamentals(identifier, options));
      }
    }
  });

  it("matches every registry financial result and each statement", () => {
    for (const entry of xstocks) {
      for (const statement of [undefined, "pl", "bs", "cf"] as const) {
        const input = { ticker: entry.ticker, ...(statement ? { statement } : {}) };
        expect(getFinancialsV2(input).data, `${entry.ticker} ${statement ?? "all"}`)
          .toEqual(readPublicFinancials(input, options));
      }
    }
  });

  it("preserves unknown and malformed external selector behavior", () => {
    for (const input of [{ ticker: "NOPE" }, { mint: "11111111111111111111111111111111" }]) {
      expect(getFundamentalsV2(input).data).toEqual(readPublicFundamentals(input, options));
      expect(getFinancialsV2(input).data).toEqual(readPublicFinancials(input, options));
    }
    for (const input of [{ ticker: "NVDA", mint: xstocks[0].mint }, { ticker: "NVDA", extra: true }, {}]) {
      expect(getFinancialsV2(input).data).toEqual(readPublicFinancials(input, options));
    }
    expect(parseV2Query(new URLSearchParams("mint=not-a-solana-mint")))
      .toEqual({ ok: false, reason: "invalid_input" });
    expect(invalidResult("invalid_input").data).toMatchObject({
      found: false, reason: "invalid_input", requested_identifier: null,
    });
  });
});
