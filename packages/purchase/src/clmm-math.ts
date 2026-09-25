/**
 * Exact-in quote of a USDC-in swap on a Raydium CLMM pool, in integer
 * arithmetic (`bigint`), ported from the program's published swap math
 * (Q64.64 square-root prices, parts-per-million fees).
 *
 * Only the case every pinned pool is in is supported, and anything else
 * fails closed with `ClmmUnsupportedError` instead of approximating:
 *  - the input is token B (USDC), so the price moves up ("one for zero");
 *  - the fee is taken from the input (`feeOn` 0) at the config's fixed trade
 *    fee rate: a pool with dynamic-fee parameters is refused;
 *  - no tick the swap reaches carries resting limit orders.
 * The quote only estimates: the minimum output the transaction encodes is
 * enforced on chain, and every built transaction is simulated before the
 * panel offers it. Pure: no RPC.
 */

import { FEE_RATE_DENOMINATOR, MAX_TICK, MIN_TICK, TICK_ARRAY_SIZE, tickArrayStartIndex, type ClmmAmmConfig, type ClmmPoolState, type ClmmTick, type ClmmTickArray } from "./clmm-program";

const Q64 = 1n << 64n;
const U64_MAX = (1n << 64n) - 1n;
/** Status bit that disables swaps. */
const SWAP_DISABLED_BIT = 1 << 4;

export class ClmmUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClmmUnsupportedError";
  }
}

function mulDivFloor(a: bigint, b: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new ClmmUnsupportedError("division by zero");
  return (a * b) / denominator;
}

function mulDivCeil(a: bigint, b: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new ClmmUnsupportedError("division by zero");
  const product = a * b;
  return product / denominator + (product % denominator === 0n ? 0n : 1n);
}

const TICK_FACTORS: readonly bigint[] = [
  0xfffcb933bd6fb800n, 0xfff97272373d4000n, 0xfff2e50f5f657000n, 0xffe5caca7e10f000n, 0xffcb9843d60f7000n,
  0xff973b41fa98e800n, 0xff2ea16466c9b000n, 0xfe5dee046a9a3800n, 0xfcbe86c7900bb000n, 0xf987a7253ac65800n,
  0xf3392b0822bb6000n, 0xe7159475a2caf000n, 0xd097f3bdfd2f2000n, 0xa9f746462d9f8000n, 0x70d869a156f31c00n,
  0x31be135f97ed3200n, 0x9aa508b5b85a500n, 0x5d6af8dedc582cn, 0x2216e584f5fan,
];

/** sqrt(1.0001^tick) as a Q64.64 number, rounded as the program does. */
export function sqrtPriceAtTick(tick: number): bigint {
  if (!Number.isInteger(tick) || tick < MIN_TICK || tick > MAX_TICK) throw new ClmmUnsupportedError("tick out of range");
  const absolute = Math.abs(tick);
  let ratio = Q64;
  for (const [bit, factor] of TICK_FACTORS.entries()) {
    if ((absolute & (1 << bit)) !== 0) ratio = (ratio * factor) / Q64;
  }
  return tick > 0 ? (Q64 * Q64) / ratio : ratio;
}

/** Token A moved between two prices (A is the product). */
function deltaA(lower: bigint, upper: bigint, liquidity: bigint, roundUp: boolean): bigint | null {
  const [a, b] = lower > upper ? [upper, lower] : [lower, upper];
  if (a <= 0n) throw new ClmmUnsupportedError("price is not positive");
  const numerator = liquidity << 64n;
  const spread = b - a;
  const result = roundUp ? mulDivCeil(mulDivCeil(numerator, spread, b), 1n, a) : mulDivFloor(numerator, spread, b) / a;
  return result > U64_MAX ? null : result;
}

/** Token B moved between two prices (B is USDC). */
function deltaB(lower: bigint, upper: bigint, liquidity: bigint, roundUp: boolean): bigint | null {
  const [a, b] = lower > upper ? [upper, lower] : [lower, upper];
  const result = roundUp ? mulDivCeil(liquidity, b - a, Q64) : mulDivFloor(liquidity, b - a, Q64);
  return result > U64_MAX ? null : result;
}

interface Step {
  sqrtPriceNext: bigint;
  amountIn: bigint;
  amountOut: bigint;
  fee: bigint;
}

/** One swap step toward `target` (above `current`), token B in, fee on the input. */
function swapStep(current: bigint, target: bigint, liquidity: bigint, remaining: bigint, feeRate: bigint): Step {
  const forPrice = mulDivFloor(remaining, FEE_RATE_DENOMINATOR - feeRate, FEE_RATE_DENOMINATOR);
  const toTarget = deltaB(current, target, liquidity, true);
  let sqrtPriceNext: bigint;
  if (toTarget !== null && forPrice >= toTarget) {
    sqrtPriceNext = target;
  } else {
    if (liquidity <= 0n) throw new ClmmUnsupportedError("no liquidity in range");
    sqrtPriceNext = current + (forPrice << 64n) / liquidity;
  }
  if (sqrtPriceNext > target) throw new ClmmUnsupportedError("step overshot its target");
  const reached = sqrtPriceNext === target;
  const amountIn = reached && toTarget !== null ? toTarget : deltaB(current, sqrtPriceNext, liquidity, true);
  const amountOut = deltaA(current, sqrtPriceNext, liquidity, false);
  if (amountIn === null || amountOut === null) throw new ClmmUnsupportedError("amount overflow");
  const fee = reached ? mulDivCeil(amountIn, feeRate, FEE_RATE_DENOMINATOR - feeRate) : remaining - amountIn;
  return { sqrtPriceNext, amountIn, amountOut, fee };
}

function hasLimitOrders(tick: ClmmTick): boolean {
  return tick.ordersAmount !== 0n || tick.partFilledOrdersRemaining !== 0n;
}

function isInitialized(tick: ClmmTick): boolean {
  return tick.liquidityGross !== 0n || hasLimitOrders(tick);
}

/** The next initialized tick above `current` in `array`, or the array's first when the array lies wholly above the current tick. */
function nextTickAbove(array: ClmmTickArray, currentTick: number, tickSpacing: number, containsCurrent: boolean): ClmmTick | undefined {
  const first = containsCurrent ? Math.floor((currentTick - array.startTickIndex) / tickSpacing) + 1 : 0;
  for (let index = Math.max(0, first); index < TICK_ARRAY_SIZE; index += 1) {
    if (isInitialized(array.ticks[index])) return array.ticks[index];
  }
  return undefined;
}

export interface ClmmQuote {
  /** Token B (USDC) the quote consumed, fee included; below the input when the arrays read run out. */
  consumedInputRaw: bigint;
  /** Token A (the product) out. */
  outputRaw: bigint;
  /** Total fee, token B raw. */
  feeRaw: bigint;
  /** The protocol's and fund's share of `feeRaw`. */
  protocolFeeRaw: bigint;
  /** Start indexes of the tick arrays the swap walks, in order. */
  tickArrayStarts: number[];
  /** Price moved against the input net of fee, percent, as a decimal string. */
  priceImpactPct: string;
  sqrtPriceAfterX64: bigint;
}

/** Refuses a pool state the port does not model. */
export function unsupportedPoolReason(pool: ClmmPoolState, config: ClmmAmmConfig): string | null {
  if ((pool.status & SWAP_DISABLED_BIT) !== 0) return "swaps are disabled on the pool";
  if (pool.feeOn !== 0) return "the pool does not take its fee from the input";
  if (pool.dynamicFee) return "the pool has a dynamic fee";
  if (config.tickSpacing !== pool.tickSpacing) return "the config tick spacing differs from the pool";
  if (config.tradeFeeRate < 0 || BigInt(config.tradeFeeRate) >= FEE_RATE_DENOMINATOR) return "the trade fee rate is out of range";
  return null;
}

/** Percent with four decimals, from a ratio `numerator / denominator` (both non-negative). */
function percentText(numerator: bigint, denominator: bigint): string {
  if (denominator <= 0n || numerator <= 0n) return "0";
  const scaled = (numerator * 1_000_000n) / denominator;
  const whole = scaled / 10_000n;
  const fraction = (scaled % 10_000n).toString().padStart(4, "0");
  return `${whole}.${fraction}`;
}

/**
 * Quote `amountIn` of token B (USDC) into the pool. `tickArrays` are the
 * initialized arrays at and above the current tick's, ascending, as read.
 * Throws `ClmmUnsupportedError` for a state the port does not model.
 */
export function quoteUsdcIn(pool: ClmmPoolState, config: ClmmAmmConfig, tickArrays: readonly ClmmTickArray[], amountIn: bigint): ClmmQuote {
  const unsupported = unsupportedPoolReason(pool, config);
  if (unsupported) throw new ClmmUnsupportedError(unsupported);
  if (amountIn <= 0n || amountIn > U64_MAX) throw new ClmmUnsupportedError("amount out of range");
  if (tickArrays.length === 0) throw new ClmmUnsupportedError("no tick arrays");
  const feeRate = BigInt(config.tradeFeeRate);
  const protocolRate = BigInt(config.protocolFeeRate);
  const fundRate = BigInt(config.fundFeeRate);
  const limit = sqrtPriceAtTick(MAX_TICK) - 1n;

  let remaining = amountIn;
  let output = 0n;
  let fee = 0n;
  let protocolFee = 0n;
  let sqrtPrice = pool.sqrtPriceX64;
  let liquidity = pool.liquidity;
  let tick = pool.tickCurrent;
  let arrayIndex = 0;
  let containsCurrent = tickArrays[0].startTickIndex === tickArrayStartIndex(pool.tickCurrent, pool.tickSpacing);
  if (!containsCurrent && tickArrays[0].startTickIndex < tickArrayStartIndex(pool.tickCurrent, pool.tickSpacing)) throw new ClmmUnsupportedError("the first tick array lies below the current tick");

  while (remaining > 0n && sqrtPrice < limit) {
    let next = nextTickAbove(tickArrays[arrayIndex], tick, pool.tickSpacing, containsCurrent);
    while (next === undefined) {
      arrayIndex += 1;
      if (arrayIndex >= tickArrays.length) {
        return finish();
      }
      containsCurrent = false;
      next = nextTickAbove(tickArrays[arrayIndex], tick, pool.tickSpacing, false);
    }
    const tickNext = Math.min(Math.max(next.tick, MIN_TICK), MAX_TICK);
    if (tickNext <= tick) throw new ClmmUnsupportedError("next tick is not above the current tick");
    const sqrtPriceNext = sqrtPriceAtTick(tickNext);
    const target = sqrtPriceNext > limit ? limit : sqrtPriceNext;
    if (target < sqrtPrice) throw new ClmmUnsupportedError("target price is below the current price");

    if (target !== sqrtPrice) {
      const step = swapStep(sqrtPrice, target, liquidity, remaining, feeRate);
      remaining -= step.amountIn + step.fee;
      output += step.amountOut;
      fee += step.fee;
      protocolFee += (step.fee * protocolRate) / FEE_RATE_DENOMINATOR + (step.fee * fundRate) / FEE_RATE_DENOMINATOR;
      sqrtPrice = step.sqrtPriceNext;
    }
    if (sqrtPrice === sqrtPriceNext) {
      if (hasLimitOrders(next)) throw new ClmmUnsupportedError("the swap reaches a tick with resting limit orders");
      if (next.liquidityGross !== 0n) {
        liquidity += next.liquidityNet;
        if (liquidity < 0n) throw new ClmmUnsupportedError("liquidity underflow");
      }
      // The crossed tick lies in the current array: the next search starts after it there.
      tick = tickNext;
      containsCurrent = true;
    } else if (remaining !== 0n) {
      throw new ClmmUnsupportedError("a partial step left input unspent");
    }
  }
  return finish();

  function finish(): ClmmQuote {
    const consumed = amountIn - remaining;
    const net = consumed - fee;
    // Output at the starting price for the net input: net / price, price = sqrtP^2 / 2^128 (B per A).
    const ideal = net > 0n ? (net << 128n) / (pool.sqrtPriceX64 * pool.sqrtPriceX64) : 0n;
    return {
      consumedInputRaw: consumed,
      outputRaw: output,
      feeRaw: fee,
      protocolFeeRaw: protocolFee,
      tickArrayStarts: tickArrays.slice(0, Math.min(arrayIndex + 1, tickArrays.length)).map((array) => array.startTickIndex),
      priceImpactPct: ideal > output ? percentText(ideal - output, ideal) : "0",
      sqrtPriceAfterX64: sqrtPrice,
    };
  }
}
