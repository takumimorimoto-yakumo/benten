/**
 * Read-only exact-in quote on the pinned NVDAx/USDC Meteora DLMM pool: read
 * the pool, check its pinned identity, and ask the SDK for the swap quote.
 * Shared by the browser swap builder (`build-swap.ts`), which then builds the
 * unsigned transaction from the same pool read, and by the server-side quote
 * reader (`server-quote.ts`), which builds nothing.
 *
 * Nothing here builds, signs or sends a transaction; it only reads public
 * RPC state through the `Connection` the caller supplies.
 */

import type { Connection } from "@solana/web3.js";
import BN from "bn.js";
// eslint-disable-next-line import/no-named-as-default -- the SDK's default export is the DLMM pool class.
import DLMM from "@meteora-ag/dlmm";

import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@benten/solana";

import { NVDAX_MINT, NVDAX_USDC_POOL, USDC_MINT } from "./route";

const MAX_SLIPPAGE_BPS = 10_000;

/**
 * `swapForY` selects the swap direction in the Meteora DLMM SDK: `true` means
 * "swap token X for token Y" (input X, output Y); `false` means the reverse
 * (input Y, output X). USDC is this pool's token Y and NVDAx is token X, so a
 * USDC-in / NVDAx-out exact-in swap is `swapForY = false`. This is fixed by
 * the pool's own mint assignment, not a caller choice.
 */
export const SWAP_FOR_Y = false;

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

/** The SDK's quoted output for one exact input, as integer strings of raw base units. */
export interface RouteQuote {
  /** USDC actually consumed by the quote (equal to input unless partial-fill applies). */
  consumedInputRaw: string;
  /** Quoted NVDAx output, raw integer base units (8 decimals). */
  outputRaw: string;
  /** Minimum NVDAx output after `slippageBps`, raw integer base units. */
  minimumOutputRaw: string;
  /** Total swap fee, raw units of the fee-charged side. */
  feeRaw: string;
  /** Protocol's share of `feeRaw`, raw units. */
  protocolFeeRaw: string;
  /** Whether the fee is charged on the input side (`true`) or the output side (`false`). */
  feeOnInput: boolean;
  /** SDK-computed price impact, percent, as a decimal string. */
  priceImpactPct: string;
}

type Pool = Awaited<ReturnType<typeof DLMM.create>>;
type BinArrays = Awaited<ReturnType<Pool["getBinArrayForSwap"]>>;
type SdkQuote = ReturnType<Pool["swapQuote"]>;

export interface PoolQuoteReading {
  pool: Pool;
  binArrays: BinArrays;
  sdkQuote: SdkQuote;
  quote: RouteQuote;
}

/** The amount-independent part of a quote: the pinned pool and the bin arrays in the swap direction. */
export interface PoolState {
  pool: Pool;
  binArrays: BinArrays;
}

function checkQuoteInput(usdcInAmountRaw: bigint, slippageBps: number): void {
  if (usdcInAmountRaw <= 0n) {
    throw new InvalidSwapInputError("usdcInAmountRaw must be a positive integer");
  }
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > MAX_SLIPPAGE_BPS) {
    throw new InvalidSwapInputError(`slippageBps must be an integer in [0, ${MAX_SLIPPAGE_BPS}]`);
  }
}

/**
 * Read the pinned pool, check its identity, and read the bin arrays a
 * USDC-in swap walks. Nothing here depends on the amount, so one reading can
 * quote many amounts through `quoteOnPoolState`.
 *
 * Throws `RoutePoolMismatchError` if the pool read back from RPC does not
 * carry the pinned mint/token-program identity. Any other failure (RPC
 * unreachable, SDK error) propagates as-is.
 */
export async function readPoolState(connection: Connection): Promise<PoolState> {
  const pool = await DLMM.create(connection, NVDAX_USDC_POOL);

  const tokenXMint = pool.tokenX.mint.address;
  const tokenYMint = pool.tokenY.mint.address;
  if (!tokenXMint.equals(NVDAX_MINT) || !tokenYMint.equals(USDC_MINT)) {
    throw new RoutePoolMismatchError(
      `pool ${NVDAX_USDC_POOL.toBase58()} mints (X=${tokenXMint.toBase58()}, Y=${tokenYMint.toBase58()}) ` +
        `do not match the pinned identity (X=${NVDAX_MINT.toBase58()}, Y=${USDC_MINT.toBase58()})`,
    );
  }
  if (!pool.tokenX.owner.equals(TOKEN_2022_PROGRAM_ID) || !pool.tokenY.owner.equals(TOKEN_PROGRAM_ID)) {
    throw new RoutePoolMismatchError(
      `pool ${NVDAX_USDC_POOL.toBase58()} token-program owners (X=${pool.tokenX.owner.toBase58()}, ` +
        `Y=${pool.tokenY.owner.toBase58()}) do not match the pinned identity (X=Token-2022, Y=Token)`,
    );
  }

  const binArrays = await pool.getBinArrayForSwap(SWAP_FOR_Y);
  return { pool, binArrays };
}

/**
 * Quote an exact-in USDC amount on an already-read pool state. A local
 * computation: it makes no RPC call. Throws `InvalidSwapInputError` for a
 * non-positive amount or an out-of-range slippage value.
 */
export function quoteOnPoolState(state: PoolState, usdcInAmountRaw: bigint, slippageBps: number): PoolQuoteReading {
  checkQuoteInput(usdcInAmountRaw, slippageBps);
  const { pool, binArrays } = state;
  const sdkQuote = pool.swapQuote(new BN(usdcInAmountRaw.toString()), SWAP_FOR_Y, new BN(slippageBps), binArrays);
  return {
    pool,
    binArrays,
    sdkQuote,
    quote: {
      consumedInputRaw: sdkQuote.consumedInAmount.toString(),
      outputRaw: sdkQuote.outAmount.toString(),
      minimumOutputRaw: sdkQuote.minOutAmount.toString(),
      feeRaw: sdkQuote.fee.toString(),
      protocolFeeRaw: sdkQuote.protocolFee.toString(),
      feeOnInput: sdkQuote.feeOnInput,
      priceImpactPct: sdkQuote.priceImpact.toString(),
    },
  };
}

/**
 * Read the pinned pool and quote an exact-in USDC amount on it.
 *
 * Throws `InvalidSwapInputError` for a non-positive input amount or an
 * out-of-range slippage value, and `RoutePoolMismatchError` if the pool read
 * back from RPC does not carry the pinned mint/token-program identity. Any
 * other failure (RPC unreachable, SDK error) propagates as-is.
 */
export async function readPoolQuote(connection: Connection, usdcInAmountRaw: bigint, slippageBps: number): Promise<PoolQuoteReading> {
  checkQuoteInput(usdcInAmountRaw, slippageBps);
  return quoteOnPoolState(await readPoolState(connection), usdcInAmountRaw, slippageBps);
}
