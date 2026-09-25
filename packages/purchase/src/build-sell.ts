/**
 * Browser-only, unsigned exact-in sale builder: sell NVDAx for USDC in the
 * pinned NVDAx/USDC Meteora DLMM pool, the purchase route reversed.
 *
 * SECURITY INVARIANTS (same as `build-swap.ts`):
 *  1. Builds and returns one unsigned `Transaction`. Never asks a wallet to
 *     sign, never submits, never touches a private key or seed phrase.
 *  2. The pool and both mints are the pinned NVDA entry of `routes-table.ts`, never
 *     derived from caller input. A pool read back from RPC that does not
 *     carry the pinned identity throws `RoutePoolMismatchError`.
 *  3. Amounts are raw integer base units (`bigint` in, integer strings out).
 *     The NVDAx amount is raw units of the mint, never a Scaled UI display
 *     amount; the caller converts at display time from the mint account.
 *  4. The per-transaction limit is enforced on the USDC side before anything
 *     is built: the quoted USDC output must not exceed `maxUsdcOutRaw`.
 *  5. The compute-unit limit is the fixed `PURCHASE_CONFIG.sellComputeUnitLimit`
 *     (the SDK's own estimate is dropped), and no compute-unit price is set.
 *
 * The caller audits the exact wire bytes (`auditSellWire`) and runs an
 * unsigned simulation before the panel offers the transaction.
 */

import { ComputeBudgetProgram, Transaction, type Connection, type PublicKey, type TransactionInstruction } from "@solana/web3.js";
import BN from "bn.js";

import { QuoteOverLimitError } from "./build-two-leg";
import { PURCHASE_CONFIG } from "./config";
import { InvalidSwapInputError, RoutePoolMismatchError, readPoolState, SELL_SWAP_FOR_Y, type PoolState, type RouteQuote } from "./quote";
import { COMPUTE_BUDGET_PROGRAM_ID, USDC_MINT } from "./route";
import { SELL_ROUTE } from "./routes-table";

export { QuoteOverLimitError };

/** How the sale reads its pool: the NVDAx pool, in the NVDAx-in direction. */
const SELL_POOL_READ = { product: SELL_ROUTE.ticker, swapForY: SELL_SWAP_FOR_Y } as const;

/** A sale quoted above the per-sale USDC limit. A `QuoteOverLimitError`, so callers map both limits alike. */
export class SellQuoteOverLimitError extends QuoteOverLimitError {
  constructor(usdcOutRaw: bigint) {
    super(usdcOutRaw);
    this.message = `the sale is quoted to return ${usdcOutRaw} raw USDC, above the per-sale limit`;
    this.name = "SellQuoteOverLimitError";
  }
}

const MAX_SLIPPAGE_BPS = 10_000;
/** How many times the field cap is narrowed toward the USDC limit before giving up. */
const SELL_CAP_ITERATIONS = 8;

export interface BuildSellParams {
  /** Caller-supplied RPC connection. This module never constructs its own. */
  connection: Connection;
  /** The wallet that sells and pays the fee. Read-only here: never used to sign. */
  userPublicKey: PublicKey;
  /** NVDAx input, raw integer base units (8 decimals). */
  nvdaxInRaw: bigint;
  /** Slippage in basis points, applied to the quoted USDC output. */
  slippageBps: number;
  /** Largest USDC the sale may be quoted to return. */
  maxUsdcOutRaw: bigint;
}

export interface BuildSellResult {
  input: { mint: string; amountRaw: string };
  /** The quote: `outputRaw` and `minimumOutputRaw` are USDC raw units; `feeRaw` is in the fee-charged token. */
  quote: RouteQuote;
  binArrayIndexes: bigint[];
  hasBitmapExtension: boolean;
  lastValidBlockHeight: number;
  /** The unsigned transaction itself. Never signed or sent by this module. */
  transaction: Transaction;
}

function checkSellInput(nvdaxInRaw: bigint, slippageBps: number): void {
  if (nvdaxInRaw <= 0n) throw new InvalidSwapInputError("nvdaxInRaw must be a positive integer");
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > MAX_SLIPPAGE_BPS) {
    throw new InvalidSwapInputError(`slippageBps must be an integer in [0, ${MAX_SLIPPAGE_BPS}]`);
  }
}

type SdkQuote = ReturnType<PoolState["pool"]["swapQuote"]>;

/** Quote selling `nvdaxInRaw` on an already-read pool state (partial fill quoted, so a short pool shows as a smaller consumed input). */
function quoteSell(state: PoolState, nvdaxInRaw: bigint, slippageBps: number): SdkQuote {
  return state.pool.swapQuote(new BN(nvdaxInRaw.toString()), SELL_SWAP_FOR_Y, new BN(slippageBps), state.binArrays, true);
}

function routeQuoteOf(quote: SdkQuote): RouteQuote {
  return {
    consumedInputRaw: quote.consumedInAmount.toString(),
    outputRaw: quote.outAmount.toString(),
    minimumOutputRaw: quote.minOutAmount.toString(),
    feeRaw: quote.fee.toString(),
    protocolFeeRaw: quote.protocolFee.toString(),
    feeOnInput: quote.feeOnInput,
    priceImpactPct: quote.priceImpact.toString(),
  };
}

/**
 * The largest NVDAx amount (raw) whose sale the pool quotes at no more than
 * `maxUsdcOutRaw`, on an already-read pool state: the exact-out quote for the
 * limit, narrowed by exact-in quotes until one fits. A local computation.
 */
export function sellCapOnPoolState(state: PoolState, maxUsdcOutRaw: bigint, slippageBps: number = PURCHASE_CONFIG.slippageBps): bigint {
  const exactOut = state.pool.swapQuoteExactOut(new BN(maxUsdcOutRaw.toString()), SELL_SWAP_FOR_Y, new BN(slippageBps), state.binArrays);
  let candidate = BigInt(exactOut.inAmount.toString());
  for (let iteration = 0; iteration < SELL_CAP_ITERATIONS && candidate > 0n; iteration += 1) {
    const quote = quoteSell(state, candidate, slippageBps);
    const consumed = BigInt(quote.consumedInAmount.toString());
    if (consumed < candidate) {
      candidate = consumed;
      continue;
    }
    const out = BigInt(quote.outAmount.toString());
    if (out <= maxUsdcOutRaw) return candidate;
    candidate = (candidate * maxUsdcOutRaw) / out;
  }
  throw new RoutePoolMismatchError("the pool did not quote an NVDAx amount within the USDC limit");
}

/** Read the pinned pool and return the NVDAx sale cap for the USDC limit (see `sellCapOnPoolState`). */
export async function readSellCap(connection: Connection, maxUsdcOutRaw: bigint = PURCHASE_CONFIG.maxUsdcOutRaw): Promise<bigint> {
  return sellCapOnPoolState(await readPoolState(connection, SELL_POOL_READ), maxUsdcOutRaw);
}

function isComputeBudget(instruction: TransactionInstruction): boolean {
  return instruction.programId.equals(COMPUTE_BUDGET_PROGRAM_ID);
}

/**
 * Read the pinned pool, quote an exact-in NVDAx sale, and build the unsigned
 * transaction for it. Throws `InvalidSwapInputError` for bad input or a pool
 * that cannot take the whole amount, `QuoteOverLimitError` above the USDC
 * limit (`SellQuoteOverLimitError`), and `RoutePoolMismatchError` on an identity mismatch.
 */
export async function buildNvdaxSellExactIn(params: BuildSellParams): Promise<BuildSellResult> {
  const { connection, userPublicKey, nvdaxInRaw, slippageBps, maxUsdcOutRaw } = params;
  checkSellInput(nvdaxInRaw, slippageBps);
  const state = await readPoolState(connection, SELL_POOL_READ);
  const { pool, binArrays } = state;
  const quote = quoteSell(state, nvdaxInRaw, slippageBps);
  if (quote.consumedInAmount.toString() !== nvdaxInRaw.toString()) throw new InvalidSwapInputError("the pool cannot take the whole amount");
  const usdcOutRaw = BigInt(quote.outAmount.toString());
  if (usdcOutRaw > maxUsdcOutRaw) throw new SellQuoteOverLimitError(usdcOutRaw);
  if (quote.minOutAmount.lten(0)) throw new InvalidSwapInputError("the sale is quoted to return no USDC");

  const indexByAddress = new Map(binArrays.map((binArray) => [binArray.publicKey.toBase58(), BigInt(binArray.account.index.toString())]));
  const binArrayIndexes = quote.binArraysPubkey.map((pubkey: PublicKey) => {
    const index = indexByAddress.get(pubkey.toBase58());
    if (index === undefined) throw new RoutePoolMismatchError("the quote used a bin array the pool read did not return");
    return index;
  });

  const built = await pool.swap({
    inToken: SELL_ROUTE.productMint,
    outToken: USDC_MINT,
    inAmount: new BN(nvdaxInRaw.toString()),
    minOutAmount: quote.minOutAmount,
    lbPair: SELL_ROUTE.pool,
    user: userPublicKey,
    binArraysPubkey: quote.binArraysPubkey,
  });
  const lastValidBlockHeight = built.lastValidBlockHeight;
  const blockhash = built.recentBlockhash;
  if (typeof lastValidBlockHeight !== "number" || !Number.isSafeInteger(lastValidBlockHeight) || lastValidBlockHeight <= 0 || !blockhash) {
    throw new Error("the built transaction carries no last valid block height");
  }
  const transaction = new Transaction({ blockhash, lastValidBlockHeight, feePayer: userPublicKey });
  transaction.add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: PURCHASE_CONFIG.sellComputeUnitLimit }),
    ...built.instructions.filter((instruction) => !isComputeBudget(instruction)),
  );

  return {
    input: { mint: SELL_ROUTE.productMint.toBase58(), amountRaw: nvdaxInRaw.toString() },
    quote: routeQuoteOf(quote),
    binArrayIndexes,
    hasBitmapExtension: pool.binArrayBitmapExtension !== null && pool.binArrayBitmapExtension !== undefined,
    lastValidBlockHeight,
    transaction,
  };
}
