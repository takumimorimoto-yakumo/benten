/**
 * Purchase panel state machine (design contract section 5), as a pure reducer.
 *
 * Two concerns: the wallet connection and the purchase attempt. The reducer
 * holds no timers, performs no RPC and never talks to a wallet; the panel
 * component runs those effects and feeds their outcomes back as actions.
 *
 * Send-once rule: the only transition into `awaitingWallet` is
 * `approveRequested` from `reviewReady` while the preview is still valid, and
 * `shouldRequestWalletApproval(previous, next)` is the only signal the panel
 * uses to ask the wallet. Every repeated or late `approveRequested` returns
 * the state unchanged, so one preview produces at most one wallet request
 * per approval, and nothing is ever re-requested automatically.
 */

import { parsePayTokenInput, type AmountError } from "./amount";
import { PURCHASE_CONFIG } from "./config";
import { PAY_CONFIG } from "./pay-config";
import { PAY_TOKEN_UNITS, resolvePayToken, type PayTokenId } from "./token-units";
import type { MeasuredResult } from "./result";

export interface WalletOption {
  /** Stable key for the session (the wallet's name; Wallet Standard names are unique per page). */
  id: string;
  name: string;
}

export interface MultiplierReading {
  /** Effective Scaled UI multiplier as a decimal string. */
  value: string;
  /** When it was read (epoch ms). */
  readAt: number;
}

/**
 * The first leg of a two-leg purchase (SOL or SKR in, USDC out), as quoted.
 * `usdcOutRaw` is the route's USD conversion of the pay amount, which the
 * per-transaction limit is checked against; `usdcMinimumRaw` is what the
 * fixed NVDAx pool then takes as its exact input.
 */
export interface FirstLegTerms {
  pool: string;
  usdcOutRaw: bigint;
  usdcMinimumRaw: bigint;
  /** The first pool's fee: in the pay token when `feeOnInput`, otherwise in USDC. */
  feeRaw: bigint;
  feeOnInput: boolean;
  priceImpactPct: string;
}

export interface PreviewTerms {
  id: number;
  walletAddress: string;
  /** The token the wallet pays with; `inputRaw` is in its raw units. */
  payToken: PayTokenId;
  /** `null` when paying with USDC (one leg). */
  firstLeg: FirstLegTerms | null;
  inputRaw: bigint;
  consumedInputRaw: bigint;
  outputRaw: bigint;
  minimumOutputRaw: bigint;
  feeRaw: bigint;
  protocolFeeRaw: bigint;
  feeOnInput: boolean;
  priceImpactPct: string;
  builtAt: number;
  expiresAt: number;
  /** `null` when the NVDAx display multiplier could not be read. */
  nvdaxMultiplier: MultiplierReading | null;
  createsNvdaxAccount: boolean;
  lastValidBlockHeight: number;
  /** Unsigned wire bytes that passed the allowlist audit. Empty in fixtures. */
  wireTransaction: Uint8Array;
}

export interface TrackingSteps {
  reviewedAt: number;
  approvedAt: number;
  sentAt: number;
  confirmedAt: number | null;
  finalizedAt: number | null;
}

export interface Tracking {
  signature: string;
  /** The wallet that approved the transaction; the result is measured for it. */
  walletAddress: string;
  lastValidBlockHeight: number;
  payToken: PayTokenId;
  inputRaw: bigint;
  steps: TrackingSteps;
}

export interface PurchaseResultView extends MeasuredResult {
  nvdaxMultiplier: MultiplierReading | null;
}

/** `overLimit`: the route quote converts a SOL or SKR amount to more than the per-transaction USDC limit (`details` holds the quoted raw USDC). */
export type PreviewFailure = "notEnoughSol" | "simulationFailed" | "routeCheck" | "relayBusy" | "relayUnavailable" | "overLimit";

export type Attempt =
  | { phase: "editing" }
  | { phase: "previewing"; requestId: number; inputRaw: bigint; payToken: PayTokenId }
  | { phase: "previewFailed"; failure: PreviewFailure; details: string | null; createsNvdaxAccount: boolean }
  | { phase: "reviewReady"; preview: PreviewTerms; notice: "rejected" | null }
  | { phase: "previewExpired"; preview: PreviewTerms }
  | { phase: "awaitingWallet"; preview: PreviewTerms; approvedAt: number }
  | { phase: "walletOutcomeUnknown"; preview: PreviewTerms }
  | { phase: "submitted"; tracking: Tracking }
  | { phase: "confirmed"; tracking: Tracking }
  | { phase: "notFinalized"; tracking: Tracking; reason: "cap" | "relay" }
  | { phase: "finalized"; tracking: Tracking }
  | { phase: "result"; tracking: Tracking; result: PurchaseResultView }
  | { phase: "resultUnreadable"; tracking: Tracking }
  | { phase: "failedOnChain"; tracking: Tracking; errorCode: string }
  | { phase: "dropped"; tracking: Tracking };

export type AttemptPhase = Attempt["phase"];

export type ConnectionState =
  | { kind: "disconnected" }
  | { kind: "connecting"; walletId: string }
  | { kind: "connected"; walletId: string; walletName: string; address: string };

export type BalanceState = { kind: "unknown" } | { kind: "loading" } | { kind: "loaded"; raw: bigint } | { kind: "unavailable" };

export interface PurchaseState {
  detection: "pending" | "done";
  wallets: WalletOption[];
  /** Names of detected wallets that lack the sign-and-send feature or Solana mainnet. */
  unsupportedWallets: string[];
  connection: ConnectionState;
  connectNotice: "rejected" | "failed" | null;
  /** The token the panel pays with (allowlist: `PAY_TOKEN_IDS`). `balance` is this token's. */
  payToken: PayTokenId;
  balance: BalanceState;
  amountText: string;
  amountError: AmountError | null;
  attempt: Attempt;
  nextRequestId: number;
  /**
   * Wallet address of an earlier request whose outcome is unknown (the wallet
   * threw a non-rejection error). Kept for the page session: every later
   * preview for that address warns that the earlier request may have been sent.
   */
  unresolvedRequestAddress: string | null;
}

export type TrackedStatus = "processed" | "confirmed" | "finalized";

export type PurchaseAction =
  | { type: "walletsDetected"; wallets: WalletOption[]; unsupported: string[] }
  | { type: "connectRequested"; walletId: string }
  | { type: "connectSucceeded"; walletId: string; walletName: string; address: string }
  | { type: "connectFailed"; reason: "rejected" | "failed" }
  | { type: "walletDisconnected" }
  | { type: "balanceRequested" }
  | { type: "payTokenSelected"; payToken: string }
  | { type: "balanceLoaded"; address: string; raw: bigint; payToken?: PayTokenId }
  | { type: "balanceFailed"; address: string; payToken?: PayTokenId }
  | { type: "amountEdited"; text: string }
  | { type: "amountCommitted" }
  | { type: "previewRequested" }
  | { type: "previewSucceeded"; requestId: number; preview: Omit<PreviewTerms, "id"> }
  | { type: "previewFailed"; requestId: number; failure: PreviewFailure; details?: string | null; createsNvdaxAccount?: boolean }
  | { type: "tick"; now: number }
  | { type: "approveRequested"; now: number }
  | { type: "walletRejected"; now: number }
  | { type: "walletFailed" }
  | { type: "walletSigned"; signature: string; now: number }
  | { type: "statusObserved"; signature: string; status: TrackedStatus; now: number }
  | { type: "statusFailed"; signature: string; errorCode: string }
  | { type: "droppedDetected"; signature: string }
  | { type: "trackingStopped"; signature: string; reason: "cap" | "relay" }
  | { type: "checkAgain" }
  | { type: "resultRead"; signature: string; result: PurchaseResultView }
  | { type: "resultUnavailable"; signature: string }
  | { type: "startNew" };

export const INITIAL_PURCHASE_STATE: PurchaseState = {
  detection: "pending",
  wallets: [],
  unsupportedWallets: [],
  connection: { kind: "disconnected" },
  connectNotice: null,
  payToken: "USDC",
  balance: { kind: "unknown" },
  amountText: "",
  amountError: null,
  attempt: { phase: "editing" },
  nextRequestId: 1,
  unresolvedRequestAddress: null,
};

/** Phases after the wallet returned a signature: the known signature keeps being tracked. */
const POST_SEND_PHASES: ReadonlySet<AttemptPhase> = new Set([
  "submitted", "confirmed", "notFinalized", "finalized", "result", "resultUnreadable", "failedOnChain", "dropped",
]);
/** Phases in which the preview-driving amount field is read-only. */
const LOCKED_PHASES: ReadonlySet<AttemptPhase> = new Set([
  "previewing", "awaitingWallet", "walletOutcomeUnknown", ...POST_SEND_PHASES,
]);
/** Phases from which the user may start over. */
const RESTARTABLE_PHASES: ReadonlySet<AttemptPhase> = new Set(["result", "failedOnChain", "dropped", "walletOutcomeUnknown"]);

export function isPostSend(phase: AttemptPhase): boolean {
  return POST_SEND_PHASES.has(phase);
}

export function isAmountLocked(phase: AttemptPhase): boolean {
  return LOCKED_PHASES.has(phase);
}

/** True when the connected wallet has an earlier request whose outcome is unknown and the panel is before a new send. */
export function hasUnresolvedEarlierRequest(state: PurchaseState): boolean {
  if (state.unresolvedRequestAddress === null || state.connection.kind !== "connected") return false;
  if (isPostSend(state.attempt.phase) || state.attempt.phase === "walletOutcomeUnknown") return false;
  return state.connection.address === state.unresolvedRequestAddress;
}

/** The tracked signature, if the attempt has one. */
export function trackedSignature(attempt: Attempt): string | null {
  return "tracking" in attempt ? attempt.tracking.signature : null;
}

/** The amount the pay field may use: the balance, less the fee and deposit reserve when paying with native SOL. */
export function spendableRaw(payToken: PayTokenId, balanceRaw: bigint): bigint {
  if (!PAY_TOKEN_UNITS[payToken].native) return balanceRaw;
  const spendable = balanceRaw - PAY_CONFIG.solFeeReserveLamports;
  return spendable > 0n ? spendable : 0n;
}

function balanceRawOf(state: PurchaseState): bigint | null {
  return state.balance.kind === "loaded" ? spendableRaw(state.payToken, state.balance.raw) : null;
}

/** Parse the pay field for the selected token. USDC keeps its raw limit; SOL and SKR are limited in USD terms at preview. */
export function parsePayAmount(state: Pick<PurchaseState, "payToken" | "amountText">, balanceRaw: bigint | null) {
  return parsePayTokenInput(state.amountText, state.payToken, balanceRaw);
}

function matchesTracking(attempt: Attempt, signature: string): attempt is Extract<Attempt, { tracking: Tracking }> {
  return "tracking" in attempt && attempt.tracking.signature === signature;
}

function startPreview(state: PurchaseState): PurchaseState {
  if (state.connection.kind !== "connected") return state;
  const parsed = parsePayAmount(state, balanceRawOf(state));
  if (!parsed.ok) return { ...state, amountError: parsed.error, attempt: { phase: "editing" } };
  return {
    ...state,
    amountError: null,
    nextRequestId: state.nextRequestId + 1,
    attempt: { phase: "previewing", requestId: state.nextRequestId, inputRaw: parsed.raw, payToken: state.payToken },
  };
}

function reduceAttempt(state: PurchaseState, action: PurchaseAction): PurchaseState {
  const attempt = state.attempt;
  switch (action.type) {
    case "previewRequested": {
      if (attempt.phase === "editing" || attempt.phase === "reviewReady" || attempt.phase === "previewExpired") return startPreview(state);
      // A route check failure is fail-closed: no retry from the panel, reload only.
      if (attempt.phase === "previewFailed" && attempt.failure !== "routeCheck") return startPreview(state);
      return state;
    }
    case "previewSucceeded": {
      if (attempt.phase !== "previewing" || attempt.requestId !== action.requestId) return state;
      if (state.connection.kind !== "connected" || action.preview.walletAddress !== state.connection.address) return state;
      if (action.preview.inputRaw !== attempt.inputRaw || action.preview.payToken !== attempt.payToken) return state;
      return { ...state, attempt: { phase: "reviewReady", preview: { ...action.preview, id: action.requestId }, notice: null } };
    }
    case "previewFailed": {
      if (attempt.phase !== "previewing" || attempt.requestId !== action.requestId) return state;
      return {
        ...state,
        attempt: { phase: "previewFailed", failure: action.failure, details: action.details ?? null, createsNvdaxAccount: action.createsNvdaxAccount ?? false },
      };
    }
    case "tick": {
      if (attempt.phase === "reviewReady" && action.now >= attempt.preview.expiresAt) {
        return { ...state, attempt: { phase: "previewExpired", preview: attempt.preview } };
      }
      return state;
    }
    case "approveRequested": {
      if (attempt.phase !== "reviewReady" || state.connection.kind !== "connected") return state;
      if (state.connection.address !== attempt.preview.walletAddress) return state;
      // Second expiry check, right before the wallet: never ask the wallet for an expired preview.
      if (action.now >= attempt.preview.expiresAt) return { ...state, attempt: { phase: "previewExpired", preview: attempt.preview } };
      return { ...state, attempt: { phase: "awaitingWallet", preview: attempt.preview, approvedAt: action.now } };
    }
    case "walletRejected": {
      if (attempt.phase !== "awaitingWallet") return state;
      if (state.connection.kind !== "connected") return { ...state, attempt: { phase: "editing" } };
      if (action.now >= attempt.preview.expiresAt) return { ...state, attempt: { phase: "previewExpired", preview: attempt.preview } };
      return { ...state, attempt: { phase: "reviewReady", preview: attempt.preview, notice: "rejected" } };
    }
    case "walletFailed": {
      if (attempt.phase !== "awaitingWallet") return state;
      // Not a rejection: the wallet may have sent it. Never back to reviewReady for this preview.
      return { ...state, unresolvedRequestAddress: attempt.preview.walletAddress, attempt: { phase: "walletOutcomeUnknown", preview: attempt.preview } };
    }
    case "walletSigned": {
      if (attempt.phase !== "awaitingWallet") return state;
      const preview = attempt.preview;
      return {
        ...state,
        attempt: {
          phase: "submitted",
          tracking: {
            signature: action.signature,
            walletAddress: preview.walletAddress,
            lastValidBlockHeight: preview.lastValidBlockHeight,
            payToken: preview.payToken,
            inputRaw: preview.inputRaw,
            steps: { reviewedAt: preview.builtAt, approvedAt: attempt.approvedAt, sentAt: action.now, confirmedAt: null, finalizedAt: null },
          },
        },
      };
    }
    case "statusObserved": {
      if (!matchesTracking(attempt, action.signature)) return state;
      if (attempt.phase !== "submitted" && attempt.phase !== "confirmed") return state;
      const steps = attempt.tracking.steps;
      if (action.status === "finalized") {
        const tracking = { ...attempt.tracking, steps: { ...steps, confirmedAt: steps.confirmedAt ?? action.now, finalizedAt: action.now } };
        return { ...state, attempt: { phase: "finalized", tracking } };
      }
      if (action.status === "confirmed" && attempt.phase === "submitted") {
        return { ...state, attempt: { phase: "confirmed", tracking: { ...attempt.tracking, steps: { ...steps, confirmedAt: action.now } } } };
      }
      return state;
    }
    case "statusFailed": {
      if (!matchesTracking(attempt, action.signature)) return state;
      if (attempt.phase !== "submitted" && attempt.phase !== "confirmed") return state;
      return { ...state, attempt: { phase: "failedOnChain", tracking: attempt.tracking, errorCode: action.errorCode } };
    }
    case "droppedDetected": {
      if (!matchesTracking(attempt, action.signature) || attempt.phase !== "submitted") return state;
      return { ...state, attempt: { phase: "dropped", tracking: attempt.tracking } };
    }
    case "trackingStopped": {
      if (!matchesTracking(attempt, action.signature)) return state;
      if (attempt.phase !== "submitted" && attempt.phase !== "confirmed") return state;
      return { ...state, attempt: { phase: "notFinalized", tracking: attempt.tracking, reason: action.reason } };
    }
    case "checkAgain": {
      // One manual look-up of the known signature; never a resend.
      if (attempt.phase === "notFinalized") {
        const phase = attempt.tracking.steps.confirmedAt === null ? "submitted" : "confirmed";
        return { ...state, attempt: { phase, tracking: attempt.tracking } };
      }
      if (attempt.phase === "resultUnreadable") return { ...state, attempt: { phase: "finalized", tracking: attempt.tracking } };
      return state;
    }
    case "resultRead": {
      if (!matchesTracking(attempt, action.signature) || attempt.phase !== "finalized") return state;
      return { ...state, attempt: { phase: "result", tracking: attempt.tracking, result: action.result } };
    }
    case "resultUnavailable": {
      if (!matchesTracking(attempt, action.signature) || attempt.phase !== "finalized") return state;
      return { ...state, attempt: { phase: "resultUnreadable", tracking: attempt.tracking } };
    }
    case "startNew": {
      if (!RESTARTABLE_PHASES.has(attempt.phase)) return state;
      return { ...state, amountText: "", amountError: null, balance: state.connection.kind === "connected" ? { kind: "unknown" } : state.balance, attempt: { phase: "editing" } };
    }
    default:
      return state;
  }
}

export function purchaseReducer(state: PurchaseState, action: PurchaseAction): PurchaseState {
  switch (action.type) {
    case "walletsDetected":
      return { ...state, detection: "done", wallets: action.wallets, unsupportedWallets: action.unsupported };
    case "connectRequested": {
      if (state.connection.kind !== "disconnected" || !state.wallets.some((wallet) => wallet.id === action.walletId)) return state;
      return { ...state, connectNotice: null, connection: { kind: "connecting", walletId: action.walletId } };
    }
    case "connectSucceeded": {
      if (state.connection.kind !== "connecting" || state.connection.walletId !== action.walletId) return state;
      return {
        ...state,
        connection: { kind: "connected", walletId: action.walletId, walletName: action.walletName, address: action.address },
        balance: { kind: "unknown" },
        amountError: null,
        attempt: isPostSend(state.attempt.phase) ? state.attempt : { phase: "editing" },
      };
    }
    case "connectFailed": {
      if (state.connection.kind !== "connecting") return state;
      return { ...state, connection: { kind: "disconnected" }, connectNotice: action.reason };
    }
    case "walletDisconnected": {
      const keepAttempt = isPostSend(state.attempt.phase) || state.attempt.phase === "awaitingWallet";
      return {
        ...state,
        connection: { kind: "disconnected" },
        balance: { kind: "unknown" },
        amountError: null,
        // Before the send the preview is discarded; after it, the known signature keeps being tracked.
        attempt: keepAttempt ? state.attempt : { phase: "editing" },
      };
    }
    case "balanceRequested":
      return state.connection.kind === "connected" ? { ...state, balance: { kind: "loading" } } : state;
    case "payTokenSelected": {
      const payToken = resolvePayToken(action.payToken);
      if (payToken === null || payToken === state.payToken || isAmountLocked(state.attempt.phase)) return state;
      // A different token changes the units: the typed amount, any preview and the balance are discarded.
      return {
        ...state,
        payToken,
        amountText: "",
        amountError: null,
        balance: state.connection.kind === "connected" ? { kind: "unknown" } : state.balance,
        attempt: { phase: "editing" },
      };
    }
    case "balanceLoaded":
      if (state.connection.kind !== "connected" || state.connection.address !== action.address) return state;
      if (action.payToken !== undefined && action.payToken !== state.payToken) return state;
      return { ...state, balance: { kind: "loaded", raw: action.raw } };
    case "balanceFailed":
      if (state.connection.kind !== "connected" || state.connection.address !== action.address) return state;
      if (action.payToken !== undefined && action.payToken !== state.payToken) return state;
      return { ...state, balance: { kind: "unavailable" } };
    case "amountEdited": {
      if (isAmountLocked(state.attempt.phase)) return state;
      // Edits invalidate: any preview or preview error is discarded, never silently re-quoted.
      return { ...state, amountText: action.text, amountError: null, attempt: { phase: "editing" } };
    }
    case "amountCommitted": {
      if (state.attempt.phase !== "editing" || state.amountText.trim() === "") return state;
      const parsed = parsePayAmount(state, balanceRawOf(state));
      return { ...state, amountError: parsed.ok ? null : parsed.error };
    }
    default:
      return reduceAttempt(state, action);
  }
}

/** True exactly when `next` is the one state from which the panel asks the wallet to approve. */
export function shouldRequestWalletApproval(previous: PurchaseState, next: PurchaseState): boolean {
  return previous.attempt.phase === "reviewReady" && next.attempt.phase === "awaitingWallet";
}

/** Milliseconds left on a preview (never negative). */
export function previewRemainingMs(preview: PreviewTerms, now: number): number {
  return Math.max(0, preview.expiresAt - now);
}

/** Build the expiry for a preview built at `builtAt`. */
export function previewExpiry(builtAt: number): number {
  return builtAt + PURCHASE_CONFIG.previewTtlMs;
}
