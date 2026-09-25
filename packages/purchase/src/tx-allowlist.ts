/**
 * Pre-approval audit of the built swap transaction.
 *
 * Before the panel ever asks a wallet to approve anything, the exact bytes it
 * would hand over are decoded and checked here against a closed allowlist:
 * only the compute-budget, associated-token-account and Meteora DLMM
 * programs; exactly one DLMM `swap2` instruction, last, whose every account
 * sits at its expected position and is either a pinned constant or derived
 * from the one pool the routes table pins for the product being bought
 * (`routes-table.ts`; any other product's pool, or a pool not in the table,
 * fails) and the connected wallet; the swap's encoded input and
 * minimum output equal the amounts the user reviews; no transfer-hook or other
 * extra accounts; the connected wallet as the only signer and fee payer.
 * Anything else fails closed with a reason, and the panel stops before the
 * wallet.
 *
 * Pure and deterministic: no RPC, no wallet, no clock.
 */

import { PublicKey, SystemProgram, Transaction, VersionedMessage } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@benten/solana";

import {
  COMPUTE_BUDGET_PROGRAM_ID,
  DLMM_PROGRAM_ID,
  MEMO_PROGRAM_ID,
  PAY_TOKENS,
  USDC_MINT,
  type PayTokenId,
} from "./route";
import { DEFAULT_PRODUCT, PRODUCT_ROUTES, resolveProductTicker, SELL_ROUTE, type ProductRoute, type ProductTicker } from "./routes-table";
import { BPS_DENOMINATOR, PURCHASE_CONFIG } from "./config";
import { PAY_CONFIG } from "./pay-config";

export interface AuditAccount {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
}

export interface AuditInstruction {
  programId: string;
  keys: AuditAccount[];
  data: Uint8Array;
}

export interface AuditTransaction {
  feePayer: string | null;
  instructions: AuditInstruction[];
}

export interface AuditExpectation {
  /** The connected wallet, base58. */
  user: string;
  /**
   * The product being bought (a routes-table key; default NVDA). The audit
   * reads its pool, mint and token program from the table itself, never from
   * the caller.
   */
  product?: ProductTicker;
  /** Raw USDC input the user reviews. */
  inputRaw: bigint;
  /** Raw product minimum output the user reviews. */
  minimumOutputRaw: bigint;
  /** Indexes of the bin arrays the quote used; each must derive from the product's pinned pool. */
  binArrayIndexes: readonly bigint[];
  /** Whether the pool has a bin-array bitmap extension account (read from the pool). */
  hasBitmapExtension: boolean;
}

/** `createsNvdaxAccount`: whether the transaction creates the wallet's token account of the product being bought (named for the first product). */
export type AuditResult =
  | { ok: true; createsNvdaxAccount: boolean; createsUsdcAccount: boolean }
  | { ok: false; reason: string };

/** Anchor discriminator of the DLMM `swap2` instruction: first 8 bytes of sha256("global:swap2"). */
const SWAP2_DISCRIMINATOR = Uint8Array.from([0x41, 0x4b, 0x3f, 0x4c, 0xeb, 0x5b, 0x5b, 0x88]);
/**
 * `swap2` data after the discriminator: amount_in u64, min_amount_out u64, then
 * the remaining-accounts info. The only accepted info is two empty slices
 * (transfer hook X and transfer hook Y, zero accounts each): every listed product mint's
 * transfer-hook program is unset, so no hook account may be appended.
 */
const SWAP2_REMAINING_ACCOUNTS_INFO = Uint8Array.from([2, 0, 0, 0, 0, 0, 1, 0]);
const U64_BYTES = 8;
const SWAP2_DATA_LENGTH = SWAP2_DISCRIMINATOR.length + U64_BYTES * 2 + SWAP2_REMAINING_ACCOUNTS_INFO.length;

/**
 * Compute-budget `SetComputeUnitLimit` (tag 2, u32 units). The only accepted
 * compute-budget instruction: neither builder emits `SetComputeUnitPrice`
 * (tag 3), whose priority fee the wallet would pay on top of the reviewed
 * terms, so it is refused like any other unknown instruction.
 */
export const COMPUTE_UNIT_LIMIT = { tag: 2, length: 5 };
/** Associated-token-account `CreateIdempotent`. */
const ATA_CREATE_IDEMPOTENT = 1;

function pda(seeds: Uint8Array[], programId: PublicKey): string {
  return PublicKey.findProgramAddressSync(seeds, programId)[0].toBase58();
}

function i64LittleEndian(value: bigint): Uint8Array {
  const bytes = new Uint8Array(U64_BYTES);
  new DataView(bytes.buffer).setBigInt64(0, value, true);
  return bytes;
}

export function u64At(data: Uint8Array, offset: number): bigint {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(offset, true);
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

export function associatedTokenAddress(owner: PublicKey, mint: PublicKey, tokenProgram: PublicKey): string {
  return pda([owner.toBytes(), tokenProgram.toBytes(), mint.toBytes()], ASSOCIATED_TOKEN_PROGRAM_ID);
}

/** The table route of a product key, or `null` for anything that is not a table key. */
function routeOf(product: ProductTicker | undefined): ProductRoute | null {
  const ticker = resolveProductTicker(product ?? DEFAULT_PRODUCT);
  // Only Meteora DLMM routes: a product bought through another DEX is audited by that DEX's audit.
  return ticker === null || PRODUCT_ROUTES[ticker].dex !== "meteora-dlmm" ? null : PRODUCT_ROUTES[ticker];
}

/** The product's pinned pool as a `PoolSpec`: product token X (its own token program), USDC token Y. */
function productPoolSpec(route: ProductRoute): PoolSpec {
  return { pool: route.pool, mintX: route.productMint, mintY: USDC_MINT, programX: route.tokenProgram, programY: TOKEN_PROGRAM_ID };
}

/** Accounts of a product's pinned pool that are fully determined by its address (DLMM program PDAs). Default NVDA. */
export function derivedPoolAccounts(product: ProductTicker = DEFAULT_PRODUCT): { reserveX: string; reserveY: string; oracle: string; eventAuthority: string; bitmapExtension: string } {
  const route = routeOf(product);
  if (!route) throw new Error("product has no pinned route");
  return poolAccounts(productPoolSpec(route));
}

/** A bin array of a product's pinned pool. Default NVDA. */
export function binArrayAddress(index: bigint, product: ProductTicker = DEFAULT_PRODUCT): string {
  const route = routeOf(product);
  if (!route) throw new Error("product has no pinned route");
  return poolBinArrayAddress(route.pool, index);
}

/**
 * `null` accepts either flag. Flags of a decoded transaction are message-wide
 * (an account writable or signing anywhere is so in every instruction), so the
 * wallet's own slots cannot be told apart per instruction; the signer set is
 * checked separately (only the wallet may sign).
 */
export type Expected = { pubkey: string; signer: boolean | null; writable: boolean | null };

export function checkAccounts(actual: AuditAccount[], expected: Expected[], label: string): string | null {
  if (actual.length !== expected.length) return `${label}: expected ${expected.length} accounts, found ${actual.length}`;
  for (const [index, want] of expected.entries()) {
    const got = actual[index];
    if (got.pubkey !== want.pubkey) return `${label}: account ${index} is not the expected account`;
    if (want.signer !== null && got.isSigner !== want.signer) return `${label}: account ${index} has an unexpected signer flag`;
    if (want.writable !== null && got.isWritable !== want.writable) return `${label}: account ${index} has an unexpected writable flag`;
  }
  return null;
}

/** `maxUnits`: the largest accepted compute-unit limit, or `null` for any (the protocol caps it). */
export function auditComputeBudget(instruction: AuditInstruction, seen: Set<number>, maxUnits: number | null): string | null {
  if (instruction.keys.length !== 0) return "compute budget: unexpected accounts";
  const tag = instruction.data[0];
  if (tag !== COMPUTE_UNIT_LIMIT.tag || instruction.data.length !== COMPUTE_UNIT_LIMIT.length) return "compute budget: unexpected instruction";
  if (seen.has(tag)) return "compute budget: duplicate instruction";
  const units = new DataView(instruction.data.buffer, instruction.data.byteOffset, instruction.data.byteLength).getUint32(1, true);
  if (maxUnits !== null && units > maxUnits) return "compute budget: limit above the route's ceiling";
  seen.add(tag);
  return null;
}

function auditAccountCreation(instruction: AuditInstruction, user: PublicKey, created: Set<string>, product: ProductRoute): string | null {
  if (!bytesEqual(instruction.data, Uint8Array.from([ATA_CREATE_IDEMPOTENT]))) return "token account: only idempotent creation is allowed";
  const mint = instruction.keys[3]?.pubkey;
  const route = mint === product.productMint.toBase58()
    ? { mint: product.productMint, program: product.tokenProgram }
    : mint === USDC_MINT.toBase58()
      ? { mint: USDC_MINT, program: TOKEN_PROGRAM_ID }
      : null;
  if (!route) return "token account: mint is not part of the route";
  if (created.has(route.mint.toBase58())) return "token account: duplicate creation";
  const failure = checkAccounts(instruction.keys, [
    { pubkey: user.toBase58(), signer: true, writable: true },
    { pubkey: associatedTokenAddress(user, route.mint, route.program), signer: false, writable: true },
    { pubkey: user.toBase58(), signer: null, writable: null },
    { pubkey: route.mint.toBase58(), signer: false, writable: false },
    { pubkey: SystemProgram.programId.toBase58(), signer: false, writable: false },
    { pubkey: route.program.toBase58(), signer: false, writable: false },
  ], "token account");
  if (failure) return failure;
  created.add(route.mint.toBase58());
  return null;
}

function auditSwap(instruction: AuditInstruction, user: PublicKey, expectation: AuditExpectation, product: ProductRoute): string | null {
  const data = instruction.data;
  if (data.length !== SWAP2_DATA_LENGTH || !bytesEqual(data.subarray(0, SWAP2_DISCRIMINATOR.length), SWAP2_DISCRIMINATOR)) {
    return "swap: not the expected swap instruction";
  }
  const amountIn = u64At(data, SWAP2_DISCRIMINATOR.length);
  const minimumOut = u64At(data, SWAP2_DISCRIMINATOR.length + U64_BYTES);
  if (amountIn !== expectation.inputRaw) return "swap: encoded input differs from the reviewed amount";
  // The same per-transaction limit the two-leg audit holds its USDC leg to, whatever the caller reviewed.
  if (amountIn <= 0n) return "swap: the USDC input is not positive";
  if (amountIn > PURCHASE_CONFIG.maxUsdcInRaw) return "swap: the USDC input is above the per-transaction limit";
  if (minimumOut !== expectation.minimumOutputRaw) return "swap: encoded minimum differs from the reviewed minimum";
  if (!bytesEqual(data.subarray(SWAP2_DISCRIMINATOR.length + U64_BYTES * 2), SWAP2_REMAINING_ACCOUNTS_INFO)) {
    return "swap: unexpected extra accounts";
  }
  if (expectation.binArrayIndexes.length === 0) return "swap: no bin arrays";

  const derived = poolAccounts(productPoolSpec(product));
  const program = DLMM_PROGRAM_ID.toBase58();
  const fixed: Expected[] = [
    { pubkey: product.pool.toBase58(), signer: false, writable: true },
    { pubkey: expectation.hasBitmapExtension ? derived.bitmapExtension : program, signer: false, writable: null },
    { pubkey: derived.reserveX, signer: false, writable: true },
    { pubkey: derived.reserveY, signer: false, writable: true },
    { pubkey: associatedTokenAddress(user, USDC_MINT, TOKEN_PROGRAM_ID), signer: false, writable: true },
    { pubkey: associatedTokenAddress(user, product.productMint, product.tokenProgram), signer: false, writable: true },
    { pubkey: product.productMint.toBase58(), signer: false, writable: false },
    { pubkey: USDC_MINT.toBase58(), signer: false, writable: false },
    { pubkey: derived.oracle, signer: false, writable: true },
    // Host fee account: none. Anchor encodes an absent optional account as the program id.
    { pubkey: program, signer: false, writable: false },
    { pubkey: user.toBase58(), signer: true, writable: null },
    { pubkey: product.tokenProgram.toBase58(), signer: false, writable: false },
    { pubkey: TOKEN_PROGRAM_ID.toBase58(), signer: false, writable: false },
    { pubkey: MEMO_PROGRAM_ID.toBase58(), signer: false, writable: false },
    { pubkey: derived.eventAuthority, signer: false, writable: false },
    { pubkey: program, signer: false, writable: false },
  ];
  const binArrays: Expected[] = expectation.binArrayIndexes.map((index) => ({ pubkey: poolBinArrayAddress(product.pool, index), signer: false, writable: true }));
  return checkAccounts(instruction.keys, [...fixed, ...binArrays], "swap");
}

/** Reason an audit gives for bytes that are not exactly one decodable transaction. */
export const NOT_ONE_TRANSACTION = "transaction bytes do not decode to exactly one transaction";

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

/** Audit the transaction the wallet would be asked to approve. */
export function auditSwapTransaction(transaction: AuditTransaction | null, expectation: AuditExpectation): AuditResult {
  if (!transaction) return { ok: false, reason: NOT_ONE_TRANSACTION };
  let user: PublicKey;
  try {
    user = new PublicKey(expectation.user);
  } catch {
    return { ok: false, reason: "wallet address is not valid" };
  }
  const product = routeOf(expectation.product);
  if (!product) return { ok: false, reason: "product has no pinned route" };
  if (transaction.feePayer !== user.toBase58()) return { ok: false, reason: "fee payer is not the connected wallet" };
  const instructions = transaction.instructions;
  if (instructions.length === 0) return { ok: false, reason: "no instructions" };

  const computeBudgetSeen = new Set<number>();
  const createdAccounts = new Set<string>();
  let swapCount = 0;
  for (const [index, instruction] of instructions.entries()) {
    for (const key of instruction.keys) {
      if (key.isSigner && key.pubkey !== user.toBase58()) return { ok: false, reason: `instruction ${index}: unexpected signer` };
    }
    let failure: string | null;
    if (instruction.programId === COMPUTE_BUDGET_PROGRAM_ID.toBase58()) {
      failure = auditComputeBudget(instruction, computeBudgetSeen, null);
    } else if (instruction.programId === ASSOCIATED_TOKEN_PROGRAM_ID.toBase58()) {
      failure = auditAccountCreation(instruction, user, createdAccounts, product);
    } else if (instruction.programId === DLMM_PROGRAM_ID.toBase58()) {
      swapCount += 1;
      failure = index === instructions.length - 1 ? auditSwap(instruction, user, expectation, product) : "swap: must be the last instruction";
    } else {
      failure = "program is not allowed";
    }
    if (failure) return { ok: false, reason: `instruction ${index}: ${failure}` };
  }
  if (swapCount !== 1) return { ok: false, reason: "expected exactly one swap instruction" };
  return {
    ok: true,
    createsNvdaxAccount: createdAccounts.has(product.productMint.toBase58()),
    createsUsdcAccount: createdAccounts.has(USDC_MINT.toBase58()),
  };
}

/**
 * Decode unsigned wire bytes into the neutral shape the audit reads, or
 * `null` when they do not decode or are not exactly the transaction they
 * decode to. Decoding stops at the end of the message and ignores anything
 * after it, so the decoded transaction is serialized again and must equal
 * the input byte for byte: trailing bytes, or a non-canonical length
 * encoding, never reach the wallet under an audit of different bytes.
 */
export function auditShapeOf(wire: Uint8Array): AuditTransaction | null {
  let decoded: Transaction;
  try {
    decoded = Transaction.from(wire);
    if (!sameBytes(decoded.serialize({ requireAllSignatures: false, verifySignatures: false }), wire)) return null;
  } catch {
    return null;
  }
  return {
    feePayer: decoded.feePayer?.toBase58() ?? null,
    instructions: decoded.instructions.map((instruction) => ({
      programId: instruction.programId.toBase58(),
      keys: instruction.keys.map((key) => ({ pubkey: key.pubkey.toBase58(), isSigner: key.isSigner, isWritable: key.isWritable })),
      data: Uint8Array.from(instruction.data),
    })),
  };
}

// ---------------------------------------------------------------------------
// Two-leg purchases (pay with SOL or SKR): pay token -> USDC in a pinned first
// pool, then exactly that leg's USDC minimum -> the product in its pinned pool.
// ---------------------------------------------------------------------------

/** One DLMM pool of a route, with every account the swap may name. */
export interface PoolSpec {
  pool: PublicKey;
  mintX: PublicKey;
  mintY: PublicKey;
  programX: PublicKey;
  programY: PublicKey;
}

export interface LegSpec extends PoolSpec {
  userTokenIn: string;
  userTokenOut: string;
  amountIn: bigint;
  minimumOut: bigint;
  binArrayIndexes: readonly bigint[];
  hasBitmapExtension: boolean;
}

export interface TwoLegAuditExpectation {
  /** The connected wallet, base58. */
  user: string;
  /** The product being bought (a routes-table key; default NVDA): its pinned pool is the second leg. */
  product?: ProductTicker;
  payToken: Exclude<PayTokenId, "USDC">;
  /** Raw pay token input the user reviews (lamports for SOL). */
  inputRaw: bigint;
  /** The first leg's quoted USDC output. */
  usdcOutRaw: bigint;
  /** The first leg's USDC minimum: also the second leg's exact USDC input. */
  usdcMinimumRaw: bigint;
  /** The second leg's quoted product output. */
  outputRaw: bigint;
  /** Raw product minimum output the user reviews. */
  minimumOutputRaw: bigint;
  firstLeg: { binArrayIndexes: readonly bigint[]; hasBitmapExtension: boolean };
  secondLeg: { binArrayIndexes: readonly bigint[]; hasBitmapExtension: boolean };
}

/** The quoted outputs and minimums of both legs of a two-leg purchase. */
export interface TwoLegAmounts {
  usdcOutRaw: bigint;
  usdcMinimumRaw: bigint;
  outputRaw: bigint;
  minimumOutputRaw: bigint;
}

/** Lowest minimum the fixed slippage allows for a quoted output: floor(out * (1 - slippage)). */
export function slippageFloor(outputRaw: bigint): bigint {
  const denominator = BigInt(BPS_DENOMINATOR);
  return (outputRaw * (denominator - BigInt(PURCHASE_CONFIG.slippageBps))) / denominator;
}

/**
 * Bounds of a two-leg purchase's amounts that hold whatever the builder
 * returned: the USDC minimum (the second leg's exact input) is positive and
 * within the per-transaction limit, the product minimum is positive, and each
 * leg's minimum is no lower than its quoted output less the fixed slippage.
 * Returns the first violation, or `null`.
 */
export function twoLegAmountFailure(amounts: TwoLegAmounts): string | null {
  if (amounts.usdcMinimumRaw <= 0n) return "amounts: the USDC minimum is not positive";
  if (amounts.usdcMinimumRaw > PURCHASE_CONFIG.maxUsdcInRaw) return "amounts: the USDC minimum is above the per-transaction limit";
  if (amounts.minimumOutputRaw <= 0n) return "amounts: the product minimum is not positive";
  if (amounts.usdcMinimumRaw < slippageFloor(amounts.usdcOutRaw)) return "amounts: the USDC minimum is below the slippage tolerance";
  if (amounts.minimumOutputRaw < slippageFloor(amounts.outputRaw)) return "amounts: the product minimum is below the slippage tolerance";
  return null;
}

/** The fields of one leg's pool quote the fee bound reads. */
export interface LegFeeQuote {
  feeRaw: string | bigint;
  consumedInputRaw: string | bigint;
  outputRaw: string | bigint;
  feeOnInput: boolean;
}

/**
 * `null` when a quoted pool fee is within `PURCHASE_CONFIG.maxPoolFeeBps` of
 * the amount it is charged on (the consumed input, or the output when the pool
 * takes the fee from it), otherwise the reason. A fee that cannot be read, or
 * a zero base, fails.
 */
export function quotedFeeFailure(quote: LegFeeQuote, label: string): string | null {
  let fee: bigint;
  let base: bigint;
  try {
    fee = BigInt(quote.feeRaw);
    base = BigInt(quote.feeOnInput ? quote.consumedInputRaw : quote.outputRaw);
  } catch {
    return `${label}: the quoted pool fee is not readable`;
  }
  if (fee < 0n || base <= 0n) return `${label}: the quoted pool fee is not readable`;
  if (fee * BigInt(BPS_DENOMINATOR) > base * BigInt(PURCHASE_CONFIG.maxPoolFeeBps)) return `${label}: the quoted pool fee is above the fee limit`;
  return null;
}

/** System program `Transfer` (u32 instruction index 2, then u64 lamports). */
export const SYSTEM_TRANSFER_INDEX = 2;
export const SYSTEM_TRANSFER_LENGTH = 12;
/** SPL Token `SyncNative` and `CloseAccount`. */
export const TOKEN_SYNC_NATIVE = 17;
export const TOKEN_CLOSE_ACCOUNT = 9;

export function poolAccounts(spec: PoolSpec) {
  const pool = spec.pool.toBytes();
  const encoder = new TextEncoder();
  return {
    reserveX: pda([pool, spec.mintX.toBytes()], DLMM_PROGRAM_ID),
    reserveY: pda([pool, spec.mintY.toBytes()], DLMM_PROGRAM_ID),
    oracle: pda([encoder.encode("oracle"), pool], DLMM_PROGRAM_ID),
    eventAuthority: pda([encoder.encode("__event_authority")], DLMM_PROGRAM_ID),
    bitmapExtension: pda([encoder.encode("bitmap"), pool], DLMM_PROGRAM_ID),
  };
}

export function poolBinArrayAddress(pool: PublicKey, index: bigint): string {
  return pda([new TextEncoder().encode("bin_array"), pool.toBytes(), i64LittleEndian(index)], DLMM_PROGRAM_ID);
}

export function auditLegSwap(instruction: AuditInstruction, user: PublicKey, leg: LegSpec, label: string): string | null {
  const data = instruction.data;
  if (data.length !== SWAP2_DATA_LENGTH || !bytesEqual(data.subarray(0, SWAP2_DISCRIMINATOR.length), SWAP2_DISCRIMINATOR)) {
    return `${label}: not the expected swap instruction`;
  }
  if (u64At(data, SWAP2_DISCRIMINATOR.length) !== leg.amountIn) return `${label}: encoded input differs from the reviewed amount`;
  if (u64At(data, SWAP2_DISCRIMINATOR.length + U64_BYTES) !== leg.minimumOut) return `${label}: encoded minimum differs from the reviewed minimum`;
  if (!bytesEqual(data.subarray(SWAP2_DISCRIMINATOR.length + U64_BYTES * 2), SWAP2_REMAINING_ACCOUNTS_INFO)) return `${label}: unexpected extra accounts`;
  if (leg.binArrayIndexes.length === 0) return `${label}: no bin arrays`;
  const derived = poolAccounts(leg);
  const program = DLMM_PROGRAM_ID.toBase58();
  const fixed: Expected[] = [
    { pubkey: leg.pool.toBase58(), signer: false, writable: true },
    { pubkey: leg.hasBitmapExtension ? derived.bitmapExtension : program, signer: false, writable: null },
    { pubkey: derived.reserveX, signer: false, writable: true },
    { pubkey: derived.reserveY, signer: false, writable: true },
    { pubkey: leg.userTokenIn, signer: false, writable: true },
    { pubkey: leg.userTokenOut, signer: false, writable: true },
    { pubkey: leg.mintX.toBase58(), signer: false, writable: false },
    { pubkey: leg.mintY.toBase58(), signer: false, writable: false },
    { pubkey: derived.oracle, signer: false, writable: true },
    // Host fee account: none (Anchor encodes an absent optional account as the program id).
    { pubkey: program, signer: false, writable: false },
    { pubkey: user.toBase58(), signer: true, writable: null },
    { pubkey: leg.programX.toBase58(), signer: false, writable: false },
    { pubkey: leg.programY.toBase58(), signer: false, writable: false },
    { pubkey: MEMO_PROGRAM_ID.toBase58(), signer: false, writable: false },
    { pubkey: derived.eventAuthority, signer: false, writable: false },
    { pubkey: program, signer: false, writable: false },
  ];
  const binArrays: Expected[] = leg.binArrayIndexes.map((index) => ({ pubkey: poolBinArrayAddress(leg.pool, index), signer: false, writable: true }));
  return checkAccounts(instruction.keys, [...fixed, ...binArrays], label);
}

/** Idempotent creation of the wallet's own token account for one of `mints`. Returns the mint created, or a failure. */
export function auditTwoLegAccountCreation(instruction: AuditInstruction, user: PublicKey, mints: ReadonlyMap<string, PublicKey>, created: Set<string>): string | null {
  if (!bytesEqual(instruction.data, Uint8Array.from([ATA_CREATE_IDEMPOTENT]))) return "token account: only idempotent creation is allowed";
  const mint = instruction.keys[3]?.pubkey ?? "";
  const program = mints.get(mint);
  if (!program) return "token account: mint is not part of the route";
  if (created.has(mint)) return "token account: duplicate creation";
  const mintKey = new PublicKey(mint);
  const failure = checkAccounts(instruction.keys, [
    { pubkey: user.toBase58(), signer: true, writable: true },
    { pubkey: associatedTokenAddress(user, mintKey, program), signer: false, writable: true },
    { pubkey: user.toBase58(), signer: null, writable: null },
    { pubkey: mint, signer: false, writable: false },
    { pubkey: SystemProgram.programId.toBase58(), signer: false, writable: false },
    { pubkey: program.toBase58(), signer: false, writable: false },
  ], "token account");
  if (failure) return failure;
  created.add(mint);
  return null;
}

/**
 * Audit a two-leg purchase transaction. Accepted shape, in order:
 *  1. setup: at most one compute-unit limit no higher than
 *     `PAY_CONFIG.twoLegComputeUnitLimit` (no compute-unit price), idempotent creation of
 *     the wallet's pay-token / USDC / product accounts, and for SOL exactly one
 *     System transfer of `inputRaw` lamports from the wallet to its own
 *     wrapped-SOL account followed by one `SyncNative` of that account;
 *  2. the first-leg swap in the pinned pay-token pool (`inputRaw` in, USDC
 *     minimum out, wallet's pay-token account to its USDC account);
 *  3. optional idempotent account creation, then the second-leg swap in the
 *     product's pinned pool (exactly the USDC minimum in, product minimum out);
 *  4. for SOL, and only for SOL, exactly one `CloseAccount` of the wallet's
 *     wrapped-SOL account back to the wallet, as the last instruction.
 * Nothing else: no other program, signer, account or amount. The reviewed
 * amounts must also pass `twoLegAmountFailure`.
 */
export function auditTwoLegTransaction(transaction: AuditTransaction | null, expectation: TwoLegAuditExpectation): AuditResult {
  if (!transaction) return { ok: false, reason: NOT_ONE_TRANSACTION };
  let user: PublicKey;
  try {
    user = new PublicKey(expectation.user);
  } catch {
    return { ok: false, reason: "wallet address is not valid" };
  }
  const route = PAY_TOKENS[expectation.payToken];
  if (!route?.leg) return { ok: false, reason: "pay token has no pinned route" };
  const product = routeOf(expectation.product);
  if (!product) return { ok: false, reason: "product has no pinned route" };
  if (transaction.feePayer !== user.toBase58()) return { ok: false, reason: "fee payer is not the connected wallet" };
  const amountFailure = twoLegAmountFailure(expectation);
  if (amountFailure) return { ok: false, reason: amountFailure };
  const native = route.native;
  const payAccount = associatedTokenAddress(user, route.mint, TOKEN_PROGRAM_ID);
  const usdcAccount = associatedTokenAddress(user, USDC_MINT, TOKEN_PROGRAM_ID);
  const productAccount = associatedTokenAddress(user, product.productMint, product.tokenProgram);
  const first: LegSpec = {
    pool: route.leg.pool, mintX: route.leg.tokenXMint, mintY: route.leg.tokenYMint, programX: TOKEN_PROGRAM_ID, programY: TOKEN_PROGRAM_ID,
    userTokenIn: payAccount, userTokenOut: usdcAccount, amountIn: expectation.inputRaw, minimumOut: expectation.usdcMinimumRaw,
    binArrayIndexes: expectation.firstLeg.binArrayIndexes, hasBitmapExtension: expectation.firstLeg.hasBitmapExtension,
  };
  const second: LegSpec = {
    ...productPoolSpec(product),
    userTokenIn: usdcAccount, userTokenOut: productAccount, amountIn: expectation.usdcMinimumRaw, minimumOut: expectation.minimumOutputRaw,
    binArrayIndexes: expectation.secondLeg.binArrayIndexes, hasBitmapExtension: expectation.secondLeg.hasBitmapExtension,
  };
  const mints = new Map<string, PublicKey>([
    [route.mint.toBase58(), TOKEN_PROGRAM_ID],
    [USDC_MINT.toBase58(), TOKEN_PROGRAM_ID],
    [product.productMint.toBase58(), product.tokenProgram],
  ]);

  const instructions = transaction.instructions;
  const computeBudgetSeen = new Set<number>();
  const created = new Set<string>();
  let swaps = 0;
  let transferred = false;
  let synced = false;
  let closed = false;
  for (const [index, instruction] of instructions.entries()) {
    for (const key of instruction.keys) {
      if (key.isSigner && key.pubkey !== user.toBase58()) return { ok: false, reason: `instruction ${index}: unexpected signer` };
    }
    let failure: string | null = null;
    const program = instruction.programId;
    if (closed) {
      failure = "nothing may follow the wrapped SOL close";
    } else if (program === COMPUTE_BUDGET_PROGRAM_ID.toBase58()) {
      failure = swaps === 0 ? auditComputeBudget(instruction, computeBudgetSeen, PAY_CONFIG.twoLegComputeUnitLimit) : "compute budget: must precede the swaps";
    } else if (program === ASSOCIATED_TOKEN_PROGRAM_ID.toBase58()) {
      failure = swaps < 2 ? auditTwoLegAccountCreation(instruction, user, mints, created) : "token account: must precede the second swap";
    } else if (program === SystemProgram.programId.toBase58()) {
      const data = instruction.data;
      if (!native) failure = "system: not allowed for this pay token";
      else if (swaps !== 0 || transferred) failure = "system: only one transfer, before the swaps";
      else if (data.length !== SYSTEM_TRANSFER_LENGTH || new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(0, true) !== SYSTEM_TRANSFER_INDEX) failure = "system: only a transfer is allowed";
      else if (u64At(data, 4) !== expectation.inputRaw) failure = "system: transfer differs from the reviewed amount";
      else failure = checkAccounts(instruction.keys, [
        { pubkey: user.toBase58(), signer: true, writable: true },
        { pubkey: payAccount, signer: false, writable: true },
      ], "system");
      transferred = failure === null;
    } else if (program === TOKEN_PROGRAM_ID.toBase58()) {
      const tag = instruction.data.length === 1 ? instruction.data[0] : -1;
      if (!native) failure = "token: not allowed for this pay token";
      else if (tag === TOKEN_SYNC_NATIVE) {
        if (!transferred || synced || swaps !== 0) failure = "token: sync must follow the transfer, once";
        else failure = checkAccounts(instruction.keys, [{ pubkey: payAccount, signer: false, writable: true }], "token sync");
        synced = failure === null;
      } else if (tag === TOKEN_CLOSE_ACCOUNT) {
        if (swaps !== 2) failure = "token: close must follow both swaps";
        else failure = checkAccounts(instruction.keys, [
          { pubkey: payAccount, signer: false, writable: true },
          { pubkey: user.toBase58(), signer: null, writable: true },
          { pubkey: user.toBase58(), signer: true, writable: null },
        ], "token close");
        closed = failure === null;
      } else failure = "token: instruction is not allowed";
    } else if (program === DLMM_PROGRAM_ID.toBase58()) {
      swaps += 1;
      if (swaps === 1) failure = native && !(transferred && synced) ? "first swap: SOL is not wrapped first" : auditLegSwap(instruction, user, first, "first swap");
      else if (swaps === 2) failure = auditLegSwap(instruction, user, second, "second swap");
      else failure = "swap: more than two swaps";
    } else {
      failure = "program is not allowed";
    }
    if (failure) return { ok: false, reason: `instruction ${index}: ${failure}` };
  }
  if (swaps !== 2) return { ok: false, reason: "expected exactly two swap instructions" };
  if (native && !closed) return { ok: false, reason: "wrapped SOL is not closed" };
  return { ok: true, createsNvdaxAccount: created.has(product.productMint.toBase58()), createsUsdcAccount: created.has(USDC_MINT.toBase58()) };
}

// ---------------------------------------------------------------------------
// Selling NVDAx for USDC: the fixed purchase route reversed, in the same one
// pinned pool (NVDAx in, USDC out, back to the connected wallet).
// ---------------------------------------------------------------------------

/** The amounts of a sale the user reviews, as the builder quoted them. */
export interface SellAmounts {
  /** Raw NVDAx the wallet sells (the swap's exact input). */
  inputRaw: bigint;
  /** The quoted USDC output, raw. */
  usdcOutRaw: bigint;
  /** The USDC minimum the swap encodes, raw. */
  minimumUsdcOutRaw: bigint;
}

export interface SellAuditExpectation extends SellAmounts {
  /** The connected wallet, base58. */
  user: string;
  /** Indexes of the bin arrays the quote used; each must derive from the pinned pool. */
  binArrayIndexes: readonly bigint[];
  /** Whether the pool has a bin-array bitmap extension account (read from the pool). */
  hasBitmapExtension: boolean;
}

/**
 * Bounds of a sale's amounts that hold whatever the builder returned: a
 * positive NVDAx input, a positive quoted USDC output no higher than the
 * per-transaction limit, and a USDC minimum that is positive, no higher than
 * the quoted output and no lower than the floor recomputed here from the
 * fixed slippage (never taken from the builder). Returns the first violation,
 * or `null`.
 */
export function sellAmountFailure(amounts: SellAmounts): string | null {
  if (amounts.inputRaw <= 0n) return "amounts: the NVDAx input is not positive";
  if (amounts.usdcOutRaw <= 0n) return "amounts: the quoted USDC output is not positive";
  if (amounts.usdcOutRaw > PURCHASE_CONFIG.maxUsdcOutRaw) return "amounts: the quoted USDC output is above the per-sale limit";
  if (amounts.minimumUsdcOutRaw <= 0n) return "amounts: the USDC minimum is not positive";
  if (amounts.minimumUsdcOutRaw > amounts.usdcOutRaw) return "amounts: the USDC minimum is above the quoted output";
  if (amounts.minimumUsdcOutRaw < slippageFloor(amounts.usdcOutRaw)) return "amounts: the USDC minimum is below the slippage tolerance";
  return null;
}

/**
 * Audit a sale transaction. Accepted shape, in order:
 *  1. exactly one compute-unit limit, no higher than
 *     `PURCHASE_CONFIG.sellComputeUnitLimit` (a compute-unit price, or any
 *     other compute-budget instruction, is refused);
 *  2. optionally, idempotent creation of the wallet's own USDC account, paid
 *     by and owned by the wallet (never an NVDAx account: the wallet sells
 *     from the one it already has);
 *  3. exactly one DLMM `swap2` in the pinned pool, last: the wallet's NVDAx
 *     account in, the wallet's own USDC account out, `inputRaw` in and
 *     `minimumUsdcOutRaw` out, every account at its expected position.
 * Nothing else: no other program, signer, account or amount. The wallet is
 * the fee payer and the only signer, and the reviewed amounts must also pass
 * `sellAmountFailure`.
 */
export function auditSellTransaction(transaction: AuditTransaction | null, expectation: SellAuditExpectation): AuditResult {
  if (!transaction) return { ok: false, reason: NOT_ONE_TRANSACTION };
  let user: PublicKey;
  try {
    user = new PublicKey(expectation.user);
  } catch {
    return { ok: false, reason: "wallet address is not valid" };
  }
  if (transaction.feePayer !== user.toBase58()) return { ok: false, reason: "fee payer is not the connected wallet" };
  const amountFailure = sellAmountFailure(expectation);
  if (amountFailure) return { ok: false, reason: amountFailure };
  const swap: LegSpec = {
    ...productPoolSpec(SELL_ROUTE),
    userTokenIn: associatedTokenAddress(user, SELL_ROUTE.productMint, SELL_ROUTE.tokenProgram),
    userTokenOut: associatedTokenAddress(user, USDC_MINT, TOKEN_PROGRAM_ID),
    amountIn: expectation.inputRaw, minimumOut: expectation.minimumUsdcOutRaw,
    binArrayIndexes: expectation.binArrayIndexes, hasBitmapExtension: expectation.hasBitmapExtension,
  };
  // Only the output account may be created: the wallet already holds the NVDAx it sells.
  const creatable = new Map<string, PublicKey>([[USDC_MINT.toBase58(), TOKEN_PROGRAM_ID]]);

  const instructions = transaction.instructions;
  if (instructions.length === 0) return { ok: false, reason: "no instructions" };
  const computeBudgetSeen = new Set<number>();
  const created = new Set<string>();
  let swaps = 0;
  for (const [index, instruction] of instructions.entries()) {
    for (const key of instruction.keys) {
      if (key.isSigner && key.pubkey !== user.toBase58()) return { ok: false, reason: `instruction ${index}: unexpected signer` };
    }
    let failure: string | null;
    const program = instruction.programId;
    if (program === COMPUTE_BUDGET_PROGRAM_ID.toBase58()) {
      failure = swaps === 0 ? auditComputeBudget(instruction, computeBudgetSeen, PURCHASE_CONFIG.sellComputeUnitLimit) : "compute budget: must precede the swap";
    } else if (program === ASSOCIATED_TOKEN_PROGRAM_ID.toBase58()) {
      failure = swaps === 0 ? auditTwoLegAccountCreation(instruction, user, creatable, created) : "token account: must precede the swap";
    } else if (program === DLMM_PROGRAM_ID.toBase58()) {
      swaps += 1;
      failure = index !== instructions.length - 1 ? "swap: must be the last instruction" : auditLegSwap(instruction, user, swap, "swap");
    } else {
      failure = "program is not allowed";
    }
    if (failure) return { ok: false, reason: `instruction ${index}: ${failure}` };
  }
  if (swaps !== 1) return { ok: false, reason: "expected exactly one swap instruction" };
  if (!computeBudgetSeen.has(COMPUTE_UNIT_LIMIT.tag)) return { ok: false, reason: "compute budget: the compute-unit limit is missing" };
  return { ok: true, createsNvdaxAccount: false, createsUsdcAccount: created.has(USDC_MINT.toBase58()) };
}

/**
 * Decode wire bytes as a legacy transaction only, for the sale audit. A
 * versioned message (which could load accounts from a lookup table the audit
 * never sees), bytes that do not decode, and bytes that are not exactly the
 * one transaction they decode to (`auditShapeOf`) return `null`.
 */
export function legacyAuditShapeOf(wire: Uint8Array): AuditTransaction | null {
  try {
    const signatureCount = wire[0];
    // The message starts after the compact-u16 signature count (one byte below 128) and the signatures.
    if (signatureCount === undefined || signatureCount >= 0x80) return null;
    const message = wire.subarray(1 + signatureCount * 64);
    if (VersionedMessage.deserializeMessageVersion(message) !== "legacy") return null;
    return auditShapeOf(wire);
  } catch {
    return null;
  }
}

/** Decode (legacy only) and audit the exact bytes a sale would hand to the wallet. Fails closed on anything that does not decode. */
export function auditSellWire(wire: Uint8Array, expectation: SellAuditExpectation): AuditResult {
  const shape = legacyAuditShapeOf(wire);
  if (!shape) return { ok: false, reason: "transaction is not a decodable legacy transaction" };
  return auditSellTransaction(shape, expectation);
}
