import { describe, expect, it } from "vitest";

import { parseTokenInput } from "./amount";
import { PAY_CONFIG } from "./pay-config";
import { INITIAL_PURCHASE_STATE, purchaseReducer, spendableRaw, type PurchaseAction, type PurchaseState } from "./purchase-machine";
import { measurePurchase, type FinalizedTransactionMeta } from "./result";
import { PAY_TOKENS, SKR_MINT, USDC_MINT } from "./route";
import { resolvePayToken } from "./token-units";

const ADDRESS = "4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi";
const WALLET = { id: "Test Wallet", name: "Test Wallet" };
const NVDAX = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";

function run(actions: PurchaseAction[], from: PurchaseState = INITIAL_PURCHASE_STATE): PurchaseState {
  return actions.reduce(purchaseReducer, from);
}

const CONNECTED = run([
  { type: "walletsDetected", wallets: [WALLET], unsupported: [] },
  { type: "connectRequested", walletId: WALLET.id },
  { type: "connectSucceeded", walletId: WALLET.id, walletName: WALLET.name, address: ADDRESS },
]);

describe("resolvePayToken", () => {
  it("accepts only the exact allowlisted ids", () => {
    expect(resolvePayToken("USDC")).toBe("USDC");
    expect(resolvePayToken("SOL")).toBe("SOL");
    expect(resolvePayToken("SKR")).toBe("SKR");
    for (const value of ["usdc", "sol", " SOL", "SKR ", "BONK", "", null, undefined, 1, SKR_MINT.toBase58()]) expect(resolvePayToken(value)).toBeNull();
  });

  it("pins every non-USDC pay token to a first leg that returns USDC", () => {
    expect(PAY_TOKENS.USDC.leg).toBeNull();
    for (const id of ["SOL", "SKR"] as const) expect(PAY_TOKENS[id].leg?.tokenYMint.equals(USDC_MINT)).toBe(true);
    expect(PAY_TOKENS.SKR.mint.toBase58()).toBe("SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3");
  });
});

describe("parseTokenInput", () => {
  it("uses the token's decimals", () => {
    expect(parseTokenInput("0.123456789", 9)).toEqual({ ok: true, raw: 123_456_789n });
    expect(parseTokenInput("0.1234567890", 9)).toEqual({ ok: false, error: "precision" });
    expect(parseTokenInput("1.5", 6)).toEqual({ ok: true, raw: 1_500_000n });
  });

  it("checks the limit only when one is given, and the spendable balance", () => {
    expect(parseTokenInput("1000", 9)).toEqual({ ok: true, raw: 1_000_000_000_000n });
    expect(parseTokenInput("11", 6, null, 10_000_000n)).toEqual({ ok: false, error: "overLimit" });
    expect(parseTokenInput("2", 9, 1_000_000_000n)).toEqual({ ok: false, error: "overBalance" });
  });
});

describe("pay token in the purchase reducer", () => {
  it("switches the token, clearing the amount, preview and balance", () => {
    const typed = run([{ type: "balanceLoaded", address: ADDRESS, raw: 5_000_000n }, { type: "amountEdited", text: "1" }], CONNECTED);
    const next = purchaseReducer(typed, { type: "payTokenSelected", payToken: "SOL" });
    expect(next.payToken).toBe("SOL");
    expect(next.amountText).toBe("");
    expect(next.balance).toEqual({ kind: "unknown" });
    expect(next.attempt).toEqual({ phase: "editing" });
  });

  it("ignores ids outside the allowlist and does not switch while the amount is locked", () => {
    expect(purchaseReducer(CONNECTED, { type: "payTokenSelected", payToken: "sol" })).toBe(CONNECTED);
    expect(purchaseReducer(CONNECTED, { type: "payTokenSelected", payToken: "BONK" })).toBe(CONNECTED);
    const previewing = run([{ type: "balanceLoaded", address: ADDRESS, raw: 5_000_000n }, { type: "amountEdited", text: "1" }, { type: "previewRequested" }], CONNECTED);
    expect(previewing.attempt.phase).toBe("previewing");
    expect(purchaseReducer(previewing, { type: "payTokenSelected", payToken: "SKR" })).toBe(previewing);
  });

  it("drops a balance read for another token", () => {
    const sol = purchaseReducer(CONNECTED, { type: "payTokenSelected", payToken: "SOL" });
    expect(purchaseReducer(sol, { type: "balanceLoaded", address: ADDRESS, raw: 1n, payToken: "USDC" })).toBe(sol);
    expect(purchaseReducer(sol, { type: "balanceLoaded", address: ADDRESS, raw: 1n, payToken: "SOL" }).balance).toEqual({ kind: "loaded", raw: 1n });
  });

  it("keeps the fee and deposit reserve out of a SOL amount", () => {
    const balance = 100_000_000n;
    expect(spendableRaw("SOL", balance)).toBe(balance - PAY_CONFIG.solFeeReserveLamports);
    expect(spendableRaw("SOL", 1n)).toBe(0n);
    expect(spendableRaw("SKR", balance)).toBe(balance);
    const sol = run([{ type: "payTokenSelected", payToken: "SOL" }, { type: "balanceLoaded", address: ADDRESS, raw: balance, payToken: "SOL" }, { type: "amountEdited", text: "0.1" }, { type: "previewRequested" }], CONNECTED);
    expect(sol.amountError).toBe("overBalance");
    const fits = run([{ type: "payTokenSelected", payToken: "SOL" }, { type: "balanceLoaded", address: ADDRESS, raw: balance, payToken: "SOL" }, { type: "amountEdited", text: "0.09" }, { type: "previewRequested" }], CONNECTED);
    expect(fits.attempt).toEqual({ phase: "previewing", requestId: 1, inputRaw: 90_000_000n, payToken: "SOL" });
  });

  it("does not apply the USDC raw limit to SOL or SKR (they are limited in USD at preview)", () => {
    const skr = run([{ type: "payTokenSelected", payToken: "SKR" }, { type: "balanceLoaded", address: ADDRESS, raw: 10_000_000_000n, payToken: "SKR" }, { type: "amountEdited", text: "400" }, { type: "previewRequested" }], CONNECTED);
    expect(skr.attempt).toEqual({ phase: "previewing", requestId: 1, inputRaw: 400_000_000n, payToken: "SKR" });
  });
});

describe("measurePurchase for other pay tokens", () => {
  const entry = (accountIndex: number, mint: string, amount: string) => ({ accountIndex, mint, owner: ADDRESS, uiTokenAmount: { amount } });

  it("measures SKR paid from the SKR token balances and leaves the extra USDC visible", () => {
    const meta: FinalizedTransactionMeta = {
      err: null,
      preTokenBalances: [entry(1, SKR_MINT.toBase58(), "500000000"), entry(2, USDC_MINT.toBase58(), "0")],
      postTokenBalances: [entry(1, SKR_MINT.toBase58(), "300000000"), entry(2, USDC_MINT.toBase58(), "12000"), entry(3, NVDAX, "2570900")],
    };
    expect(measurePurchase(meta, ADDRESS, "SKR")).toEqual({ nvdaxDeltaRaw: 2_570_900n, usdcPaidRaw: -12_000n, payToken: "SKR", paidRaw: 200_000_000n });
  });

  it("measures SOL paid as the fee payer's lamport change, or null without it", () => {
    const meta: FinalizedTransactionMeta = { err: null, preTokenBalances: [], postTokenBalances: [entry(3, NVDAX, "2570900")], preBalances: [1_000_000_000, 0], postBalances: [947_955_000, 0] };
    expect(measurePurchase(meta, ADDRESS, "SOL")?.paidRaw).toBe(52_045_000n);
    expect(measurePurchase({ ...meta, preBalances: null }, ADDRESS, "SOL")?.paidRaw).toBeNull();
  });
});
