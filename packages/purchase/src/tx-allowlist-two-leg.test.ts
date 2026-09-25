import { describe, expect, it } from "vitest";
import { ComputeBudgetProgram, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";

import { PURCHASE_CONFIG } from "./config";
import { PAY_CONFIG } from "./pay-config";
import { composeTwoLegInstructions } from "./two-leg-compose";
import { NVDAX_MINT, NVDAX_USDC_POOL, PAY_TOKENS, SKR_USDC_POOL, USDC_MINT } from "./route";
import {
  associatedTokenAddress,
  auditShapeOf,
  auditTwoLegTransaction,
  poolAccounts,
  twoLegAmountFailure,
  poolBinArrayAddress,
  type TwoLegAuditExpectation,
} from "./tx-allowlist";

const PROGRAM = new PublicKey("LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo");
const TOKEN = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN_2022 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const MEMO = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const ATA_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const USER = new PublicKey(new Uint8Array(32).fill(3));
const STRANGER = new PublicKey(new Uint8Array(32).fill(8));
const BLOCKHASH = new PublicKey(new Uint8Array(32).fill(1)).toBase58();

// SKR/USDC pool accounts observed read-only on 2026-09-25 in a mainnet build
// of this route: independent evidence for the derivations the audit uses.
const OBSERVED_SKR_POOL = {
  reserveX: "2DxsFPTTPqUQNbvfx3GoAA6AeovXnB4Fh8qBDvddgJRY",
  oracle: "FCuiSCJaQAV5k2Xk2Pfg2Ec21EsbF4czbVZxkiEiEHWP",
  bitmapExtension: "DmNABPAB6pgkHKULo6ehkKKqM8Htthbgw1MWZYRwzpdB",
};

const SOL_IN = 50_000_000n;
const SKR_IN = 200_000_000n;
const USDC_MIN = 5_848_810n;
const NVDAX_MIN = 2_570_830n;
/** Quoted outputs whose 1% slippage floor is exactly the minimums above. */
const USDC_OUT = 5_907_889n;
const NVDAX_OUT = 2_596_798n;

function key(pubkey: string | PublicKey, isSigner = false, isWritable = false) {
  return { pubkey: typeof pubkey === "string" ? new PublicKey(pubkey) : pubkey, isSigner, isWritable };
}

function swapData(amountIn: bigint, minimumOut: bigint): Buffer {
  const amounts = Buffer.alloc(16);
  amounts.writeBigUInt64LE(amountIn, 0);
  amounts.writeBigUInt64LE(minimumOut, 8);
  return Buffer.concat([Buffer.from("414b3f4ceb5b5b88", "hex"), amounts, Buffer.from("0200000000000100", "hex")]);
}

type Leg = { pool: PublicKey; mintX: PublicKey; mintY: PublicKey; programX: PublicKey; programY: PublicKey; tokenIn: string; tokenOut: string; bitmap: boolean; binArray: bigint };

function legSwap(leg: Leg, amountIn: bigint, minimumOut: bigint): TransactionInstruction {
  const derived = poolAccounts(leg);
  return new TransactionInstruction({
    programId: PROGRAM,
    data: swapData(amountIn, minimumOut),
    keys: [
      key(leg.pool, false, true),
      key(leg.bitmap ? derived.bitmapExtension : PROGRAM),
      key(derived.reserveX, false, true),
      key(derived.reserveY, false, true),
      key(leg.tokenIn, false, true),
      key(leg.tokenOut, false, true),
      key(leg.mintX),
      key(leg.mintY),
      key(derived.oracle, false, true),
      key(PROGRAM),
      key(USER, true, false),
      key(leg.programX),
      key(leg.programY),
      key(MEMO),
      key(derived.eventAuthority),
      key(PROGRAM),
      key(poolBinArrayAddress(leg.pool, leg.binArray), false, true),
    ],
  });
}

function ata(mint: PublicKey, program = TOKEN): string {
  return associatedTokenAddress(USER, mint, program);
}

function createAccount(mint: PublicKey, program = TOKEN): TransactionInstruction {
  return new TransactionInstruction({
    programId: ATA_PROGRAM,
    keys: [key(USER, true, true), key(ata(mint, program), false, true), key(USER), key(mint), key(SystemProgram.programId), key(program)],
    data: Buffer.from([1]),
  });
}

const WSOL = PAY_TOKENS.SOL.mint;
const SKR = PAY_TOKENS.SKR.mint;
const solLeg: Leg = { pool: PAY_TOKENS.SOL.leg!.pool, mintX: WSOL, mintY: USDC_MINT, programX: TOKEN, programY: TOKEN, tokenIn: ata(WSOL), tokenOut: ata(USDC_MINT), bitmap: true, binArray: -3n };
const skrLeg: Leg = { ...solLeg, pool: SKR_USDC_POOL, mintX: SKR, tokenIn: ata(SKR), binArray: 12n };
const nvdaxLeg: Leg = { pool: NVDAX_USDC_POOL, mintX: NVDAX_MINT, mintY: USDC_MINT, programX: TOKEN_2022, programY: TOKEN, tokenIn: ata(USDC_MINT), tokenOut: ata(NVDAX_MINT, TOKEN_2022), bitmap: false, binArray: 4n };

const transferIn = (lamports = SOL_IN, to = ata(WSOL)) => SystemProgram.transfer({ fromPubkey: USER, toPubkey: new PublicKey(to), lamports });
const syncNative = (account = ata(WSOL)) => new TransactionInstruction({ programId: TOKEN, keys: [key(account, false, true)], data: Buffer.from([17]) });
const closeWsol = (destination: PublicKey = USER) => new TransactionInstruction({ programId: TOKEN, keys: [key(ata(WSOL), false, true), key(destination, false, true), key(USER, true, false)], data: Buffer.from([9]) });
const limit = (units: number = PAY_CONFIG.twoLegComputeUnitLimit) => ComputeBudgetProgram.setComputeUnitLimit({ units });

function solInstructions(): TransactionInstruction[] {
  return [limit(), createAccount(WSOL), transferIn(), syncNative(), legSwap(solLeg, SOL_IN, USDC_MIN), createAccount(NVDAX_MINT, TOKEN_2022), legSwap(nvdaxLeg, USDC_MIN, NVDAX_MIN), closeWsol()];
}

function skrInstructions(): TransactionInstruction[] {
  return [limit(), legSwap(skrLeg, SKR_IN, USDC_MIN), legSwap(nvdaxLeg, USDC_MIN, NVDAX_MIN)];
}

function wire(instructions: TransactionInstruction[], feePayer: PublicKey = USER): Uint8Array {
  const transaction = new Transaction({ feePayer, blockhash: BLOCKHASH, lastValidBlockHeight: 1 }).add(...instructions);
  return Uint8Array.from(transaction.serialize({ requireAllSignatures: false, verifySignatures: false }));
}

const SOL_EXPECTATION: TwoLegAuditExpectation = {
  user: USER.toBase58(), payToken: "SOL", inputRaw: SOL_IN, usdcOutRaw: USDC_OUT, usdcMinimumRaw: USDC_MIN, outputRaw: NVDAX_OUT, minimumOutputRaw: NVDAX_MIN,
  firstLeg: { binArrayIndexes: [-3n], hasBitmapExtension: true }, secondLeg: { binArrayIndexes: [4n], hasBitmapExtension: false },
};
const SKR_EXPECTATION: TwoLegAuditExpectation = { ...SOL_EXPECTATION, payToken: "SKR", inputRaw: SKR_IN, firstLeg: { binArrayIndexes: [12n], hasBitmapExtension: true } };

function audit(instructions: TransactionInstruction[], expectation: Partial<TwoLegAuditExpectation> = {}, feePayer?: PublicKey) {
  return auditTwoLegTransaction(auditShapeOf(wire(instructions, feePayer)), { ...SOL_EXPECTATION, ...expectation });
}

describe("two-leg route derivations", () => {
  it("match the SKR/USDC pool accounts observed on chain", () => {
    const derived = poolAccounts({ pool: SKR_USDC_POOL, mintX: SKR, mintY: USDC_MINT, programX: TOKEN, programY: TOKEN });
    expect(derived.reserveX).toBe(OBSERVED_SKR_POOL.reserveX);
    expect(derived.oracle).toBe(OBSERVED_SKR_POOL.oracle);
    expect(derived.bitmapExtension).toBe(OBSERVED_SKR_POOL.bitmapExtension);
  });

  it("fits a two-leg SOL purchase in one legacy transaction", () => {
    expect(wire(solInstructions()).length).toBeLessThanOrEqual(1232);
  });
});

describe("auditTwoLegTransaction accepts the route's own transactions", () => {
  it("accepts SOL: wrap, first leg, NVDAx account creation, second leg, close", () => {
    expect(audit(solInstructions())).toEqual({ ok: true, createsNvdaxAccount: true, createsUsdcAccount: false });
  });

  it("accepts a compute-unit limit at exactly the route's ceiling", () => {
    expect(audit([limit(PAY_CONFIG.twoLegComputeUnitLimit), ...skrInstructions().slice(1)], SKR_EXPECTATION).ok).toBe(true);
  });

  it("accepts SKR: two swaps and nothing else", () => {
    expect(audit(skrInstructions(), SKR_EXPECTATION)).toEqual({ ok: true, createsNvdaxAccount: false, createsUsdcAccount: false });
  });

  it("ignores extra fields on the leg expectation (the pinned pools always win)", () => {
    const loose = { ...SKR_EXPECTATION, firstLeg: { ...SKR_EXPECTATION.firstLeg, pool: STRANGER.toBase58() } } as TwoLegAuditExpectation;
    expect(audit(skrInstructions(), loose).ok).toBe(true);
  });

  it("accepts a USDC account creation before the first leg and reports it", () => {
    const instructions = skrInstructions();
    instructions.splice(1, 0, createAccount(USDC_MINT));
    expect(audit(instructions, SKR_EXPECTATION)).toEqual({ ok: true, createsNvdaxAccount: false, createsUsdcAccount: true });
  });
});

describe("auditTwoLegTransaction rejects anything else before the wallet", () => {
  const replace = (index: number, instruction: TransactionInstruction) => {
    const instructions = solInstructions();
    instructions[index] = instruction;
    return instructions;
  };
  const cases: [string, () => ReturnType<typeof audit>, RegExp][] = [
    ["a transfer of a different amount", () => audit(replace(2, transferIn(SOL_IN + 1n))), /transfer differs/],
    ["a transfer to someone else", () => audit(replace(2, transferIn(SOL_IN, STRANGER.toBase58()))), /system: account 1/],
    ["a transfer for SKR", () => audit([limit(), transferIn(SKR_IN, ata(SKR)), ...skrInstructions().slice(1)], SKR_EXPECTATION), /not allowed for this pay token/],
    ["a first leg in a different pool", () => audit(replace(4, legSwap({ ...solLeg, pool: STRANGER }, SOL_IN, USDC_MIN))), /first swap: account 0/],
    ["a first leg with another input", () => audit(replace(4, legSwap(solLeg, SOL_IN + 1n, USDC_MIN))), /first swap: encoded input/],
    ["a second leg that takes more USDC than the first minimum", () => audit(replace(6, legSwap(nvdaxLeg, USDC_MIN + 1n, NVDAX_MIN))), /second swap: encoded input/],
    ["a second leg with a lower minimum", () => audit(replace(6, legSwap(nvdaxLeg, USDC_MIN, NVDAX_MIN - 1n))), /second swap: encoded minimum/],
    ["an NVDAx output to someone else's account", () => audit(replace(6, legSwap({ ...nvdaxLeg, tokenOut: STRANGER.toBase58() }, USDC_MIN, NVDAX_MIN))), /second swap: account 5/],
    ["a close to someone else", () => audit(replace(7, closeWsol(STRANGER))), /token close: account 1/],
    ["no close for SOL", () => audit(solInstructions().slice(0, 7)), /not closed/],
    ["a swap before the SOL wrap", () => audit([limit(), legSwap(solLeg, SOL_IN, USDC_MIN), transferIn(), syncNative(), legSwap(nvdaxLeg, USDC_MIN, NVDAX_MIN), closeWsol()]), /not wrapped first|only one transfer/],
    ["a third swap", () => audit([...skrInstructions(), legSwap(nvdaxLeg, USDC_MIN, NVDAX_MIN)], SKR_EXPECTATION), /more than two swaps/],
    ["only one swap", () => audit(skrInstructions().slice(0, 2), SKR_EXPECTATION), /exactly two swap/],
    ["an unknown program", () => audit([...skrInstructions().slice(0, 1), new TransactionInstruction({ programId: STRANGER, keys: [], data: Buffer.alloc(0) }), ...skrInstructions().slice(1)], SKR_EXPECTATION), /program is not allowed/],
    ["an account creation for another mint", () => audit([limit(), createAccount(STRANGER), ...skrInstructions().slice(1)], SKR_EXPECTATION), /mint is not part of the route/],
    ["another fee payer", () => audit(skrInstructions(), SKR_EXPECTATION, STRANGER), /fee payer/],
    ["anything after the close", () => audit([...solInstructions(), limit()]), /nothing may follow/],
    ["a compute-unit price", () => audit([limit(), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }), ...skrInstructions().slice(1)], SKR_EXPECTATION), /compute budget: unexpected instruction/],
    ["a compute-unit limit above the route's ceiling", () => audit([limit(PAY_CONFIG.twoLegComputeUnitLimit + 1), ...skrInstructions().slice(1)], SKR_EXPECTATION), /limit above the route's ceiling/],
    ["a second compute-unit limit", () => audit([limit(), limit(), ...skrInstructions().slice(1)], SKR_EXPECTATION), /compute budget: duplicate/],
  ];
  for (const [name, run, reason] of cases) {
    it(`rejects ${name}`, () => {
      const result = run();
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(reason);
    });
  }
});

describe("two-leg amount bounds (independent of the builder's own checks)", () => {
  const AMOUNTS = { usdcOutRaw: USDC_OUT, usdcMinimumRaw: USDC_MIN, outputRaw: NVDAX_OUT, minimumOutputRaw: NVDAX_MIN };

  it("fixture minimums sit exactly on the 1% slippage floor", () => {
    expect(twoLegAmountFailure(AMOUNTS)).toBeNull();
    expect(twoLegAmountFailure({ ...AMOUNTS, usdcOutRaw: USDC_OUT + 2n })).toMatch(/USDC minimum is below the slippage/);
  });

  it("accepts a USDC minimum of exactly the per-transaction limit", () => {
    expect(twoLegAmountFailure({ ...AMOUNTS, usdcOutRaw: PURCHASE_CONFIG.maxUsdcInRaw, usdcMinimumRaw: PURCHASE_CONFIG.maxUsdcInRaw })).toBeNull();
  });

  const cases: [string, Partial<TwoLegAuditExpectation>, RegExp][] = [
    ["a USDC minimum above the per-transaction limit", { usdcOutRaw: PURCHASE_CONFIG.maxUsdcInRaw + 1n, usdcMinimumRaw: PURCHASE_CONFIG.maxUsdcInRaw + 1n }, /above the per-transaction limit/],
    ["a zero USDC minimum", { usdcOutRaw: 0n, usdcMinimumRaw: 0n }, /USDC minimum is not positive/],
    ["a zero NVDAx minimum", { outputRaw: 0n, minimumOutputRaw: 0n }, /product minimum is not positive/],
    ["a USDC minimum below the slippage floor", { usdcMinimumRaw: USDC_MIN - 1n }, /USDC minimum is below the slippage/],
    ["an NVDAx minimum below the slippage floor", { minimumOutputRaw: NVDAX_MIN - 1n }, /product minimum is below the slippage/],
  ];
  for (const [name, change, reason] of cases) {
    it(`the audit rejects ${name}`, () => {
      const expectation = { ...SKR_EXPECTATION, ...change };
      const usdcMinimum = expectation.usdcMinimumRaw;
      const instructions = [limit(), legSwap(skrLeg, SKR_IN, usdcMinimum), legSwap(nvdaxLeg, usdcMinimum, expectation.minimumOutputRaw)];
      const result = audit(instructions, expectation);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(reason);
    });
  }
});

describe("composeTwoLegInstructions", () => {
  it("keeps one compute limit, moves the wrapped SOL close last and drops a duplicate account creation", () => {
    const sdkLeg = [ComputeBudgetProgram.setComputeUnitLimit({ units: 1 }), createAccount(USDC_MINT), transferIn(), syncNative(), legSwap(solLeg, SOL_IN, USDC_MIN), closeWsol()];
    const sdkNvdax = [ComputeBudgetProgram.setComputeUnitLimit({ units: 2 }), createAccount(USDC_MINT), createAccount(NVDAX_MINT, TOKEN_2022), legSwap(nvdaxLeg, USDC_MIN, NVDAX_MIN)];
    const composed = composeTwoLegInstructions(sdkLeg, sdkNvdax, 400_000);
    expect(composed).toHaveLength(8);
    expect(composed[composed.length - 1].data[0]).toBe(9);
    const result = audit(composed, SOL_EXPECTATION);
    expect(result).toEqual({ ok: true, createsNvdaxAccount: true, createsUsdcAccount: true });
  });
});

describe("two-leg wire bytes that are not exactly one transaction (fail closed)", () => {
  it("refuses a trailing byte after the builder's bytes", () => {
    const exact = wire(solInstructions());
    expect(auditTwoLegTransaction(auditShapeOf(exact), SOL_EXPECTATION).ok).toBe(true);
    expect(auditTwoLegTransaction(auditShapeOf(Uint8Array.from([...exact, 0])), SOL_EXPECTATION)).toEqual({ ok: false, reason: "transaction bytes do not decode to exactly one transaction" });
  });
});
