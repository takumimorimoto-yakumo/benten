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

import { parsePayTokenInput, parseScaledInput, type AmountError, type AmountParse } from "./amount";
import { PURCHASE_CONFIG } from "./config";
import { PAY_CONFIG } from "./pay-config";
import { NVDAX_DECIMALS, PAY_TOKEN_UNITS, resolvePayToken, type PayTokenId } from "./token-units";
import { DEFAULT_PRODUCT, resolveProductTicker, type ProductTicker } from "./routes-table";
import type { MeasuredResult } from "./result";

/**
 * Which way the panel trades on the one fixed pool: `buy` pays a pay token
 * for NVDAx; `sell` sells NVDAx for USDC (the same route reversed). One
 * state holds one side for its whole life.
 */
export type TradeSide = "buy" | "sell";

/**
 * What a sale amount is checked against besides the balance: the NVDAx
 * display multiplier in effect (the field takes display units) and the cap,
 * the NVDAx amount (raw) the pool quotes at the USDC limit per sale.
 */
export type SellTerms =
  | { kind: "unknown" }
  | { kind: "loading" }
  | { kind: "loaded"; multiplier: string; capRaw: bigint }
  | { kind: "unavailable" };

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
 * product's pinned pool then takes as its exact input.
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
  /** The product this preview buys (a routes-table key); `outputRaw` and the minimum are in its raw units. */
  product: ProductTicker;
  /**
   * Absent or `buy`: a purchase. `sell`: a sale, where `inputRaw` and
   * `consumedInputRaw` are raw NVDAx, `outputRaw` and `minimumOutputRaw` raw
   * USDC, and `payToken` is `USDC` (the token received).
   */
  side?: TradeSide;
  /** A sale may create the wallet's USDC account (a purchase reports `createsNvdaxAccount`). */
  createsUsdcAccount?: boolean;
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
  /** `null` when the product's display multiplier could not be read (named for the first product). */
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
  /** The product the approved preview bought. */
  product: ProductTicker;
  /** Absent or `buy`: a purchase; `sell`: a sale (`inputRaw` is raw NVDAx). */
  side?: TradeSide;
  payToken: PayTokenId;
  inputRaw: bigint;
  steps: TrackingSteps;
}

export interface PurchaseResultView extends MeasuredResult {
  nvdaxMultiplier: MultiplierReading | null;
}

/**
 * `overLimit`: the route quote converts a SOL or SKR amount to more than the
 * per-transaction USDC limit (`details` holds the quoted raw USDC).
 * `sellTermsChanged` (sales only): the NVDAx display multiplier in effect
 * differs from the one the amount was converted with; the sale terms are
 * read again before another preview.
 */
export type PreviewFailure = "notEnoughSol" | "simulationFailed" | "routeCheck" | "relayBusy" | "relayUnavailable" | "overLimit" | "sellTermsChanged";

export type Attempt =
  | { phase: "editing" }
  | { phase: "previewing"; requestId: number; inputRaw: bigint; payToken: PayTokenId; product: ProductTicker; sellMultiplier?: string }
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
  /** Fixed for the life of the state (`INITIAL_PURCHASE_STATE` or `INITIAL_SELL_STATE`). */
  side: TradeSide;
  /** Only used on the sell side: the multiplier and cap the NVDAx field is checked against. */
  sellTerms: SellTerms;
  detection: "pending" | "done";
  wallets: WalletOption[];
  /** Names of detected wallets that lack the sign-and-send feature or Solana mainnet. */
  unsupportedWallets: string[];
  connection: ConnectionState;
  connectNotice: "rejected" | "failed" | null;
  /** The token the panel pays with (allowlist: `PAY_TOKEN_IDS`). `balance` is this token's. */
  payToken: PayTokenId;
  /** The product the panel buys (allowlist: the routes table), set by the buy flow of the product page. */
  product: ProductTicker;
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
  | { type: "productSelected"; product: string }
  | { type: "balanceLoaded"; address: string; raw: bigint; payToken?: PayTokenId }
  | { type: "balanceFailed"; address: string; payToken?: PayTokenId }
  | { type: "sellTermsRequested" }
  | { type: "sellTermsLoaded"; address: string; multiplier: string; capRaw: bigint }
  | { type: "sellTermsFailed"; address: string }
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
  side: "buy",
  sellTerms: { kind: "unknown" },
  detection: "pending",
  wallets: [],
  unsupportedWallets: [],
  connection: { kind: "disconnected" },
  connectNotice: null,
  payToken: "USDC",
  product: DEFAULT_PRODUCT,
  balance: { kind: "unknown" },
  amountText: "",
  amountError: null,
  attempt: { phase: "editing" },
  nextRequestId: 1,
  unresolvedRequestAddress: null,
};

/** The sell panel's starting state: the same machine, selling NVDAx for USDC. */
export const INITIAL_SELL_STATE: PurchaseState = { ...INITIAL_PURCHASE_STATE, side: "sell", product: "NVDA" };

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

/**
 * The product the panel shows: the one the attempt is about once there is a
 * request, preview or sent transaction (it may differ from the page the
 * panel is on while a sent purchase is tracked), otherwise the selected one.
 */
export function attemptProduct(state: Pick<PurchaseState, "product" | "attempt">): ProductTicker {
  const attempt = state.attempt;
  if ("tracking" in attempt) return attempt.tracking.product;
  if ("preview" in attempt) return attempt.preview.product;
  if (attempt.phase === "previewing") return attempt.product;
  return state.product;
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
  if (state.balance.kind !== "loaded") return null;
  return state.side === "sell" ? state.balance.raw : spendableRaw(state.payToken, state.balance.raw);
}

/**
 * The most NVDAx (raw) one sale may use: the smaller of the whole balance and
 * the cap at the USDC limit. `null` until both are read.
 */
export function sellMaxRaw(state: Pick<PurchaseState, "balance" | "sellTerms">): bigint | null {
  if (state.balance.kind !== "loaded" || state.sellTerms.kind !== "loaded") return null;
  return state.balance.raw < state.sellTerms.capRaw ? state.balance.raw : state.sellTerms.capRaw;
}

/**
 * Parse the amount field. Buying: in the selected pay token (USDC keeps its
 * raw limit; SOL and SKR are limited in USD terms at preview). Selling: NVDAx
 * display units through the multiplier read with the cap, checked against the
 * cap and the balance; `notReady` until both are read.
 */
export function parsePayAmount(state: Pick<PurchaseState, "payToken" | "amountText"> & Partial<Pick<PurchaseState, "side" | "sellTerms">>, balanceRaw: bigint | null): AmountParse {
  if (state.side !== "sell") return parsePayTokenInput(state.amountText, state.payToken, balanceRaw);
  const display = parseScaledInput(state.amountText, NVDAX_DECIMALS, "1");
  if (!display.ok && display.error !== "zero") return display;
  const terms = state.sellTerms;
  if (!terms || terms.kind !== "loaded" || balanceRaw === null) return { ok: false, error: "notReady" };
  return parseScaledInput(state.amountText, NVDAX_DECIMALS, terms.multiplier, balanceRaw, terms.capRaw);
}

function matchesTracking(attempt: Attempt, signature: string): attempt is Extract<Attempt, { tracking: Tracking }> {
  return "tracking" in attempt && attempt.tracking.signature === signature;
}

function startPreview(state: PurchaseState): PurchaseState {
  if (state.connection.kind !== "connected") return state;
  const parsed = parsePayAmount(state, balanceRawOf(state));
  if (!parsed.ok) return { ...state, amountError: parsed.error, attempt: { phase: "editing" } };
  // A sale remembers the multiplier its raw amount was converted with; the preview must be built at the same one.
  const sellMultiplier = state.side === "sell" && state.sellTerms.kind === "loaded" ? { sellMultiplier: state.sellTerms.multiplier } : {};
  return {
    ...state,
    amountError: null,
    nextRequestId: state.nextRequestId + 1,
    attempt: { phase: "previewing", requestId: state.nextRequestId, inputRaw: parsed.raw, payToken: state.payToken, product: state.product, ...sellMultiplier },
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
      if (action.preview.inputRaw !== attempt.inputRaw || action.preview.payToken !== attempt.payToken || action.preview.product !== attempt.product) return state;
      if ((action.preview.side ?? "buy") !== state.side) return state;
      // A sale preview built at another multiplier than the amount's conversion is refused and the terms read again.
      if (state.side === "sell" && action.preview.nvdaxMultiplier?.value !== attempt.sellMultiplier) {
        return { ...state, sellTerms: { kind: "unknown" }, attempt: { phase: "previewFailed", failure: "sellTermsChanged", details: null, createsNvdaxAccount: false } };
      }
      return { ...state, attempt: { phase: "reviewReady", preview: { ...action.preview, id: action.requestId }, notice: null } };
    }
    case "previewFailed": {
      if (attempt.phase !== "previewing" || attempt.requestId !== action.requestId) return state;
      return {
        ...state,
        // Changed sale terms are read again (the island reloads them from `unknown`) before the next preview.
        ...(action.failure === "sellTermsChanged" ? { sellTerms: { kind: "unknown" } as const } : {}),
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
            product: preview.product,
            ...(preview.side === "sell" ? { side: "sell" as const } : {}),
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
      return { ...state, amountText: "", amountError: null, balance: state.connection.kind === "connected" ? { kind: "unknown" } : state.balance, sellTerms: { kind: "unknown" }, attempt: { phase: "editing" } };
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
        sellTerms: { kind: "unknown" },
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
        sellTerms: { kind: "unknown" },
        amountError: null,
        // Before the send the preview is discarded; after it, the known signature keeps being tracked.
        attempt: keepAttempt ? state.attempt : { phase: "editing" },
      };
    }
    case "balanceRequested":
      return state.connection.kind === "connected" ? { ...state, balance: { kind: "loading" } } : state;
    case "payTokenSelected": {
      const payToken = resolvePayToken(action.payToken);
      // A sale always receives USDC; it has no pay token choice.
      if (state.side === "sell") return state;
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
    case "productSelected": {
      const product = resolveProductTicker(action.product);
      // A sale only sells NVDAx; it has no product choice.
      if (state.side === "sell") return state;
      if (product === null || product === state.product || isAmountLocked(state.attempt.phase)) return state;
      // A different product changes what the preview buys: the typed amount and any preview are discarded; the pay balance stays.
      return { ...state, product, amountText: "", amountError: null, attempt: { phase: "editing" } };
    }
    case "balanceLoaded":
      if (state.connection.kind !== "connected" || state.connection.address !== action.address) return state;
      if (action.payToken !== undefined && action.payToken !== state.payToken) return state;
      return { ...state, balance: { kind: "loaded", raw: action.raw } };
    case "balanceFailed":
      if (state.connection.kind !== "connected" || state.connection.address !== action.address) return state;
      if (action.payToken !== undefined && action.payToken !== state.payToken) return state;
      return { ...state, balance: { kind: "unavailable" } };
    case "sellTermsRequested":
      return state.side === "sell" && state.connection.kind === "connected" ? { ...state, sellTerms: { kind: "loading" } } : state;
    case "sellTermsLoaded":
      if (state.side !== "sell" || state.connection.kind !== "connected" || state.connection.address !== action.address) return state;
      if (action.capRaw <= 0n) return { ...state, sellTerms: { kind: "unavailable" } };
      return { ...state, sellTerms: { kind: "loaded", multiplier: action.multiplier, capRaw: action.capRaw } };
    case "sellTermsFailed":
      if (state.side !== "sell" || state.connection.kind !== "connected" || state.connection.address !== action.address) return state;
      return { ...state, sellTerms: { kind: "unavailable" } };
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
