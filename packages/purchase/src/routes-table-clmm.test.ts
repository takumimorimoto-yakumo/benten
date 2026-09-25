/**
 * The Raydium CLMM part of the routes table against independent evidence:
 * the registry (mints, decimals, symbols, product rule), the program's vault
 * derivation, and the pools recorded read-only on mainnet
 * (`clmm-pools.fixture.json`, 2026-09-25).
 */
import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { resolveTicker } from "@benten/registry";

import fixture from "./clmm-pools.fixture.json";
import { CLMM_CONFIG } from "./clmm-config";
import { PURCHASE_CONFIG } from "./config";
import observed from "./routes-observed.json" with { type: "json" };
import { decodePoolState, poolVaultAddress, tickArrayAddress } from "./clmm-program";
import { PRODUCT_TICKERS, productRouteForMint, purchasableRoute, resolveProductTicker } from "./routes-table";
import { CLMM_PRODUCT_ROUTES, CLMM_PRODUCT_TICKERS, clmmPins, type ClmmProductTicker } from "./routes-table-clmm";

const TOKEN_2022 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const USDC = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const bytes = (base64: string) => Uint8Array.from(Buffer.from(base64, "base64"));

describe("CLMM routes table", () => {
  it("keeps SPCX (an unlisted-company token) and PEP (a dynamic-fee pool) out of every route", () => {
    expect(resolveProductTicker("SPCX")).toBeNull();
    expect(resolveProductTicker("PEP")).toBeNull();
    expect(productRouteForMint("Xs3oZwbHvqis4NYcf4YKWmEia2eC84wSiVrcYcTqpH8")).toBeNull();
  });

  it.each([...CLMM_PRODUCT_TICKERS])("pins %s to its registry entry and the program's vault addresses", (ticker) => {
    const route = CLMM_PRODUCT_ROUTES[ticker];
    const entry = resolveTicker(ticker);
    expect(entry).not.toBeNull();
    expect(purchasableRoute(entry)).toBe(route);
    expect(route.symbol).toBe(entry!.symbol);
    expect(poolVaultAddress(route.pool, route.productMint).equals(route.clmm.productVault)).toBe(true);
    expect(poolVaultAddress(route.pool, USDC).equals(route.clmm.usdcVault)).toBe(true);
  });

  it("gives every CLMM product exactly one route, after the DLMM products", () => {
    expect(PRODUCT_TICKERS.slice(-CLMM_PRODUCT_TICKERS.length)).toEqual([...CLMM_PRODUCT_TICKERS]);
    for (const ticker of CLMM_PRODUCT_TICKERS) {
      expect(CLMM_PRODUCT_ROUTES[ticker]).toMatchObject({ ticker, dex: "raydium-clmm", decimals: 8, tokenProgram: TOKEN_2022 });
      expect(clmmPins(ticker)).toBe(CLMM_PRODUCT_ROUTES[ticker].clmm);
    }
    expect(clmmPins("NVDA")).toBeNull();
  });
});

describe("CLMM fee bound", () => {
  it("refuses a trade fee above the same 1% the DLMM previews are held to", () => {
    // CLMM trade fee rates are over 10^6; the DLMM bound is in basis points.
    expect((CLMM_CONFIG.maxTradeFeeRate / 1_000_000) * 10_000).toBe(PURCHASE_CONFIG.maxPoolFeeBps);
  });

  it.each([...CLMM_PRODUCT_TICKERS])("records a trade fee within the bound for %s", (ticker) => {
    const record = (observed as Record<string, { tradeFeePct?: number }>)[ticker]!;
    expect(record.tradeFeePct).toBeGreaterThan(0);
    expect(record.tradeFeePct! * 100).toBeLessThanOrEqual(PURCHASE_CONFIG.maxPoolFeeBps);
  });
});

describe("recorded CLMM pools", () => {
  it("derives the vaults the COIN pool names on mainnet, and the tick arrays the SDK named", () => {
    const route = CLMM_PRODUCT_ROUTES.COIN;
    const pool = decodePoolState(bytes(fixture.COIN.accounts.pool))!;
    expect(poolVaultAddress(route.pool, route.productMint).equals(pool.vaultA)).toBe(true);
    expect(poolVaultAddress(route.pool, pool.mintB).equals(pool.vaultB)).toBe(true);
    expect(tickArrayAddress(route.pool, fixture.COIN.tickArrayStarts[0]).toBase58()).toBe(fixture.COIN.sdk.expected[2].accounts[0]);
  });

  it("decodes the recorded pools that are in the table as their pinned routes describe them", () => {
    const recorded = (["COIN", "NFLX"] as const).filter((ticker) => clmmPins(ticker) !== null);
    expect(recorded).toContain("COIN");
    for (const ticker of recorded) {
      const route = CLMM_PRODUCT_ROUTES[ticker as ClmmProductTicker];
      const pool = decodePoolState(bytes(fixture[ticker].accounts.pool))!;
      expect(pool.mintA.equals(route.productMint)).toBe(true);
      expect(pool.vaultA.equals(route.clmm.productVault) && pool.vaultB.equals(route.clmm.usdcVault)).toBe(true);
      expect(pool.ammConfig.equals(route.clmm.ammConfig) && pool.observation.equals(route.clmm.observation)).toBe(true);
      expect(pool.tickSpacing).toBe(route.clmm.tickSpacing);
      expect([pool.decimalsA, pool.decimalsB, pool.feeOn, pool.dynamicFee]).toEqual([8, 6, 0, false]);
    }
  });
});
