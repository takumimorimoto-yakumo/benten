/**
 * The Raydium CLMM purchase audit, fail closed: the accepted one-leg and
 * two-leg shapes pass, and every tampering the DLMM audit's tests cover
 * (wrong account at any position, flags, amounts, minimum, price limit,
 * tick arrays, extra or missing instructions, compute budget, signers,
 * another product's or an unlisted pool, trailing bytes, versioned messages
 * and lookup tables) is refused. Also builds the one-leg transaction from a
 * recorded mainnet snapshot through the real builder and audits its bytes.
 */
import { describe, expect, it } from "vitest";
import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  type AccountInfo,
  type Connection,
} from "@solana/web3.js";

import fixture from "./clmm-pools.fixture.json";
import { auditClmmSwapTransaction, auditClmmTwoLegTransaction, clmmAmountFailure, type ClmmSwapExpectation, type ClmmTwoLegExpectation } from "./clmm-audit";
import { buildClmmUsdcExactInSwap, clmmSwapInstruction, createOwnAccount } from "./clmm-build";
import { CLMM_CONFIG } from "./clmm-config";
import { bitmapExtensionAddress, CLMM_PROGRAM_ID, encodeSwapV2Data, tickArrayAddress, USDC_IN_SQRT_PRICE_LIMIT_X64 } from "./clmm-program";
import { PAY_CONFIG } from "./pay-config";
import { PAY_TOKENS, USDC_MINT } from "./route";
import type { ProductTicker } from "./routes-table";
import { CLMM_PRODUCT_ROUTES, CLMM_PRODUCT_TICKERS, type ClmmProductRoute } from "./routes-table-clmm";
import { associatedTokenAddress, legacyAuditShapeOf, poolAccounts, poolBinArrayAddress } from "./tx-allowlist";

const DLMM = new PublicKey("LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo");
const TOKEN = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN_2022 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const MEMO = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const USER = new PublicKey(new Uint8Array(32).fill(3));
const STRANGER = new PublicKey(new Uint8Array(32).fill(7));
const UNLISTED_POOL = new PublicKey(new Uint8Array(32).fill(9));
const BLOCKHASH = new PublicKey(new Uint8Array(32).fill(1)).toBase58();
const SKR = PAY_TOKENS.SKR.mint;
const WSOL = PAY_TOKENS.SOL.mint;

/** A CLMM route that is not in the table: another pool, config, observation account and vaults for the same product. */
const OTHER_ROUTE: ClmmProductRoute = Object.freeze({
  ...CLMM_PRODUCT_ROUTES.COIN,
  pool: new PublicKey(new Uint8Array(32).fill(11)),
  clmm: Object.freeze({ ...CLMM_PRODUCT_ROUTES.COIN.clmm, ammConfig: new PublicKey(new Uint8Array(32).fill(12)), observation: new PublicKey(new Uint8Array(32).fill(13)), productVault: new PublicKey(new Uint8Array(32).fill(14)), usdcVault: new PublicKey(new Uint8Array(32).fill(15)) }),
});

const INPUT = 2_000_000n;
const OUT = 1_019_254n;
const MIN = (OUT * 9_900n) / 10_000n;
const STARTS = [3600, 7200];

const ata = (mint: PublicKey, program = TOKEN) => associatedTokenAddress(USER, mint, program);
const key = (pubkey: PublicKey | string, isSigner = false, isWritable = false) => ({ pubkey: typeof pubkey === "string" ? new PublicKey(pubkey) : pubkey, isSigner, isWritable });
const LIMIT = (units: number = CLMM_CONFIG.computeUnitLimit) => ComputeBudgetProgram.setComputeUnitLimit({ units });

function wire(instructions: TransactionInstruction[], feePayer = USER): Uint8Array {
  return Uint8Array.from(new Transaction({ feePayer, blockhash: BLOCKHASH, lastValidBlockHeight: 1 }).add(...instructions).serialize({ requireAllSignatures: false, verifySignatures: false }));
}

function swapOf(route: ClmmProductRoute = CLMM_PRODUCT_ROUTES.COIN, amountIn = INPUT, minimumOut = MIN, starts = STARTS, extension = true): TransactionInstruction {
  return clmmSwapInstruction(route, USER, amountIn, minimumOut, starts, extension);
}

function expectation(overrides: Partial<ClmmSwapExpectation> = {}): ClmmSwapExpectation {
  return { user: USER.toBase58(), product: "COIN", inputRaw: INPUT, outputRaw: OUT, minimumOutputRaw: MIN, tickArrayStarts: STARTS, hasBitmapExtension: true, ...overrides };
}

function audit(instructions: TransactionInstruction[], overrides: Partial<ClmmSwapExpectation> = {}, feePayer = USER) {
  return auditClmmSwapTransaction(legacyAuditShapeOf(wire(instructions, feePayer)), expectation(overrides));
}

const valid = () => [LIMIT(), createOwnAccount(USER, CLMM_PRODUCT_ROUTES.COIN.productMint, TOKEN_2022), swapOf()];

/** A copy of `instruction` with its account `index` replaced (flags kept). */
function withAccount(instruction: TransactionInstruction, index: number, pubkey: PublicKey): TransactionInstruction {
  return new TransactionInstruction({ programId: instruction.programId, data: instruction.data, keys: instruction.keys.map((k, i) => (i === index ? { ...k, pubkey } : k)) });
}

function withData(instruction: TransactionInstruction, data: Uint8Array): TransactionInstruction {
  return new TransactionInstruction({ programId: instruction.programId, keys: instruction.keys, data: Buffer.from(data) });
}

describe("auditClmmSwapTransaction accepts", () => {
  it("the builder's shape, with and without the product account creation", () => {
    expect(audit(valid())).toEqual({ ok: true, createsNvdaxAccount: true, createsUsdcAccount: false });
    expect(audit([LIMIT(), swapOf()])).toEqual({ ok: true, createsNvdaxAccount: false, createsUsdcAccount: false });
  });

  it("a pool without a bitmap extension, when the expectation says so", () => {
    expect(audit([LIMIT(), swapOf(undefined, undefined, undefined, undefined, false)], { hasBitmapExtension: false })).toMatchObject({ ok: true });
  });

  it.each([...CLMM_PRODUCT_TICKERS])("each product's own pinned pool (%s)", (ticker) => {
    const route = CLMM_PRODUCT_ROUTES[ticker];
    const starts = [route.clmm.tickSpacing * 60];
    expect(audit([LIMIT(), swapOf(route, INPUT, MIN, starts)], { product: ticker, tickArrayStarts: starts })).toMatchObject({ ok: true });
  });
});

describe("auditClmmSwapTransaction refuses", () => {
  const swap = swapOf();
  const positions = swap.keys.length;

  it.each(Array.from({ length: positions }, (_, index) => index))("a different account at swap position %i", (index) => {
    const tampered = withAccount(swap, index, STRANGER);
    expect(audit([LIMIT(), tampered])).toMatchObject({ ok: false });
  });

  it.each([2, 3, 4, 5, 6, 7, 13, 14])("a read-only account where the swap writes (position %i)", (index) => {
    const tampered = new TransactionInstruction({ programId: swap.programId, data: swap.data, keys: swap.keys.map((k, i) => (i === index ? { ...k, isWritable: false } : k)) });
    expect(audit([LIMIT(), tampered])).toMatchObject({ ok: false, reason: expect.stringMatching(/writable/) });
  });

  it("a writable config or mint", () => {
    for (const index of [1, 11, 12]) {
      const tampered = new TransactionInstruction({ programId: swap.programId, data: swap.data, keys: swap.keys.map((k, i) => (i === index ? { ...k, isWritable: true } : k)) });
      expect(audit([LIMIT(), tampered])).toMatchObject({ ok: false });
    }
  });

  it("another pool's accounts, a pool not in the table, and its own swap audited as another product", () => {
    expect(audit([LIMIT(), swapOf(OTHER_ROUTE)])).toMatchObject({ ok: false, reason: /account 1/ });
    expect(audit([LIMIT(), withAccount(swap, 2, UNLISTED_POOL)])).toMatchObject({ ok: false, reason: /account 2/ });
    for (const other of CLMM_PRODUCT_TICKERS.filter((ticker) => ticker !== "COIN")) {
      expect(audit([LIMIT(), swapOf(CLMM_PRODUCT_ROUTES[other])])).toMatchObject({ ok: false });
      expect(audit([LIMIT(), swap], { product: other })).toMatchObject({ ok: false });
    }
  });

  it("a product that is not a CLMM route, or not a table key", () => {
    expect(audit(valid(), { product: "NVDA" })).toEqual({ ok: false, reason: "product has no pinned CLMM route" });
    expect(audit(valid(), { product: "SPCX" as ProductTicker })).toEqual({ ok: false, reason: "product has no pinned CLMM route" });
  });

  it.each([
    ["input", encodeSwapV2Data(INPUT + 1n, MIN, USDC_IN_SQRT_PRICE_LIMIT_X64), /encoded input/],
    ["minimum", encodeSwapV2Data(INPUT, MIN - 1n, USDC_IN_SQRT_PRICE_LIMIT_X64), /encoded minimum/],
    ["price limit", encodeSwapV2Data(INPUT, MIN, USDC_IN_SQRT_PRICE_LIMIT_X64 - 1n), /price limit/],
    ["zero price limit", encodeSwapV2Data(INPUT, MIN, 0n), /price limit/],
    ["exact-output flag", Uint8Array.from([...encodeSwapV2Data(INPUT, MIN, USDC_IN_SQRT_PRICE_LIMIT_X64).subarray(0, 40), 0]), /exact-input/],
    ["trailing data", Uint8Array.from([...encodeSwapV2Data(INPUT, MIN, USDC_IN_SQRT_PRICE_LIMIT_X64), 0]), /not the expected swap/],
    ["another instruction", Uint8Array.from([0xf8, 0xc6, 0x9e, 0x91, 0xe1, 0x75, 0x87, 0xc8, ...encodeSwapV2Data(INPUT, MIN, USDC_IN_SQRT_PRICE_LIMIT_X64).subarray(8)]), /not the expected swap/],
  ])("swap data with a different %s", (_name, data, reason) => {
    expect(audit([LIMIT(), withData(swap, data)])).toMatchObject({ ok: false, reason });
  });

  it.each([
    ["a start that is not a multiple of the array span", [3601], /not valid/],
    ["descending starts", [7200, 3600], /ascending/],
    ["a repeated start", [3600, 3600], /ascending/],
    ["more arrays than allowed", [3600, 7200, 10800, 14400], /too many/],
    ["no arrays", [], /no tick arrays/],
    ["a start outside the pool bitmap", [512 * 3600], /not valid/],
  ])("tick arrays with %s", (_name, starts, reason) => {
    expect(audit([LIMIT(), swapOf(undefined, INPUT, MIN, starts)], { tickArrayStarts: starts })).toMatchObject({ ok: false, reason });
  });

  it("tick arrays other than the ones the quote walked, and one array too few or too many", () => {
    expect(audit([LIMIT(), swapOf(undefined, INPUT, MIN, [3600, 10800])])).toMatchObject({ ok: false });
    expect(audit([LIMIT(), swapOf(undefined, INPUT, MIN, [3600])])).toMatchObject({ ok: false, reason: /expected 16 accounts/ });
    const extra = new TransactionInstruction({ programId: swap.programId, data: swap.data, keys: [...swap.keys, key(tickArrayAddress(CLMM_PRODUCT_ROUTES.COIN.pool, 10800), false, true)] });
    expect(audit([LIMIT(), extra])).toMatchObject({ ok: false, reason: /expected 16 accounts/ });
  });

  it("a bitmap extension the pool does not have, or a missing one it has", () => {
    expect(audit([LIMIT(), swap], { hasBitmapExtension: false })).toMatchObject({ ok: false });
    expect(audit([LIMIT(), swapOf(undefined, undefined, undefined, undefined, false)])).toMatchObject({ ok: false });
    expect(audit([LIMIT(), withAccount(swap, 13, bitmapExtensionAddress(OTHER_ROUTE.pool))])).toMatchObject({ ok: false, reason: /account 13/ });
  });

  it.each([
    ["an input above the per-transaction limit", { inputRaw: 10_000_001n }, /per-transaction limit/],
    ["a zero input", { inputRaw: 0n }, /not positive/],
    ["a zero quoted output", { outputRaw: 0n, minimumOutputRaw: 0n }, /not positive/],
    ["a minimum above the quoted output", { minimumOutputRaw: OUT + 1n }, /above the quoted output/],
    ["a minimum below the fixed slippage", { minimumOutputRaw: (OUT * 9_899n) / 10_000n }, /slippage tolerance/],
  ])("reviewed amounts with %s", (_name, overrides, reason) => {
    expect(audit(valid(), overrides as Partial<ClmmSwapExpectation>)).toMatchObject({ ok: false, reason });
  });

  it("computes the slippage floor itself, independent of the builder", () => {
    expect(clmmAmountFailure({ inputRaw: INPUT, outputRaw: OUT, minimumOutputRaw: (OUT * 9_900n) / 10_000n })).toBeNull();
    expect(clmmAmountFailure({ inputRaw: INPUT, outputRaw: OUT, minimumOutputRaw: (OUT * 9_900n) / 10_000n - 1n })).toMatch(/slippage/);
  });

  it("a compute-unit price, a limit above the ceiling, a missing, duplicated or late limit", () => {
    expect(audit([LIMIT(), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }), swap])).toMatchObject({ ok: false, reason: /compute budget/ });
    expect(audit([LIMIT(CLMM_CONFIG.computeUnitLimit + 1), swap])).toMatchObject({ ok: false, reason: /ceiling/ });
    expect(audit([swap])).toMatchObject({ ok: false, reason: /compute-unit limit is missing/ });
    expect(audit([LIMIT(), LIMIT(), swap])).toMatchObject({ ok: false, reason: /duplicate/ });
    expect(audit([LIMIT(), ComputeBudgetProgram.requestHeapFrame({ bytes: 64 * 1024 }), swap])).toMatchObject({ ok: false });
  });

  it("a USDC or foreign account creation, a non-idempotent one, and a creation after the swap", () => {
    expect(audit([LIMIT(), createOwnAccount(USER, USDC_MINT, TOKEN), swap])).toMatchObject({ ok: false, reason: /not part of the route/ });
    expect(audit([LIMIT(), createOwnAccount(USER, SKR, TOKEN), swap])).toMatchObject({ ok: false, reason: /not part of the route/ });
    const create = createOwnAccount(USER, CLMM_PRODUCT_ROUTES.COIN.productMint, TOKEN_2022);
    expect(audit([LIMIT(), withData(create, Uint8Array.from([0])), swap])).toMatchObject({ ok: false, reason: /idempotent/ });
    expect(audit([LIMIT(), create, create, swap])).toMatchObject({ ok: false, reason: /duplicate/ });
    expect(audit([LIMIT(), swap, create])).toMatchObject({ ok: false });
  });

  it("the swap not last, two swaps, no swap, and any other program", () => {
    expect(audit([LIMIT(), swap, new TransactionInstruction({ programId: MEMO, keys: [], data: Buffer.from("x") })])).toMatchObject({ ok: false });
    expect(audit([LIMIT(), swap, swap])).toMatchObject({ ok: false });
    expect(audit([LIMIT()])).toMatchObject({ ok: false, reason: /exactly one swap/ });
    expect(audit([LIMIT(), SystemProgram.transfer({ fromPubkey: USER, toPubkey: STRANGER, lamports: 1 }), swap])).toMatchObject({ ok: false, reason: /not allowed/ });
    const dlmmSwap = new TransactionInstruction({ programId: DLMM, keys: swap.keys, data: swap.data });
    expect(audit([LIMIT(), dlmmSwap])).toMatchObject({ ok: false, reason: /not allowed/ });
  });

  it("another fee payer, or a second signer", () => {
    expect(audit(valid(), {}, STRANGER)).toMatchObject({ ok: false });
    const signed = new TransactionInstruction({ programId: swap.programId, data: swap.data, keys: swap.keys.map((k, i) => (i === 2 ? { ...k, isSigner: true } : k)) });
    expect(audit([LIMIT(), signed])).toMatchObject({ ok: false, reason: /unexpected signer/ });
  });

  it("an invalid wallet address", () => {
    expect(audit(valid(), { user: "not-a-key" })).toEqual({ ok: false, reason: "wallet address is not valid" });
  });

  it("trailing bytes, a versioned message, and a message that loads accounts from a lookup table", () => {
    const bytes = wire(valid());
    expect(legacyAuditShapeOf(Uint8Array.from([...bytes, 0]))).toBeNull();
    const v0 = new VersionedTransaction(new TransactionMessage({ payerKey: USER, recentBlockhash: BLOCKHASH, instructions: valid() }).compileToV0Message()).serialize();
    expect(legacyAuditShapeOf(v0)).toBeNull();
    const table = new AddressLookupTableAccount({ key: STRANGER, state: { deactivationSlot: 2n ** 64n - 1n, lastExtendedSlot: 0, lastExtendedSlotStartIndex: 0, authority: undefined, addresses: [CLMM_PRODUCT_ROUTES.COIN.clmm.observation, CLMM_PRODUCT_ROUTES.COIN.clmm.usdcVault] } });
    const withTable = new VersionedTransaction(new TransactionMessage({ payerKey: USER, recentBlockhash: BLOCKHASH, instructions: valid() }).compileToV0Message([table])).serialize();
    expect(legacyAuditShapeOf(withTable)).toBeNull();
    expect(auditClmmSwapTransaction(legacyAuditShapeOf(withTable), expectation())).toMatchObject({ ok: false });
  });
});

// ---------------------------------------------------------------------------
// Two legs: SOL / SKR -> USDC in the pinned DLMM pool, then USDC -> product in the CLMM pool.
// ---------------------------------------------------------------------------

const BIN = 7n;
const SKR_IN = 200_000_000n;
const SOL_IN = 10_000_000n;
const USDC_OUT = 2_000_000n;
const USDC_MIN = 1_980_000n;

function dlmmLeg(payMint: PublicKey, pool: PublicKey, amountIn: bigint, minimumOut: bigint): TransactionInstruction {
  const derived = poolAccounts({ pool, mintX: payMint, mintY: USDC_MINT, programX: TOKEN, programY: TOKEN });
  const amounts = Buffer.alloc(16);
  amounts.writeBigUInt64LE(amountIn, 0);
  amounts.writeBigUInt64LE(minimumOut, 8);
  return new TransactionInstruction({
    programId: DLMM,
    data: Buffer.concat([Buffer.from("414b3f4ceb5b5b88", "hex"), amounts, Buffer.from("0200000000000100", "hex")]),
    keys: [
      key(pool, false, true), key(DLMM), key(derived.reserveX, false, true), key(derived.reserveY, false, true),
      key(ata(payMint), false, true), key(ata(USDC_MINT), false, true), key(payMint), key(USDC_MINT), key(derived.oracle, false, true),
      key(DLMM), key(USER, true, false), key(TOKEN), key(TOKEN), key(MEMO), key(derived.eventAuthority), key(DLMM),
      key(poolBinArrayAddress(pool, BIN), false, true),
    ],
  });
}

type PayToken = "SKR" | "SOL";
const TWO_LEG_LIMIT = () => ComputeBudgetProgram.setComputeUnitLimit({ units: PAY_CONFIG.twoLegComputeUnitLimit });

function twoLegInstructions(payToken: PayToken, second: TransactionInstruction = swapOf(undefined, USDC_MIN, MIN)): TransactionInstruction[] {
  if (payToken === "SKR") {
    return [TWO_LEG_LIMIT(), dlmmLeg(SKR, PAY_TOKENS.SKR.leg!.pool, SKR_IN, USDC_MIN), createOwnAccount(USER, CLMM_PRODUCT_ROUTES.COIN.productMint, TOKEN_2022), second];
  }
  return [
    TWO_LEG_LIMIT(),
    createOwnAccount(USER, WSOL, TOKEN),
    SystemProgram.transfer({ fromPubkey: USER, toPubkey: new PublicKey(ata(WSOL)), lamports: SOL_IN }),
    new TransactionInstruction({ programId: TOKEN, keys: [key(ata(WSOL), false, true)], data: Buffer.from([17]) }),
    dlmmLeg(WSOL, PAY_TOKENS.SOL.leg!.pool, SOL_IN, USDC_MIN),
    createOwnAccount(USER, CLMM_PRODUCT_ROUTES.COIN.productMint, TOKEN_2022),
    second,
    new TransactionInstruction({ programId: TOKEN, keys: [key(ata(WSOL), false, true), key(USER, false, true), key(USER, true, false)], data: Buffer.from([9]) }),
  ];
}

function twoLegExpectation(payToken: PayToken, overrides: Partial<ClmmTwoLegExpectation> = {}): ClmmTwoLegExpectation {
  return {
    user: USER.toBase58(), product: "COIN", payToken, inputRaw: payToken === "SKR" ? SKR_IN : SOL_IN, usdcOutRaw: USDC_OUT, usdcMinimumRaw: USDC_MIN, outputRaw: OUT, minimumOutputRaw: MIN,
    firstLeg: { binArrayIndexes: [BIN], hasBitmapExtension: false }, secondLeg: { tickArrayStarts: STARTS, hasBitmapExtension: true }, ...overrides,
  };
}

function twoLeg(payToken: PayToken, instructions = twoLegInstructions(payToken), overrides: Partial<ClmmTwoLegExpectation> = {}) {
  return auditClmmTwoLegTransaction(legacyAuditShapeOf(wire(instructions)), twoLegExpectation(payToken, overrides));
}

describe.each(["SKR", "SOL"] as const)("auditClmmTwoLegTransaction paid with %s", (payToken) => {
  it("accepts the two-leg shape", () => {
    expect(twoLeg(payToken)).toEqual({ ok: true, createsNvdaxAccount: true, createsUsdcAccount: false });
  });

  it("refuses a second leg whose input is not exactly the first leg's USDC minimum", () => {
    expect(twoLeg(payToken, twoLegInstructions(payToken, swapOf(undefined, USDC_OUT, MIN)))).toMatchObject({ ok: false, reason: /second swap: encoded input/ });
  });

  it("refuses the DLMM product swap in place of the CLMM second leg, and a CLMM swap as the first leg", () => {
    const instructions = twoLegInstructions(payToken);
    const index = instructions.findIndex((instruction) => instruction.programId.equals(CLMM_PROGRAM_ID));
    const asDlmm = [...instructions];
    asDlmm[index] = dlmmLeg(CLMM_PRODUCT_ROUTES.COIN.productMint, CLMM_PRODUCT_ROUTES.COIN.pool, USDC_MIN, MIN);
    expect(twoLeg(payToken, asDlmm)).toMatchObject({ ok: false });
    const swapped = instructions.filter((instruction) => !instruction.programId.equals(DLMM));
    expect(twoLeg(payToken, swapped)).toMatchObject({ ok: false });
  });

  it("refuses another product's CLMM pool, an unlisted pool, and a product that is not a CLMM route", () => {
    expect(twoLeg(payToken, twoLegInstructions(payToken, swapOf(OTHER_ROUTE, USDC_MIN, MIN)))).toMatchObject({ ok: false, reason: /second swap: account 1/ });
    expect(twoLeg(payToken, twoLegInstructions(payToken, withAccount(swapOf(undefined, USDC_MIN, MIN), 2, UNLISTED_POOL)))).toMatchObject({ ok: false });
    expect(twoLeg(payToken, undefined, { product: "NVDA" })).toEqual({ ok: false, reason: "product has no pinned CLMM route" });
  });

  it("refuses a compute-unit price, a limit above the two-leg ceiling, and a missing limit", () => {
    const instructions = twoLegInstructions(payToken);
    expect(twoLeg(payToken, [instructions[0], ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }), ...instructions.slice(1)])).toMatchObject({ ok: false, reason: /compute budget/ });
    expect(twoLeg(payToken, [ComputeBudgetProgram.setComputeUnitLimit({ units: PAY_CONFIG.twoLegComputeUnitLimit + 1 }), ...instructions.slice(1)])).toMatchObject({ ok: false, reason: /ceiling/ });
    expect(twoLeg(payToken, instructions.slice(1))).toMatchObject({ ok: false, reason: /compute-unit limit is missing/ });
  });

  it("refuses reviewed amounts outside the bounds", () => {
    expect(twoLeg(payToken, undefined, { minimumOutputRaw: (OUT * 9_899n) / 10_000n })).toMatchObject({ ok: false, reason: /slippage/ });
    expect(twoLeg(payToken, undefined, { minimumOutputRaw: OUT + 1n, outputRaw: OUT })).toMatchObject({ ok: false });
    expect(twoLeg(payToken, undefined, { usdcMinimumRaw: USDC_OUT + 1n })).toMatchObject({ ok: false });
    expect(twoLeg(payToken, undefined, { usdcMinimumRaw: 10_000_001n, usdcOutRaw: 10_000_001n })).toMatchObject({ ok: false, reason: /per-transaction limit/ });
  });

  it("refuses a trailing instruction and a trailing byte", () => {
    expect(twoLeg(payToken, [...twoLegInstructions(payToken), new TransactionInstruction({ programId: MEMO, keys: [], data: Buffer.from("x") })])).toMatchObject({ ok: false });
    expect(legacyAuditShapeOf(Uint8Array.from([...wire(twoLegInstructions(payToken)), 0]))).toBeNull();
  });
});

describe("auditClmmTwoLegTransaction for SOL", () => {
  it("refuses a missing close, a missing wrap, and a transfer of another amount", () => {
    const instructions = twoLegInstructions("SOL");
    expect(twoLeg("SOL", instructions.slice(0, -1))).toMatchObject({ ok: false, reason: /not closed/ });
    expect(twoLeg("SOL", instructions.filter((_, index) => index !== 2 && index !== 3))).toMatchObject({ ok: false, reason: /not wrapped/ });
    const wrong = [...instructions];
    wrong[2] = SystemProgram.transfer({ fromPubkey: USER, toPubkey: new PublicKey(ata(WSOL)), lamports: SOL_IN + 1n });
    expect(twoLeg("SOL", wrong)).toMatchObject({ ok: false, reason: /transfer differs/ });
  });
});

// ---------------------------------------------------------------------------
// The real builder on the recorded mainnet snapshot, through a read-only fake connection.
// ---------------------------------------------------------------------------

function snapshotConnection(snapshot: (typeof fixture)["COIN"]): Connection {
  const pool = new PublicKey(snapshot.pool);
  const accounts = new Map<string, Buffer>([[pool.toBase58(), Buffer.from(snapshot.accounts.pool, "base64")], [bitmapExtensionAddress(pool).toBase58(), Buffer.alloc(8)]]);
  const poolData = accounts.get(pool.toBase58())!;
  accounts.set(new PublicKey(poolData.subarray(9, 41)).toBase58(), Buffer.from(snapshot.accounts.config, "base64"));
  snapshot.tickArrayStarts.forEach((start, index) => accounts.set(tickArrayAddress(pool, start).toBase58(), Buffer.from(snapshot.accounts.tickArrays[index], "base64")));
  const info = (address: PublicKey): AccountInfo<Buffer> | null => {
    const data = accounts.get(address.toBase58());
    return data ? { data, owner: CLMM_PROGRAM_ID, lamports: 1, executable: false, rentEpoch: 0 } : null;
  };
  return {
    getMultipleAccountsInfo: async (keys: PublicKey[]) => keys.map(info),
    getLatestBlockhash: async () => ({ blockhash: BLOCKHASH, lastValidBlockHeight: 100 }),
  } as unknown as Connection;
}

describe("the one-leg builder on the recorded COIN pool", () => {
  it("builds bytes that pass the audit and fit one legacy transaction", async () => {
    const built = await buildClmmUsdcExactInSwap({ connection: snapshotConnection(fixture.COIN), userPublicKey: USER, product: "COIN", usdcInAmountRaw: 10_000_000n, slippageBps: 100 });
    expect(built.reading.quote.outputRaw).toBe(fixture.COIN.sdk.expected[2].amountOut);
    const bytes = Uint8Array.from(built.transaction.serialize({ requireAllSignatures: false, verifySignatures: false }));
    expect(bytes.length).toBeLessThanOrEqual(1232);
    expect(auditClmmSwapTransaction(legacyAuditShapeOf(bytes), {
      user: USER.toBase58(), product: "COIN", inputRaw: 10_000_000n, outputRaw: built.reading.outputRaw, minimumOutputRaw: built.reading.minimumOutputRaw,
      tickArrayStarts: built.reading.tickArrayStarts, hasBitmapExtension: built.hasBitmapExtension,
    })).toEqual({ ok: true, createsNvdaxAccount: true, createsUsdcAccount: false });
  });

  it("stops before building when the pool read back no longer carries the pins", async () => {
    await expect(buildClmmUsdcExactInSwap({ connection: snapshotConnection(fixture.NFLX), userPublicKey: USER, product: "COIN", usdcInAmountRaw: 2_000_000n, slippageBps: 100 })).rejects.toThrow();
  });
});
