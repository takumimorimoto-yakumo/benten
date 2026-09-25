/**
 * The live purchase island for the fixed-route token. Loaded only by the
 * NVDA Dossier's purchase slot after hydration (see
 * `features/dossier/purchase-slot.tsx`), so the wallet and DEX code below
 * never reaches the static page graph.
 *
 * The island installs itself into the app shell once
 * (`createInstalledPurchase`): its purchase state and its runtime (previews,
 * tracking, result reads) then live for the whole visit, so leaving the NVDA
 * page, switching tabs or coming back never drops a purchase being tracked.
 * The wallet connection is the shell's session; the runtime replays it into
 * the unchanged reducer (`session-bridge.ts`).
 *
 * Reads go only through the same-origin read-only relay; the wallet signs
 * and sends. Benten asks the wallet once per approved preview
 * (`approveOnce`, only from the panel's Approve handler) and never resends.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { PURCHASE_CONFIG } from "@benten/purchase/config";
import { clockText, nvdaxText } from "@benten/purchase/display";
import type { Attempt, PurchaseAction } from "@benten/purchase/purchase-machine";
import { measurePurchase } from "@benten/purchase/result";
import { NVDAX_SYMBOL } from "@benten/purchase/route";
import { createRelayConnection, readNvdaxMultiplier, readPayBalance, relayFailureOf, relayPurchaseRpc } from "@benten/purchase/rpc";
import { trackSignature } from "@benten/purchase/tracker";
import { requestWalletApproval } from "@benten/purchase/wallet-standard";
import { flowStepText } from "@/features/buy-flow/flow-steps";
import { useAppSession, type InstalledPurchase } from "@/features/wallet-session/app-session";
import { INITIAL_WALLET_SESSION } from "@/features/wallet-session/wallet-session";
import type { PublicWebLocale } from "@/i18n/locales";
import { purchaseMessagesFor } from "@/i18n/purchase-messages";
import { PurchasePanelView, type PanelHandlers, type PanelRefs } from "./purchase-panel-view";
import { activityWriteFor, recordPurchaseActivity } from "./purchase-activity";
import { approveOnce, createPurchaseStore, prefillPurchase, type PurchaseStore } from "./purchase-store";
import { locksDisconnect, sessionTransitionActions } from "./session-bridge";
import { PurchaseStatusLineView, STATUS_LINE_PHASES } from "./purchase-status-line";

const PREVIEW_PHASES: ReadonlySet<Attempt["phase"]> = new Set(["reviewReady", "previewExpired", "awaitingWallet"]);
const ERROR_PHASES: ReadonlySet<Attempt["phase"]> = new Set(["previewFailed", "previewExpired", "walletOutcomeUnknown", "notFinalized", "failedOnChain", "dropped"]);
const TRACKING_PHASES: ReadonlySet<Attempt["phase"]> = new Set(["submitted", "confirmed"]);
const RESTART_SOURCES: ReadonlySet<Attempt["phase"]> = new Set(["result", "failedOnChain", "dropped", "walletOutcomeUnknown"]);

export function usePanelRefs(): PanelRefs {
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const errorTitle = useRef<HTMLHeadingElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const amountInput = useRef<HTMLInputElement>(null);
  return useMemo(() => ({ previewHeading, errorTitle, resultHeading, amountInput }), []);
}

/** Move focus for the new phase (design contract section 10). */
function focusFor(previous: Attempt, next: Attempt, refs: PanelRefs): void {
  if (next.phase === previous.phase && !(next.phase === "reviewReady" && previous.phase === "reviewReady")) return;
  if (ERROR_PHASES.has(next.phase) || (next.phase === "reviewReady" && next.notice === "rejected")) refs.errorTitle.current?.focus();
  else if (next.phase === "reviewReady" && previous.phase === "previewing") refs.previewHeading.current?.focus();
  else if (next.phase === "result") refs.resultHeading.current?.focus();
  else if (next.phase === "editing" && RESTART_SOURCES.has(previous.phase)) refs.amountInput.current?.focus();
}

/**
 * Everything that must keep running while the purchase is off screen: the
 * wallet-session bridge, the USDC balance read, preview building, the expiry
 * clock, signature tracking and the result read. Renders nothing. Mounted by
 * the shell once, for the rest of the visit.
 */
function PurchaseRuntime({ store }: { store: PurchaseStore }) {
  const { session } = useAppSession();
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const [trackingRun, setTrackingRun] = useState(0);
  const singleReadRef = useRef(false);

  const send = useCallback((action: PurchaseAction) => store.send(action), [store]);

  // The shell's wallet session drives the reducer's wallet part, starting from what is already connected.
  useEffect(() => {
    let previous = INITIAL_WALLET_SESSION;
    const sync = () => {
      const next = session.getState();
      for (const action of sessionTransitionActions(previous, next)) store.send(action);
      previous = next;
    };
    sync();
    return session.subscribe(sync);
  }, [session, store]);

  // The header may not disconnect while the panel keeps its own Disconnect disabled.
  const phase = state.attempt.phase;
  useEffect(() => session.setDisconnectLocked(locksDisconnect(phase)), [session, phase]);

  // Every reported attempt transition goes to Activity (app IA 5.2, addition 2), wherever the panel is.
  useEffect(() => {
    let previous = store.getState();
    return store.subscribe(() => {
      const next = store.getState();
      const write = activityWriteFor(previous, next, Date.now());
      previous = next;
      if (write) recordPurchaseActivity(write);
    });
  }, [store]);

  // Every entry into tracking (the wallet returned a signature, or "Check again") starts one tracking run.
  useEffect(() => {
    let previous = store.getState();
    return store.subscribe(() => {
      const next = store.getState();
      if (TRACKING_PHASES.has(next.attempt.phase) && !TRACKING_PHASES.has(previous.attempt.phase)) {
        singleReadRef.current = previous.attempt.phase === "notFinalized";
        setTrackingRun((run) => run + 1);
      }
      previous = next;
    });
  }, [store]);

  const connection = state.connection;
  const connectedAddress = connection.kind === "connected" ? connection.address : null;

  // Balance of the selected pay token for the amount check.
  const payToken = state.payToken;
  useEffect(() => {
    if (!connectedAddress || state.balance.kind !== "unknown") return;
    send({ type: "balanceRequested" });
    readPayBalance(createRelayConnection(), connectedAddress, payToken)
      .then((raw) => send({ type: "balanceLoaded", address: connectedAddress, raw, payToken }))
      .catch(() => send({ type: "balanceFailed", address: connectedAddress, payToken }));
  }, [connectedAddress, state.balance.kind, payToken, send]);

  // Preview: build, audit and simulate in the browser, then hand the outcome to the reducer.
  const previewRequest = state.attempt.phase === "previewing" ? state.attempt : null;
  const previewRequestId = previewRequest?.requestId ?? null;
  useEffect(() => {
    if (!previewRequest || !connectedAddress) return;
    const { requestId, inputRaw, payToken: previewPayToken } = previewRequest;
    let active = true;
    import("@benten/purchase/preview")
      .then(({ preparePreview }) => preparePreview(connectedAddress, inputRaw, Date.now, previewPayToken))
      .then((outcome) => {
        if (!active) return;
        if (outcome.ok) send({ type: "previewSucceeded", requestId, preview: outcome.preview });
        else send({ type: "previewFailed", requestId, failure: outcome.failure, details: outcome.details, createsNvdaxAccount: outcome.createsNvdaxAccount });
      })
      .catch(() => {
        if (active) send({ type: "previewFailed", requestId, failure: "simulationFailed", details: null });
      });
    return () => {
      active = false;
    };
    // One run per preview request id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewRequestId]);

  // Expiry clock: the reducer expires the preview even while the panel is not on screen.
  const reviewPreview = state.attempt.phase === "reviewReady" || state.attempt.phase === "awaitingWallet" ? state.attempt.preview : null;
  useEffect(() => {
    if (!reviewPreview) return;
    const tick = () => send({ type: "tick", now: Date.now() });
    tick();
    const timer = window.setInterval(tick, PURCHASE_CONFIG.countdownTickMs);
    return () => window.clearInterval(timer);
  }, [reviewPreview, send]);

  // Tracking the known signature (never a resend).
  useEffect(() => {
    const attempt = store.getState().attempt;
    if (trackingRun === 0 || !TRACKING_PHASES.has(attempt.phase) || !("tracking" in attempt)) return;
    let cancelled = false;
    const relay = createRelayConnection();
    void trackSignature(
      { signature: attempt.tracking.signature, lastValidBlockHeight: attempt.tracking.lastValidBlockHeight, alreadyConfirmed: attempt.phase === "confirmed", singleRead: singleReadRef.current },
      {
        rpc: relayPurchaseRpc(relay),
        dispatch: (action) => {
          if (!cancelled) send(action);
        },
        now: Date.now,
        sleep: (ms) => new Promise((resolve) => window.setTimeout(resolve, ms)),
        relayFailureOf: (error) => relayFailureOf(error, relay),
        isCancelled: () => cancelled,
      },
    );
    return () => {
      cancelled = true;
    };
  }, [trackingRun, send, store]);

  // Result: measured from the finalized transaction's token balances.
  const finalizedSignature = state.attempt.phase === "finalized" ? state.attempt.tracking.signature : null;
  const finalizedWallet = state.attempt.phase === "finalized" ? state.attempt.tracking.walletAddress : null;
  const finalizedPayToken = state.attempt.phase === "finalized" ? state.attempt.tracking.payToken : "USDC";
  useEffect(() => {
    if (!finalizedSignature || !finalizedWallet) return;
    let active = true;
    const relay = createRelayConnection();
    Promise.all([relayPurchaseRpc(relay).finalizedTransactionMeta(finalizedSignature), readNvdaxMultiplier(createRelayConnection(), Date.now)])
      .then(([meta, multiplier]) => {
        if (!active) return;
        const measured = measurePurchase(meta, finalizedWallet, finalizedPayToken);
        if (measured) send({ type: "resultRead", signature: finalizedSignature, result: { ...measured, nvdaxMultiplier: multiplier } });
        else send({ type: "resultUnavailable", signature: finalizedSignature });
      })
      .catch(() => {
        if (active) send({ type: "resultUnavailable", signature: finalizedSignature });
      });
    return () => {
      active = false;
    };
  }, [finalizedSignature, finalizedWallet, finalizedPayToken, send]);

  return null;
}

/**
 * The panel on the NVDA page: the view of the shared purchase state, focus
 * and polite announcements, and the user's actions. Connecting and
 * disconnecting go to the shell's session; approving goes only through
 * `approveOnce`.
 */
function PurchasePanel({ store, locale, flow }: { store: PurchaseStore; locale: PublicWebLocale; flow?: { readonly leading: ReactNode } }) {
  const { session } = useAppSession();
  const copy = purchaseMessagesFor(locale);
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const [now, setNow] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const warnedPreviewRef = useRef<number | null>(null);
  const refs = usePanelRefs();

  const send = useCallback((action: PurchaseAction) => store.send(action), [store]);

  // Visible countdown; announcements happen at ready, 10 s left and expiry.
  const reviewPreview = state.attempt.phase === "reviewReady" || state.attempt.phase === "awaitingWallet" ? state.attempt.preview : null;
  useEffect(() => {
    if (!reviewPreview) return;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (reviewPreview.expiresAt - current <= PURCHASE_CONFIG.tenSecondWarningMs && warnedPreviewRef.current !== reviewPreview.id && current < reviewPreview.expiresAt) {
        warnedPreviewRef.current = reviewPreview.id;
        setAnnouncement(copy.preview.tenSecondsLeft);
      }
    };
    tick();
    const timer = window.setInterval(tick, PURCHASE_CONFIG.countdownTickMs);
    return () => window.clearInterval(timer);
  }, [reviewPreview, copy.preview.tenSecondsLeft]);

  // Focus and polite announcements per phase; returning to the page announces nothing that already happened.
  const previousAttemptRef = useRef<Attempt>(state.attempt);
  useEffect(() => {
    const previous = previousAttemptRef.current;
    const next = state.attempt;
    previousAttemptRef.current = next;
    if (previous === next) return;
    focusFor(previous, next, refs);
    if (previous.phase === next.phase) return;
    switch (next.phase) {
      case "previewing": setAnnouncement(copy.action.previewing); break;
      case "reviewReady": setAnnouncement(copy.preview.ready(clockText(next.preview.expiresAt, locale))); break;
      case "awaitingWallet": setAnnouncement(copy.trail.waitingApproval); break;
      case "submitted": setAnnouncement(copy.trail.announceSent); break;
      case "confirmed": setAnnouncement(copy.trail.announceConfirmed); break;
      case "finalized": setAnnouncement(copy.trail.readingResult); break;
      case "result": {
        const scaled = nvdaxText(next.result.nvdaxDeltaRaw, next.result.nvdaxMultiplier, locale);
        setAnnouncement(copy.result.received(scaled === null ? copy.preview.rawOnly(next.result.nvdaxDeltaRaw.toString()) : `${scaled} ${NVDAX_SYMBOL}`));
        break;
      }
      case "resultUnreadable": setAnnouncement(copy.result.unreadable); break;
      default: break;
    }
  }, [state.attempt, refs, copy, locale]);

  const connectionKind = state.connection.kind;
  const previousConnectionRef = useRef(connectionKind);
  useEffect(() => {
    if (previousConnectionRef.current === connectionKind) return;
    previousConnectionRef.current = connectionKind;
    if (connectionKind === "connecting") setAnnouncement(copy.wallet.connecting);
    else if (connectionKind === "connected") setAnnouncement(copy.wallet.connected);
  }, [connectionKind, copy.wallet.connecting, copy.wallet.connected]);

  const handlers: PanelHandlers = {
    onConnect: (walletId) => session.connect(walletId),
    onDisconnect: () => session.disconnect(),
    onAmountChange: (text) => void send({ type: "amountEdited", text }),
    onAmountBlur: () => void send({ type: "amountCommitted" }),
    onPreview: () => void send({ type: "previewRequested" }),
    // The single place that asks the wallet: only on the reviewReady -> awaitingWallet transition.
    onApprove: () => void approveOnce(store, requestWalletApproval),
    onCheckAgain: () => void send({ type: "checkAgain" }),
    onStartNew: () => void send({ type: "startNew" }),
    onPayTokenChange: (payToken) => void send({ type: "payTokenSelected", payToken }),
  };

  // Times are only rendered in client-created states, and this panel mounts after hydration.
  const renderNow = now === 0 && PREVIEW_PHASES.has(state.attempt.phase) ? Date.now() : now;
  const flowChrome = flow ? { leading: flow.leading, step: flowStepText(state.attempt.phase, locale) } : undefined;
  return <PurchasePanelView state={state} now={renderNow} locale={locale} handlers={handlers} refs={refs} announcement={announcement} flow={flowChrome} />;
}

/**
 * One purchase for the visit: a fresh purchase state with its runtime and
 * panel bound to it. Called once, by the shell's `installPurchase`.
 */
/** The status line while the attempt is sent and tracked; nothing otherwise. */
function PurchaseStatus({ store, locale }: { store: PurchaseStore; locale: PublicWebLocale }) {
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  return STATUS_LINE_PHASES.has(state.attempt.phase) ? <PurchaseStatusLineView locale={locale} /> : null;
}

export function createInstalledPurchase(): InstalledPurchase {
  const store = createPurchaseStore();
  function InstalledPurchaseRuntime() {
    return <PurchaseRuntime store={store} />;
  }
  function InstalledPurchasePanel({ locale, flow }: { locale: PublicWebLocale; flow?: { readonly leading: ReactNode } }) {
    return <PurchasePanel store={store} locale={locale} flow={flow} />;
  }
  function InstalledPurchaseStatus({ locale }: { locale: PublicWebLocale }) {
    return <PurchaseStatus store={store} locale={locale} />;
  }
  return {
    Runtime: InstalledPurchaseRuntime,
    Panel: InstalledPurchasePanel,
    Status: InstalledPurchaseStatus,
    prefillPurchase: (link) => prefillPurchase(store, link),
  };
}
