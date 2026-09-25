import { describe, expect, it } from "vitest";
import { resolveMint, resolveTicker } from "@benten/registry";

import { isPurchasableMint, NVDAX_MINT, NVDAX_SYMBOL, NVDAX_USDC_POOL } from "./route";
import { PRODUCT_SYMBOLS } from "./product-symbols";
import observed from "./routes-observed.json" with { type: "json" };
import { DEFAULT_PRODUCT, dlmmProductRoute, PRODUCT_ROUTES, PRODUCT_TICKERS, productRoute, productRouteForMint, purchasableRoute, resolveProductTicker } from "./routes-table";

const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

/**
 * The pinned pools as the read-only mainnet observation recorded them
 * (`routes-observed.json`, written by `scripts/routes/add-routes.mjs` after
 * it checked each pool: owner DLMM, token X the product mint, token Y USDC).
 * A change to the table must change that record too.
 */
const OBSERVED_POOLS: Record<string, string> = Object.fromEntries(Object.entries(observed).map(([ticker, record]) => [ticker, record.pool]));

describe("routes table", () => {
  it("lists exactly the observed products, NVDA first and by default", () => {
    expect([...PRODUCT_TICKERS]).toEqual(Object.keys(OBSERVED_POOLS));
    // Written out so that a route added or dropped is reviewed here too.
    expect([...PRODUCT_TICKERS]).toEqual(["NVDA", "META", "MSTR", "GOOGL", "CRCL", "TSLA", "SPY", "HOOD", "AMD", "COIN", "AMZN", "MSFT", "QQQ", "GLD", "BRK.B", "AVGO", "MCD", "KO", "INTC", "UNH", "XOM", "PLTR", "GME", "STRC", "WMT"]);
    expect(Object.keys(PRODUCT_ROUTES)).toEqual([...PRODUCT_TICKERS]);
    expect(PRODUCT_TICKERS[0]).toBe("NVDA");
    expect(DEFAULT_PRODUCT).toBe("NVDA");
  });

  it("states the table's symbols, in its order, in the dependency-free symbol list", () => {
    expect([...PRODUCT_SYMBOLS]).toEqual(PRODUCT_TICKERS.map((ticker) => PRODUCT_ROUTES[ticker].symbol));
  });

  it.each([...PRODUCT_TICKERS])("records a liquidity reading and its date for %s", (ticker) => {
    const record = (observed as Record<string, { liquidityUsd: number; observedOn: string }>)[ticker]!;
    expect(record.liquidityUsd).toBeGreaterThan(0);
    expect(record.observedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
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

  it.each([...PRODUCT_TICKERS])("records %s under its route's DEX", (ticker) => {
    const record = (observed as Record<string, { dex?: string }>)[ticker]!;
    // The DLMM generator's records carry no DEX field; the Raydium CLMM records name theirs.
    expect(record.dex ?? "meteora-dlmm").toBe(PRODUCT_ROUTES[ticker].dex);
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
  it.each(["ACN", "IBM", "PEP", "JPM"])("does not make the registry product %s purchasable", (ticker) => {
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
    expect(() => productRoute("AAPL" as never)).toThrow(/no pinned route/);
  });
});

describe("DLMM route gate", () => {
  it.each([...PRODUCT_TICKERS])("gives %s to the DLMM reader and builders only when its route is a DLMM pool", (ticker) => {
    const route = PRODUCT_ROUTES[ticker];
    expect(dlmmProductRoute(ticker)).toBe(route.dex === "meteora-dlmm" ? route : null);
  });

  it("refuses every Raydium CLMM product and still throws for a value that is not a table key", () => {
    const clmm = PRODUCT_TICKERS.filter((ticker) => PRODUCT_ROUTES[ticker].dex === "raydium-clmm");
    expect(clmm.length).toBeGreaterThan(0);
    for (const ticker of clmm) expect(dlmmProductRoute(ticker)).toBeNull();
    expect(() => dlmmProductRoute("AAPL" as never)).toThrow(/no pinned route/);
  });
});
