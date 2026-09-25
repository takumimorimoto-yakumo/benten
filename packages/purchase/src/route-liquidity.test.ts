import { describe, expect, it } from "vitest";

import { routeLiquidity } from "./route-liquidity";
import { PRODUCT_ROUTES, PRODUCT_TICKERS, type ProductTicker } from "./routes-table";

describe("route liquidity reading", () => {
  it.each([...PRODUCT_TICKERS])("returns the recorded reading of %s", (ticker) => {
    const reading = routeLiquidity(ticker);
    expect(reading).not.toBeNull();
    expect(reading!.usd).toBeGreaterThan(0);
    expect(reading!.observedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("covers both DEXes of the table", () => {
    const dexes = new Set(PRODUCT_TICKERS.filter((ticker) => routeLiquidity(ticker) !== null).map((ticker) => PRODUCT_ROUTES[ticker].dex));
    expect([...dexes].sort()).toEqual(["meteora-dlmm", "raydium-clmm"]);
  });

  it.each(["AAPL", "", "nvda", "__proto__", "constructor", "toString"])("returns null instead of throwing for a ticker with no record: %j", (ticker) => {
    expect(() => routeLiquidity(ticker as ProductTicker)).not.toThrow();
    expect(routeLiquidity(ticker as ProductTicker)).toBeNull();
  });
});
