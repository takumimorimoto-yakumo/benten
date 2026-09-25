import { describe, expect, it } from "vitest";

import { attemptProduct, INITIAL_PURCHASE_STATE, purchaseReducer, type PreviewTerms, type PurchaseAction, type PurchaseState } from "./purchase-machine";
import { PURCHASE_CONFIG } from "./config";

const ADDRESS = "4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi";
const WALLET = { id: "Test Wallet", name: "Test Wallet" };
const SIGNATURE = "5".repeat(88);
const BUILT_AT = 1_000_000;

function run(actions: PurchaseAction[], from: PurchaseState = INITIAL_PURCHASE_STATE): PurchaseState {
  return actions.reduce(purchaseReducer, from);
}

function preview(product: PreviewTerms["product"]): Omit<PreviewTerms, "id"> {
  return {
    walletAddress: ADDRESS, product, payToken: "USDC", firstLeg: null, inputRaw: 2_000_000n, consumedInputRaw: 2_000_000n, outputRaw: 255_418n, minimumOutputRaw: 252_863n,
    feeRaw: 2_000n, protocolFeeRaw: 200n, feeOnInput: true, priceImpactPct: "0", builtAt: BUILT_AT, expiresAt: BUILT_AT + PURCHASE_CONFIG.previewTtlMs,
    nvdaxMultiplier: null, createsNvdaxAccount: false, lastValidBlockHeight: 500, wireTransaction: new Uint8Array(0),
  };
}

const CONNECTED = run([
  { type: "walletsDetected", wallets: [WALLET], unsupported: [] },
  { type: "connectRequested", walletId: WALLET.id },
  { type: "connectSucceeded", walletId: WALLET.id, walletName: WALLET.name, address: ADDRESS },
]);

describe("product selection in the purchase reducer", () => {
  it("starts on the default product, NVDA", () => {
    expect(INITIAL_PURCHASE_STATE.product).toBe("NVDA");
    expect(attemptProduct(INITIAL_PURCHASE_STATE)).toBe("NVDA");
  });

  it("selects a table product exactly, discarding the typed amount and any preview", () => {
    const typed = run([{ type: "amountEdited", text: "2" }], CONNECTED);
    const meta = purchaseReducer(typed, { type: "productSelected", product: "META" });
    expect(meta).toMatchObject({ product: "META", amountText: "", attempt: { phase: "editing" } });
    const ready = run([{ type: "amountEdited", text: "2" }, { type: "previewRequested" }, { type: "previewSucceeded", requestId: 1, preview: preview("META") }], meta);
    expect(ready.attempt.phase).toBe("reviewReady");
    expect(purchaseReducer(ready, { type: "productSelected", product: "TSLA" })).toMatchObject({ product: "TSLA", attempt: { phase: "editing" } });
  });

  it.each(["AMZN", "meta", "METAx", "", " META"])("ignores %j, which is not a routes-table key", (product) => {
    expect(purchaseReducer(CONNECTED, { type: "productSelected", product })).toBe(CONNECTED);
  });

  it("carries the product into the preview request and refuses a preview for another product", () => {
    const meta = run([{ type: "productSelected", product: "META" }, { type: "amountEdited", text: "2" }, { type: "previewRequested" }], CONNECTED);
    expect(meta.attempt).toMatchObject({ phase: "previewing", product: "META" });
    expect(purchaseReducer(meta, { type: "previewSucceeded", requestId: 1, preview: preview("NVDA") })).toBe(meta);
    expect(purchaseReducer(meta, { type: "previewSucceeded", requestId: 1, preview: preview("META") }).attempt.phase).toBe("reviewReady");
  });

  it("keeps a sent purchase on its own product: another page's product waits until a new purchase starts", () => {
    const sent = run([
      { type: "productSelected", product: "META" }, { type: "amountEdited", text: "2" }, { type: "previewRequested" },
      { type: "previewSucceeded", requestId: 1, preview: preview("META") }, { type: "approveRequested", now: BUILT_AT + 1_000 },
      { type: "walletSigned", signature: SIGNATURE, now: BUILT_AT + 2_000 },
    ], CONNECTED);
    expect(sent.attempt).toMatchObject({ phase: "submitted", tracking: { product: "META" } });
    const onTsla = purchaseReducer(sent, { type: "productSelected", product: "TSLA" });
    expect(onTsla).toBe(sent);
    expect(attemptProduct(onTsla)).toBe("META");
    // While the wallet is asked, the product is locked too.
    const awaiting = run([
      { type: "productSelected", product: "META" }, { type: "amountEdited", text: "2" }, { type: "previewRequested" },
      { type: "previewSucceeded", requestId: 1, preview: preview("META") }, { type: "approveRequested", now: BUILT_AT + 1_000 },
    ], CONNECTED);
    expect(purchaseReducer(awaiting, { type: "productSelected", product: "TSLA" })).toBe(awaiting);
    expect(attemptProduct(awaiting)).toBe("META");
  });
});
