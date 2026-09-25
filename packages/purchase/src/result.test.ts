import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";

import { measurePurchase, tokenDeltaRaw, type FinalizedTransactionMeta } from "./result";
import { NVDAX_MINT, USDC_MINT } from "./route";

// Synthetic addresses in the shape of a finalized `getTransaction` response
// (`encoding: json`, `maxSupportedTransactionVersion: 0`). Not real wallets.
const WALLET = new PublicKey(new Uint8Array(32).fill(7)).toBase58();
const OTHER = new PublicKey(new Uint8Array(32).fill(9)).toBase58();
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const NVDAX = NVDAX_MINT.toBase58();
const USDC = USDC_MINT.toBase58();

function balance(accountIndex: number, mint: string, owner: string, amount: string, decimals: number, programId: string) {
  return { accountIndex, mint, owner, programId, uiTokenAmount: { amount, decimals, uiAmount: null, uiAmountString: amount } };
}

/** A recorded-shape fixture: the wallet's NVDAx account is created by this transaction (no pre entry). */
const FINALIZED: FinalizedTransactionMeta = {
  err: null,
  preTokenBalances: [
    balance(1, USDC, WALLET, "5000000", 6, TOKEN_PROGRAM),
    balance(3, USDC, OTHER, "104410121597", 6, TOKEN_PROGRAM),
    balance(4, NVDAX, OTHER, "179879402245", 8, TOKEN_2022),
  ],
  postTokenBalances: [
    balance(1, USDC, WALLET, "4000000", 6, TOKEN_PROGRAM),
    balance(2, NVDAX, WALLET, "441990", 8, TOKEN_2022),
    balance(3, USDC, OTHER, "104411121597", 6, TOKEN_PROGRAM),
    balance(4, NVDAX, OTHER, "179878960255", 8, TOKEN_2022),
  ],
};

describe("tokenDeltaRaw", () => {
  it("counts a missing pre entry as zero", () => {
    expect(tokenDeltaRaw(FINALIZED.preTokenBalances!, FINALIZED.postTokenBalances!, WALLET, NVDAX)).toBe(441_990n);
  });

  it("sums every account of the owner and mint", () => {
    const pre = [balance(1, NVDAX, WALLET, "10", 8, TOKEN_2022), balance(2, NVDAX, WALLET, "5", 8, TOKEN_2022)];
    const post = [balance(1, NVDAX, WALLET, "20", 8, TOKEN_2022), balance(2, NVDAX, WALLET, "5", 8, TOKEN_2022)];
    expect(tokenDeltaRaw(pre, post, WALLET, NVDAX)).toBe(10n);
  });

  it("keeps full precision above 2^53", () => {
    const pre = [balance(1, NVDAX, WALLET, "9007199254740993", 8, TOKEN_2022)];
    const post = [balance(1, NVDAX, WALLET, "9007199254740995", 8, TOKEN_2022)];
    expect(tokenDeltaRaw(pre, post, WALLET, NVDAX)).toBe(2n);
  });

  it("rejects malformed amounts", () => {
    expect(tokenDeltaRaw([], [balance(1, NVDAX, WALLET, "1.5", 8, TOKEN_2022)], WALLET, NVDAX)).toBeNull();
    expect(tokenDeltaRaw([], [balance(1, NVDAX, WALLET, "-1", 8, TOKEN_2022)], WALLET, NVDAX)).toBeNull();
  });
});

describe("measurePurchase", () => {
  it("measures NVDAx received and USDC paid for the approving wallet only", () => {
    expect(measurePurchase(FINALIZED, WALLET)).toEqual({ nvdaxDeltaRaw: 441_990n, usdcPaidRaw: 1_000_000n, payToken: "USDC", paidRaw: 1_000_000n });
    expect(measurePurchase(FINALIZED, OTHER)).toEqual({ nvdaxDeltaRaw: -441_990n, usdcPaidRaw: -1_000_000n, payToken: "USDC", paidRaw: -1_000_000n });
  });

  it("reports SOL paid as unknown when the fee payer ended with more lamports", () => {
    expect(measurePurchase({ ...FINALIZED, preBalances: [2_000_000], postBalances: [1_000_000] }, WALLET, "SOL")?.paidRaw).toBe(1_000_000n);
    expect(measurePurchase({ ...FINALIZED, preBalances: [1_000_000], postBalances: [2_000_000] }, WALLET, "SOL")?.paidRaw).toBeNull();
  });

  it("reports an unreadable result instead of guessing", () => {
    expect(measurePurchase(null, WALLET)).toBeNull();
    expect(measurePurchase({ err: null, preTokenBalances: null, postTokenBalances: [] }, WALLET)).toBeNull();
    expect(measurePurchase({ ...FINALIZED, err: { InstructionError: [2, { Custom: 6004 }] } }, WALLET)).toBeNull();
  });
});
