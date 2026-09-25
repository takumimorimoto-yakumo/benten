/**
 * Browser-only, unsigned exact-in swap builder for a product's pinned
 * product/USDC Meteora DLMM route (`routes-table.ts`; default NVDAx) (gate G-B1, `specs/stocklana-submission-plan-2026-09-23.md`).
 *
 * SECURITY INVARIANTS (do not weaken without a security review; mirrors
 * `packages/solana/src/index.ts` and the repository CLAUDE.md):
 *  1. This module only builds and simulates an unsigned transaction. It
 *     never imports a wallet keyholder type, never asks a wallet to sign,
 *     never submits a transaction, and never touches a private key or seed
 *     phrase.
 *  2. It builds exactly one `Transaction` and returns it unsigned. The caller
 *     (a wallet-connected UI) owns the decision to show it to the user, get a
 *     signature, and send it. This module makes that decision for nobody.
 *  3. The pool, its two mints, and their token-program owners are pinned
 *     constants of the routes table (the NVDAx route observed read-only in
 *     `docs/route-feasibility-2026-09-14.md` and referenced from
 *     `specs/stocklana-submission-plan-2026-09-23.md`); the caller names only
 *     a table key.
 *     They are never derived from caller input. If the pool account read back
 *     from RPC does not match this pinned identity, this module throws
 *     `RoutePoolMismatchError` instead of falling back to whatever the RPC
 *     returned -- a live mint or program swap must fail closed, never silently
 *     substitute a different route.
 *  4. Amounts in and out are raw integer base units (`bigint` in, `string` of
 *     an integer out). Nothing here converts through a floating-point display
 *     amount or a stored Scaled UI multiplier; the multiplier, if ever shown
 *     to a user, must be read at display time by the caller from the mint
 *     account itself, not from a constant in this file.
 *
 * This module is safe to evaluate in a browser: it holds no credentials, only
 * reads public RPC state through the `Connection` the caller supplies, and
 * never constructs its own `Connection` or reads environment variables.
 */

import { PublicKey, type Connection, type Transaction, type TransactionInstruction } from "@solana/web3.js";
import BN from "bn.js";

import { NVDAX_MINT, NVDAX_USDC_POOL, USDC_MINT } from "./route";
import { DEFAULT_PRODUCT, productRoute, type ProductTicker } from "./routes-table";
import { InvalidSwapInputError, RoutePoolMismatchError, readPoolQuote, type RouteQuote } from "./quote";

/** The pinned route identities live in `route.ts` (no SDK import) and are re-exported here. */
export { NVDAX_MINT, NVDAX_USDC_POOL, USDC_MINT };
/** The pool read and quote live in `quote.ts`; their errors are re-exported for existing callers. */
export { InvalidSwapInputError, RoutePoolMismatchError };

export interface BuildSwapParams {
  /** Caller-supplied RPC connection. This module never constructs its own. */
  connection: Connection;
  /** The wallet that will sign and pay for the swap. Read-only here: never used to sign. */
  userPublicKey: PublicKey;
  /** The product to buy: a routes-table key (default NVDA). Its pool is read from the table. */
  product?: ProductTicker;
  /** USDC input amount, in raw integer base units (6 decimals), as a `bigint`. */
  usdcInAmountRaw: bigint;
  /** Allowed slippage in basis points (0-10000) applied to the quoted output. */
  slippageBps: number;
}

export interface SwapInstructionSummary {
  programId: string;
  accounts: string[];
}

export interface BuildSwapResult {
  /** Raw USDC input, echoed back as a decimal-integer string. */
  input: {
    mint: string;
    amountRaw: string;
  };
  /** The SDK's quoted output for this exact input, before this transaction is built. `minimumOutputRaw` is what the built transaction enforces on-chain. */
  quote: RouteQuote;
  /** Bin arrays the quote and transaction were built against, base58. */
  binArrays: string[];
  /** Index of each entry of `binArrays`, in the same order, so a caller can re-derive each address from the pinned pool. */
  binArrayIndexes: bigint[];
  /** Pool facts read back from RPC that the transaction depends on. */
  pool: {
    reserveX: string;
    reserveY: string;
    oracle: string;
    /** Whether the pool has a bin-array bitmap extension account. */
    hasBitmapExtension: boolean;
  };
  /** Last block height at which the network accepts this transaction's blockhash. */
  lastValidBlockHeight: number;
  /** Every instruction in the built transaction: program id and the account list, in order. For an offline audit before signing. */
  instructions: SwapInstructionSummary[];
  /** The unsigned transaction itself. Never signed or sent by this module. */
  transaction: Transaction;
}

/**
 * Read the product's pinned pool (default NVDAx/USDC), quote an exact-in USDC
 * swap, and build the unsigned swap transaction for it.
 *
 * The pool read and quote (with their `InvalidSwapInputError` and
 * `RoutePoolMismatchError` checks) are `readPoolQuote` in `quote.ts`. Any
 * other failure (RPC unreachable, SDK quote/build error) propagates as-is;
 * this module does not swallow errors into a partial result.
 */
export async function buildNvdaxUsdcExactInSwap(params: BuildSwapParams): Promise<BuildSwapResult> {
  const { connection, userPublicKey, usdcInAmountRaw, slippageBps } = params;
  const route = productRoute(params.product ?? DEFAULT_PRODUCT);

  const { pool, binArrays, sdkQuote: quote, quote: routeQuote } = await readPoolQuote(connection, usdcInAmountRaw, slippageBps, route.ticker);
  const inAmount = new BN(usdcInAmountRaw.toString());
  const indexByAddress = new Map(binArrays.map((binArray) => [binArray.publicKey.toBase58(), BigInt(binArray.account.index.toString())]));
  const binArrayIndexes = quote.binArraysPubkey.map((pubkey: PublicKey) => {
    const index = indexByAddress.get(pubkey.toBase58());
    if (index === undefined) throw new RoutePoolMismatchError("the quote used a bin array the pool read did not return");
    return index;
  });

  const transaction = await pool.swap({
    inToken: USDC_MINT,
    outToken: route.productMint,
    inAmount,
    minOutAmount: quote.minOutAmount,
    lbPair: route.pool,
    user: userPublicKey,
    binArraysPubkey: quote.binArraysPubkey,
  });

  // Tracking decides "dropped" from this height; without it the transaction must not be offered.
  const lastValidBlockHeight = transaction.lastValidBlockHeight;
  if (typeof lastValidBlockHeight !== "number" || !Number.isSafeInteger(lastValidBlockHeight) || lastValidBlockHeight <= 0) {
    throw new Error("the built transaction carries no last valid block height");
  }

  return {
    input: {
      mint: USDC_MINT.toBase58(),
      amountRaw: usdcInAmountRaw.toString(),
    },
    quote: routeQuote,
    binArrays: quote.binArraysPubkey.map((pubkey: PublicKey) => pubkey.toBase58()),
    binArrayIndexes,
    pool: {
      reserveX: pool.lbPair.reserveX.toBase58(),
      reserveY: pool.lbPair.reserveY.toBase58(),
      oracle: pool.lbPair.oracle.toBase58(),
      hasBitmapExtension: pool.binArrayBitmapExtension !== null && pool.binArrayBitmapExtension !== undefined,
    },
    lastValidBlockHeight,
    instructions: transaction.instructions.map((instruction: TransactionInstruction) => ({
      programId: instruction.programId.toBase58(),
      accounts: instruction.keys.map((key) => key.pubkey.toBase58()),
    })),
    transaction,
  };
}
