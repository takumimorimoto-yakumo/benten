import { describe, expect, it } from "vitest";

import { parseScaledInput } from "./amount";
import {
  INITIAL_PURCHASE_STATE,
  INITIAL_SELL_STATE,
  parsePayAmount,
  purchaseReducer,
  sellMaxRaw,
  type PreviewTerms,
  type PurchaseAction,
  type PurchaseState,
} from "./purchase-machine";
import { PURCHASE_CONFIG } from "./config";
import { NVDAX_DECIMALS } from "./token-units";

const ADDRESS = "4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi";
const OTHER_ADDRESS = "8opHzTAnfzRpPEx21XtnrVTX28YQuCpAjcn1PczScKh";
const WALLET = { id: "Test Wallet", name: "Test Wallet" };
const MULTIPLIER = "1.001701196801074";
const BUILT_AT = 1_000_000;

function run(actions: PurchaseAction[], from: PurchaseState): PurchaseState {
  return actions.reduce(purchaseReducer, from);
}

function connect(from: PurchaseState): PurchaseState {
  return run([
    { type: "walletsDetected", wallets: [WALLET], unsupported: [] },
    { type: "connectRequested", walletId: WALLET.id },
    { type: "connectSucceeded", walletId: WALLET.id, walletName: WALLET.name, address: ADDRESS },
  ], from);
}

/** 0.2 NVDAx held (raw); the cap at the USDC limit is 0.05 NVDAx (raw). */
const BALANCE_RAW = 20_000_000n;
const CAP_RAW = 5_000_000n;

const CONNECTED = connect(INITIAL_SELL_STATE);
const READY = run([
  { type: "balanceRequested" },
  { type: "balanceLoaded", address: ADDRESS, raw: BALANCE_RAW },
  { type: "sellTermsRequested" },
  { type: "sellTermsLoaded", address: ADDRESS, multiplier: MULTIPLIER, capRaw: CAP_RAW },
], CONNECTED);

function sellPreview(overrides: Partial<Omit<PreviewTerms, "id">> = {}): Omit<PreviewTerms, "id"> {
  return {
    walletAddress: ADDRESS,
    side: "sell",
    product: "NVDA",
    payToken: "USDC",
    firstLeg: null,
    inputRaw: 1_000_000n,
    consumedInputRaw: 1_000_000n,
    outputRaw: 2_262_000n,
    minimumOutputRaw: 2_239_380n,
    feeRaw: 2_250n,
    protocolFeeRaw: 250n,
    feeOnInput: true,
    priceImpactPct: "0",
    builtAt: BUILT_AT,
    expiresAt: BUILT_AT + PURCHASE_CONFIG.previewTtlMs,
    nvdaxMultiplier: { value: MULTIPLIER, readAt: BUILT_AT },
    createsNvdaxAccount: false,
    createsUsdcAccount: false,
    lastValidBlockHeight: 500,
    wireTransaction: new Uint8Array(0),
    ...overrides,
  };
}

describe("parseScaledInput (display NVDAx to raw through the Scaled UI multiplier)", () => {
  it("divides by the multiplier and truncates", () => {
    // 1 display NVDAx / 1.001701196801074 = 0.99830169... raw NVDAx
    expect(parseScaledInput("1", NVDAX_DECIMALS, MULTIPLIER)).toEqual({ ok: true, raw: 99_830_169n });
  });

  it("is the identity at multiplier 1", () => {
    expect(parseScaledInput("0.12345678", NVDAX_DECIMALS, "1")).toEqual({ ok: true, raw: 12_345_678n });
  });

  it.each([
    ["an amount that rounds to zero raw", "0.00000001", "2", "zero"],
    ["more fraction digits than the mint has", "0.000000001", "1", "precision"],
    ["a non-number", "abc", "1", "format"],
    ["an empty field", "", "1", "empty"],
    ["a zero multiplier", "1", "0", "notReady"],
    ["a negative multiplier", "1", "-1", "notReady"],
    ["a malformed multiplier", "1", "one", "notReady"],
  ])("refuses %s", (_name, text, multiplier, error) => {
    expect(parseScaledInput(text, NVDAX_DECIMALS, multiplier)).toEqual({ ok: false, error });
  });

  it("checks the limit before the balance", () => {
    expect(parseScaledInput("1", NVDAX_DECIMALS, "1", 1n, 1n)).toEqual({ ok: false, error: "overLimit" });
    expect(parseScaledInput("1", NVDAX_DECIMALS, "1", 1n, null)).toEqual({ ok: false, error: "overBalance" });
  });
});

describe("the sale side of the purchase machine", () => {
  it("starts on the sell side and a purchase state stays a purchase", () => {
    expect(INITIAL_SELL_STATE.side).toBe("sell");
    expect(INITIAL_PURCHASE_STATE.side).toBe("buy");
  });

  it("caps one sale at the smaller of the balance and the cap at the USDC limit", () => {
    expect(sellMaxRaw(READY)).toBe(CAP_RAW);
    const small = purchaseReducer(READY, { type: "balanceLoaded", address: ADDRESS, raw: 3_000_000n });
    expect(sellMaxRaw(small)).toBe(3_000_000n);
  });

  it("has no maximum until both the balance and the terms are read", () => {
    expect(sellMaxRaw(CONNECTED)).toBeNull();
    expect(sellMaxRaw(run([{ type: "balanceLoaded", address: ADDRESS, raw: BALANCE_RAW }], CONNECTED))).toBeNull();
  });

  it("reads the field in display NVDAx and requests a preview in raw units", () => {
    const previewing = run([{ type: "amountEdited", text: "0.01" }, { type: "previewRequested" }], READY);
    expect(previewing.attempt.phase).toBe("previewing");
    if (previewing.attempt.phase === "previewing") expect(previewing.attempt.inputRaw).toBe(998_301n);
  });

  it("refuses an amount above the cap even when the balance covers it", () => {
    const state = run([{ type: "amountEdited", text: "0.1" }, { type: "amountCommitted" }], READY);
    expect(state.amountError).toBe("overLimit");
    expect(run([{ type: "previewRequested" }], state).attempt.phase).toBe("editing");
  });

  it("refuses an amount above the balance when the balance is below the cap", () => {
    const low = purchaseReducer(READY, { type: "balanceLoaded", address: ADDRESS, raw: 100_000n });
    expect(parsePayAmount({ ...low, amountText: "0.01" }, low.balance.kind === "loaded" ? low.balance.raw : null)).toEqual({ ok: false, error: "overBalance" });
  });

  it("is not ready before the terms are read, and never previews", () => {
    const loadedBalance = run([{ type: "balanceLoaded", address: ADDRESS, raw: BALANCE_RAW }, { type: "amountEdited", text: "0.01" }, { type: "amountCommitted" }], CONNECTED);
    expect(loadedBalance.amountError).toBe("notReady");
    expect(purchaseReducer(loadedBalance, { type: "previewRequested" }).attempt.phase).toBe("editing");
  });

  it("still reports a format error before the terms are read", () => {
    expect(parsePayAmount({ ...CONNECTED, amountText: "1..0" }, null)).toEqual({ ok: false, error: "format" });
  });

  it("ignores terms read for another wallet, and on a purchase state", () => {
    const other = purchaseReducer(CONNECTED, { type: "sellTermsLoaded", address: OTHER_ADDRESS, multiplier: MULTIPLIER, capRaw: CAP_RAW });
    expect(other.sellTerms.kind).toBe("unknown");
    const buy = connect(INITIAL_PURCHASE_STATE);
    expect(purchaseReducer(buy, { type: "sellTermsLoaded", address: ADDRESS, multiplier: MULTIPLIER, capRaw: CAP_RAW }).sellTerms.kind).toBe("unknown");
    expect(purchaseReducer(buy, { type: "sellTermsRequested" }).sellTerms.kind).toBe("unknown");
  });

  it("treats a zero cap or a failed read as unavailable", () => {
    expect(purchaseReducer(CONNECTED, { type: "sellTermsLoaded", address: ADDRESS, multiplier: MULTIPLIER, capRaw: 0n }).sellTerms.kind).toBe("unavailable");
    expect(purchaseReducer(CONNECTED, { type: "sellTermsFailed", address: ADDRESS }).sellTerms.kind).toBe("unavailable");
  });

  it("has no pay-token choice", () => {
    expect(purchaseReducer(READY, { type: "payTokenSelected", payToken: "SOL" }).payToken).toBe("USDC");
  });

  it("accepts only a sale preview, and a purchase state refuses one", () => {
    const previewing = run([{ type: "amountEdited", text: "0.01" }, { type: "previewRequested" }], READY);
    const inputRaw = previewing.attempt.phase === "previewing" ? previewing.attempt.inputRaw : 0n;
    const asBuy = purchaseReducer(previewing, { type: "previewSucceeded", requestId: 1, preview: sellPreview({ inputRaw, side: "buy" }) });
    expect(asBuy.attempt.phase).toBe("previewing");
    const asSell = purchaseReducer(previewing, { type: "previewSucceeded", requestId: 1, preview: sellPreview({ inputRaw }) });
    expect(asSell.attempt.phase).toBe("reviewReady");
  });

  it("carries the sell side into tracking after the wallet signs", () => {
    const previewing = run([{ type: "amountEdited", text: "0.01" }, { type: "previewRequested" }], READY);
    const inputRaw = previewing.attempt.phase === "previewing" ? previewing.attempt.inputRaw : 0n;
    const submitted = run([
      { type: "previewSucceeded", requestId: 1, preview: sellPreview({ inputRaw }) },
      { type: "approveRequested", now: BUILT_AT + 1_000 },
      { type: "walletSigned", signature: "5".repeat(88), now: BUILT_AT + 2_000 },
    ], previewing);
    expect(submitted.attempt.phase).toBe("submitted");
    if (submitted.attempt.phase === "submitted") expect(submitted.attempt.tracking.side).toBe("sell");
  });

  it("forgets the terms on disconnect and on a new wallet", () => {
    expect(purchaseReducer(READY, { type: "walletDisconnected" }).sellTerms.kind).toBe("unknown");
  });
});

describe("a multiplier switch between the amount's conversion and the preview (fails, terms read again)", () => {
  const OTHER_MULTIPLIER = "1.002";
  const previewing = run([{ type: "amountEdited", text: "0.01" }, { type: "previewRequested" }], READY);

  it("records the multiplier the amount was converted with on the request", () => {
    expect(previewing.attempt).toMatchObject({ phase: "previewing", sellMultiplier: MULTIPLIER });
  });

  it("refuses a preview built at another multiplier and reads the terms again", () => {
    const inputRaw = previewing.attempt.phase === "previewing" ? previewing.attempt.inputRaw : 0n;
    const next = purchaseReducer(previewing, { type: "previewSucceeded", requestId: 1, preview: sellPreview({ inputRaw, nvdaxMultiplier: { value: OTHER_MULTIPLIER, readAt: BUILT_AT } }) });
    expect(next.attempt).toMatchObject({ phase: "previewFailed", failure: "sellTermsChanged" });
    expect(next.sellTerms).toEqual({ kind: "unknown" });
  });

  it("refuses a sale preview without a multiplier", () => {
    const inputRaw = previewing.attempt.phase === "previewing" ? previewing.attempt.inputRaw : 0n;
    const next = purchaseReducer(previewing, { type: "previewSucceeded", requestId: 1, preview: sellPreview({ inputRaw, nvdaxMultiplier: null }) });
    expect(next.attempt).toMatchObject({ phase: "previewFailed", failure: "sellTermsChanged" });
  });

  it("accepts a preview built at the same multiplier", () => {
    const inputRaw = previewing.attempt.phase === "previewing" ? previewing.attempt.inputRaw : 0n;
    const next = purchaseReducer(previewing, { type: "previewSucceeded", requestId: 1, preview: sellPreview({ inputRaw }) });
    expect(next.attempt.phase).toBe("reviewReady");
  });

  it("reads the terms again after the preview reports the switch, and converts anew with the new multiplier", () => {
    const failed = purchaseReducer(previewing, { type: "previewFailed", requestId: 1, failure: "sellTermsChanged", details: "multiplier changed" });
    expect(failed.sellTerms).toEqual({ kind: "unknown" });
    // Retrying before the terms are read again does not start a preview.
    const early = purchaseReducer(failed, { type: "previewRequested" });
    expect(early.attempt.phase).toBe("editing");
    expect(early.amountError).toBe("notReady");
    const reloaded = run([
      { type: "sellTermsRequested" },
      { type: "sellTermsLoaded", address: ADDRESS, multiplier: OTHER_MULTIPLIER, capRaw: CAP_RAW },
      { type: "previewRequested" },
    ], early);
    const converted = parseScaledInput("0.01", NVDAX_DECIMALS, OTHER_MULTIPLIER);
    expect(converted.ok).toBe(true);
    expect(reloaded.attempt).toMatchObject({ phase: "previewing", sellMultiplier: OTHER_MULTIPLIER, inputRaw: converted.ok ? converted.raw : -1n });
  });
});
