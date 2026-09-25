/**
 * Browser-only, unsigned two-leg purchase of a product bought through its
 * pinned Raydium CLMM pool: SOL / SKR -> USDC in the pay token's pinned
 * Meteora DLMM pool (built by the DLMM SDK, as for every two-leg purchase),
 * then exactly that leg's USDC minimum -> the product in the CLMM pool
 * (`swap_v2` written by `clmm-build.ts`), in one transaction. Same security
 * invariants as `clmm-build.ts`: nothing is signed or sent here, and the
 * caller audits the wire bytes (`auditClmmTwoLegTransaction`) and simulates.
 */

import { Transaction, type Connection, type PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { TOKEN_PROGRAM_ID } from "@benten/solana";

import { LEG_SWAP_FOR_Y, legQuote, loadPool, QuoteOverLimitError, TwoLegInputError, type LegQuote } from "./build-two-leg";
import { clmmRoute, clmmSwapInstruction, createOwnAccount, latestBlockhash } from "./clmm-build";
import { quoteClmmOnState, readClmmRouteState, type ClmmQuoteReading } from "./clmm-quote";
import { PAY_CONFIG } from "./pay-config";
import { composeTwoLegInstructions } from "./two-leg-compose";
import { PAY_TOKENS, USDC_MINT, type PayTokenId } from "./route";
import type { ProductTicker } from "./routes-table";

/** Largest serialized legacy transaction the network accepts (packet data size). */
const LEGACY_TRANSACTION_LIMIT = 1232;

/** Serialized length of an unsigned transaction, or `Infinity` when it does not fit at all. */
function serializedLength(transaction: Transaction): number {
  try {
    return transaction.serialize({ requireAllSignatures: false, verifySignatures: false }).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export interface BuildClmmTwoLegParams {
  connection: Connection;
  userPublicKey: PublicKey;
  product: ProductTicker;
  payToken: Exclude<PayTokenId, "USDC">;
  inAmountRaw: bigint;
  slippageBps: number;
  /** Largest USDC the first leg may be quoted to return (the per-transaction limit in USD terms). */
  maxUsdcRaw: bigint;
}

export interface BuildClmmTwoLegResult {
  input: { payToken: PayTokenId; mint: string; amountRaw: string };
  /** Pay token -> USDC in the pinned DLMM pool. Its `minimumOutputRaw` is the second leg's exact USDC input. */
  firstLeg: LegQuote;
  /** USDC -> the product in its pinned CLMM pool. */
  secondLeg: ClmmQuoteReading;
  secondLegHasBitmapExtension: boolean;
  lastValidBlockHeight: number;
  transaction: Transaction;
}

/** Read both pinned pools, quote the two legs, and build the unsigned transaction. */
export async function buildClmmTwoLegExactInSwap(params: BuildClmmTwoLegParams): Promise<BuildClmmTwoLegResult> {
  const { connection, userPublicKey: user, payToken, inAmountRaw, slippageBps, maxUsdcRaw } = params;
  const pay = PAY_TOKENS[payToken];
  const route = clmmRoute(params.product);
  const leg = pay?.leg ?? null;
  if (!leg) throw new TwoLegInputError("the pay token has no pinned first leg");
  if (inAmountRaw <= 0n) throw new TwoLegInputError("inAmountRaw must be a positive integer");

  const [legPool, state] = await Promise.all([
    loadPool(connection, leg.pool, leg.tokenXMint, leg.tokenYMint, TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID),
    readClmmRouteState(connection, route.ticker),
  ]);
  const inAmount = new BN(inAmountRaw.toString());
  const legBinArrays = await legPool.getBinArrayForSwap(LEG_SWAP_FOR_Y);
  const first = legPool.swapQuote(inAmount, LEG_SWAP_FOR_Y, new BN(slippageBps), legBinArrays);
  if (first.consumedInAmount.toString() !== inAmountRaw.toString()) throw new TwoLegInputError("the first pool cannot take the whole amount");
  const usdcOutRaw = BigInt(first.outAmount.toString());
  if (usdcOutRaw > maxUsdcRaw) throw new QuoteOverLimitError(usdcOutRaw);
  const usdcMinimumRaw = BigInt(first.minOutAmount.toString());
  if (usdcMinimumRaw <= 0n) throw new TwoLegInputError("the first leg is quoted to return no USDC");
  const second = quoteClmmOnState(state, usdcMinimumRaw, slippageBps);

  const legTransaction = await legPool.swap({ inToken: leg.tokenXMint, outToken: USDC_MINT, inAmount, minOutAmount: first.minOutAmount, lbPair: leg.pool, user, binArraysPubkey: first.binArraysPubkey });
  const { blockhash, lastValidBlockHeight } = await latestBlockhash(connection);
  const compose = (starts: readonly number[]) => new Transaction({ blockhash, lastValidBlockHeight, feePayer: user }).add(...composeTwoLegInstructions(legTransaction.instructions, [
    createOwnAccount(user, route.productMint, route.tokenProgram),
    clmmSwapInstruction(route, user, usdcMinimumRaw, second.minimumOutputRaw, starts, state.hasBitmapExtension),
  ], PAY_CONFIG.twoLegComputeUnitLimit));
  // Paying with SOL comes within a few bytes of the legacy limit; without room, name only the arrays the quote walks.
  let starts = second.tickArrayStarts;
  let transaction = compose(starts);
  if (serializedLength(transaction) > LEGACY_TRANSACTION_LIMIT) {
    starts = second.walkedTickArrayStarts;
    transaction = compose(starts);
  }

  return {
    input: { payToken, mint: pay.mint.toBase58(), amountRaw: inAmountRaw.toString() },
    firstLeg: legQuote(legPool, legBinArrays, first),
    secondLeg: { ...second, tickArrayStarts: starts },
    secondLegHasBitmapExtension: state.hasBitmapExtension,
    lastValidBlockHeight,
    transaction,
  };
}
