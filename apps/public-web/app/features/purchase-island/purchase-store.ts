/**
 * The purchase panel's state holder: the pure reducer from `@benten/purchase`
 * plus a synchronous `send` that returns the previous and next state, so the
 * caller can act on exactly one transition. React subscribes through
 * `useSyncExternalStore`; nothing here performs I/O.
 */
import {
  INITIAL_PURCHASE_STATE,
  purchaseReducer,
  shouldRequestWalletApproval,
  type PurchaseAction,
  type PurchaseState,
} from "@benten/purchase/purchase-machine";
import type { ApprovalOutcome } from "@benten/purchase/wallet-standard";

export type Transition = { readonly previous: PurchaseState; readonly next: PurchaseState };

export type PurchaseStore = {
  getState(): PurchaseState;
  send(action: PurchaseAction): Transition;
  subscribe(listener: () => void): () => void;
};

export function createPurchaseStore(initial: PurchaseState = INITIAL_PURCHASE_STATE): PurchaseStore {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    send(action) {
      const previous = state;
      const next = purchaseReducer(previous, action);
      state = next;
      if (next !== previous) for (const listener of listeners) listener();
      return { previous, next };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Asks the wallet to approve and send one audited transaction. */
export type RequestWalletApproval = (walletId: string, address: string, wireTransaction: Uint8Array) => Promise<ApprovalOutcome>;

/**
 * The single place the panel asks the wallet (design contract section 5,
 * "Send once"). The wallet is called only on the reducer's one
 * `reviewReady -> awaitingWallet` transition; a repeated click while the
 * wallet is open, or after expiry, leaves the state unchanged and calls
 * nothing. Returns whether a request was made.
 */
export function approveOnce(store: PurchaseStore, requestApproval: RequestWalletApproval, now: () => number = Date.now): boolean {
  const { previous, next } = store.send({ type: "approveRequested", now: now() });
  if (!shouldRequestWalletApproval(previous, next) || next.attempt.phase !== "awaitingWallet" || previous.connection.kind !== "connected") return false;
  const preview = next.attempt.preview;
  void requestApproval(previous.connection.walletId, preview.walletAddress, preview.wireTransaction).then(
    (outcome) => {
      if (outcome.kind === "signed") store.send({ type: "walletSigned", signature: outcome.signature, now: now() });
      else if (outcome.kind === "rejected") store.send({ type: "walletRejected", now: now() });
      else store.send({ type: "walletFailed" });
    },
    // A thrown request is an unknown outcome, never a rejection.
    () => store.send({ type: "walletFailed" }),
  );
  return true;
}

/**
 * Fill the amount field from a buy-flow link (`?amount=`), after the link
 * amount passed the field's checks (`deepLinkAmountText`). Only an empty
 * field in the editing phase is filled, so a typed amount or an attempt in
 * progress is never replaced. It only edits and commits the field: no
 * preview is requested and the wallet is never asked. Returns whether the
 * field was filled.
 */
export function prefillAmount(store: PurchaseStore, text: string): boolean {
  const state = store.getState();
  if (state.attempt.phase !== "editing" || state.amountText !== "") return false;
  store.send({ type: "amountEdited", text });
  store.send({ type: "amountCommitted" });
  return true;
}
