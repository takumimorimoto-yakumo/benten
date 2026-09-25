/**
 * Read-only state read and exact-in USDC quote of a product's pinned Raydium
 * CLMM pool (`routes-table-clmm.ts`). Shared by the browser builder
 * (`clmm-build.ts`) and the server-side quote reader (`server-quote.ts`).
 *
 * Reads go through the `Connection` the caller supplies (the same-origin
 * relay in the browser, the server's upstream on the server), with
 * `getMultipleAccountsInfo` only: no DEX HTTP API, no SDK. Every account read
 * back must carry the pinned identity (owner program, pool, mints, vaults,
 * config, observation, tick spacing) or the read throws
 * `RoutePoolMismatchError`; nothing falls back. Nothing here builds, signs
 * or sends a transaction.
 */

import { PublicKey, type Connection } from "@solana/web3.js";

import { bitmapExtensionAddress, CLMM_PROGRAM_ID, decodeAmmConfig, decodePoolState, decodeTickArray, initializedStartsAbove, tickArrayAddress, tickArrayStartIndex, withinPoolBitmap, type ClmmAmmConfig, type ClmmPoolState, type ClmmTickArray } from "./clmm-program";
import { ClmmUnsupportedError, quoteUsdcIn, unsupportedPoolReason } from "./clmm-math";
import { CLMM_CONFIG } from "./clmm-config";
import { clmmPins, type ClmmPoolPins } from "./routes-table-clmm";
import type { RouteQuote } from "./quote";
import { productRoute, type ProductTicker } from "./routes-table";
import { USDC_MINT } from "./route";

const MAX_SLIPPAGE_BPS = 10_000;
const BPS = 10_000n;

/** Same name as the DLMM reader's error, so callers classify both alike. */
export class RoutePoolMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoutePoolMismatchError";
  }
}

export class InvalidSwapInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSwapInputError";
  }
}

/** The amount-independent state of one CLMM pool: the decoded pool, config and the tick arrays a USDC-in swap walks. */
export interface ClmmState {
  /** The pool address (also the marker the server cache checks for a successful read). */
  pool: PublicKey;
  poolState: ClmmPoolState;
  config: ClmmAmmConfig;
  /** Initialized tick arrays at and above the current tick's, ascending. */
  tickArrays: ClmmTickArray[];
  /** Whether the pool's bitmap extension account exists (then the swap names it). */
  hasBitmapExtension: boolean;
}

/** A quote on a read state: the route's quote shape plus the tick arrays the transaction names. */
export interface ClmmQuoteReading {
  quote: RouteQuote;
  outputRaw: bigint;
  minimumOutputRaw: bigint;
  /** Start indexes of the tick arrays the swap names: the arrays the quote walks, and one more when read. */
  tickArrayStarts: number[];
  /** Only the arrays the quote walks (a two-leg transaction near the size limit names these). */
  walkedTickArrayStarts: number[];
}

/**
 * Read a CLMM pool's state with no pinned expectations beyond the program
 * owner (the route generator uses this; runtime reads use
 * `readClmmRouteState`). Two requests: the pool and its bitmap extension,
 * then the config and the tick arrays.
 */
export async function readClmmState(connection: Connection, pool: PublicKey): Promise<ClmmState> {
  const [poolAccount, extension] = await connection.getMultipleAccountsInfo([pool, bitmapExtensionAddress(pool)]);
  if (!poolAccount || !poolAccount.owner.equals(CLMM_PROGRAM_ID)) throw new RoutePoolMismatchError(`pool ${pool.toBase58()} is not a CLMM pool`);
  const poolState = decodePoolState(poolAccount.data);
  if (!poolState) throw new RoutePoolMismatchError(`pool ${pool.toBase58()} does not decode as a CLMM pool`);
  if (extension && !extension.owner.equals(CLMM_PROGRAM_ID)) throw new RoutePoolMismatchError("the bitmap extension is not owned by the CLMM program");
  const currentStart = tickArrayStartIndex(poolState.tickCurrent, poolState.tickSpacing);
  if (!withinPoolBitmap(currentStart, poolState.tickSpacing)) throw new ClmmUnsupportedError("the current tick lies outside the pool bitmap");
  const starts = initializedStartsAbove(poolState.tickArrayBitmap, poolState.tickSpacing, currentStart, CLMM_CONFIG.tickArraysRead);
  if (starts.length === 0) throw new ClmmUnsupportedError("no initialized tick array above the current price");
  const [configAccount, ...arrayAccounts] = await connection.getMultipleAccountsInfo([poolState.ammConfig, ...starts.map((start) => tickArrayAddress(pool, start))]);
  if (!configAccount || !configAccount.owner.equals(CLMM_PROGRAM_ID)) throw new RoutePoolMismatchError("the pool config is not a CLMM config");
  const config = decodeAmmConfig(configAccount.data);
  if (!config) throw new RoutePoolMismatchError("the pool config does not decode");
  const tickArrays = arrayAccounts.map((account, index) => {
    const array = account && account.owner.equals(CLMM_PROGRAM_ID) ? decodeTickArray(account.data) : null;
    if (!array || !array.pool.equals(pool) || array.startTickIndex !== starts[index]) throw new RoutePoolMismatchError("a tick array does not carry the pool's identity");
    return array;
  });
  return { pool, poolState, config, tickArrays, hasBitmapExtension: extension !== null };
}

/** The first way `state` differs from the pinned route, or `null`. */
export function pinMismatch(state: ClmmState, productMint: PublicKey, pins: ClmmPoolPins): string | null {
  const pool = state.poolState;
  if (!pool.mintA.equals(productMint) || !pool.mintB.equals(USDC_MINT)) return "pool mints differ from the pinned route";
  if (!pool.vaultA.equals(pins.productVault) || !pool.vaultB.equals(pins.usdcVault)) return "pool vaults differ from the pinned route";
  if (!pool.ammConfig.equals(pins.ammConfig)) return "pool config differs from the pinned route";
  if (!pool.observation.equals(pins.observation)) return "pool observation account differs from the pinned route";
  if (pool.tickSpacing !== pins.tickSpacing) return "pool tick spacing differs from the pinned route";
  return null;
}

/** Read a product's pinned CLMM pool and check every pinned identity. */
export async function readClmmRouteState(connection: Connection, product: ProductTicker): Promise<ClmmState> {
  const route = productRoute(product);
  const pins = clmmPins(product);
  if (route.dex !== "raydium-clmm" || !pins) throw new RoutePoolMismatchError("product has no pinned CLMM route");
  const state = await readClmmState(connection, route.pool);
  const mismatch = pinMismatch(state, route.productMint, pins);
  if (mismatch) throw new RoutePoolMismatchError(`pool ${route.pool.toBase58()}: ${mismatch}`);
  const unsupported = unsupportedPoolReason(state.poolState, state.config);
  if (unsupported) throw new ClmmUnsupportedError(unsupported);
  if (state.config.tradeFeeRate > CLMM_CONFIG.maxTradeFeeRate) throw new ClmmUnsupportedError("the pool's trade fee is above the route ceiling");
  return state;
}

/** Lowest minimum the slippage allows: floor(out * (1 - slippage)). */
export function slippageMinimum(outputRaw: bigint, slippageBps: number): bigint {
  return (outputRaw * (BPS - BigInt(slippageBps))) / BPS;
}

/**
 * Quote an exact-in USDC amount on a read state. A local computation.
 * Throws `InvalidSwapInputError` for a non-positive amount or out-of-range
 * slippage, and `ClmmUnsupportedError` when the read arrays cannot take the
 * whole amount or the state is one the port does not model.
 */
export function quoteClmmOnState(state: ClmmState, usdcInAmountRaw: bigint, slippageBps: number): ClmmQuoteReading {
  if (usdcInAmountRaw <= 0n) throw new InvalidSwapInputError("usdcInAmountRaw must be a positive integer");
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > MAX_SLIPPAGE_BPS) throw new InvalidSwapInputError(`slippageBps must be an integer in [0, ${MAX_SLIPPAGE_BPS}]`);
  const result = quoteUsdcIn(state.poolState, state.config, state.tickArrays, usdcInAmountRaw);
  if (result.consumedInputRaw !== usdcInAmountRaw) throw new ClmmUnsupportedError("the tick arrays read cannot take the whole amount");
  if (result.outputRaw <= 0n) throw new ClmmUnsupportedError("the quote returns nothing");
  const minimumOutputRaw = slippageMinimum(result.outputRaw, slippageBps);
  const walked = result.tickArrayStarts;
  const extra = state.tickArrays.map((array) => array.startTickIndex).find((start) => start > walked[walked.length - 1]);
  const tickArrayStarts = extra !== undefined && walked.length < CLMM_CONFIG.maxTickArrays ? [...walked, extra] : walked;
  return {
    outputRaw: result.outputRaw,
    minimumOutputRaw,
    tickArrayStarts,
    walkedTickArrayStarts: walked,
    quote: {
      consumedInputRaw: result.consumedInputRaw.toString(),
      outputRaw: result.outputRaw.toString(),
      minimumOutputRaw: minimumOutputRaw.toString(),
      feeRaw: result.feeRaw.toString(),
      protocolFeeRaw: result.protocolFeeRaw.toString(),
      feeOnInput: true,
      priceImpactPct: result.priceImpactPct,
    },
  };
}
