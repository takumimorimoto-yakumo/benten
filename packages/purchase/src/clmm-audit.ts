/**
 * Pre-approval audit of a Raydium CLMM purchase, as strict as the DLMM audit
 * (`tx-allowlist.ts`, whose shared checks it reuses).
 *
 * Every expected account and bound is derived here from the pinned routes
 * table (`routes-table-clmm.ts`), the connected wallet and the reviewed
 * amounts, never from the builder's output: the only builder values it takes
 * are the ones the user reviews (amounts) and the tick-array start indexes
 * the quote walked, each of which must be a valid start for the pinned tick
 * spacing and is turned into an address here. Accepted shapes:
 *
 * USDC -> product (`auditClmmSwapTransaction`), in order:
 *  1. exactly one compute-unit limit, no higher than
 *     `CLMM_CONFIG.computeUnitLimit` (a compute-unit price is refused);
 *  2. optionally, idempotent creation of the wallet's own product account;
 *  3. exactly one `swap_v2` in the product's pinned pool, last.
 *
 * SOL / SKR -> USDC -> product (`auditClmmTwoLegTransaction`): the two-leg
 * shape of the DLMM audit (wrap, first-leg DLMM swap in the pinned pay-token
 * pool, unwrap), with the second swap a `swap_v2` in the product's pinned
 * CLMM pool whose exact input is the first leg's USDC minimum.
 *
 * `swap_v2` must name, at their positions: the wallet (the only signer), the
 * pinned config, pool, the wallet's USDC and product accounts, the pinned
 * USDC and product vaults, the pinned observation account, both token
 * programs, the memo program, both mints, the pool's bitmap extension (only
 * when the pool has one), then the tick arrays; and encode an exact-in
 * amount equal to the reviewed input, a minimum equal to the reviewed
 * minimum (itself no lower than the fixed slippage allows for the quoted
 * output), and the one accepted price limit. Pure: no RPC, wallet or clock.
 */

import { PublicKey, SystemProgram } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@benten/solana";

import { bitmapExtensionAddress, CLMM_PROGRAM_ID, decodeSwapV2Data, isTickArrayStart, tickArrayAddress, USDC_IN_SQRT_PRICE_LIMIT_X64, withinPoolBitmap } from "./clmm-program";
import { CLMM_CONFIG } from "./clmm-config";
import { PURCHASE_CONFIG } from "./config";
import { PAY_CONFIG } from "./pay-config";
import { COMPUTE_BUDGET_PROGRAM_ID, MEMO_PROGRAM_ID, PAY_TOKENS, USDC_MINT, DLMM_PROGRAM_ID, type PayTokenId } from "./route";
import { resolveProductTicker, type ProductTicker } from "./routes-table";
import { CLMM_PRODUCT_ROUTES, clmmPins, type ClmmProductRoute, type ClmmProductTicker } from "./routes-table-clmm";
import {
  associatedTokenAddress,
  auditComputeBudget,
  auditLegSwap,
  auditTwoLegAccountCreation,
  checkAccounts,
  COMPUTE_UNIT_LIMIT,
  NOT_ONE_TRANSACTION,
  slippageFloor,
  SYSTEM_TRANSFER_INDEX,
  SYSTEM_TRANSFER_LENGTH,
  TOKEN_CLOSE_ACCOUNT,
  TOKEN_SYNC_NATIVE,
  twoLegAmountFailure,
  u64At,
  type AuditInstruction,
  type AuditResult,
  type AuditTransaction,
  type Expected,
  type LegSpec,
} from "./tx-allowlist";

export interface ClmmSwapAmounts {
  /** Raw USDC input the user reviews (the swap's exact input). */
  inputRaw: bigint;
  /** The quoted product output. */
  outputRaw: bigint;
  /** Raw product minimum output the user reviews. */
  minimumOutputRaw: bigint;
}

export interface ClmmSwapExpectation extends ClmmSwapAmounts {
  /** The connected wallet, base58. */
  user: string;
  /** The product being bought: a table key whose route is a CLMM route. */
  product: ProductTicker;
  /** Start indexes of the tick arrays the quote walked, ascending. */
  tickArrayStarts: readonly number[];
  /** Whether the pool's bitmap extension account exists (read from chain). */
  hasBitmapExtension: boolean;
}

/**
 * Bounds of a one-leg CLMM purchase that hold whatever the builder returned:
 * a positive input within the per-transaction limit, a positive quoted
 * output, and a minimum that is positive, no higher than the quoted output,
 * and no lower than the floor recomputed here from the fixed slippage.
 */
export function clmmAmountFailure(amounts: ClmmSwapAmounts): string | null {
  if (amounts.inputRaw <= 0n) return "amounts: the USDC input is not positive";
  if (amounts.inputRaw > PURCHASE_CONFIG.maxUsdcInRaw) return "amounts: the USDC input is above the per-transaction limit";
  if (amounts.outputRaw <= 0n) return "amounts: the quoted output is not positive";
  if (amounts.minimumOutputRaw <= 0n) return "amounts: the product minimum is not positive";
  if (amounts.minimumOutputRaw > amounts.outputRaw) return "amounts: the product minimum is above the quoted output";
  if (amounts.minimumOutputRaw < slippageFloor(amounts.outputRaw)) return "amounts: the product minimum is below the slippage tolerance";
  return null;
}

function clmmRouteOf(product: ProductTicker | undefined): ClmmProductRoute | null {
  const ticker = resolveProductTicker(product);
  return ticker !== null && clmmPins(ticker) ? CLMM_PRODUCT_ROUTES[ticker as ClmmProductTicker] : null;
}

/** The tick-array accounts for `starts`, or a failure: 1 to `maxTickArrays` valid, strictly ascending starts inside the pool bitmap. */
function tickArrayAccounts(route: ClmmProductRoute, starts: readonly number[], label: string): Expected[] | string {
  if (starts.length === 0) return `${label}: no tick arrays`;
  if (starts.length > CLMM_CONFIG.maxTickArrays) return `${label}: too many tick arrays`;
  const spacing = route.clmm.tickSpacing;
  for (const [index, start] of starts.entries()) {
    if (!isTickArrayStart(start, spacing) || !withinPoolBitmap(start, spacing)) return `${label}: a tick array start is not valid for the pool`;
    if (index > 0 && start <= starts[index - 1]) return `${label}: tick arrays are not in ascending order`;
  }
  return starts.map((start) => ({ pubkey: tickArrayAddress(route.pool, start).toBase58(), signer: false, writable: true }));
}

interface ClmmLegSpec {
  route: ClmmProductRoute;
  amountIn: bigint;
  minimumOut: bigint;
  tickArrayStarts: readonly number[];
  hasBitmapExtension: boolean;
}

/** Audit one `swap_v2`: USDC from the wallet's USDC account to its product account, in the product's pinned pool. */
function auditClmmSwap(instruction: AuditInstruction, user: PublicKey, leg: ClmmLegSpec, label: string): string | null {
  const data = decodeSwapV2Data(instruction.data);
  if (!data) return `${label}: not the expected swap instruction`;
  if (!data.isBaseInput) return `${label}: not an exact-input swap`;
  if (data.amount !== leg.amountIn) return `${label}: encoded input differs from the reviewed amount`;
  if (data.otherAmountThreshold !== leg.minimumOut) return `${label}: encoded minimum differs from the reviewed minimum`;
  if (data.sqrtPriceLimitX64 !== USDC_IN_SQRT_PRICE_LIMIT_X64) return `${label}: unexpected price limit`;
  const arrays = tickArrayAccounts(leg.route, leg.tickArrayStarts, label);
  if (typeof arrays === "string") return arrays;
  const { route } = leg;
  const fixed: Expected[] = [
    { pubkey: user.toBase58(), signer: true, writable: null },
    { pubkey: route.clmm.ammConfig.toBase58(), signer: false, writable: false },
    { pubkey: route.pool.toBase58(), signer: false, writable: true },
    { pubkey: associatedTokenAddress(user, USDC_MINT, TOKEN_PROGRAM_ID), signer: false, writable: true },
    { pubkey: associatedTokenAddress(user, route.productMint, route.tokenProgram), signer: false, writable: true },
    { pubkey: route.clmm.usdcVault.toBase58(), signer: false, writable: true },
    { pubkey: route.clmm.productVault.toBase58(), signer: false, writable: true },
    { pubkey: route.clmm.observation.toBase58(), signer: false, writable: true },
    { pubkey: TOKEN_PROGRAM_ID.toBase58(), signer: false, writable: false },
    { pubkey: TOKEN_2022_PROGRAM_ID.toBase58(), signer: false, writable: false },
    { pubkey: MEMO_PROGRAM_ID.toBase58(), signer: false, writable: false },
    { pubkey: USDC_MINT.toBase58(), signer: false, writable: false },
    { pubkey: route.productMint.toBase58(), signer: false, writable: false },
  ];
  const extension: Expected[] = leg.hasBitmapExtension ? [{ pubkey: bitmapExtensionAddress(route.pool).toBase58(), signer: false, writable: true }] : [];
  return checkAccounts(instruction.keys, [...fixed, ...extension, ...arrays], label);
}

function walletOf(address: string): PublicKey | null {
  try {
    return new PublicKey(address);
  } catch {
    return null;
  }
}

function unexpectedSigner(instruction: AuditInstruction, user: PublicKey): boolean {
  return instruction.keys.some((key) => key.isSigner && key.pubkey !== user.toBase58());
}

/** Audit a one-leg CLMM purchase (USDC -> product). */
export function auditClmmSwapTransaction(transaction: AuditTransaction | null, expectation: ClmmSwapExpectation): AuditResult {
  if (!transaction) return { ok: false, reason: NOT_ONE_TRANSACTION };
  const user = walletOf(expectation.user);
  if (!user) return { ok: false, reason: "wallet address is not valid" };
  const route = clmmRouteOf(expectation.product);
  if (!route) return { ok: false, reason: "product has no pinned CLMM route" };
  if (transaction.feePayer !== user.toBase58()) return { ok: false, reason: "fee payer is not the connected wallet" };
  const amountFailure = clmmAmountFailure(expectation);
  if (amountFailure) return { ok: false, reason: amountFailure };
  const leg: ClmmLegSpec = { route, amountIn: expectation.inputRaw, minimumOut: expectation.minimumOutputRaw, tickArrayStarts: expectation.tickArrayStarts, hasBitmapExtension: expectation.hasBitmapExtension };
  // Only the output account may be created: the wallet pays from the USDC account it already holds.
  const creatable = new Map<string, PublicKey>([[route.productMint.toBase58(), route.tokenProgram]]);

  const instructions = transaction.instructions;
  if (instructions.length === 0) return { ok: false, reason: "no instructions" };
  const computeBudgetSeen = new Set<number>();
  const created = new Set<string>();
  let swaps = 0;
  for (const [index, instruction] of instructions.entries()) {
    if (unexpectedSigner(instruction, user)) return { ok: false, reason: `instruction ${index}: unexpected signer` };
    let failure: string | null;
    const program = instruction.programId;
    if (program === COMPUTE_BUDGET_PROGRAM_ID.toBase58()) {
      failure = swaps === 0 ? auditComputeBudget(instruction, computeBudgetSeen, CLMM_CONFIG.computeUnitLimit) : "compute budget: must precede the swap";
    } else if (program === ASSOCIATED_TOKEN_PROGRAM_ID.toBase58()) {
      failure = swaps === 0 ? auditTwoLegAccountCreation(instruction, user, creatable, created) : "token account: must precede the swap";
    } else if (program === CLMM_PROGRAM_ID.toBase58()) {
      swaps += 1;
      failure = index !== instructions.length - 1 ? "swap: must be the last instruction" : auditClmmSwap(instruction, user, leg, "swap");
    } else {
      failure = "program is not allowed";
    }
    if (failure) return { ok: false, reason: `instruction ${index}: ${failure}` };
  }
  if (swaps !== 1) return { ok: false, reason: "expected exactly one swap instruction" };
  if (!computeBudgetSeen.has(COMPUTE_UNIT_LIMIT.tag)) return { ok: false, reason: "compute budget: the compute-unit limit is missing" };
  return { ok: true, createsNvdaxAccount: created.has(route.productMint.toBase58()), createsUsdcAccount: false };
}

export interface ClmmTwoLegExpectation {
  /** The connected wallet, base58. */
  user: string;
  /** The product being bought: its pinned CLMM pool is the second leg. */
  product: ProductTicker;
  payToken: Exclude<PayTokenId, "USDC">;
  /** Raw pay token input the user reviews (lamports for SOL). */
  inputRaw: bigint;
  usdcOutRaw: bigint;
  /** The first leg's USDC minimum: also the second leg's exact USDC input. */
  usdcMinimumRaw: bigint;
  outputRaw: bigint;
  minimumOutputRaw: bigint;
  firstLeg: { binArrayIndexes: readonly bigint[]; hasBitmapExtension: boolean };
  secondLeg: { tickArrayStarts: readonly number[]; hasBitmapExtension: boolean };
}

/**
 * Audit a two-leg purchase whose second leg is a CLMM pool. Shape as in
 * `auditTwoLegTransaction`: exactly one compute-unit limit no higher than
 * `PAY_CONFIG.twoLegComputeUnitLimit`; idempotent creation of the wallet's
 * pay-token / USDC / product accounts before the second swap; for SOL one
 * transfer of `inputRaw` to the wallet's wrapped-SOL account and one sync
 * before the swaps; the DLMM first leg; the CLMM second leg (exactly the USDC
 * minimum in); for SOL one close of the wrapped-SOL account, last.
 */
export function auditClmmTwoLegTransaction(transaction: AuditTransaction | null, expectation: ClmmTwoLegExpectation): AuditResult {
  if (!transaction) return { ok: false, reason: NOT_ONE_TRANSACTION };
  const user = walletOf(expectation.user);
  if (!user) return { ok: false, reason: "wallet address is not valid" };
  const pay = PAY_TOKENS[expectation.payToken];
  if (!pay?.leg) return { ok: false, reason: "pay token has no pinned route" };
  const route = clmmRouteOf(expectation.product);
  if (!route) return { ok: false, reason: "product has no pinned CLMM route" };
  if (transaction.feePayer !== user.toBase58()) return { ok: false, reason: "fee payer is not the connected wallet" };
  const amountFailure = twoLegAmountFailure(expectation);
  if (amountFailure) return { ok: false, reason: amountFailure };
  if (expectation.usdcMinimumRaw > expectation.usdcOutRaw) return { ok: false, reason: "amounts: the USDC minimum is above the quoted output" };
  if (expectation.minimumOutputRaw > expectation.outputRaw) return { ok: false, reason: "amounts: the product minimum is above the quoted output" };
  const native = pay.native;
  const payAccount = associatedTokenAddress(user, pay.mint, TOKEN_PROGRAM_ID);
  const usdcAccount = associatedTokenAddress(user, USDC_MINT, TOKEN_PROGRAM_ID);
  const first: LegSpec = {
    pool: pay.leg.pool, mintX: pay.leg.tokenXMint, mintY: pay.leg.tokenYMint, programX: TOKEN_PROGRAM_ID, programY: TOKEN_PROGRAM_ID,
    userTokenIn: payAccount, userTokenOut: usdcAccount, amountIn: expectation.inputRaw, minimumOut: expectation.usdcMinimumRaw,
    binArrayIndexes: expectation.firstLeg.binArrayIndexes, hasBitmapExtension: expectation.firstLeg.hasBitmapExtension,
  };
  const second: ClmmLegSpec = {
    route, amountIn: expectation.usdcMinimumRaw, minimumOut: expectation.minimumOutputRaw,
    tickArrayStarts: expectation.secondLeg.tickArrayStarts, hasBitmapExtension: expectation.secondLeg.hasBitmapExtension,
  };
  const mints = new Map<string, PublicKey>([
    [pay.mint.toBase58(), TOKEN_PROGRAM_ID],
    [USDC_MINT.toBase58(), TOKEN_PROGRAM_ID],
    [route.productMint.toBase58(), route.tokenProgram],
  ]);

  const instructions = transaction.instructions;
  const computeBudgetSeen = new Set<number>();
  const created = new Set<string>();
  let swaps = 0;
  let transferred = false;
  let synced = false;
  let closed = false;
  for (const [index, instruction] of instructions.entries()) {
    if (unexpectedSigner(instruction, user)) return { ok: false, reason: `instruction ${index}: unexpected signer` };
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
      if (swaps !== 1) failure = "first swap: only the first leg is a DLMM swap";
      else failure = native && !(transferred && synced) ? "first swap: SOL is not wrapped first" : auditLegSwap(instruction, user, first, "first swap");
    } else if (program === CLMM_PROGRAM_ID.toBase58()) {
      swaps += 1;
      failure = swaps === 2 ? auditClmmSwap(instruction, user, second, "second swap") : "second swap: the CLMM swap must follow the first leg";
    } else {
      failure = "program is not allowed";
    }
    if (failure) return { ok: false, reason: `instruction ${index}: ${failure}` };
  }
  if (swaps !== 2) return { ok: false, reason: "expected exactly two swap instructions" };
  if (!computeBudgetSeen.has(COMPUTE_UNIT_LIMIT.tag)) return { ok: false, reason: "compute budget: the compute-unit limit is missing" };
  if (native && !closed) return { ok: false, reason: "wrapped SOL is not closed" };
  return { ok: true, createsNvdaxAccount: created.has(route.productMint.toBase58()), createsUsdcAccount: created.has(USDC_MINT.toBase58()) };
}
