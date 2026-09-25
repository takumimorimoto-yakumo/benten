/**
 * The hand-written CLMM program facts and quote against independent
 * evidence: Anchor discriminators recomputed from their names, account
 * addresses read back on mainnet, and the official SDK's swap results on a
 * recorded mainnet snapshot (`clmm-pools.fixture.json`: the COIN and NFLX
 * pools, their configs and tick arrays read read-only on 2026-09-25, with
 * `@raydium-io/raydium-sdk-v2@0.2.73-alpha` `swapInternal` outputs computed
 * on the same bytes). No network, no SDK at test time.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";

import fixture from "./clmm-pools.fixture.json";
import {
  AMM_CONFIG_DISCRIMINATOR,
  decodeAmmConfig,
  decodePoolState,
  decodeSwapV2Data,
  decodeTickArray,
  encodeSwapV2Data,
  initializedStartsAbove,
  isTickArrayStart,
  MAX_SQRT_PRICE_X64,
  MIN_SQRT_PRICE_X64,
  POOL_STATE_DISCRIMINATOR,
  SWAP_V2_DISCRIMINATOR,
  TICK_ARRAY_DISCRIMINATOR,
  tickArrayAddress,
  tickArrayStartIndex,
  USDC_IN_SQRT_PRICE_LIMIT_X64,
  withinPoolBitmap,
} from "./clmm-program";
import { ClmmUnsupportedError, quoteUsdcIn, sqrtPriceAtTick } from "./clmm-math";
import { quoteClmmOnState, slippageMinimum, type ClmmState } from "./clmm-quote";

const anchor = (name: string) => Uint8Array.from(createHash("sha256").update(name).digest().subarray(0, 8));
const bytes = (base64: string) => Uint8Array.from(Buffer.from(base64, "base64"));

type Snapshot = (typeof fixture)["COIN"];

function stateOf(snapshot: Snapshot): ClmmState {
  const pool = new PublicKey(snapshot.pool);
  return {
    pool,
    poolState: decodePoolState(bytes(snapshot.accounts.pool))!,
    config: decodeAmmConfig(bytes(snapshot.accounts.config))!,
    tickArrays: snapshot.accounts.tickArrays.map((data) => decodeTickArray(bytes(data))!),
    hasBitmapExtension: true,
  };
}

describe("CLMM program facts", () => {
  it("uses the Anchor discriminators of the pool, config and tick-array accounts and of swap_v2", () => {
    expect(POOL_STATE_DISCRIMINATOR).toEqual(anchor("account:PoolState"));
    expect(AMM_CONFIG_DISCRIMINATOR).toEqual(anchor("account:AmmConfig"));
    expect(TICK_ARRAY_DISCRIMINATOR).toEqual(anchor("account:TickArrayState"));
    expect(SWAP_V2_DISCRIMINATOR).toEqual(anchor("global:swap_v2"));
  });



  it("refuses bytes that are not the account they claim to be", () => {
    const pool = bytes(fixture.COIN.accounts.pool);
    expect(decodePoolState(pool.subarray(0, pool.length - 1))).toBeNull();
    const renamed = Uint8Array.from(pool);
    renamed[0] ^= 1;
    expect(decodePoolState(renamed)).toBeNull();
    expect(decodeTickArray(pool)).toBeNull();
    expect(decodeAmmConfig(pool.subarray(0, 40))).toBeNull();
  });

  it("round-trips swap_v2 data and refuses anything else", () => {
    const data = encodeSwapV2Data(2_000_000n, 99n, USDC_IN_SQRT_PRICE_LIMIT_X64);
    expect(decodeSwapV2Data(data)).toEqual({ amount: 2_000_000n, otherAmountThreshold: 99n, sqrtPriceLimitX64: USDC_IN_SQRT_PRICE_LIMIT_X64, isBaseInput: true });
    expect(decodeSwapV2Data(data.subarray(0, data.length - 1))).toBeNull();
    expect(decodeSwapV2Data(Uint8Array.from([...data, 0]))).toBeNull();
    const flag = Uint8Array.from(data);
    flag[40] = 2;
    expect(decodeSwapV2Data(flag)).toBeNull();
    expect(USDC_IN_SQRT_PRICE_LIMIT_X64).toBe(MAX_SQRT_PRICE_X64 - 1n);
  });

  it("finds initialized tick arrays in the pool bitmap as the SDK does, and bounds starts", () => {
    const state = stateOf(fixture.COIN);
    const current = tickArrayStartIndex(state.poolState.tickCurrent, state.poolState.tickSpacing);
    expect(initializedStartsAbove(state.poolState.tickArrayBitmap, state.poolState.tickSpacing, current, 4)).toEqual(fixture.COIN.tickArrayStarts);
    expect(isTickArrayStart(3600, 60)).toBe(true);
    expect(isTickArrayStart(3601, 60)).toBe(false);
    expect(isTickArrayStart(-3600, 60)).toBe(true);
    expect(withinPoolBitmap(511 * 3600, 60)).toBe(true);
    expect(withinPoolBitmap(512 * 3600, 60)).toBe(false);
    expect(tickArrayStartIndex(-1, 60)).toBe(-3600);
  });
});

describe("CLMM USDC-in quote", () => {
  it("prices ticks exactly as the program does at the ends and the middle", () => {
    expect(sqrtPriceAtTick(0)).toBe(1n << 64n);
    expect(sqrtPriceAtTick(-443636)).toBe(MIN_SQRT_PRICE_X64);
    expect(sqrtPriceAtTick(443636)).toBe(MAX_SQRT_PRICE_X64);
    expect(() => sqrtPriceAtTick(443637)).toThrow(ClmmUnsupportedError);
  });

  for (const ticker of ["COIN", "NFLX"] as const) {
    it.each(fixture[ticker].sdk.expected)(`matches the SDK on the recorded ${ticker} pool for $amountIn raw USDC`, (expected) => {
      const state = stateOf(fixture[ticker]);
      const quote = quoteUsdcIn(state.poolState, state.config, state.tickArrays, BigInt(expected.amountIn));
      expect(expected.allTrade).toBe(true);
      expect(quote.consumedInputRaw.toString()).toBe(expected.amountIn);
      expect(quote.outputRaw.toString()).toBe(expected.amountOut);
      expect(quote.feeRaw.toString()).toBe(expected.fee);
      expect(quote.tickArrayStarts.map((start) => tickArrayAddress(state.pool, start).toBase58())).toEqual(expected.accounts);
    });
  }

  it("names one more tick array than it walks, and a minimum at the fixed slippage", () => {
    const reading = quoteClmmOnState(stateOf(fixture.COIN), 10_000_000n, 100);
    expect(reading.tickArrayStarts).toEqual(fixture.COIN.tickArrayStarts.slice(0, 2));
    expect(reading.minimumOutputRaw).toBe(slippageMinimum(reading.outputRaw, 100));
    expect(reading.minimumOutputRaw).toBe((reading.outputRaw * 9_900n) / 10_000n);
    expect(Number(reading.quote.priceImpactPct)).toBeLessThan(3);
  });

  it("refuses an amount the arrays read cannot take, instead of quoting a partial fill", () => {
    const state = stateOf(fixture.COIN);
    const short = { ...state, tickArrays: state.tickArrays.slice(0, 1), poolState: { ...state.poolState, liquidity: 1n } };
    expect(() => quoteClmmOnState({ ...short, tickArrays: [{ ...short.tickArrays[0], ticks: short.tickArrays[0].ticks.map((tick) => ({ ...tick, liquidityGross: 0n })) }] }, 10_000_000n, 100)).toThrow(ClmmUnsupportedError);
  });

  it.each([
    ["dynamic fee", (state: ClmmState) => ({ ...state, poolState: { ...state.poolState, dynamicFee: true } }), /dynamic fee/],
    ["fee not on the input", (state: ClmmState) => ({ ...state, poolState: { ...state.poolState, feeOn: 1 } }), /fee from the input/],
    ["swaps disabled", (state: ClmmState) => ({ ...state, poolState: { ...state.poolState, status: 1 << 4 } }), /disabled/],
    ["config tick spacing", (state: ClmmState) => ({ ...state, config: { ...state.config, tickSpacing: 1 } }), /tick spacing/],
    ["limit orders on a crossed tick", (state: ClmmState) => ({ ...state, tickArrays: state.tickArrays.map((array) => ({ ...array, ticks: array.ticks.map((tick) => (tick.liquidityGross !== 0n ? { ...tick, ordersAmount: 5n } : tick)) })) }), /limit orders/],
  ])("refuses a pool state it does not model: %s", (_name, mutate, reason) => {
    // 5,000 USDC crosses at least one initialized tick of the recorded NFLX pool.
    expect(() => quoteClmmOnState(mutate(stateOf(fixture.NFLX)), 5_000_000_000n, 100)).toThrow(reason);
  });

  it("refuses a non-positive amount and an out-of-range slippage", () => {
    const state = stateOf(fixture.COIN);
    expect(() => quoteClmmOnState(state, 0n, 100)).toThrow(/positive/);
    expect(() => quoteClmmOnState(state, 1n, 10_001)).toThrow(/slippageBps/);
  });
});
