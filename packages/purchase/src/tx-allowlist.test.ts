import { describe, expect, it } from "vitest";
import { ComputeBudgetProgram, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";

import {
  associatedTokenAddress,
  auditShapeOf,
  auditSwapTransaction,
  binArrayAddress,
  derivedPoolAccounts,
  type AuditExpectation,
} from "./tx-allowlist";

// Pool accounts observed read-only on 2026-09-24 in a no-funds build of this
// route (DLMM `lbPair` fields and the built swap's account list). They are
// independent evidence for the PDA derivations the audit relies on.
const OBSERVED = {
  pool: "F4inHs4RQARpASmvLpj45QjGLdkukeGQrtQ22pimVy2a",
  program: "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
  reserveX: "86FWMceL1zy5agA4HxyDAZxRHR86Ky7D6AhDL8VXtvsY",
  reserveY: "GZj4nNXEZ67eEvbvKzkRc8aSrS2EGH2mu2hmUA3UTeBr",
  oracle: "AMhrVuCt6Yh98bVFSWHfFnn7L25D8QzzocfCRbQfHhB7",
  eventAuthority: "D1ZN9Wj1fRSUQfCjhvnu1hqDMT7hzjzBBpi12nVniYD6",
  binArray4: "891ion4yx28nYV6RUZDyDc1fzLfqou3axv6P4TyeJDxz",
  nvdax: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
  usdc: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  token: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  token2022: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  memo: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
  ata: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
};
/** swap2 data observed for 1 USDC in and a 437562 raw NVDAx minimum. */
const OBSERVED_SWAP_DATA = "414b3f4ceb5b5b8840420f00000000003aad0600000000000200000000000100";

const USER = new PublicKey(new Uint8Array(32).fill(3));
const INPUT = 1_000_000n;
const MINIMUM = 437_562n;
const BLOCKHASH = new PublicKey(new Uint8Array(32).fill(1)).toBase58();

function key(pubkey: string | PublicKey, isSigner = false, isWritable = false) {
  return { pubkey: typeof pubkey === "string" ? new PublicKey(pubkey) : pubkey, isSigner, isWritable };
}

function userAta(mint: string, program: string): PublicKey {
  return PublicKey.findProgramAddressSync([USER.toBytes(), new PublicKey(program).toBytes(), new PublicKey(mint).toBytes()], new PublicKey(OBSERVED.ata))[0];
}

function swapData(input = INPUT, minimum = MINIMUM, remaining = "0200000000000100"): Buffer {
  const amounts = Buffer.alloc(16);
  amounts.writeBigUInt64LE(input, 0);
  amounts.writeBigUInt64LE(minimum, 8);
  return Buffer.concat([Buffer.from("414b3f4ceb5b5b88", "hex"), amounts, Buffer.from(remaining, "hex")]);
}

function swapKeys() {
  return [
    key(OBSERVED.pool, false, true),
    key(OBSERVED.program),
    key(OBSERVED.reserveX, false, true),
    key(OBSERVED.reserveY, false, true),
    key(userAta(OBSERVED.usdc, OBSERVED.token), false, true),
    key(userAta(OBSERVED.nvdax, OBSERVED.token2022), false, true),
    key(OBSERVED.nvdax),
    key(OBSERVED.usdc),
    key(OBSERVED.oracle, false, true),
    key(OBSERVED.program),
    key(USER, true, false),
    key(OBSERVED.token2022),
    key(OBSERVED.token),
    key(OBSERVED.memo),
    key(OBSERVED.eventAuthority),
    key(OBSERVED.program),
    key(OBSERVED.binArray4, false, true),
  ];
}

function swapInstruction(keys = swapKeys(), data = swapData()): TransactionInstruction {
  return new TransactionInstruction({ programId: new PublicKey(OBSERVED.program), keys, data });
}

function createNvdaxAccount(mint = OBSERVED.nvdax, program = OBSERVED.token2022, data = Buffer.from([1])): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(OBSERVED.ata),
    keys: [key(USER, true, true), key(userAta(mint, program), false, true), key(USER), key(mint), key(SystemProgram.programId), key(program)],
    data,
  });
}

function wire(instructions: TransactionInstruction[], feePayer: PublicKey = USER): Uint8Array {
  const transaction = new Transaction({ feePayer, blockhash: BLOCKHASH, lastValidBlockHeight: 1 }).add(...instructions);
  return Uint8Array.from(transaction.serialize({ requireAllSignatures: false, verifySignatures: false }));
}

const EXPECTATION: AuditExpectation = { user: USER.toBase58(), inputRaw: INPUT, minimumOutputRaw: MINIMUM, binArrayIndexes: [4n], hasBitmapExtension: false };

function audit(instructions: TransactionInstruction[], expectation: Partial<AuditExpectation> = {}, feePayer?: PublicKey) {
  return auditSwapTransaction(auditShapeOf(wire(instructions, feePayer)), { ...EXPECTATION, ...expectation });
}

const LIMIT = () => ComputeBudgetProgram.setComputeUnitLimit({ units: 90_000 });

describe("pool account derivations", () => {
  it("match the accounts observed on chain for the pinned pool", () => {
    const derived = derivedPoolAccounts();
    expect(derived.reserveX).toBe(OBSERVED.reserveX);
    expect(derived.reserveY).toBe(OBSERVED.reserveY);
    expect(derived.oracle).toBe(OBSERVED.oracle);
    expect(derived.eventAuthority).toBe(OBSERVED.eventAuthority);
    expect(binArrayAddress(4n)).toBe(OBSERVED.binArray4);
    expect(associatedTokenAddress(USER, new PublicKey(OBSERVED.usdc), new PublicKey(OBSERVED.token))).toBe(userAta(OBSERVED.usdc, OBSERVED.token).toBase58());
  });

  it("encodes the swap exactly as the observed build did", () => {
    expect(swapData().toString("hex")).toBe(OBSERVED_SWAP_DATA);
  });
});

describe("auditSwapTransaction accepts the route's own transactions", () => {
  it("accepts compute budget + swap (the observed shape)", () => {
    expect(audit([LIMIT(), swapInstruction()])).toEqual({ ok: true, createsNvdaxAccount: false, createsUsdcAccount: false });
  });

  it("accepts an idempotent NVDAx token-account creation and reports it", () => {
    expect(audit([LIMIT(), createNvdaxAccount(), swapInstruction()])).toEqual({ ok: true, createsNvdaxAccount: true, createsUsdcAccount: false });
  });

  it("accepts several derived bin arrays", () => {
    const keys = [...swapKeys(), key(binArrayAddress(5n), false, true)];
    expect(audit([LIMIT(), swapInstruction(keys)], { binArrayIndexes: [4n, 5n] }).ok).toBe(true);
  });
});

describe("auditSwapTransaction rejects anything else before the wallet", () => {
  const stranger = new PublicKey(new Uint8Array(32).fill(8));
  const cases: [string, () => ReturnType<typeof audit>, RegExp][] = [
    ["a compute-unit price (the builder never sets one)", () => audit([LIMIT(), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }), swapInstruction()]), /compute budget: unexpected instruction/],
    ["a duplicate compute-unit limit", () => audit([LIMIT(), LIMIT(), swapInstruction()]), /compute budget: duplicate/],
    ["an extra SOL transfer", () => audit([LIMIT(), SystemProgram.transfer({ fromPubkey: USER, toPubkey: stranger, lamports: 1 }), swapInstruction()]), /program is not allowed/],
    ["an unknown program", () => audit([new TransactionInstruction({ programId: stranger, keys: [], data: Buffer.alloc(0) }), swapInstruction()]), /program is not allowed/],
    ["a different pool", () => {
      const keys = swapKeys();
      keys[0] = key(stranger, false, true);
      return audit([LIMIT(), swapInstruction(keys)]);
    }, /swap: account 0/],
    ["a different reserve", () => {
      const keys = swapKeys();
      keys[2] = key(stranger, false, true);
      return audit([swapInstruction(keys)]);
    }, /swap: account 2/],
    ["a different output account (recipient)", () => {
      const keys = swapKeys();
      keys[5] = key(stranger, false, true);
      return audit([swapInstruction(keys)]);
    }, /swap: account 5/],
    ["a swapped mint order", () => {
      const keys = swapKeys();
      [keys[6], keys[7]] = [keys[7], keys[6]];
      return audit([swapInstruction(keys)]);
    }, /swap: account 6/],
    ["a wrong token program", () => {
      const keys = swapKeys();
      keys[11] = key(OBSERVED.token);
      return audit([swapInstruction(keys)]);
    }, /swap: account 11/],
    ["a bin array of another pool", () => {
      const keys = swapKeys();
      keys[16] = key(stranger, false, true);
      return audit([swapInstruction(keys)]);
    }, /swap: account 16/],
    ["an appended transfer-hook account", () => audit([swapInstruction([...swapKeys(), key(stranger)])]), /expected 17 accounts/],
    ["a non-empty transfer-hook slice", () => audit([swapInstruction(swapKeys(), swapData(INPUT, MINIMUM, "0200000000010100"))]), /unexpected extra accounts/],
    ["an input that differs from the reviewed amount", () => audit([swapInstruction(swapKeys(), swapData(INPUT + 1n))]), /encoded input differs/],
    ["a minimum that differs from the reviewed minimum", () => audit([swapInstruction(swapKeys(), swapData(INPUT, MINIMUM - 1n))]), /encoded minimum differs/],
    ["another instruction of the DLMM program", () => audit([swapInstruction(swapKeys(), Buffer.from("00".repeat(32), "hex"))]), /not the expected swap/],
    ["two swaps", () => audit([swapInstruction(), swapInstruction()]), /must be the last instruction/],
    ["a swap that is not last", () => audit([swapInstruction(), LIMIT()]), /must be the last instruction/],
    ["no swap", () => audit([LIMIT()]), /exactly one swap/],
    ["a duplicate compute budget", () => audit([LIMIT(), LIMIT(), swapInstruction()]), /duplicate/],
    ["a second signer", () => {
      const keys = swapKeys();
      keys[1] = key(stranger, true, false);
      return audit([swapInstruction(keys)]);
    }, /unexpected signer/],
    ["another fee payer", () => audit([swapInstruction()], {}, stranger), /fee payer/],
    ["another wallet than the connected one", () => audit([LIMIT(), swapInstruction()], { user: stranger.toBase58() }), /fee payer/],
    ["a token account for another mint", () => audit([createNvdaxAccount(stranger.toBase58(), OBSERVED.token2022), swapInstruction()]), /mint is not part of the route/],
    ["a token account under the wrong program", () => audit([createNvdaxAccount(OBSERVED.nvdax, OBSERVED.token), swapInstruction()]), /token account: account 1/],
    ["a non-idempotent token account creation", () => audit([createNvdaxAccount(OBSERVED.nvdax, OBSERVED.token2022, Buffer.alloc(0)), swapInstruction()]), /only idempotent/],
    ["a bitmap extension the pool does not have", () => audit([swapInstruction()], { hasBitmapExtension: true }), /swap: account 1/],
    ["bin arrays that differ from the quote", () => audit([swapInstruction()], { binArrayIndexes: [5n] }), /swap: account 16/],
  ];

  it.each(cases)("rejects %s", (_name, run, reason) => {
    const result = run();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(reason);
  });

  it("rejects an invalid wallet address", () => {
    expect(auditSwapTransaction(auditShapeOf(wire([swapInstruction()])), { ...EXPECTATION, user: "not-a-key" })).toEqual({ ok: false, reason: "wallet address is not valid" });
  });

  it("audits the decoded wire bytes, not a builder object", () => {
    // A random unrelated signer inside the wire bytes is caught after decoding.
    const other = new PublicKey(new Uint8Array(32).fill(11));
    const keys = swapKeys();
    keys[13] = key(other, true, false);
    expect(audit([swapInstruction(keys)]).ok).toBe(false);
  });
});

describe("wire bytes that are not exactly one transaction (fail closed)", () => {
  const exact = () => wire([LIMIT(), swapInstruction()]);
  it("decodes the builder's bytes, which re-serialize to themselves", () => {
    expect(auditSwapTransaction(auditShapeOf(exact()), EXPECTATION).ok).toBe(true);
  });
  const cases: [string, () => Uint8Array][] = [
    ["one trailing byte", () => Uint8Array.from([...exact(), 7])],
    ["a trailing copy of the transaction", () => Uint8Array.from([...exact(), ...exact()])],
    ["undecodable bytes", () => exact().subarray(0, 40)],
  ];
  for (const [name, bytes] of cases) {
    it(`refuses ${name}`, () => {
      expect(auditShapeOf(bytes())).toBeNull();
      expect(auditSwapTransaction(auditShapeOf(bytes()), EXPECTATION)).toEqual({ ok: false, reason: "transaction bytes do not decode to exactly one transaction" });
    });
  }
});
