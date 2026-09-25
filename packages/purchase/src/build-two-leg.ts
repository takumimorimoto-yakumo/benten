/**
 * Browser-only, unsigned two-leg exact-in purchase builder: pay with SOL or
 * SKR, swap it to USDC in one pinned Meteora DLMM pool, and swap exactly that
 * leg's USDC minimum to NVDAx in the fixed NVDAx/USDC pool, all in one
 * transaction.
 *
 * SECURITY INVARIANTS (same as `build-swap.ts`):
 *  1. Builds and returns one unsigned `Transaction`. Never asks a wallet to
 *     sign, never submits, never touches a private key or seed phrase.
 *  2. Every pool and mint is a pinned constant from `route.ts`, never derived
 *     from caller input. A pool read back from RPC that does not carry the
 *     pinned identity throws `RoutePoolMismatchError`; nothing falls back.
 *  3. Amounts are raw integer base units (`bigint` in, integer strings out).
 *  4. The per-transaction limit is enforced in USD terms before anything is
 *     built: the first leg's quoted USDC output must not exceed `maxUsdcRaw`.
 *
 * The caller audits the exact wire bytes (`auditTwoLegTransaction`) and runs
 * an unsigned simulation before the panel offers the transaction.
 */

import { PublicKey, Transaction, type Connection } from "@solana/web3.js";
import BN from "bn.js";
// eslint-disable-next-line import/no-named-as-default -- the SDK's default export is the DLMM pool class.
import DLMM from "@meteora-ag/dlmm";

import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@benten/solana";

import { PAY_CONFIG } from "./pay-config";
import { composeTwoLegInstructions } from "./two-leg-compose";
import { NVDAX_MINT, NVDAX_USDC_POOL, PAY_TOKENS, USDC_MINT, type PayLeg, type PayTokenId } from "./route";

const MAX_SLIPPAGE_BPS = 10_000;
/** The pay token is token X of its first pool: that leg swaps X for Y. */
const LEG_SWAP_FOR_Y = true;
/** USDC is token Y of the fixed pool and NVDAx token X: the second leg swaps Y for X. */
const NVDAX_SWAP_FOR_Y = false;

export class TwoLegRouteMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TwoLegRouteMismatchError";
  }
}

export class TwoLegInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TwoLegInputError";
  }
}

/** The first leg is quoted to return more USDC than the per-transaction limit. */
export class QuoteOverLimitError extends Error {
  constructor(readonly usdcOutRaw: bigint) {
    super(`the first leg is quoted to return ${usdcOutRaw} raw USDC, above the per-transaction limit`);
    this.name = "QuoteOverLimitError";
  }
}

type DlmmPool = Awaited<ReturnType<typeof DLMM.create>>;
type PoolBinArrays = Awaited<ReturnType<DlmmPool["getBinArrayForSwap"]>>;

export interface BuildTwoLegParams {
  /** Caller-supplied RPC connection. This module never constructs its own. */
  connection: Connection;
  /** The wallet that will sign and pay. Read-only here: never used to sign. */
  userPublicKey: PublicKey;
  /** A pay token with a pinned first leg (not USDC). */
  payToken: Exclude<PayTokenId, "USDC">;
  /** Pay token input, raw integer base units (lamports for SOL). */
  inAmountRaw: bigint;
  /** Slippage in basis points, applied to each leg's quoted output. */
  slippageBps: number;
  /** Largest USDC the first leg may be quoted to return (the per-transaction limit in USD terms). */
  maxUsdcRaw: bigint;
}

export interface LegQuote {
  pool: string;
  consumedInputRaw: string;
  outputRaw: string;
  minimumOutputRaw: string;
  feeRaw: string;
  protocolFeeRaw: string;
  feeOnInput: boolean;
  priceImpactPct: string;
  binArrayIndexes: bigint[];
  hasBitmapExtension: boolean;
}

export interface BuildTwoLegResult {
  input: { payToken: PayTokenId; mint: string; amountRaw: string };
  /** Pay token -> USDC. Its `minimumOutputRaw` is the second leg's exact USDC input. */
  firstLeg: LegQuote;
  /** USDC -> NVDAx in the fixed pool. */
  secondLeg: LegQuote;
  lastValidBlockHeight: number;
  /** The unsigned transaction itself. Never signed or sent by this module. */
  transaction: Transaction;
}

async function loadPool(connection: Connection, address: PublicKey, mintX: PublicKey, mintY: PublicKey, programX: PublicKey, programY: PublicKey): Promise<DlmmPool> {
  const pool = await DLMM.create(connection, address);
  if (!pool.tokenX.mint.address.equals(mintX) || !pool.tokenY.mint.address.equals(mintY)) {
    throw new TwoLegRouteMismatchError(`pool ${address.toBase58()} mints do not match the pinned identity`);
  }
  if (!pool.tokenX.owner.equals(programX) || !pool.tokenY.owner.equals(programY)) {
    throw new TwoLegRouteMismatchError(`pool ${address.toBase58()} token programs do not match the pinned identity`);
  }
  return pool;
}

function binArrayIndexesOf(pool: DlmmPool, binArrays: PoolBinArrays, used: PublicKey[]): bigint[] {
  const indexByAddress = new Map(binArrays.map((binArray) => [binArray.publicKey.toBase58(), BigInt(binArray.account.index.toString())]));
  return used.map((pubkey) => {
    const index = indexByAddress.get(pubkey.toBase58());
    if (index === undefined) throw new TwoLegRouteMismatchError(`the quote for pool ${pool.pubkey.toBase58()} used a bin array the pool read did not return`);
    return index;
  });
}

type SdkQuote = ReturnType<DlmmPool["swapQuote"]>;

function legQuote(pool: DlmmPool, binArrays: PoolBinArrays, quote: SdkQuote): LegQuote {
  return {
    pool: pool.pubkey.toBase58(),
    consumedInputRaw: quote.consumedInAmount.toString(),
    outputRaw: quote.outAmount.toString(),
    minimumOutputRaw: quote.minOutAmount.toString(),
    feeRaw: quote.fee.toString(),
    protocolFeeRaw: quote.protocolFee.toString(),
    feeOnInput: quote.feeOnInput,
    priceImpactPct: quote.priceImpact.toString(),
    binArrayIndexes: binArrayIndexesOf(pool, binArrays, quote.binArraysPubkey),
    hasBitmapExtension: pool.binArrayBitmapExtension !== null && pool.binArrayBitmapExtension !== undefined,
  };
}

/**
 * Read both pinned pools, quote the two legs, and build the unsigned
 * transaction. Any USDC above the first leg's minimum stays in the wallet.
 */
export async function buildTwoLegExactInSwap(params: BuildTwoLegParams): Promise<BuildTwoLegResult> {
  const { connection, userPublicKey, payToken, inAmountRaw, slippageBps, maxUsdcRaw } = params;
  const route = PAY_TOKENS[payToken];
  const leg: PayLeg | null = route?.leg ?? null;
  if (!leg) throw new TwoLegInputError("the pay token has no pinned first leg");
  if (inAmountRaw <= 0n) throw new TwoLegInputError("inAmountRaw must be a positive integer");
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > MAX_SLIPPAGE_BPS) {
    throw new TwoLegInputError(`slippageBps must be an integer in [0, ${MAX_SLIPPAGE_BPS}]`);
  }

  const [legPool, nvdaxPool] = await Promise.all([
    loadPool(connection, leg.pool, leg.tokenXMint, leg.tokenYMint, TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID),
    loadPool(connection, NVDAX_USDC_POOL, NVDAX_MINT, USDC_MINT, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID),
  ]);
  const slippage = new BN(slippageBps);
  const inAmount = new BN(inAmountRaw.toString());

  const legBinArrays = await legPool.getBinArrayForSwap(LEG_SWAP_FOR_Y);
  const first = legPool.swapQuote(inAmount, LEG_SWAP_FOR_Y, slippage, legBinArrays);
  if (first.consumedInAmount.toString() !== inAmountRaw.toString()) throw new TwoLegInputError("the first pool cannot take the whole amount");
  const usdcOutRaw = BigInt(first.outAmount.toString());
  if (usdcOutRaw > maxUsdcRaw) throw new QuoteOverLimitError(usdcOutRaw);
  const usdcMinimum = first.minOutAmount;
  if (usdcMinimum.lten(0)) throw new TwoLegInputError("the first leg is quoted to return no USDC");

  const nvdaxBinArrays = await nvdaxPool.getBinArrayForSwap(NVDAX_SWAP_FOR_Y);
  const second = nvdaxPool.swapQuote(usdcMinimum, NVDAX_SWAP_FOR_Y, slippage, nvdaxBinArrays);

  const [legTransaction, nvdaxTransaction] = await Promise.all([
    legPool.swap({ inToken: leg.tokenXMint, outToken: USDC_MINT, inAmount, minOutAmount: usdcMinimum, lbPair: leg.pool, user: userPublicKey, binArraysPubkey: first.binArraysPubkey }),
    nvdaxPool.swap({ inToken: USDC_MINT, outToken: NVDAX_MINT, inAmount: usdcMinimum, minOutAmount: second.minOutAmount, lbPair: NVDAX_USDC_POOL, user: userPublicKey, binArraysPubkey: second.binArraysPubkey }),
  ]);

  // Tracking decides "dropped" from this height; without it the transaction must not be offered.
  const lastValidBlockHeight = nvdaxTransaction.lastValidBlockHeight;
  const blockhash = nvdaxTransaction.recentBlockhash;
  if (typeof lastValidBlockHeight !== "number" || !Number.isSafeInteger(lastValidBlockHeight) || lastValidBlockHeight <= 0 || !blockhash) {
    throw new Error("the built transaction carries no last valid block height");
  }
  const transaction = new Transaction({ blockhash, lastValidBlockHeight, feePayer: userPublicKey });
  transaction.add(...composeTwoLegInstructions(legTransaction.instructions, nvdaxTransaction.instructions, PAY_CONFIG.twoLegComputeUnitLimit));

  return {
    input: { payToken, mint: route.mint.toBase58(), amountRaw: inAmountRaw.toString() },
    firstLeg: legQuote(legPool, legBinArrays, first),
    secondLeg: legQuote(nvdaxPool, nvdaxBinArrays, second),
    lastValidBlockHeight,
    transaction,
  };
}
