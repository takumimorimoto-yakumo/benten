import { describe, expect, it } from "vitest";
import { ComputeBudgetProgram, PublicKey, SystemProgram, Transaction, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";

import { PURCHASE_CONFIG } from "./config";
import { NVDAX_MINT, NVDAX_USDC_POOL, USDC_MINT } from "./route";
import {
  associatedTokenAddress,
  auditSellTransaction,
  auditSellWire,
  auditShapeOf,
  legacyAuditShapeOf,
  poolAccounts,
  poolBinArrayAddress,
  sellAmountFailure,
  type SellAuditExpectation,
} from "./tx-allowlist";

const PROGRAM = new PublicKey("LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo");
const TOKEN = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN_2022 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const MEMO = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const ATA_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const USER = new PublicKey(new Uint8Array(32).fill(3));
const STRANGER = new PublicKey(new Uint8Array(32).fill(8));
const BLOCKHASH = new PublicKey(new Uint8Array(32).fill(1)).toBase58();

/** 0.05 NVDAx raw (8 decimals) sold for a quoted 9 USDC; the minimum sits exactly on the 1% slippage floor. */
const NVDAX_IN = 5_000_000n;
const USDC_OUT = 9_000_000n;
const USDC_MIN = 8_910_000n;
const BIN_ARRAY = -2n;

function key(pubkey: string | PublicKey, isSigner = false, isWritable = false) {
  return { pubkey: typeof pubkey === "string" ? new PublicKey(pubkey) : pubkey, isSigner, isWritable };
}

function ata(owner: PublicKey, mint: PublicKey, program: PublicKey): string {
  return associatedTokenAddress(owner, mint, program);
}

const USER_NVDAX = ata(USER, NVDAX_MINT, TOKEN_2022);
const USER_USDC = ata(USER, USDC_MINT, TOKEN);

type SwapShape = {
  pool: PublicKey;
  tokenIn: string;
  tokenOut: string;
  bitmap: boolean;
  binArrays: bigint[];
  signer: PublicKey;
  discriminator: string;
  remaining: string;
  extraKeys: number;
};

const SELL_SWAP: SwapShape = {
  pool: NVDAX_USDC_POOL,
  tokenIn: USER_NVDAX,
  tokenOut: USER_USDC,
  bitmap: false,
  binArrays: [BIN_ARRAY],
  signer: USER,
  discriminator: "414b3f4ceb5b5b88",
  remaining: "0200000000000100",
  extraKeys: 0,
};

function swapData(amountIn: bigint, minimumOut: bigint, shape: SwapShape): Buffer {
  const amounts = Buffer.alloc(16);
  amounts.writeBigUInt64LE(amountIn, 0);
  amounts.writeBigUInt64LE(minimumOut, 8);
  return Buffer.concat([Buffer.from(shape.discriminator, "hex"), amounts, Buffer.from(shape.remaining, "hex")]);
}

function sellSwap(change: Partial<SwapShape> = {}, amountIn = NVDAX_IN, minimumOut = USDC_MIN): TransactionInstruction {
  const shape = { ...SELL_SWAP, ...change };
  const derived = poolAccounts({ pool: shape.pool, mintX: NVDAX_MINT, mintY: USDC_MINT, programX: TOKEN_2022, programY: TOKEN });
  return new TransactionInstruction({
    programId: PROGRAM,
    data: swapData(amountIn, minimumOut, shape),
    keys: [
      key(shape.pool, false, true),
      key(shape.bitmap ? derived.bitmapExtension : PROGRAM),
      key(derived.reserveX, false, true),
      key(derived.reserveY, false, true),
      key(shape.tokenIn, false, true),
      key(shape.tokenOut, false, true),
      key(NVDAX_MINT),
      key(USDC_MINT),
      key(derived.oracle, false, true),
      key(PROGRAM),
      key(shape.signer, true, false),
      key(TOKEN_2022),
      key(TOKEN),
      key(MEMO),
      key(derived.eventAuthority),
      key(PROGRAM),
      ...shape.binArrays.map((index) => key(poolBinArrayAddress(shape.pool, index), false, true)),
      ...Array.from({ length: shape.extraKeys }, () => key(STRANGER, false, true)),
    ],
  });
}

function createAccount(mint: PublicKey, program: PublicKey, owner: PublicKey = USER, data = 1): TransactionInstruction {
  return new TransactionInstruction({
    programId: ATA_PROGRAM,
    keys: [key(USER, true, true), key(ata(owner, mint, program), false, true), key(owner), key(mint), key(SystemProgram.programId), key(program)],
    data: Buffer.from([data]),
  });
}

const limit = (units: number = PURCHASE_CONFIG.sellComputeUnitLimit) => ComputeBudgetProgram.setComputeUnitLimit({ units });

function sellInstructions(): TransactionInstruction[] {
  return [limit(), sellSwap()];
}

function wire(instructions: TransactionInstruction[], feePayer: PublicKey = USER): Uint8Array {
  const transaction = new Transaction({ feePayer, blockhash: BLOCKHASH, lastValidBlockHeight: 1 }).add(...instructions);
  return Uint8Array.from(transaction.serialize({ requireAllSignatures: false, verifySignatures: false }));
}

const EXPECTATION: SellAuditExpectation = {
  user: USER.toBase58(),
  inputRaw: NVDAX_IN,
  usdcOutRaw: USDC_OUT,
  minimumUsdcOutRaw: USDC_MIN,
  binArrayIndexes: [BIN_ARRAY],
  hasBitmapExtension: false,
};

function audit(instructions: TransactionInstruction[], expectation: Partial<SellAuditExpectation> = {}, feePayer?: PublicKey) {
  return auditSellWire(wire(instructions, feePayer), { ...EXPECTATION, ...expectation });
}

describe("auditSellTransaction accepts the sale's own transactions", () => {
  it("accepts a compute-unit limit then one sale swap", () => {
    expect(audit(sellInstructions())).toEqual({ ok: true, createsNvdaxAccount: false, createsUsdcAccount: false });
  });

  it("accepts the wallet's own USDC account creation before the swap and reports it", () => {
    expect(audit([limit(), createAccount(USDC_MINT, TOKEN), sellSwap()])).toEqual({ ok: true, createsNvdaxAccount: false, createsUsdcAccount: true });
  });

  it("accepts a compute-unit limit at exactly the sale's ceiling", () => {
    expect(audit([limit(PURCHASE_CONFIG.sellComputeUnitLimit), sellSwap()]).ok).toBe(true);
  });

  it("accepts the bitmap extension when the pool has one", () => {
    expect(audit([limit(), sellSwap({ bitmap: true })], { hasBitmapExtension: true }).ok).toBe(true);
  });

  it("fits in one legacy transaction", () => {
    expect(wire([limit(), createAccount(USDC_MINT, TOKEN), sellSwap({ binArrays: [BIN_ARRAY, BIN_ARRAY + 1n, BIN_ARRAY + 2n] })]).length).toBeLessThanOrEqual(1232);
  });
});

describe("auditSellTransaction rejects anything else before the wallet", () => {
  const cases: [string, () => ReturnType<typeof audit>, RegExp][] = [
    // Recipient and owner are the connected wallet.
    ["USDC paid out to someone else's account", () => audit([limit(), sellSwap({ tokenOut: ata(STRANGER, USDC_MINT, TOKEN) })]), /swap: account 5/],
    ["NVDAx taken from someone else's account", () => audit([limit(), sellSwap({ tokenIn: ata(STRANGER, NVDAX_MINT, TOKEN_2022) })]), /swap: account 4/],
    ["the purchase direction (USDC in, NVDAx out)", () => audit([limit(), sellSwap({ tokenIn: USER_USDC, tokenOut: USER_NVDAX })]), /swap: account 4/],
    ["a USDC account created for someone else", () => audit([limit(), createAccount(USDC_MINT, TOKEN, STRANGER), sellSwap()]), /token account: account 1/],
    ["an NVDAx account creation", () => audit([limit(), createAccount(NVDAX_MINT, TOKEN_2022), sellSwap()]), /mint is not part of the route/],
    ["a non-idempotent account creation", () => audit([limit(), createAccount(USDC_MINT, TOKEN, USER, 0), sellSwap()]), /only idempotent creation/],
    ["a duplicate USDC account creation", () => audit([limit(), createAccount(USDC_MINT, TOKEN), createAccount(USDC_MINT, TOKEN), sellSwap()]), /duplicate creation/],
    ["another fee payer", () => audit(sellInstructions(), {}, STRANGER), /fee payer/],
    ["another signer on the swap", () => audit([limit(), sellSwap({ signer: STRANGER })]), /unexpected signer/],
    // Only the fixed pool.
    ["a swap in a different pool", () => audit([limit(), sellSwap({ pool: STRANGER })]), /swap: account 0/],
    ["a bin array the quote did not use", () => audit([limit(), sellSwap({ binArrays: [BIN_ARRAY + 1n] })]), /swap: account 16/],
    ["an extra account after the bin arrays", () => audit([limit(), sellSwap({ extraKeys: 1 })]), /expected 17 accounts/],
    ["transfer-hook accounts in the remaining-accounts info", () => audit([limit(), sellSwap({ remaining: "0200000000010100" })]), /unexpected extra accounts/],
    ["another DLMM instruction than swap2", () => audit([limit(), sellSwap({ discriminator: "f8c69e91e17587c8" })]), /not the expected swap instruction/],
    ["a bitmap extension the pool does not have", () => audit([limit(), sellSwap({ bitmap: true })]), /swap: account 1/],
    ["a second swap", () => audit([limit(), sellSwap(), sellSwap()]), /must be the last instruction/],
    ["no swap", () => audit([limit()]), /exactly one swap/],
    ["an instruction after the swap", () => audit([limit(), sellSwap(), createAccount(USDC_MINT, TOKEN)]), /must be the last instruction|must precede the swap/],
    ["an unknown program", () => audit([limit(), new TransactionInstruction({ programId: STRANGER, keys: [], data: Buffer.alloc(0) }), sellSwap()]), /program is not allowed/],
    ["a memo instruction", () => audit([limit(), new TransactionInstruction({ programId: MEMO, keys: [], data: Buffer.from("x") }), sellSwap()]), /program is not allowed/],
    ["a System transfer", () => audit([limit(), SystemProgram.transfer({ fromPubkey: USER, toPubkey: STRANGER, lamports: 1 }), sellSwap()]), /program is not allowed/],
    ["a token-program instruction", () => audit([limit(), new TransactionInstruction({ programId: TOKEN_2022, keys: [key(USER_NVDAX, false, true)], data: Buffer.from([9]) }), sellSwap()]), /program is not allowed/],
    // Encoded amounts equal the reviewed ones.
    ["an encoded input above the reviewed amount", () => audit([limit(), sellSwap({}, NVDAX_IN + 1n)]), /encoded input differs/],
    ["an encoded minimum below the reviewed minimum", () => audit([limit(), sellSwap({}, NVDAX_IN, USDC_MIN - 1n)]), /encoded minimum differs/],
    ["an encoded minimum of zero", () => audit([limit(), sellSwap({}, NVDAX_IN, 0n)]), /encoded minimum differs/],
    // Compute budget: a bounded limit, no price.
    ["a compute-unit price", () => audit([limit(), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }), sellSwap()]), /compute budget: unexpected instruction/],
    ["a compute-unit price alone", () => audit([ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }), sellSwap()]), /compute budget: unexpected instruction/],
    ["a compute-unit limit above the ceiling", () => audit([limit(PURCHASE_CONFIG.sellComputeUnitLimit + 1), sellSwap()]), /limit above the route's ceiling/],
    ["a second compute-unit limit", () => audit([limit(), limit(), sellSwap()]), /compute budget: duplicate/],
    ["no compute-unit limit", () => audit([sellSwap()]), /compute-unit limit is missing/],
    ["a heap-frame request", () => audit([ComputeBudgetProgram.requestHeapFrame({ bytes: 64 * 1024 }), limit(), sellSwap()]), /compute budget: unexpected instruction/],
    ["a compute-unit limit after the swap", () => audit([sellSwap(), limit()]), /must be the last instruction|must precede the swap/],
  ];
  for (const [name, run, reason] of cases) {
    it(`rejects ${name}`, () => {
      const result = run();
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(reason);
    });
  }

  it("rejects an invalid wallet address", () => {
    const result = auditSellTransaction(auditShapeOf(wire(sellInstructions())), { ...EXPECTATION, user: "not-a-key" });
    expect(result).toEqual({ ok: false, reason: "wallet address is not valid" });
  });

  it("rejects an empty transaction shape", () => {
    expect(auditSellTransaction({ feePayer: USER.toBase58(), instructions: [] }, EXPECTATION)).toEqual({ ok: false, reason: "no instructions" });
  });
});

describe("sale amount bounds (independent of the builder's own checks)", () => {
  const AMOUNTS = { inputRaw: NVDAX_IN, usdcOutRaw: USDC_OUT, minimumUsdcOutRaw: USDC_MIN };

  it("the fixture minimum sits exactly on the 1% slippage floor", () => {
    expect(sellAmountFailure(AMOUNTS)).toBeNull();
    expect(sellAmountFailure({ ...AMOUNTS, usdcOutRaw: USDC_OUT + 200n })).toMatch(/below the slippage tolerance/);
  });

  it("accepts a quoted output of exactly the per-sale limit", () => {
    const out = PURCHASE_CONFIG.maxUsdcOutRaw;
    expect(sellAmountFailure({ inputRaw: NVDAX_IN, usdcOutRaw: out, minimumUsdcOutRaw: (out * 99n) / 100n })).toBeNull();
  });

  const cases: [string, Partial<SellAuditExpectation>, RegExp][] = [
    ["a quoted output above the per-sale limit", { usdcOutRaw: PURCHASE_CONFIG.maxUsdcOutRaw + 1n, minimumUsdcOutRaw: PURCHASE_CONFIG.maxUsdcOutRaw }, /above the per-sale limit/],
    ["a zero NVDAx input", { inputRaw: 0n }, /NVDAx input is not positive/],
    ["a negative NVDAx input", { inputRaw: -1n }, /NVDAx input is not positive/],
    ["a zero quoted output", { usdcOutRaw: 0n, minimumUsdcOutRaw: 0n }, /quoted USDC output is not positive/],
    ["a zero USDC minimum", { minimumUsdcOutRaw: 0n }, /USDC minimum is not positive/],
    ["a USDC minimum above the quoted output", { minimumUsdcOutRaw: USDC_OUT + 1n }, /above the quoted output/],
    ["a USDC minimum below the slippage floor", { minimumUsdcOutRaw: USDC_MIN - 1n }, /below the slippage tolerance/],
  ];
  for (const [name, change, reason] of cases) {
    it(`the audit rejects ${name}, even when the swap encodes the same numbers`, () => {
      const expectation = { ...EXPECTATION, ...change };
      const amountIn = expectation.inputRaw > 0n ? expectation.inputRaw : 1n;
      const minimum = expectation.minimumUsdcOutRaw > 0n ? expectation.minimumUsdcOutRaw : 0n;
      const result = audit([limit(), sellSwap({}, amountIn, minimum)], expectation);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(reason);
    });
  }
});

describe("legacy-only decoding of the sale's wire bytes (fail closed)", () => {
  it("decodes the builder's legacy transaction", () => {
    expect(legacyAuditShapeOf(wire(sellInstructions()))?.instructions).toHaveLength(2);
  });

  it("refuses bytes beyond the one transaction they decode to", () => {
    expect(legacyAuditShapeOf(Uint8Array.from([...wire(sellInstructions()), 0]))).toBeNull();
  });

  it("refuses a versioned (v0) message carrying the same instructions", () => {
    const message = new TransactionMessage({ payerKey: USER, recentBlockhash: BLOCKHASH, instructions: sellInstructions() }).compileToV0Message();
    const bytes = new VersionedTransaction(message).serialize();
    expect(legacyAuditShapeOf(bytes)).toBeNull();
    expect(auditSellWire(bytes, EXPECTATION)).toEqual({ ok: false, reason: "transaction is not a decodable legacy transaction" });
  });

  const garbage: [string, Uint8Array][] = [
    ["empty bytes", new Uint8Array(0)],
    ["a signature count alone", Uint8Array.from([1])],
    ["a signature count of 128 or more", Uint8Array.from([0x80, 0x01, ...new Uint8Array(64)])],
    ["a truncated transaction", wire(sellInstructions()).subarray(0, 100)],
    ["one trailing byte after the transaction", Uint8Array.from([...wire(sellInstructions()), 7])],
    ["a second transaction appended", Uint8Array.from([...wire(sellInstructions()), ...wire(sellInstructions())])],
    ["random bytes", Uint8Array.from({ length: 300 }, (_, index) => (index * 37 + 11) % 256)],
  ];
  for (const [name, bytes] of garbage) {
    it(`fails closed on ${name}`, () => {
      const result = auditSellWire(bytes, EXPECTATION);
      expect(result.ok).toBe(false);
    });
  }
});
