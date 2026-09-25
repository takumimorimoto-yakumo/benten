import { describe, expect, it } from "vitest";
import {
  isWithheldFromProduct,
  listPublicAssets,
  productXStocks,
  readPublicFinancials,
  readPublicFundamentals,
  resolveAssetIdentifier,
  resolveMint,
  resolveTicker,
  xstocks,
} from "./index.js";

const validMint = () => true;
const withheld = xstocks.filter(isWithheldFromProduct);

describe("registry rows withheld from product surfaces", () => {
  it("withholds exactly the two rows the registry marks private, and keeps them in the registry data", () => {
    expect(withheld.map((entry) => entry.ticker)).toEqual(["SPCX", "VCX"]);
    expect(xstocks).toHaveLength(154);
    expect(productXStocks).toHaveLength(152);
    expect(productXStocks.some(isWithheldFromProduct)).toBe(false);
    expect(Object.isFrozen(productXStocks)).toBe(true);
  });

  it("never resolves a withheld row through the allowlist, in any accepted spelling", () => {
    for (const entry of withheld) {
      for (const ticker of [entry.ticker, entry.ticker.toLowerCase(), ` ${entry.ticker} `, entry.symbol]) {
        expect(resolveTicker(ticker)).toBeNull();
      }
      expect(resolveMint(entry.mint)).toBeNull();
      expect(resolveMint(` ${entry.mint} `)).toBeNull();
      expect(resolveAssetIdentifier({ ticker: entry.ticker })).toBeUndefined();
      expect(resolveAssetIdentifier({ mint: entry.mint })).toBeUndefined();
    }
  });

  it("keeps withheld rows out of every catalog and read", () => {
    const catalog = listPublicAssets({});
    if (!catalog.found) throw new Error("catalog unavailable");
    const tickers = catalog.items.map((item) => item.identity.ticker);
    for (const entry of withheld) {
      expect(tickers).not.toContain(entry.ticker);
      expect(listPublicAssets({ ticker: entry.ticker })).toEqual({ found: true, items: [] });
      expect(listPublicAssets({ mint: entry.mint })).toEqual({ found: true, items: [] });
      expect(readPublicFundamentals({ ticker: entry.ticker }, { isValidMint: validMint }))
        .toMatchObject({ found: false, reason: "unknown_ticker", identity: null, coverage: null });
      expect(readPublicFundamentals({ mint: entry.mint }, { isValidMint: validMint }))
        .toMatchObject({ found: false, reason: "unknown_mint", identity: null, coverage: null });
      expect(readPublicFinancials({ ticker: entry.ticker }, { isValidMint: validMint }))
        .toMatchObject({ found: false, reason: "unknown_ticker", identity: null });
    }
    expect(listPublicAssets({ exclusion_reason: "private" })).toEqual({ found: true, items: [] });
  });
});
