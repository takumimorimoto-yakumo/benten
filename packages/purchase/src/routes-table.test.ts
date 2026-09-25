import { describe, expect, it } from "vitest";
import { resolveMint, resolveTicker } from "@benten/registry";

import { isPurchasableMint, NVDAX_MINT, NVDAX_SYMBOL, NVDAX_USDC_POOL } from "./route";
import { DEFAULT_PRODUCT, PRODUCT_ROUTES, PRODUCT_TICKERS, productRoute, productRouteForMint, purchasableRoute, resolveProductTicker } from "./routes-table";

const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

/**
 * The pinned pools, copied from the read-only mainnet observation of
 * 2026-09-25 (pool owner DLMM, token X the product mint, token Y USDC). A
 * change to the table must change this list too.
 */
const OBSERVED_POOLS: Record<string, string> = {
  NVDA: "F4inHs4RQARpASmvLpj45QjGLdkukeGQrtQ22pimVy2a",
  META: "D8pGWVN3vWeyexBtMZjyyPbcLhM1oeTEMibE9h3nNRYL",
  MSTR: "CK751YkvVdjWF6cC3Mcs6ibb16DQ417ohXDZ52CRC4xS",
  GOOGL: "HgerAhee6opeBQZSLYALL87kBAe9sa3gXM3qj7S4Jdk5",
  CRCL: "DUJM3UvCd9o7CtQ771JR8x5ecn9AsbiH1GnEZAWwCinT",
  TSLA: "BCZLEgknvcyCsJ9ERRN38U4gBTNn4ftU11fEtV3XHnK2",
  SPY: "6uAw2iue69CTGsENLS3j2ur4NnBtbmGptFZ1ZZUje5PJ",
  HOOD: "AiKXdE3vAtCQTD9REbMEwNnuUfxHAZtBaHoVHdQirBUU",
};

describe("routes table", () => {
  it("lists exactly the eight observed products, NVDA first and by default", () => {
    expect([...PRODUCT_TICKERS]).toEqual(Object.keys(OBSERVED_POOLS));
    expect(Object.keys(PRODUCT_ROUTES)).toEqual([...PRODUCT_TICKERS]);
    expect(DEFAULT_PRODUCT).toBe("NVDA");
  });

  it.each([...PRODUCT_TICKERS])("pins %s to its registry mint, decimals and symbol, and its observed pool", (ticker) => {
    const route = PRODUCT_ROUTES[ticker];
    const entry = resolveTicker(ticker);
    expect(entry).not.toBeNull();
    expect(route.ticker).toBe(ticker);
    expect(route.productMint.toBase58()).toBe(entry!.mint);
    expect(route.decimals).toBe(entry!.decimals);
    expect(route.symbol).toBe(entry!.symbol);
    expect(route.pool.toBase58()).toBe(OBSERVED_POOLS[ticker]);
    expect(route.orientation).toBe("product_x_usdc_y");
    expect(route.tokenProgram.toBase58()).toBe(TOKEN_2022);
    // Through the registry gate, by ticker and by mint.
    expect(purchasableRoute(entry)).toBe(route);
    expect(purchasableRoute(resolveMint(entry!.mint))).toBe(route);
    expect(productRouteForMint(entry!.mint)).toBe(route);
    expect(isPurchasableMint(entry!.mint)).toBe(true);
  });

  it("gives every product its own pool and mint", () => {
    const pools = new Set(PRODUCT_TICKERS.map((ticker) => PRODUCT_ROUTES[ticker].pool.toBase58()));
    const mints = new Set(PRODUCT_TICKERS.map((ticker) => PRODUCT_ROUTES[ticker].productMint.toBase58()));
    expect(pools.size).toBe(PRODUCT_TICKERS.length);
    expect(mints.size).toBe(PRODUCT_TICKERS.length);
  });

  it("keeps the original NVDAx names as the NVDA entry", () => {
    expect(NVDAX_USDC_POOL).toBe(PRODUCT_ROUTES.NVDA.pool);
    expect(NVDAX_MINT).toBe(PRODUCT_ROUTES.NVDA.productMint);
    expect(NVDAX_SYMBOL).toBe("NVDAx");
  });
});

describe("routes table gate", () => {
  it.each(["AMZN", "COIN", "MSFT", "QQQ"])("does not make the registry product %s purchasable", (ticker) => {
    const entry = resolveTicker(ticker);
    expect(entry).not.toBeNull();
    expect(purchasableRoute(entry)).toBeNull();
    expect(isPurchasableMint(entry!.mint)).toBe(false);
  });

  it("refuses a registry-shaped entry whose mint or decimals differ from the table", () => {
    const meta = resolveTicker("META")!;
    expect(purchasableRoute({ ...meta, mint: NVDAX_MINT.toBase58() })).toBeNull();
    expect(purchasableRoute({ ...meta, decimals: 6 })).toBeNull();
    expect(purchasableRoute(null)).toBeNull();
    expect(purchasableRoute(undefined)).toBeNull();
  });

  it.each(["meta", " META", "META ", "METAx", "Meta", "NVDA,META", "", "SPCX"])("matches a table key exactly: %j is not one", (value) => {
    expect(resolveProductTicker(value)).toBeNull();
  });

  it("matches a mint exactly: case changes, padding and pool addresses are not mints", () => {
    const mint = PRODUCT_ROUTES.META.productMint.toBase58();
    expect(productRouteForMint(mint.toLowerCase())).toBeNull();
    expect(productRouteForMint(` ${mint}`)).toBeNull();
    expect(productRouteForMint(PRODUCT_ROUTES.META.pool.toBase58())).toBeNull();
    expect(productRouteForMint(42)).toBeNull();
  });

  it("throws for a value that is not a table key", () => {
    expect(() => productRoute("AMZN" as never)).toThrow(/no pinned route/);
  });
});
