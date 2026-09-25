/**
 * Keeps the purchase reducer's wallet part in step with the app-level wallet
 * session. The reducer and its transition rules are unchanged: the session's
 * changes are replayed as the same actions the island used to send when it
 * owned the connection (`walletsDetected`, `connectRequested`,
 * `connectSucceeded`, `connectFailed`, `walletDisconnected`), so every rule
 * about what a disconnect or an account change does to an attempt still
 * lives in the reducer. Pure: no wallet, no I/O.
 */
import { isAmountLocked, isPostSend, type AttemptPhase, type ConnectionState, type PurchaseAction } from "@benten/purchase/purchase-machine";
import type { WalletSessionState } from "@/features/wallet-session/wallet-session";

function sameConnection(left: ConnectionState, right: ConnectionState): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "disconnected" || right.kind === "disconnected") return true;
  if (left.walletId !== right.walletId) return false;
  return left.kind !== "connected" || (right.kind === "connected" && left.address === right.address);
}

/**
 * The reducer actions that move the purchase state from session `previous`
 * to session `next`. Called with the initial session as `previous` when the
 * island first installs, so a wallet connected on another page arrives as
 * `connectRequested` then `connectSucceeded`.
 */
export function sessionTransitionActions(previous: WalletSessionState, next: WalletSessionState): PurchaseAction[] {
  const actions: PurchaseAction[] = [];
  if (next.detection === "done" && (previous.detection !== "done" || previous.wallets !== next.wallets || previous.unsupported !== next.unsupported)) {
    actions.push({ type: "walletsDetected", wallets: [...next.wallets], unsupported: [...next.unsupported] });
  }
  const from = previous.connection;
  const to = next.connection;
  if (sameConnection(from, to)) return actions;
  if (to.kind === "disconnected") {
    if (from.kind === "connecting") actions.push({ type: "connectFailed", reason: next.notice ?? "failed" });
    else actions.push({ type: "walletDisconnected" });
    return actions;
  }
  const continuesAttempt = from.kind === "connecting" && to.kind === "connected" && from.walletId === to.walletId;
  if (!continuesAttempt) {
    if (from.kind !== "disconnected") actions.push({ type: "walletDisconnected" });
    actions.push({ type: "connectRequested", walletId: to.walletId });
  }
  if (to.kind === "connected") actions.push({ type: "connectSucceeded", walletId: to.walletId, walletName: to.walletName, address: to.address });
  return actions;
}

/**
 * Whether the header may disconnect: not while the panel itself keeps its
 * Disconnect disabled before a send (previewing, waiting for the wallet, or
 * an unknown wallet outcome). After a send the reducer keeps tracking the
 * approving address, so disconnecting is allowed again.
 */
export function locksDisconnect(phase: AttemptPhase): boolean {
  return isAmountLocked(phase) && !isPostSend(phase);
}

