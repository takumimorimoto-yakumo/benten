/**
 * Pre-approval audit of the built swap transaction.
 *
 * Before the panel ever asks a wallet to approve anything, the exact bytes it
 * would hand over are decoded and checked here against a closed allowlist:
 * only the compute-budget, associated-token-account and Meteora DLMM
 * programs; exactly one DLMM `swap2` instruction, last, whose every account
 * sits at its expected position and is either a pinned constant or derived
 * from the pinned pool and the connected wallet; the swap's encoded input and
 * minimum output equal the amounts the user reviews; no transfer-hook or other
 * extra accounts; the connected wallet as the only signer and fee payer.
 * Anything else fails closed with a reason, and the panel stops before the
 * wallet.
 *
 * Pure and deterministic: no RPC, no wallet, no clock.
 */

import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@benten/solana";

import {
  COMPUTE_BUDGET_PROGRAM_ID,
  DLMM_PROGRAM_ID,
  MEMO_PROGRAM_ID,
  NVDAX_MINT,
  NVDAX_USDC_POOL,
  PAY_TOKENS,
  USDC_MINT,
  type PayTokenId,
} from "./route";
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
  /** Raw USDC input the user reviews. */
  inputRaw: bigint;
  /** Raw NVDAx minimum output the user reviews. */
  minimumOutputRaw: bigint;
  /** Indexes of the bin arrays the quote used; each must derive from the pinned pool. */
  binArrayIndexes: readonly bigint[];
  /** Whether the pool has a bin-array bitmap extension account (read from the pool). */
  hasBitmapExtension: boolean;
}

export type AuditResult =
  | { ok: true; createsNvdaxAccount: boolean; createsUsdcAccount: boolean }
  | { ok: false; reason: string };

/** Anchor discriminator of the DLMM `swap2` instruction: first 8 bytes of sha256("global:swap2"). */
const SWAP2_DISCRIMINATOR = Uint8Array.from([0x41, 0x4b, 0x3f, 0x4c, 0xeb, 0x5b, 0x5b, 0x88]);
/**
 * `swap2` data after the discriminator: amount_in u64, min_amount_out u64, then
 * the remaining-accounts info. The only accepted info is two empty slices
 * (transfer hook X and transfer hook Y, zero accounts each): the NVDAx mint's
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
const COMPUTE_UNIT_LIMIT = { tag: 2, length: 5 };
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

function u64At(data: Uint8Array, offset: number): bigint {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(offset, true);
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

export function associatedTokenAddress(owner: PublicKey, mint: PublicKey, tokenProgram: PublicKey): string {
  return pda([owner.toBytes(), tokenProgram.toBytes(), mint.toBytes()], ASSOCIATED_TOKEN_PROGRAM_ID);
}

/** Accounts of the pinned pool that are fully determined by its address (DLMM program PDAs). */
export function derivedPoolAccounts(): { reserveX: string; reserveY: string; oracle: string; eventAuthority: string; bitmapExtension: string } {
  const pool = NVDAX_USDC_POOL.toBytes();
  return {
    reserveX: pda([pool, NVDAX_MINT.toBytes()], DLMM_PROGRAM_ID),
    reserveY: pda([pool, USDC_MINT.toBytes()], DLMM_PROGRAM_ID),
    oracle: pda([new TextEncoder().encode("oracle"), pool], DLMM_PROGRAM_ID),
    eventAuthority: pda([new TextEncoder().encode("__event_authority")], DLMM_PROGRAM_ID),
    bitmapExtension: pda([new TextEncoder().encode("bitmap"), pool], DLMM_PROGRAM_ID),
  };
}

export function binArrayAddress(index: bigint): string {
  return pda([new TextEncoder().encode("bin_array"), NVDAX_USDC_POOL.toBytes(), i64LittleEndian(index)], DLMM_PROGRAM_ID);
}

/**
 * `null` accepts either flag. Flags of a decoded transaction are message-wide
 * (an account writable or signing anywhere is so in every instruction), so the
 * wallet's own slots cannot be told apart per instruction; the signer set is
 * checked separately (only the wallet may sign).
 */
type Expected = { pubkey: string; signer: boolean | null; writable: boolean | null };

function checkAccounts(actual: AuditAccount[], expected: Expected[], label: string): string | null {
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
function auditComputeBudget(instruction: AuditInstruction, seen: Set<number>, maxUnits: number | null): string | null {
  if (instruction.keys.length !== 0) return "compute budget: unexpected accounts";
  const tag = instruction.data[0];
  if (tag !== COMPUTE_UNIT_LIMIT.tag || instruction.data.length !== COMPUTE_UNIT_LIMIT.length) return "compute budget: unexpected instruction";
  if (seen.has(tag)) return "compute budget: duplicate instruction";
  const units = new DataView(instruction.data.buffer, instruction.data.byteOffset, instruction.data.byteLength).getUint32(1, true);
  if (maxUnits !== null && units > maxUnits) return "compute budget: limit above the route's ceiling";
  seen.add(tag);
  return null;
}

function auditAccountCreation(instruction: AuditInstruction, user: PublicKey, created: Set<string>): string | null {
  if (!bytesEqual(instruction.data, Uint8Array.from([ATA_CREATE_IDEMPOTENT]))) return "token account: only idempotent creation is allowed";
  const mint = instruction.keys[3]?.pubkey;
  const route = mint === NVDAX_MINT.toBase58()
    ? { mint: NVDAX_MINT, program: TOKEN_2022_PROGRAM_ID }
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

function auditSwap(instruction: AuditInstruction, user: PublicKey, expectation: AuditExpectation): string | null {
  const data = instruction.data;
  if (data.length !== SWAP2_DATA_LENGTH || !bytesEqual(data.subarray(0, SWAP2_DISCRIMINATOR.length), SWAP2_DISCRIMINATOR)) {
    return "swap: not the expected swap instruction";
  }
  const amountIn = u64At(data, SWAP2_DISCRIMINATOR.length);
  const minimumOut = u64At(data, SWAP2_DISCRIMINATOR.length + U64_BYTES);
  if (amountIn !== expectation.inputRaw) return "swap: encoded input differs from the reviewed amount";
  if (minimumOut !== expectation.minimumOutputRaw) return "swap: encoded minimum differs from the reviewed minimum";
  if (!bytesEqual(data.subarray(SWAP2_DISCRIMINATOR.length + U64_BYTES * 2), SWAP2_REMAINING_ACCOUNTS_INFO)) {
    return "swap: unexpected extra accounts";
  }
  if (expectation.binArrayIndexes.length === 0) return "swap: no bin arrays";

  const derived = derivedPoolAccounts();
  const program = DLMM_PROGRAM_ID.toBase58();
  const fixed: Expected[] = [
    { pubkey: NVDAX_USDC_POOL.toBase58(), signer: false, writable: true },
    { pubkey: expectation.hasBitmapExtension ? derived.bitmapExtension : program, signer: false, writable: null },
    { pubkey: derived.reserveX, signer: false, writable: true },
    { pubkey: derived.reserveY, signer: false, writable: true },
    { pubkey: associatedTokenAddress(user, USDC_MINT, TOKEN_PROGRAM_ID), signer: false, writable: true },
    { pubkey: associatedTokenAddress(user, NVDAX_MINT, TOKEN_2022_PROGRAM_ID), signer: false, writable: true },
    { pubkey: NVDAX_MINT.toBase58(), signer: false, writable: false },
    { pubkey: USDC_MINT.toBase58(), signer: false, writable: false },
    { pubkey: derived.oracle, signer: false, writable: true },
    // Host fee account: none. Anchor encodes an absent optional account as the program id.
    { pubkey: program, signer: false, writable: false },
    { pubkey: user.toBase58(), signer: true, writable: null },
    { pubkey: TOKEN_2022_PROGRAM_ID.toBase58(), signer: false, writable: false },
    { pubkey: TOKEN_PROGRAM_ID.toBase58(), signer: false, writable: false },
    { pubkey: MEMO_PROGRAM_ID.toBase58(), signer: false, writable: false },
    { pubkey: derived.eventAuthority, signer: false, writable: false },
    { pubkey: program, signer: false, writable: false },
  ];
  const binArrays: Expected[] = expectation.binArrayIndexes.map((index) => ({ pubkey: binArrayAddress(index), signer: false, writable: true }));
  return checkAccounts(instruction.keys, [...fixed, ...binArrays], "swap");
}

/** Audit the transaction the wallet would be asked to approve. */
export function auditSwapTransaction(transaction: AuditTransaction, expectation: AuditExpectation): AuditResult {
  let user: PublicKey;
  try {
    user = new PublicKey(expectation.user);
  } catch {
    return { ok: false, reason: "wallet address is not valid" };
  }
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
      failure = auditAccountCreation(instruction, user, createdAccounts);
    } else if (instruction.programId === DLMM_PROGRAM_ID.toBase58()) {
      swapCount += 1;
      failure = index === instructions.length - 1 ? auditSwap(instruction, user, expectation) : "swap: must be the last instruction";
    } else {
      failure = "program is not allowed";
    }
    if (failure) return { ok: false, reason: `instruction ${index}: ${failure}` };
  }
  if (swapCount !== 1) return { ok: false, reason: "expected exactly one swap instruction" };
  return {
    ok: true,
    createsNvdaxAccount: createdAccounts.has(NVDAX_MINT.toBase58()),
    createsUsdcAccount: createdAccounts.has(USDC_MINT.toBase58()),
  };
}

/** Decode unsigned wire bytes into the neutral shape the audit reads. */
export function auditShapeOf(wire: Uint8Array): AuditTransaction {
  const decoded = Transaction.from(wire);
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
// pool, then exactly that leg's USDC minimum -> NVDAx in the fixed pool.
// ---------------------------------------------------------------------------

/** One DLMM pool of a route, with every account the swap may name. */
export interface PoolSpec {
  pool: PublicKey;
  mintX: PublicKey;
  mintY: PublicKey;
  programX: PublicKey;
  programY: PublicKey;
}

interface LegSpec extends PoolSpec {
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
  payToken: Exclude<PayTokenId, "USDC">;
  /** Raw pay token input the user reviews (lamports for SOL). */
  inputRaw: bigint;
  /** The first leg's quoted USDC output. */
  usdcOutRaw: bigint;
  /** The first leg's USDC minimum: also the second leg's exact USDC input. */
  usdcMinimumRaw: bigint;
  /** The second leg's quoted NVDAx output. */
  outputRaw: bigint;
  /** Raw NVDAx minimum output the user reviews. */
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
function slippageFloor(outputRaw: bigint): bigint {
  const denominator = BigInt(BPS_DENOMINATOR);
  return (outputRaw * (denominator - BigInt(PURCHASE_CONFIG.slippageBps))) / denominator;
}

/**
 * Bounds of a two-leg purchase's amounts that hold whatever the builder
 * returned: the USDC minimum (the second leg's exact input) is positive and
 * within the per-transaction limit, the NVDAx minimum is positive, and each
 * leg's minimum is no lower than its quoted output less the fixed slippage.
 * Returns the first violation, or `null`.
 */
export function twoLegAmountFailure(amounts: TwoLegAmounts): string | null {
  if (amounts.usdcMinimumRaw <= 0n) return "amounts: the USDC minimum is not positive";
  if (amounts.usdcMinimumRaw > PURCHASE_CONFIG.maxUsdcInRaw) return "amounts: the USDC minimum is above the per-transaction limit";
  if (amounts.minimumOutputRaw <= 0n) return "amounts: the NVDAx minimum is not positive";
  if (amounts.usdcMinimumRaw < slippageFloor(amounts.usdcOutRaw)) return "amounts: the USDC minimum is below the slippage tolerance";
  if (amounts.minimumOutputRaw < slippageFloor(amounts.outputRaw)) return "amounts: the NVDAx minimum is below the slippage tolerance";
  return null;
}

/** System program `Transfer` (u32 instruction index 2, then u64 lamports). */
const SYSTEM_TRANSFER_INDEX = 2;
const SYSTEM_TRANSFER_LENGTH = 12;
/** SPL Token `SyncNative` and `CloseAccount`. */
const TOKEN_SYNC_NATIVE = 17;
const TOKEN_CLOSE_ACCOUNT = 9;

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

function auditLegSwap(instruction: AuditInstruction, user: PublicKey, leg: LegSpec, label: string): string | null {
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
function auditTwoLegAccountCreation(instruction: AuditInstruction, user: PublicKey, mints: ReadonlyMap<string, PublicKey>, created: Set<string>): string | null {
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
 *     the wallet's pay-token / USDC / NVDAx accounts, and for SOL exactly one
 *     System transfer of `inputRaw` lamports from the wallet to its own
 *     wrapped-SOL account followed by one `SyncNative` of that account;
 *  2. the first-leg swap in the pinned pay-token pool (`inputRaw` in, USDC
 *     minimum out, wallet's pay-token account to its USDC account);
 *  3. optional idempotent account creation, then the second-leg swap in the
 *     fixed pool (exactly the USDC minimum in, NVDAx minimum out);
 *  4. for SOL, and only for SOL, exactly one `CloseAccount` of the wallet's
 *     wrapped-SOL account back to the wallet, as the last instruction.
 * Nothing else: no other program, signer, account or amount. The reviewed
 * amounts must also pass `twoLegAmountFailure`.
 */
export function auditTwoLegTransaction(transaction: AuditTransaction, expectation: TwoLegAuditExpectation): AuditResult {
  let user: PublicKey;
  try {
    user = new PublicKey(expectation.user);
  } catch {
    return { ok: false, reason: "wallet address is not valid" };
  }
  const route = PAY_TOKENS[expectation.payToken];
  if (!route?.leg) return { ok: false, reason: "pay token has no pinned route" };
  if (transaction.feePayer !== user.toBase58()) return { ok: false, reason: "fee payer is not the connected wallet" };
  const amountFailure = twoLegAmountFailure(expectation);
  if (amountFailure) return { ok: false, reason: amountFailure };
  const native = route.native;
  const payAccount = associatedTokenAddress(user, route.mint, TOKEN_PROGRAM_ID);
  const usdcAccount = associatedTokenAddress(user, USDC_MINT, TOKEN_PROGRAM_ID);
  const nvdaxAccount = associatedTokenAddress(user, NVDAX_MINT, TOKEN_2022_PROGRAM_ID);
  const first: LegSpec = {
    pool: route.leg.pool, mintX: route.leg.tokenXMint, mintY: route.leg.tokenYMint, programX: TOKEN_PROGRAM_ID, programY: TOKEN_PROGRAM_ID,
    userTokenIn: payAccount, userTokenOut: usdcAccount, amountIn: expectation.inputRaw, minimumOut: expectation.usdcMinimumRaw,
    binArrayIndexes: expectation.firstLeg.binArrayIndexes, hasBitmapExtension: expectation.firstLeg.hasBitmapExtension,
  };
  const second: LegSpec = {
    pool: NVDAX_USDC_POOL, mintX: NVDAX_MINT, mintY: USDC_MINT, programX: TOKEN_2022_PROGRAM_ID, programY: TOKEN_PROGRAM_ID,
    userTokenIn: usdcAccount, userTokenOut: nvdaxAccount, amountIn: expectation.usdcMinimumRaw, minimumOut: expectation.minimumOutputRaw,
    binArrayIndexes: expectation.secondLeg.binArrayIndexes, hasBitmapExtension: expectation.secondLeg.hasBitmapExtension,
  };
  const mints = new Map<string, PublicKey>([
    [route.mint.toBase58(), TOKEN_PROGRAM_ID],
    [USDC_MINT.toBase58(), TOKEN_PROGRAM_ID],
    [NVDAX_MINT.toBase58(), TOKEN_2022_PROGRAM_ID],
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
  return { ok: true, createsNvdaxAccount: created.has(NVDAX_MINT.toBase58()), createsUsdcAccount: created.has(USDC_MINT.toBase58()) };
}
