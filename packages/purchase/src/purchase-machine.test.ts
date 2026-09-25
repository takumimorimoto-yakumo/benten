import { describe, expect, it } from "vitest";

import {
  hasUnresolvedEarlierRequest,
  INITIAL_PURCHASE_STATE,
  isAmountLocked,
  previewRemainingMs,
  purchaseReducer,
  shouldRequestWalletApproval,
  type PreviewTerms,
  type PurchaseAction,
  type PurchaseState,
} from "./purchase-machine";
import { PURCHASE_CONFIG } from "./config";

const ADDRESS = "4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi";
const OTHER_ADDRESS = "8opHzTAnfzRpPEx21XtnrVTX28YQuCpAjcn1PczScKh";
const WALLET = { id: "Test Wallet", name: "Test Wallet" };
const SIGNATURE = "5".repeat(88);
const BUILT_AT = 1_000_000;

function run(actions: PurchaseAction[], from: PurchaseState = INITIAL_PURCHASE_STATE): PurchaseState {
  return actions.reduce(purchaseReducer, from);
}

function previewTerms(overrides: Partial<Omit<PreviewTerms, "id">> = {}): Omit<PreviewTerms, "id"> {
  return {
    walletAddress: ADDRESS,
    payToken: "USDC",
    firstLeg: null,
    inputRaw: 1_000_000n,
    consumedInputRaw: 1_000_000n,
    outputRaw: 441_982n,
    minimumOutputRaw: 437_562n,
    feeRaw: 2_250n,
    protocolFeeRaw: 250n,
    feeOnInput: true,
    priceImpactPct: "0",
    builtAt: BUILT_AT,
    expiresAt: BUILT_AT + PURCHASE_CONFIG.previewTtlMs,
    nvdaxMultiplier: { value: "1.001701196801074", readAt: BUILT_AT },
    createsNvdaxAccount: false,
    lastValidBlockHeight: 500,
    wireTransaction: new Uint8Array(0),
    ...overrides,
  };
}

const CONNECTED = run([
  { type: "walletsDetected", wallets: [WALLET], unsupported: [] },
  { type: "connectRequested", walletId: WALLET.id },
  { type: "connectSucceeded", walletId: WALLET.id, walletName: WALLET.name, address: ADDRESS },
  { type: "balanceRequested" },
  { type: "balanceLoaded", address: ADDRESS, raw: 5_000_000n },
]);

const PREVIEWING = run([{ type: "amountEdited", text: "1" }, { type: "previewRequested" }], CONNECTED);
const REVIEW_READY = run([{ type: "previewSucceeded", requestId: 1, preview: previewTerms() }], PREVIEWING);
const AWAITING = purchaseReducer(REVIEW_READY, { type: "approveRequested", now: BUILT_AT + 1_000 });
const SUBMITTED = purchaseReducer(AWAITING, { type: "walletSigned", signature: SIGNATURE, now: BUILT_AT + 2_000 });
const CONFIRMED = purchaseReducer(SUBMITTED, { type: "statusObserved", signature: SIGNATURE, status: "confirmed", now: BUILT_AT + 3_000 });
const FINALIZED = purchaseReducer(CONFIRMED, { type: "statusObserved", signature: SIGNATURE, status: "finalized", now: BUILT_AT + 4_000 });
const RESULT_VIEW = { nvdaxDeltaRaw: 441_990n, usdcPaidRaw: 1_000_000n, payToken: "USDC" as const, paidRaw: 1_000_000n, nvdaxMultiplier: null };

describe("wallet connection", () => {
  it("starts undetected, then lists supported and unsupported wallets", () => {
    expect(INITIAL_PURCHASE_STATE.detection).toBe("pending");
    const state = purchaseReducer(INITIAL_PURCHASE_STATE, { type: "walletsDetected", wallets: [WALLET], unsupported: ["Old Wallet"] });
    expect(state).toMatchObject({ detection: "done", wallets: [WALLET], unsupportedWallets: ["Old Wallet"] });
  });

  it("connects only a detected wallet and records a rejected connection", () => {
    const detected = purchaseReducer(INITIAL_PURCHASE_STATE, { type: "walletsDetected", wallets: [WALLET], unsupported: [] });
    expect(purchaseReducer(detected, { type: "connectRequested", walletId: "Unknown" })).toBe(detected);
    const connecting = purchaseReducer(detected, { type: "connectRequested", walletId: WALLET.id });
    expect(connecting.connection).toEqual({ kind: "connecting", walletId: WALLET.id });
    expect(purchaseReducer(connecting, { type: "connectFailed", reason: "rejected" })).toMatchObject({ connection: { kind: "disconnected" }, connectNotice: "rejected" });
    expect(CONNECTED.connection).toEqual({ kind: "connected", walletId: WALLET.id, walletName: WALLET.name, address: ADDRESS });
    expect(CONNECTED.balance).toEqual({ kind: "loaded", raw: 5_000_000n });
  });

  it("ignores a balance for a wallet that is no longer connected", () => {
    expect(purchaseReducer(CONNECTED, { type: "balanceLoaded", address: OTHER_ADDRESS, raw: 1n }).balance).toEqual({ kind: "loaded", raw: 5_000_000n });
  });

  it("discards a preview on disconnect before the send", () => {
    for (const state of [PREVIEWING, REVIEW_READY]) {
      const next = purchaseReducer(state, { type: "walletDisconnected" });
      expect(next.connection.kind).toBe("disconnected");
      expect(next.attempt.phase).toBe("editing");
    }
  });

  it("keeps tracking the known signature after disconnect", () => {
    const next = purchaseReducer(SUBMITTED, { type: "walletDisconnected" });
    expect(next.attempt).toBe(SUBMITTED.attempt);
    expect(purchaseReducer(next, { type: "statusObserved", signature: SIGNATURE, status: "finalized", now: 9 }).attempt.phase).toBe("finalized");
  });

  it("keeps waiting for the wallet's answer if it disconnects mid-approval", () => {
    const disconnected = purchaseReducer(AWAITING, { type: "walletDisconnected" });
    expect(disconnected.attempt.phase).toBe("awaitingWallet");
    expect(purchaseReducer(disconnected, { type: "walletSigned", signature: SIGNATURE, now: 5 }).attempt.phase).toBe("submitted");
    expect(purchaseReducer(disconnected, { type: "walletRejected", now: 5 }).attempt.phase).toBe("editing");
  });
});

describe("amount and preview", () => {
  it("validates on commit and on preview, not while typing", () => {
    const typed = purchaseReducer(CONNECTED, { type: "amountEdited", text: "1.1234567" });
    expect(typed.amountError).toBeNull();
    expect(purchaseReducer(typed, { type: "amountCommitted" }).amountError).toBe("precision");
    const previewed = purchaseReducer(typed, { type: "previewRequested" });
    expect(previewed.amountError).toBe("precision");
    expect(previewed.attempt.phase).toBe("editing");
  });

  it.each([
    ["", "empty"],
    ["0", "zero"],
    ["101", "overLimit"],
    ["6", "overBalance"],
    ["1e2", "format"],
  ])("refuses to preview %j (%s)", (text, error) => {
    const state = run([{ type: "amountEdited", text }, { type: "previewRequested" }], CONNECTED);
    expect(state.amountError).toBe(error);
    expect(state.attempt.phase).toBe("editing");
  });

  it("previews only while connected", () => {
    const disconnected = run([{ type: "amountEdited", text: "1" }, { type: "previewRequested" }], { ...INITIAL_PURCHASE_STATE, amountText: "1" });
    expect(disconnected.attempt.phase).toBe("editing");
  });

  it("moves previewing -> reviewReady and ignores stale or mismatched results", () => {
    expect(PREVIEWING.attempt).toEqual({ phase: "previewing", requestId: 1, inputRaw: 1_000_000n, payToken: "USDC" });
    expect(REVIEW_READY.attempt.phase).toBe("reviewReady");
    expect(purchaseReducer(PREVIEWING, { type: "previewSucceeded", requestId: 99, preview: previewTerms() })).toBe(PREVIEWING);
    expect(purchaseReducer(PREVIEWING, { type: "previewSucceeded", requestId: 1, preview: previewTerms({ walletAddress: OTHER_ADDRESS }) })).toBe(PREVIEWING);
    expect(purchaseReducer(PREVIEWING, { type: "previewSucceeded", requestId: 1, preview: previewTerms({ inputRaw: 2n }) })).toBe(PREVIEWING);
  });

  it("locks the amount while previewing and discards a preview on edit", () => {
    expect(isAmountLocked("previewing")).toBe(true);
    expect(purchaseReducer(PREVIEWING, { type: "amountEdited", text: "2" })).toBe(PREVIEWING);
    const edited = purchaseReducer(REVIEW_READY, { type: "amountEdited", text: "2" });
    expect(edited.attempt.phase).toBe("editing");
    expect(edited.amountText).toBe("2");
  });

  it.each(["notEnoughSol", "simulationFailed", "relayBusy", "relayUnavailable"] as const)("lets the user try again after %s", (failure) => {
    const failed = purchaseReducer(PREVIEWING, { type: "previewFailed", requestId: 1, failure });
    expect(failed.attempt).toMatchObject({ phase: "previewFailed", failure });
    expect(purchaseReducer(failed, { type: "previewRequested" }).attempt).toMatchObject({ phase: "previewing", requestId: 2 });
  });

  it("does not retry after a route check failure (fail closed)", () => {
    const failed = purchaseReducer(PREVIEWING, { type: "previewFailed", requestId: 1, failure: "routeCheck", details: "pool mismatch" });
    expect(purchaseReducer(failed, { type: "previewRequested" })).toBe(failed);
  });

  it("refreshes a ready preview with a new request", () => {
    expect(purchaseReducer(REVIEW_READY, { type: "previewRequested" }).attempt).toMatchObject({ phase: "previewing", requestId: 2 });
  });
});

describe("expiry", () => {
  it("expires on the countdown tick", () => {
    const expiresAt = BUILT_AT + PURCHASE_CONFIG.previewTtlMs;
    expect(purchaseReducer(REVIEW_READY, { type: "tick", now: expiresAt - 1 })).toBe(REVIEW_READY);
    const expired = purchaseReducer(REVIEW_READY, { type: "tick", now: expiresAt });
    expect(expired.attempt.phase).toBe("previewExpired");
    expect(previewRemainingMs(previewTerms() as PreviewTerms, expiresAt + 5)).toBe(0);
  });

  it("re-checks the clock right before asking the wallet", () => {
    const late = purchaseReducer(REVIEW_READY, { type: "approveRequested", now: BUILT_AT + PURCHASE_CONFIG.previewTtlMs });
    expect(late.attempt.phase).toBe("previewExpired");
    expect(shouldRequestWalletApproval(REVIEW_READY, late)).toBe(false);
  });

  it("never approves from an expired preview; only a refresh continues", () => {
    const expired = purchaseReducer(REVIEW_READY, { type: "tick", now: BUILT_AT + PURCHASE_CONFIG.previewTtlMs });
    expect(purchaseReducer(expired, { type: "approveRequested", now: BUILT_AT })).toBe(expired);
    expect(purchaseReducer(expired, { type: "previewRequested" }).attempt.phase).toBe("previewing");
  });
});

describe("send once", () => {
  it("requests the wallet exactly once per approval, however often approve is pressed", () => {
    expect(AWAITING.attempt.phase).toBe("awaitingWallet");
    expect(shouldRequestWalletApproval(REVIEW_READY, AWAITING)).toBe(true);
    const again = purchaseReducer(AWAITING, { type: "approveRequested", now: BUILT_AT + 1_500 });
    expect(again).toBe(AWAITING);
    expect(shouldRequestWalletApproval(AWAITING, again)).toBe(false);
  });

  it("does not approve for another wallet than the one the preview was built for", () => {
    const switched = { ...REVIEW_READY, connection: { kind: "connected" as const, walletId: WALLET.id, walletName: WALLET.name, address: OTHER_ADDRESS } };
    expect(purchaseReducer(switched, { type: "approveRequested", now: BUILT_AT })).toBe(switched);
  });

  it("returns to the valid preview after a rejection, or to expired after the deadline", () => {
    const rejected = purchaseReducer(AWAITING, { type: "walletRejected", now: BUILT_AT + 2_000 });
    expect(rejected.attempt).toMatchObject({ phase: "reviewReady", notice: "rejected" });
    const lateRejection = purchaseReducer(AWAITING, { type: "walletRejected", now: BUILT_AT + PURCHASE_CONFIG.previewTtlMs });
    expect(lateRejection.attempt.phase).toBe("previewExpired");
  });

  it("treats a wallet error without signature as an unknown outcome that cannot be re-approved", () => {
    const unknown = purchaseReducer(AWAITING, { type: "walletFailed" });
    expect(unknown.attempt.phase).toBe("walletOutcomeUnknown");
    expect(purchaseReducer(unknown, { type: "approveRequested", now: BUILT_AT })).toBe(unknown);
    expect(purchaseReducer(unknown, { type: "previewRequested" })).toBe(unknown);
    expect(purchaseReducer(unknown, { type: "startNew" }).attempt.phase).toBe("editing");
  });

  it("never offers the same preview again after an unknown outcome, even on repeated or late approvals", () => {
    const unknown = purchaseReducer(AWAITING, { type: "walletFailed" });
    for (const action of [
      { type: "approveRequested", now: BUILT_AT + 2_000 },
      { type: "approveRequested", now: BUILT_AT + PURCHASE_CONFIG.previewTtlMs },
      { type: "walletRejected", now: BUILT_AT + 2_000 },
      { type: "walletFailed" },
      { type: "tick", now: BUILT_AT + PURCHASE_CONFIG.previewTtlMs },
      { type: "amountEdited", text: "2" },
    ] as PurchaseAction[]) {
      const next = purchaseReducer(unknown, action);
      expect(next, action.type).toBe(unknown);
      expect(shouldRequestWalletApproval(unknown, next), action.type).toBe(false);
    }
  });

  it("warns on every new preview for the same wallet after an unknown outcome", () => {
    const unknown = purchaseReducer(AWAITING, { type: "walletFailed" });
    expect(unknown.unresolvedRequestAddress).toBe(ADDRESS);
    expect(hasUnresolvedEarlierRequest(unknown)).toBe(false);
    const fresh = run([{ type: "startNew" }, { type: "amountEdited", text: "1" }, { type: "previewRequested" }], unknown);
    expect(hasUnresolvedEarlierRequest(fresh)).toBe(true);
    const ready = purchaseReducer(fresh, { type: "previewSucceeded", requestId: 2, preview: previewTerms() });
    expect(ready.attempt.phase).toBe("reviewReady");
    expect(hasUnresolvedEarlierRequest(ready)).toBe(true);
    // The warning survives a disconnect and reconnect of the same wallet, and does not apply to another address.
    const reconnected = run([
      { type: "walletDisconnected" },
      { type: "connectRequested", walletId: WALLET.id },
      { type: "connectSucceeded", walletId: WALLET.id, walletName: WALLET.name, address: ADDRESS },
    ], ready);
    expect(hasUnresolvedEarlierRequest(reconnected)).toBe(true);
    const other = run([
      { type: "walletDisconnected" },
      { type: "connectRequested", walletId: WALLET.id },
      { type: "connectSucceeded", walletId: WALLET.id, walletName: WALLET.name, address: OTHER_ADDRESS },
    ], ready);
    expect(hasUnresolvedEarlierRequest(other)).toBe(false);
    expect(hasUnresolvedEarlierRequest(REVIEW_READY)).toBe(false);
  });

  it("keeps a structured rejection re-approvable within the preview lifetime", () => {
    const rejected = purchaseReducer(AWAITING, { type: "walletRejected", now: BUILT_AT + 2_000 });
    expect(rejected.unresolvedRequestAddress).toBeNull();
    const again = purchaseReducer(rejected, { type: "approveRequested", now: BUILT_AT + 3_000 });
    expect(again.attempt.phase).toBe("awaitingWallet");
    expect(shouldRequestWalletApproval(rejected, again)).toBe(true);
  });

  it("ignores wallet answers outside awaitingWallet", () => {
    expect(purchaseReducer(REVIEW_READY, { type: "walletSigned", signature: SIGNATURE, now: 1 })).toBe(REVIEW_READY);
    expect(purchaseReducer(SUBMITTED, { type: "walletSigned", signature: "other", now: 1 })).toBe(SUBMITTED);
  });

  it("locks the amount and blocks a new preview after the send", () => {
    for (const state of [SUBMITTED, CONFIRMED, FINALIZED]) {
      expect(purchaseReducer(state, { type: "amountEdited", text: "3" })).toBe(state);
      expect(purchaseReducer(state, { type: "previewRequested" })).toBe(state);
      expect(purchaseReducer(state, { type: "startNew" })).toBe(state);
    }
  });
});

describe("tracking", () => {
  it("records the trail times from the preview through finality", () => {
    expect(SUBMITTED.attempt).toMatchObject({
      phase: "submitted",
      tracking: { signature: SIGNATURE, walletAddress: ADDRESS, lastValidBlockHeight: 500, steps: { reviewedAt: BUILT_AT, approvedAt: BUILT_AT + 1_000, sentAt: BUILT_AT + 2_000, confirmedAt: null } },
    });
    expect(CONFIRMED.attempt.phase).toBe("confirmed");
    expect(FINALIZED.attempt).toMatchObject({ phase: "finalized", tracking: { steps: { confirmedAt: BUILT_AT + 3_000, finalizedAt: BUILT_AT + 4_000 } } });
  });

  it("goes straight to finalized when confirmation was not observed", () => {
    const state = purchaseReducer(SUBMITTED, { type: "statusObserved", signature: SIGNATURE, status: "finalized", now: 7 });
    expect(state.attempt).toMatchObject({ phase: "finalized", tracking: { steps: { confirmedAt: 7, finalizedAt: 7 } } });
  });

  it("ignores statuses for another signature", () => {
    expect(purchaseReducer(SUBMITTED, { type: "statusObserved", signature: "x", status: "finalized", now: 1 })).toBe(SUBMITTED);
    expect(purchaseReducer(SUBMITTED, { type: "statusFailed", signature: "x", errorCode: "e" })).toBe(SUBMITTED);
  });

  it("records an on-chain failure from submitted or confirmed", () => {
    for (const state of [SUBMITTED, CONFIRMED]) {
      expect(purchaseReducer(state, { type: "statusFailed", signature: SIGNATURE, errorCode: "{\"InstructionError\":[2,{\"Custom\":6004}]}" }).attempt)
        .toMatchObject({ phase: "failedOnChain", errorCode: "{\"InstructionError\":[2,{\"Custom\":6004}]}" });
    }
  });

  it("reports dropped only from submitted", () => {
    expect(purchaseReducer(SUBMITTED, { type: "droppedDetected", signature: SIGNATURE }).attempt.phase).toBe("dropped");
    expect(purchaseReducer(CONFIRMED, { type: "droppedDetected", signature: SIGNATURE })).toBe(CONFIRMED);
  });

  it("stops at the cap and resumes with Check again, from the last seen step", () => {
    const stopped = purchaseReducer(SUBMITTED, { type: "trackingStopped", signature: SIGNATURE, reason: "cap" });
    expect(stopped.attempt).toMatchObject({ phase: "notFinalized", reason: "cap" });
    expect(purchaseReducer(stopped, { type: "checkAgain" }).attempt.phase).toBe("submitted");
    const stoppedConfirmed = purchaseReducer(CONFIRMED, { type: "trackingStopped", signature: SIGNATURE, reason: "relay" });
    expect(stoppedConfirmed.attempt).toMatchObject({ phase: "notFinalized", reason: "relay" });
    expect(purchaseReducer(stoppedConfirmed, { type: "checkAgain" }).attempt.phase).toBe("confirmed");
  });

  it("shows the measured result, or an unreadable state that can be re-read", () => {
    const result = purchaseReducer(FINALIZED, { type: "resultRead", signature: SIGNATURE, result: RESULT_VIEW });
    expect(result.attempt).toMatchObject({ phase: "result", result: RESULT_VIEW });
    const unreadable = purchaseReducer(FINALIZED, { type: "resultUnavailable", signature: SIGNATURE });
    expect(unreadable.attempt.phase).toBe("resultUnreadable");
    expect(purchaseReducer(unreadable, { type: "checkAgain" }).attempt.phase).toBe("finalized");
    expect(purchaseReducer(SUBMITTED, { type: "resultRead", signature: SIGNATURE, result: RESULT_VIEW })).toBe(SUBMITTED);
  });

  it.each(["result", "failedOnChain", "dropped"] as const)("starts a new purchase from %s with a cleared amount", (phase) => {
    const terminal = phase === "result"
      ? purchaseReducer(FINALIZED, { type: "resultRead", signature: SIGNATURE, result: RESULT_VIEW })
      : phase === "failedOnChain"
        ? purchaseReducer(SUBMITTED, { type: "statusFailed", signature: SIGNATURE, errorCode: "e" })
        : purchaseReducer(SUBMITTED, { type: "droppedDetected", signature: SIGNATURE });
    const fresh = purchaseReducer(terminal, { type: "startNew" });
    expect(fresh.attempt.phase).toBe("editing");
    expect(fresh.amountText).toBe("");
    expect(fresh.balance).toEqual({ kind: "unknown" });
  });
});
