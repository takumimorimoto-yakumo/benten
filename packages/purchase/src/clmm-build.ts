/**
 * Browser-only, unsigned exact-in purchase builder for a product's pinned
 * Raydium CLMM route (`routes-table-clmm.ts`): USDC -> product in one
 * `swap_v2`. The two-leg purchase (SOL / SKR first through a Meteora DLMM
 * pool) is `clmm-build-two-leg.ts`; this module loads no DEX SDK.
 *
 * SECURITY INVARIANTS (same as `build-swap.ts` and `build-two-leg.ts`):
 *  1. Builds and returns one unsigned legacy `Transaction`. Never asks a
 *     wallet to sign, never submits, never touches a private key or seed
 *     phrase.
 *  2. Every pool, vault, config and mint is a pinned constant of the routes
 *     table, never derived from caller input; a pool read back that does not
 *     carry the pinned identity throws `RoutePoolMismatchError`.
 *  3. Amounts are raw integer base units.
 *  4. The `swap_v2` instruction is written here from the program's IDL; no
 *     DEX SDK builds it. The caller audits the exact wire bytes
 *     (`clmm-audit.ts`, which derives every account independently) and runs
 *     an unsigned simulation before the panel offers the transaction.
 */

import { ComputeBudgetProgram, PublicKey, SystemProgram, Transaction, TransactionInstruction, type Connection } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@benten/solana";

import { bitmapExtensionAddress, CLMM_PROGRAM_ID, encodeSwapV2Data, tickArrayAddress, USDC_IN_SQRT_PRICE_LIMIT_X64 } from "./clmm-program";
import { CLMM_CONFIG } from "./clmm-config";
import { quoteClmmOnState, readClmmRouteState, type ClmmQuoteReading } from "./clmm-quote";
import { PURCHASE_CONFIG } from "./config";
import { MEMO_PROGRAM_ID, USDC_MINT } from "./route";
import type { ProductTicker } from "./routes-table";
import { CLMM_PRODUCT_ROUTES, clmmPins, type ClmmProductRoute, type ClmmProductTicker } from "./routes-table-clmm";
import { associatedTokenAddress } from "./tx-allowlist";

const ATA_CREATE_IDEMPOTENT = 1;

export function clmmRoute(product: ProductTicker): ClmmProductRoute {
  if (!clmmPins(product)) throw new Error("product has no pinned CLMM route");
  return CLMM_PRODUCT_ROUTES[product as ClmmProductTicker];
}

/** Idempotent creation of `owner`'s associated token account of `mint`, paid by `owner`. */
export function createOwnAccount(owner: PublicKey, mint: PublicKey, tokenProgram: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: new PublicKey(associatedTokenAddress(owner, mint, tokenProgram)), isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: tokenProgram, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([ATA_CREATE_IDEMPOTENT]),
  });
}

/** The `swap_v2` of a USDC-in purchase in the product's pinned pool. */
export function clmmSwapInstruction(route: ClmmProductRoute, user: PublicKey, amountIn: bigint, minimumOut: bigint, tickArrayStarts: readonly number[], hasBitmapExtension: boolean): TransactionInstruction {
  const account = (pubkey: PublicKey, isWritable: boolean) => ({ pubkey, isSigner: false, isWritable });
  return new TransactionInstruction({
    programId: CLMM_PROGRAM_ID,
    keys: [
      { pubkey: user, isSigner: true, isWritable: false },
      account(route.clmm.ammConfig, false),
      account(route.pool, true),
      account(new PublicKey(associatedTokenAddress(user, USDC_MINT, TOKEN_PROGRAM_ID)), true),
      account(new PublicKey(associatedTokenAddress(user, route.productMint, route.tokenProgram)), true),
      account(route.clmm.usdcVault, true),
      account(route.clmm.productVault, true),
      account(route.clmm.observation, true),
      account(TOKEN_PROGRAM_ID, false),
      account(TOKEN_2022_PROGRAM_ID, false),
      account(MEMO_PROGRAM_ID, false),
      account(USDC_MINT, false),
      account(route.productMint, false),
      ...(hasBitmapExtension ? [account(bitmapExtensionAddress(route.pool), true)] : []),
      ...tickArrayStarts.map((start) => account(tickArrayAddress(route.pool, start), true)),
    ],
    data: Buffer.from(encodeSwapV2Data(amountIn, minimumOut, USDC_IN_SQRT_PRICE_LIMIT_X64)),
  });
}

export async function latestBlockhash(connection: Connection): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
  const latest = await connection.getLatestBlockhash(PURCHASE_CONFIG.readCommitment);
  if (!latest.blockhash || !Number.isSafeInteger(latest.lastValidBlockHeight) || latest.lastValidBlockHeight <= 0) {
    throw new Error("the built transaction carries no last valid block height");
  }
  return latest;
}

export interface BuildClmmParams {
  connection: Connection;
  /** The wallet that will sign and pay. Read-only here: never used to sign. */
  userPublicKey: PublicKey;
  /** A routes-table key whose route is a CLMM route. */
  product: ProductTicker;
  usdcInAmountRaw: bigint;
  slippageBps: number;
}

export interface BuildClmmResult {
  reading: ClmmQuoteReading;
  hasBitmapExtension: boolean;
  lastValidBlockHeight: number;
  transaction: Transaction;
}

/** Read the pinned pool, quote, and build the unsigned USDC -> product transaction. */
export async function buildClmmUsdcExactInSwap(params: BuildClmmParams): Promise<BuildClmmResult> {
  const { connection, userPublicKey: user, usdcInAmountRaw, slippageBps } = params;
  const route = clmmRoute(params.product);
  const state = await readClmmRouteState(connection, route.ticker);
  const reading = quoteClmmOnState(state, usdcInAmountRaw, slippageBps);
  const { blockhash, lastValidBlockHeight } = await latestBlockhash(connection);
  const transaction = new Transaction({ blockhash, lastValidBlockHeight, feePayer: user });
  transaction.add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: CLMM_CONFIG.computeUnitLimit }),
    createOwnAccount(user, route.productMint, route.tokenProgram),
    clmmSwapInstruction(route, user, usdcInAmountRaw, reading.minimumOutputRaw, reading.tickArrayStarts, state.hasBitmapExtension),
  );
  return { reading, hasBitmapExtension: state.hasBitmapExtension, lastValidBlockHeight, transaction };
}

