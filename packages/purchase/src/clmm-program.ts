/**
 * Raydium CLMM program facts the purchase route depends on: the program id,
 * the account addresses it derives (PDAs), the fields of its pool, config,
 * tick-array and bitmap-extension accounts that a quote reads, and the
 * `swap_v2` instruction encoding.
 *
 * Written from the program's published account layouts and IDL, with no DEX
 * SDK: a test keeps the discriminators equal to their Anchor definitions, and
 * the decoders were compared field by field with the official SDK's layouts
 * on the pinned mainnet pools (read-only). Pure: no RPC, no wallet, no clock.
 */

import { PublicKey } from "@solana/web3.js";

/** Raydium concentrated-liquidity (CLMM) program. */
export const CLMM_PROGRAM_ID = new PublicKey("CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK");

/** Ticks per tick array. */
export const TICK_ARRAY_SIZE = 60;
/** Tick arrays the pool account's own bitmap covers on each side of tick 0 (1024 bits). */
export const POOL_BITMAP_HALF = 512;
export const MIN_TICK = -443636;
export const MAX_TICK = 443636;
export const MIN_SQRT_PRICE_X64 = 4295048016n;
export const MAX_SQRT_PRICE_X64 = 79226673521066979257578248091n;
/** Fee rates are parts per million. */
export const FEE_RATE_DENOMINATOR = 1_000_000n;

/** Anchor discriminators: first 8 bytes of sha256("account:<Name>") / sha256("global:swap_v2"). */
export const POOL_STATE_DISCRIMINATOR = Uint8Array.from([0xf7, 0xed, 0xe3, 0xf5, 0xd7, 0xc3, 0xde, 0x46]);
export const AMM_CONFIG_DISCRIMINATOR = Uint8Array.from([0xda, 0xf4, 0x21, 0x68, 0xcb, 0xcb, 0x2b, 0x6f]);
export const TICK_ARRAY_DISCRIMINATOR = Uint8Array.from([0xc0, 0x9b, 0x55, 0xcd, 0x31, 0xf9, 0x81, 0x2a]);
export const SWAP_V2_DISCRIMINATOR = Uint8Array.from([0x2b, 0x04, 0xed, 0x0b, 0x1a, 0xc9, 0x1e, 0x62]);

/** `swap_v2` data: discriminator, amount u64, other_amount_threshold u64, sqrt_price_limit_x64 u128, is_base_input bool. */
export const SWAP_V2_DATA_LENGTH = SWAP_V2_DISCRIMINATOR.length + 8 + 8 + 16 + 1;

/** Account sizes (discriminator included) of the program's zero-copy accounts. */
export const POOL_STATE_LENGTH = 1544;
export const TICK_ARRAY_LENGTH = 10240;
const TICK_LENGTH = 168;
const TICKS_OFFSET = 44;

const encoder = new TextEncoder();

function pda(seeds: Uint8Array[]): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, CLMM_PROGRAM_ID)[0];
}

function i32BigEndian(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setInt32(0, value, false);
  return bytes;
}

/** A tick array of `pool` starting at `startTickIndex` (seed: the index as big-endian i32). */
export function tickArrayAddress(pool: PublicKey, startTickIndex: number): PublicKey {
  return pda([encoder.encode("tick_array"), pool.toBytes(), i32BigEndian(startTickIndex)]);
}

/** The pool's tick-array bitmap extension account. */
export function bitmapExtensionAddress(pool: PublicKey): PublicKey {
  return pda([encoder.encode("pool_tick_array_bitmap_extension"), pool.toBytes()]);
}

/** A pool vault of `mint`. */
export function poolVaultAddress(pool: PublicKey, mint: PublicKey): PublicKey {
  return pda([encoder.encode("pool_vault"), pool.toBytes(), mint.toBytes()]);
}

/** Ticks one tick array spans. */
export function ticksPerArray(tickSpacing: number): number {
  return TICK_ARRAY_SIZE * tickSpacing;
}

/** Start index of the tick array that holds `tick`. */
export function tickArrayStartIndex(tick: number, tickSpacing: number): number {
  const span = ticksPerArray(tickSpacing);
  return Math.floor(tick / span) * span;
}

/** Whether `start` is a valid tick array start for `tickSpacing` (a multiple of the span within the tick range). */
export function isTickArrayStart(start: number, tickSpacing: number): boolean {
  return Number.isSafeInteger(start) && start % ticksPerArray(tickSpacing) === 0 && start >= tickArrayStartIndex(MIN_TICK, tickSpacing) && start <= MAX_TICK;
}

function view(data: Uint8Array): DataView {
  return new DataView(data.buffer, data.byteOffset, data.byteLength);
}

function u128At(data: Uint8Array, offset: number): bigint {
  const v = view(data);
  return v.getBigUint64(offset, true) | (v.getBigUint64(offset + 8, true) << 64n);
}

function i128At(data: Uint8Array, offset: number): bigint {
  return BigInt.asIntN(128, u128At(data, offset));
}

function keyAt(data: Uint8Array, offset: number): PublicKey {
  return new PublicKey(data.subarray(offset, offset + 32));
}

function startsWith(data: Uint8Array, prefix: Uint8Array): boolean {
  return data.length >= prefix.length && prefix.every((byte, index) => data[index] === byte);
}

/** The pool state fields a USDC-in quote reads. */
export interface ClmmPoolState {
  ammConfig: PublicKey;
  mintA: PublicKey;
  mintB: PublicKey;
  vaultA: PublicKey;
  vaultB: PublicKey;
  observation: PublicKey;
  decimalsA: number;
  decimalsB: number;
  tickSpacing: number;
  liquidity: bigint;
  sqrtPriceX64: bigint;
  tickCurrent: number;
  /** Operation status bits; bit 4 set disables swaps. */
  status: number;
  /** Fee collection mode (0: from the input token). */
  feeOn: number;
  /** The pool's own tick-array bitmap, 1024 bits (16 little-endian u64 words). */
  tickArrayBitmap: Uint8Array;
  /** Whether any dynamic-fee parameter is set (the quote refuses such a pool). */
  dynamicFee: boolean;
}

/** Decode a CLMM pool state account, or `null` when it is not one. */
export function decodePoolState(data: Uint8Array): ClmmPoolState | null {
  if (data.length !== POOL_STATE_LENGTH || !startsWith(data, POOL_STATE_DISCRIMINATOR)) return null;
  const v = view(data);
  const dynamic = data.subarray(1096, 1096 + 34);
  return {
    ammConfig: keyAt(data, 9),
    mintA: keyAt(data, 73),
    mintB: keyAt(data, 105),
    vaultA: keyAt(data, 137),
    vaultB: keyAt(data, 169),
    observation: keyAt(data, 201),
    decimalsA: data[233],
    decimalsB: data[234],
    tickSpacing: v.getUint16(235, true),
    liquidity: u128At(data, 237),
    sqrtPriceX64: u128At(data, 253),
    tickCurrent: v.getInt32(269, true),
    status: data[389],
    feeOn: data[390],
    tickArrayBitmap: Uint8Array.from(data.subarray(904, 904 + 128)),
    dynamicFee: dynamic.some((byte) => byte !== 0),
  };
}

/** The config fields a quote reads (fee rates in parts per million). */
export interface ClmmAmmConfig {
  protocolFeeRate: number;
  tradeFeeRate: number;
  tickSpacing: number;
  fundFeeRate: number;
}

export function decodeAmmConfig(data: Uint8Array): ClmmAmmConfig | null {
  if (data.length < 57 || !startsWith(data, AMM_CONFIG_DISCRIMINATOR)) return null;
  const v = view(data);
  return { protocolFeeRate: v.getUint32(43, true), tradeFeeRate: v.getUint32(47, true), tickSpacing: v.getUint16(51, true), fundFeeRate: v.getUint32(53, true) };
}

/** One tick of a tick array. */
export interface ClmmTick {
  tick: number;
  liquidityNet: bigint;
  liquidityGross: bigint;
  /** Limit-order amounts resting on the tick (the quote refuses to cross such a tick). */
  ordersAmount: bigint;
  partFilledOrdersRemaining: bigint;
}

export interface ClmmTickArray {
  pool: PublicKey;
  startTickIndex: number;
  ticks: ClmmTick[];
}

export function decodeTickArray(data: Uint8Array): ClmmTickArray | null {
  if (data.length !== TICK_ARRAY_LENGTH || !startsWith(data, TICK_ARRAY_DISCRIMINATOR)) return null;
  const v = view(data);
  const ticks: ClmmTick[] = [];
  for (let index = 0; index < TICK_ARRAY_SIZE; index += 1) {
    const offset = TICKS_OFFSET + index * TICK_LENGTH;
    ticks.push({
      tick: v.getInt32(offset, true),
      liquidityNet: i128At(data, offset + 4),
      liquidityGross: u128At(data, offset + 20),
      ordersAmount: v.getBigUint64(offset + 124, true),
      partFilledOrdersRemaining: v.getBigUint64(offset + 132, true),
    });
  }
  return { pool: keyAt(data, 8), startTickIndex: v.getInt32(40, true), ticks };
}

/**
 * Start indexes of the initialized tick arrays at or above `fromStart`, in
 * ascending order, from the pool's own bitmap (bit `i` is the array starting
 * at `(i - 512) * span`). Arrays beyond the pool bitmap's range need the
 * bitmap extension; this search stops at its edge instead.
 */
export function initializedStartsAbove(bitmap: Uint8Array, tickSpacing: number, fromStart: number, limit: number): number[] {
  const span = ticksPerArray(tickSpacing);
  const found: number[] = [];
  const firstBit = Math.max(0, Math.ceil(fromStart / span) + POOL_BITMAP_HALF);
  for (let bit = firstBit; bit < POOL_BITMAP_HALF * 2 && found.length < limit; bit += 1) {
    if ((bitmap[bit >> 3] & (1 << (bit & 7))) !== 0) found.push((bit - POOL_BITMAP_HALF) * span);
  }
  return found;
}

/** Whether a tick array start lies inside the range the pool's own bitmap covers. */
export function withinPoolBitmap(start: number, tickSpacing: number): boolean {
  const index = start / ticksPerArray(tickSpacing);
  return index >= -POOL_BITMAP_HALF && index < POOL_BITMAP_HALF;
}

/** Encode `swap_v2` data for an exact-in swap. */
export function encodeSwapV2Data(amountIn: bigint, minimumOut: bigint, sqrtPriceLimitX64: bigint): Uint8Array {
  const data = new Uint8Array(SWAP_V2_DATA_LENGTH);
  data.set(SWAP_V2_DISCRIMINATOR, 0);
  const v = new DataView(data.buffer);
  v.setBigUint64(8, amountIn, true);
  v.setBigUint64(16, minimumOut, true);
  v.setBigUint64(24, sqrtPriceLimitX64 & ((1n << 64n) - 1n), true);
  v.setBigUint64(32, sqrtPriceLimitX64 >> 64n, true);
  data[40] = 1;
  return data;
}

/** Decoded `swap_v2` data, or `null` when the bytes are not exactly one. */
export function decodeSwapV2Data(data: Uint8Array): { amount: bigint; otherAmountThreshold: bigint; sqrtPriceLimitX64: bigint; isBaseInput: boolean } | null {
  if (data.length !== SWAP_V2_DATA_LENGTH || !startsWith(data, SWAP_V2_DISCRIMINATOR)) return null;
  const flag = data[40];
  if (flag !== 0 && flag !== 1) return null;
  const v = view(data);
  return { amount: v.getBigUint64(8, true), otherAmountThreshold: v.getBigUint64(16, true), sqrtPriceLimitX64: u128At(data, 24), isBaseInput: flag === 1 };
}

/**
 * The only price limit a USDC-in swap encodes: USDC is token B, so the swap
 * moves the price up (one for zero) and the limit is the highest price the
 * program accepts. The minimum output, not the limit, bounds what the wallet
 * receives.
 */
export const USDC_IN_SQRT_PRICE_LIMIT_X64 = MAX_SQRT_PRICE_X64 - 1n;
