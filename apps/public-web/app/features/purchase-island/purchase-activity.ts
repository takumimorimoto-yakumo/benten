/**
 * The purchase flow's one write interface to Activity (app IA sections 5.2,
 * addition 2, and 5.4). The purchase runtime reports each attempt at the
 * transitions below; storing and listing records belongs to the Activity
 * feature (`app/features/activity/activity-store.ts`).
 *
 * What is reported: the attempt key, the approving wallet address, the
 * signature once known, both route mints, raw integer amounts as decimal
 * strings, the phase and the transition time. Never signed or transaction
 * bytes, and never a preview number presented as a result: `receivedRaw`
 * and `paidRaw` come only from the finalized transaction's token balances.
 */
import { formatScaledUnits } from "@benten/purchase/amount";
import type { Attempt, PurchaseState, TradeSide } from "@benten/purchase/purchase-machine";
import { PAY_TOKENS, USDC_MINT, type PayTokenId } from "@benten/purchase/route";
import { productRoute, SELL_ROUTE, type ProductTicker } from "@benten/purchase/routes-table";
import { ACTIVITY_CONFIG } from "@/features/activity/activity-config";
import { activityStore, type ActivityPhase, type ActivityStore, type PurchaseAttemptInput } from "@/features/activity/activity-store";

export type PurchaseActivityPhase =
  | "opened" // the wallet was asked to approve; the outcome is not known yet
  | "rejected" // the wallet returned a structured rejection: nothing was sent
  | "outcome_unknown" // the wallet failed without a signature: it may have sent
  | "sent" // the wallet returned a signature
  | "confirmed"
  | "not_finalized" // tracking stopped before finality; check again later
  | "finalized" // finalized; amounts measured when readable
  | "failed" // processed on chain with an error
  | "dropped"; // expired without being processed

export type PurchaseActivityWrite = {
  /** Stable for one attempt from `opened` to its end: `{walletAddress}:{preview build time in ms}`. */
  readonly attemptKey: string;
  readonly walletAddress: string;
  /** `null` until the wallet returns it. */
  readonly signature: string | null;
  /** The product's pinned pool (the route the attempt used). */
  readonly routeId: string;
  readonly inputMint: string;
  readonly outputMint: string;
  /** Pay token asked to pay, raw units of `inputMint`. */
  readonly inputRaw: string;
  /** From the approved preview; present only on `opened` and `sent`. Never a result. */
  readonly expectedOutputRaw: string | null;
  readonly minimumOutputRaw: string | null;
  /** When the approved preview expires (epoch ms); present only on `opened` and `sent`. */
  readonly previewExpiresAt: number | null;
  /** Measured from the finalized transaction's token balances; `null` otherwise. */
  readonly receivedRaw: string | null;
  /** `receivedRaw` in the product's display units, with its mint's Scaled UI multiplier read at the result; `null` without it. */
  readonly receivedDisplay: string | null;
  readonly paidRaw: string | null;
  readonly phase: PurchaseActivityPhase;
  /** When this transition happened (ISO 8601 UTC). */
  readonly at: string;
};

export type PurchaseActivityWriter = (write: PurchaseActivityWrite) => void;

/** An attempt key: the approving wallet (base58) and the preview build time in ms. */
const ATTEMPT_KEY = /^([1-9A-HJ-NP-Za-km-z]{32,44}):(\d{1,19})$/;

/**
 * The Activity record id of an attempt key: the same two parts joined by
 * `_`, which Activity's id rule (`[A-Za-z0-9_-]{8,64}`) accepts. Deterministic
 * and one-to-one (a base58 address has no `_`, and 44 + 1 + 19 = 64), so
 * every transition of one attempt lands on the same record and no two
 * attempts share one; no hashing is needed. `null` for a key of any other
 * shape (never written).
 */
export function activityAttemptId(attemptKey: string): string | null {
  const match = ATTEMPT_KEY.exec(attemptKey);
  return match ? `${match[1]}_${match[2]}` : null;
}

/** The store input for one write; `null` fields of the write are left out, so they keep what the record holds. */
function attemptInput(write: PurchaseActivityWrite & { readonly phase: ActivityPhase }, attemptId: string): PurchaseAttemptInput {
  const optional = <T>(value: T | null) => (value === null ? undefined : value);
  const at = Date.parse(write.at);
  const tracked = write.phase !== "opened" && write.phase !== "outcome_unknown" && write.phase !== "sent";
  return {
    attemptId,
    walletAddress: write.walletAddress,
    genesisHash: ACTIVITY_CONFIG.mainnetGenesisHash,
    routeId: write.routeId,
    inputMint: write.inputMint,
    outputMint: write.outputMint,
    inputRaw: write.inputRaw,
    phase: write.phase,
    expectedOutputRaw: optional(write.expectedOutputRaw),
    minimumOutputRaw: optional(write.minimumOutputRaw),
    previewExpiresAt: optional(write.previewExpiresAt),
    signature: optional(write.signature),
    finalizedAt: write.phase === "finalized" ? at : undefined,
    receivedRaw: optional(write.receivedRaw),
    receivedDisplay: optional(write.receivedDisplay),
    paidRaw: optional(write.paidRaw),
    // A status the flow read from the network counts as a check of the record.
    checkedAt: tracked ? at : undefined,
  };
}

/**
 * Write one attempt transition to this browser's Activity history
 * (`recordPurchaseAttempt`). A structured rejection (`rejected`) means the
 * wallet sent nothing, so the attempt's `opened` record is withdrawn instead
 * of kept: an "outcome unknown" record would tell the investor a purchase
 * may have been sent when it was not. If they approve the same preview
 * again, `opened` creates the record anew. Never throws; a refused or
 * unavailable write changes nothing in the purchase flow.
 */
export function recordPurchaseActivity(write: PurchaseActivityWrite, store: ActivityStore = activityStore): void {
  const attemptId = activityAttemptId(write.attemptKey);
  if (!attemptId) return;
  try {
    if (write.phase === "rejected") store.withdraw(attemptId, write.walletAddress);
    else store.record(attemptInput({ ...write, phase: write.phase }, attemptId));
  } catch {
    // Activity is a convenience; the purchase flow never depends on it.
  }
}

const USDC = USDC_MINT.toBase58();

/**
 * A purchase pays `payToken` for the product; a sale (`side: "sell"`) pays
 * NVDAx for USDC on the one sale route, so its `inputRaw` is raw NVDAx.
 */
function base(walletAddress: string, reviewedAt: number, product: ProductTicker, payToken: PayTokenId, inputRaw: bigint, at: number, side: TradeSide | undefined) {
  const route = side === "sell" ? SELL_ROUTE : productRoute(product);
  const productMint = route.productMint.toBase58();
  const [inputMint, outputMint] = side === "sell" ? [productMint, USDC] : [PAY_TOKENS[payToken].mint.toBase58(), productMint];
  return { attemptKey: `${walletAddress}:${reviewedAt}`, walletAddress, routeId: route.pool.toBase58(), inputMint, outputMint, inputRaw: inputRaw.toString(), at: new Date(at).toISOString() };
}

/** A write that carries no preview number and no measured amount. */
const NO_AMOUNTS = { expectedOutputRaw: null, minimumOutputRaw: null, previewExpiresAt: null, receivedRaw: null, receivedDisplay: null, paidRaw: null } as const;

const TRACKED_PHASES: Partial<Record<Attempt["phase"], PurchaseActivityPhase>> = {
  confirmed: "confirmed",
  notFinalized: "not_finalized",
  resultUnreadable: "finalized",
  failedOnChain: "failed",
  dropped: "dropped",
};

/** The Activity write for one reducer transition, or `null` when the transition is not reported. Pure. */
export function activityWriteFor(previous: PurchaseState, next: PurchaseState, nowMs: number): PurchaseActivityWrite | null {
  const from = previous.attempt;
  const to = next.attempt;
  if (from.phase === to.phase && !(to.phase === "result" && from !== to)) return null;
  if (to.phase === "awaitingWallet" && from.phase === "reviewReady") {
    const preview = to.preview;
    return { ...base(preview.walletAddress, preview.builtAt, preview.product, preview.payToken, preview.inputRaw, nowMs, preview.side), signature: null, expectedOutputRaw: preview.outputRaw.toString(), minimumOutputRaw: preview.minimumOutputRaw.toString(), previewExpiresAt: preview.expiresAt, receivedRaw: null, receivedDisplay: null, paidRaw: null, phase: "opened" };
  }
  if (from.phase === "awaitingWallet" && (to.phase === "reviewReady" || to.phase === "previewExpired" || to.phase === "walletOutcomeUnknown")) {
    const preview = from.preview;
    return { ...base(preview.walletAddress, preview.builtAt, preview.product, preview.payToken, preview.inputRaw, nowMs, preview.side), ...NO_AMOUNTS, signature: null, phase: to.phase === "walletOutcomeUnknown" ? "outcome_unknown" : "rejected" };
  }
  if (!("tracking" in to)) return null;
  const { tracking } = to;
  const common = { ...base(tracking.walletAddress, tracking.steps.reviewedAt, tracking.product, tracking.payToken, tracking.inputRaw, nowMs, tracking.side), signature: tracking.signature };
  if (to.phase === "submitted" && from.phase === "awaitingWallet") {
    return { ...common, ...NO_AMOUNTS, expectedOutputRaw: from.preview.outputRaw.toString(), minimumOutputRaw: from.preview.minimumOutputRaw.toString(), previewExpiresAt: from.preview.expiresAt, phase: "sent" };
  }
  if (to.phase === "result" && tracking.side === "sell") {
    // Measured balance changes: USDC arrived (received), NVDAx left (paid). USDC is not a Scaled UI token, so no display amount is kept.
    const { nvdaxDeltaRaw, usdcPaidRaw } = to.result;
    return { ...common, ...NO_AMOUNTS, receivedRaw: (-usdcPaidRaw).toString(), paidRaw: (-nvdaxDeltaRaw).toString(), phase: "finalized" };
  }
  if (to.phase === "result") {
    const { nvdaxDeltaRaw, paidRaw, nvdaxMultiplier } = to.result;
    const receivedDisplay = nvdaxMultiplier && nvdaxDeltaRaw >= 0n ? formatScaledUnits(nvdaxDeltaRaw, productRoute(tracking.product).decimals, nvdaxMultiplier.value) : null;
    return { ...common, ...NO_AMOUNTS, receivedRaw: nvdaxDeltaRaw.toString(), receivedDisplay, paidRaw: paidRaw === null ? null : paidRaw.toString(), phase: "finalized" };
  }
  const phase = TRACKED_PHASES[to.phase];
  return phase ? { ...common, ...NO_AMOUNTS, phase } : null;
}
