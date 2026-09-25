/**
 * Tracking of one user-sent signature by polling (design contract section 5):
 * `getSignatureStatuses` every `statusPollIntervalMs`, doubling up to
 * `statusPollMaxIntervalMs` while the relay answers 429, stopping at a
 * terminal status or after `statusPollTimeoutMs`. `dropped` is reported only
 * when the current block height is past the transaction's
 * `lastValidBlockHeight` and a status read with transaction-history search
 * still finds nothing.
 *
 * It only reads. It never resends, rebuilds or asks the wallet for anything.
 * Clock, sleep and RPC are injected so the rules are unit tested.
 */

import { PURCHASE_CONFIG } from "./config";
import type { PurchaseAction } from "./purchase-machine";
import type { PurchaseRpc, RelayFailure, SignatureStatusRead } from "./rpc";

export interface TrackerDeps {
  rpc: PurchaseRpc;
  dispatch: (action: PurchaseAction) => void;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  /** Classify a thrown read error; `null` means it was not a relay failure. */
  relayFailureOf: (error: unknown) => RelayFailure | null;
  isCancelled: () => boolean;
}

export interface TrackOptions {
  signature: string;
  lastValidBlockHeight: number;
  /** Status already seen before this run (after "Check again" from a confirmed state). */
  alreadyConfirmed: boolean;
  /** "Check again": exactly one status read, then stop again if nothing is final. */
  singleRead: boolean;
}

export interface PollLimits {
  baseMs: number;
  maxMs: number;
  timeoutMs: number;
}

export const POLL_LIMITS: PollLimits = {
  baseMs: PURCHASE_CONFIG.statusPollIntervalMs,
  maxMs: PURCHASE_CONFIG.statusPollMaxIntervalMs,
  timeoutMs: PURCHASE_CONFIG.statusPollTimeoutMs,
};

/** Next wait: double (to the ceiling) after a relay 429, otherwise the base interval. */
export function nextPollInterval(currentMs: number, rateLimited: boolean, limits: { baseMs: number; maxMs: number } = POLL_LIMITS): number {
  return rateLimited ? Math.min(currentMs * 2, limits.maxMs) : limits.baseMs;
}

/** Compact, stable text for an on-chain error value (shown under "Technical details"). */
export function transactionErrorCode(err: unknown): string {
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err) ?? "unknown";
  } catch {
    return "unknown";
  }
}

type Observation = "pending" | "confirmed" | "terminal";

function observe(status: SignatureStatusRead | null, options: TrackOptions, deps: TrackerDeps): Observation | "missing" {
  if (!status) return "missing";
  if (status.err !== null && status.err !== undefined) {
    deps.dispatch({ type: "statusFailed", signature: options.signature, errorCode: transactionErrorCode(status.err) });
    return "terminal";
  }
  if (status.confirmationStatus === "finalized") {
    deps.dispatch({ type: "statusObserved", signature: options.signature, status: "finalized", now: deps.now() });
    return "terminal";
  }
  if (status.confirmationStatus === "confirmed") {
    deps.dispatch({ type: "statusObserved", signature: options.signature, status: "confirmed", now: deps.now() });
    return "confirmed";
  }
  return "pending";
}

/** Poll one signature until it is final, dropped, or the cap is reached. Resolves when tracking stops. */
export async function trackSignature(options: TrackOptions, deps: TrackerDeps, limits: PollLimits = POLL_LIMITS): Promise<void> {
  const startedAt = deps.now();
  let intervalMs = limits.baseMs;
  let lastReadFailed = false;
  let confirmed = options.alreadyConfirmed;

  for (;;) {
    if (deps.isCancelled()) return;
    let rateLimited = false;
    try {
      let observation = observe(await deps.rpc.signatureStatus(options.signature, false), options, deps);
      if (observation === "missing" && !confirmed) {
        const height = await deps.rpc.blockHeight();
        if (height > options.lastValidBlockHeight) {
          observation = observe(await deps.rpc.signatureStatus(options.signature, true), options, deps);
          if (observation === "missing") {
            deps.dispatch({ type: "droppedDetected", signature: options.signature });
            return;
          }
        }
      }
      if (observation === "terminal") return;
      if (observation === "confirmed") confirmed = true;
      lastReadFailed = false;
    } catch (error) {
      if (deps.isCancelled()) return;
      const failure = deps.relayFailureOf(error) ?? "unavailable";
      rateLimited = failure === "rateLimited";
      lastReadFailed = true;
    }
    if (deps.isCancelled()) return;
    intervalMs = nextPollInterval(intervalMs, rateLimited, limits);
    if (options.singleRead || deps.now() - startedAt + intervalMs > limits.timeoutMs) {
      deps.dispatch({ type: "trackingStopped", signature: options.signature, reason: lastReadFailed ? "relay" : "cap" });
      return;
    }
    await deps.sleep(intervalMs);
  }
}
