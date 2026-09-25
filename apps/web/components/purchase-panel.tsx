"use client";

import { useCallback, useEffect, useId, useRef, useState, type RefObject } from "react";

import { AlertNotice } from "@/components/alert-notice";
import { CopyValue } from "@/components/copy-value";
import { PurchaseNotice } from "@/components/purchase-notice";
import { PurchaseTermsList } from "@/components/purchase-terms-list";
import { PurchaseTrail, type TrailStep } from "@/components/purchase-trail";
import { StatusMark } from "@/components/status-mark";
import { shortenAddress } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import { messagesFor, type PurchaseCopy } from "@/lib/i18n/messages";
import { parseUsdcInput, type AmountError } from "@benten/purchase/amount";
import { PURCHASE_CONFIG } from "@benten/purchase/config";
import { clockText, minutesText, nvdaxText, usdcText } from "@benten/purchase/display";
import {
  hasUnresolvedEarlierRequest,
  INITIAL_PURCHASE_STATE,
  isAmountLocked,
  isPostSend,
  purchaseReducer,
  shouldRequestWalletApproval,
  type Attempt,
  type PreviewTerms,
  type PurchaseAction,
  type PurchaseState,
  type Tracking,
} from "@benten/purchase/purchase-machine";
import { measurePurchase } from "@benten/purchase/result";
import { NVDAX_SYMBOL, NVDAX_USDC_POOL, USDC_SYMBOL } from "@benten/purchase/route";
import { createRelayConnection, readNvdaxMultiplier, readUsdcBalance, relayFailureOf, relayPurchaseRpc } from "@benten/purchase/rpc";
import { trackSignature } from "@benten/purchase/tracker";
import { connectWallet, disconnectWallet, requestWalletApproval, watchConnectedAccount, watchWallets } from "@benten/purchase/wallet-standard";

export interface PanelHandlers {
  onConnect(walletId: string): void;
  onDisconnect(): void;
  onAmountChange(text: string): void;
  onAmountBlur(): void;
  onPreview(): void;
  onApprove(): void;
  onCheckAgain(): void;
  onStartNew(): void;
}

export interface PanelRefs {
  previewHeading: RefObject<HTMLHeadingElement>;
  errorTitle: RefObject<HTMLHeadingElement>;
  resultHeading: RefObject<HTMLHeadingElement>;
  amountInput: RefObject<HTMLInputElement>;
}

const PREVIEW_PHASES: ReadonlySet<Attempt["phase"]> = new Set(["reviewReady", "previewExpired", "awaitingWallet"]);
/** Largest raw value the helper line echoes while typing (the limit check itself lives in the reducer). */
const HELPER_PARSE_CEILING = 10n ** 30n;

function amountErrorText(error: AmountError, state: PurchaseState, copy: PurchaseCopy, locale: Locale): string {
  switch (error) {
    case "empty": return copy.amount.errorEmpty;
    case "format": return copy.amount.errorFormat;
    case "precision": return copy.amount.errorPrecision;
    case "zero": return copy.amount.errorZero;
    case "overLimit": return copy.amount.errorOverLimit(usdcText(PURCHASE_CONFIG.maxUsdcInRaw, locale));
    case "overBalance": return copy.amount.errorOverBalance(state.balance.kind === "loaded" ? usdcText(state.balance.raw, locale) : "");
  }
}

function explorerLink(signature: string, label: string, locale: Locale) {
  return externalLink(PURCHASE_CONFIG.explorerTxUrl(signature), label, locale);
}

function externalLink(href: string, label: string, locale: Locale) {
  return (
    <a className="purchase-panel__link" href={href} target="_blank" rel="noopener noreferrer">
      {label}<span className="sr-only"> {messagesFor(locale).facts.opensNewTab}</span>
    </a>
  );
}

function trailSteps(attempt: Attempt, copy: PurchaseCopy, locale: Locale): TrailStep[] {
  const time = (value: number | null) => (value === null ? undefined : clockText(value, locale));
  if (attempt.phase === "awaitingWallet") {
    return [
      { key: "reviewed", label: copy.trail.reviewed, state: "done", time: time(attempt.preview.builtAt) },
      { key: "approved", label: copy.trail.approveNow, state: "current", detail: copy.trail.approveBody },
      { key: "sent", label: copy.trail.sent, state: "notYet" },
      { key: "confirmed", label: copy.trail.confirmed, state: "notYet" },
      { key: "finalized", label: copy.trail.finalized, state: "notYet" },
    ];
  }
  if (!("tracking" in attempt)) return [];
  const steps = attempt.tracking.steps;
  const stopped = attempt.phase === "notFinalized";
  const confirmedDone = steps.confirmedAt !== null;
  const finalizedDone = steps.finalizedAt !== null;
  const tracking = attempt.phase === "submitted" || attempt.phase === "confirmed";
  return [
    { key: "reviewed", label: copy.trail.reviewed, state: "done", time: time(steps.reviewedAt) },
    { key: "approved", label: copy.trail.approved, state: "done", time: time(steps.approvedAt) },
    { key: "sent", label: copy.trail.sent, state: "done", time: time(steps.sentAt) },
    { key: "confirmed", label: copy.trail.confirmed, state: confirmedDone ? "done" : tracking ? "current" : "notYet", time: time(steps.confirmedAt), unseen: stopped && !confirmedDone },
    { key: "finalized", label: copy.trail.finalized, state: finalizedDone ? "done" : tracking && confirmedDone ? "current" : "notYet", time: time(steps.finalizedAt), unseen: stopped && !finalizedDone },
  ];
}

function SignatureLine({ tracking, copy, locale, full }: { tracking: Tracking; copy: PurchaseCopy; locale: Locale; full?: boolean }) {
  return (
    <p className="purchase-panel__signature">
      <span className="purchase-panel__muted">{copy.trail.signature}</span>{" "}
      <span className="mono" title={tracking.signature}>{full ? tracking.signature : shortenAddress(tracking.signature)}</span>
      <CopyValue value={tracking.signature} locale={locale} label={copy.result.copySignature} />
    </p>
  );
}

function PreviewNotes({ preview, copy, locale }: { preview: PreviewTerms; copy: PurchaseCopy; locale: Locale }) {
  return (
    <div className="purchase-panel__notes">
      <p>{preview.nvdaxMultiplier ? copy.preview.multiplierNote(clockText(preview.nvdaxMultiplier.readAt, locale)) : copy.preview.multiplierUnavailable}</p>
      {preview.createsNvdaxAccount ? <p>{copy.preview.accountCreation}</p> : null}
      <p>{copy.preview.networkFee}</p>
    </div>
  );
}

function WalletStep({ state, copy, handlers, locked }: { state: PurchaseState; copy: PurchaseCopy; handlers: PanelHandlers; locked: boolean }) {
  const connection = state.connection;
  if (connection.kind === "connected") {
    return (
      <div className="purchase-wallet">
        <div className="purchase-wallet__row">
          <StatusMark>{copy.wallet.connected}</StatusMark>
          <span className="mono" title={connection.address}>{shortenAddress(connection.address)}</span>
          <span className="sr-only">{copy.wallet.address(connection.address)}</span>
          <button className="button button--quiet purchase-wallet__disconnect" type="button" onClick={handlers.onDisconnect} disabled={locked}>{copy.wallet.disconnect}</button>
        </div>
      </div>
    );
  }
  if (connection.kind === "connecting") {
    return <div className="purchase-actions"><button className="button button--primary" type="button" aria-disabled="true" aria-busy="true">{copy.wallet.connecting}</button></div>;
  }
  if (state.detection === "pending") return <p className="purchase-panel__muted">{copy.wallet.detecting}</p>;
  return (
    <div className="purchase-wallet">
      {state.wallets.length === 0 ? (
        <div className="purchase-wallet__empty">
          <h3 className="purchase-panel__subheading">{copy.wallet.notDetectedTitle}</h3>
          <p>{copy.wallet.notDetectedBody}</p>
        </div>
      ) : state.wallets.length === 1 ? (
        <div className="purchase-actions">
          <button className="button button--primary" type="button" onClick={() => handlers.onConnect(state.wallets[0].id)}>{copy.wallet.connect}</button>
        </div>
      ) : (
        <ul className="purchase-wallet__list" aria-label={copy.wallet.listLabel}>
          {state.wallets.map((wallet) => (
            <li key={wallet.id}><button className="button button--outline" type="button" onClick={() => handlers.onConnect(wallet.id)}>{copy.wallet.connectNamed(wallet.name)}</button></li>
          ))}
        </ul>
      )}
      {state.connectNotice ? <p className="purchase-panel__status" role="status">{state.connectNotice === "rejected" ? copy.wallet.connectRejected : copy.wallet.connectFailed}</p> : null}
      {state.unsupportedWallets.map((name) => <p className="purchase-panel__muted" key={name}>{copy.wallet.unsupported(name)}</p>)}
    </div>
  );
}

function AmountField({ state, copy, locale, handlers, refs }: { state: PurchaseState; copy: PurchaseCopy; locale: Locale; handlers: PanelHandlers; refs: PanelRefs }) {
  const id = useId();
  const locked = isAmountLocked(state.attempt.phase);
  const helper = parseUsdcInput(state.amountText, null, HELPER_PARSE_CEILING);
  const describedBy = [`${id}-helper`, state.amountError ? `${id}-error` : null].filter(Boolean).join(" ");
  return (
    <div className="purchase-field">
      <div className="purchase-field__head">
        <label htmlFor={`${id}-input`}>{copy.amount.label}</label>
        <span className="purchase-field__balance">
          {state.balance.kind === "loaded" ? copy.balance.usdc(`${usdcText(state.balance.raw, locale)} ${USDC_SYMBOL}`) : state.balance.kind === "unavailable" ? copy.balance.unavailable : copy.balance.loading}
        </span>
      </div>
      <input
        ref={refs.amountInput}
        id={`${id}-input`}
        className="purchase-field__input"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        value={state.amountText}
        readOnly={locked}
        aria-invalid={state.amountError ? true : undefined}
        aria-describedby={describedBy}
        onChange={(event) => handlers.onAmountChange(event.target.value)}
        onBlur={handlers.onAmountBlur}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !locked) handlers.onPreview();
        }}
      />
      <p className="purchase-field__helper" id={`${id}-helper`}>
        {helper.ok ? copy.amount.helperRaw(helper.raw.toString()) : copy.amount.helperSeparator}
      </p>
      {state.amountError ? <p className="field-error" id={`${id}-error`}>{amountErrorText(state.amountError, state, copy, locale)}</p> : null}
    </div>
  );
}

/** Presentational panel: renders one reducer state. Used by the live island and by the Living Catalog fixtures. */
export function PurchasePanelView({ state, now, locale, handlers, refs, announcement }: { state: PurchaseState; now: number; locale: Locale; handlers: PanelHandlers; refs: PanelRefs; announcement: string }) {
  const copy = messagesFor(locale).purchase;
  const attempt = state.attempt;
  const postSend = isPostSend(attempt.phase);
  const pool = NVDAX_USDC_POOL.toBase58();
  const connected = state.connection.kind === "connected";
  const showField = connected && !postSend && attempt.phase !== "walletOutcomeUnknown";
  const locked = isAmountLocked(attempt.phase);

  let stage: JSX.Element | null = null;
  let actions: JSX.Element | null = null;

  switch (attempt.phase) {
    case "editing":
      if (connected) actions = <button className="button button--primary" type="button" onClick={handlers.onPreview}>{copy.action.preview}</button>;
      break;
    case "previewing":
      actions = <button className="button button--primary" type="button" aria-disabled="true" aria-busy="true">{copy.action.previewing}</button>;
      break;
    case "previewFailed": {
      const error = copy.error[attempt.failure];
      const body = attempt.failure === "notEnoughSol" ? copy.error.notEnoughSol.body(attempt.createsNvdaxAccount) : (error as { body: string }).body;
      stage = (
        <AlertNotice title={error.title} titleRef={refs.errorTitle}>
          <p>{body}</p>
          {attempt.details && attempt.failure !== "relayBusy" && attempt.failure !== "relayUnavailable" ? (
            <details className="purchase-panel__details"><summary>{copy.error.technicalDetails}</summary><p className="mono">{attempt.details}</p></details>
          ) : null}
        </AlertNotice>
      );
      if (attempt.failure !== "routeCheck") {
        const retryLabel = attempt.failure === "relayBusy" || attempt.failure === "relayUnavailable" ? copy.action.tryAgain : copy.action.refresh;
        actions = <button className="button button--primary" type="button" onClick={handlers.onPreview}>{retryLabel}</button>;
      }
      break;
    }
    case "reviewReady":
    case "previewExpired":
    case "awaitingWallet": {
      const expired = attempt.phase === "previewExpired";
      const preview = attempt.preview;
      stage = (
        <>
          {expired ? <AlertNotice title={copy.error.expired.title} titleRef={refs.errorTitle}><p>{copy.error.expired.body(clockText(preview.builtAt, locale))}</p></AlertNotice> : null}
          {attempt.phase === "reviewReady" && attempt.notice === "rejected" ? <AlertNotice title={copy.error.rejected.title} titleRef={refs.errorTitle}><p>{copy.error.rejected.body}</p></AlertNotice> : null}
          <h3 className="purchase-panel__subheading" ref={refs.previewHeading} tabIndex={-1}>{expired ? copy.preview.headingExpired : copy.preview.heading}</h3>
          <PurchaseTermsList preview={preview} now={now} expired={expired} locale={locale} />
          {attempt.phase === "awaitingWallet" ? <PurchaseTrail steps={trailSteps(attempt, copy, locale)} locale={locale} /> : null}
        </>
      );
      actions = expired ? (
        <>
          <button className="button button--primary" type="button" onClick={handlers.onPreview}>{copy.action.refresh}</button>
          <button className="button button--disabled" type="button" aria-disabled="true">{copy.action.approve}</button>
        </>
      ) : attempt.phase === "awaitingWallet" ? (
        <button className="button button--primary" type="button" aria-disabled="true" aria-busy="true">{copy.action.approving}</button>
      ) : (
        <>
          <button className="button button--primary" type="button" onClick={handlers.onApprove}>{copy.action.approve}</button>
          <button className="button button--quiet" type="button" onClick={handlers.onPreview}>{copy.action.refresh}</button>
        </>
      );
      break;
    }
    case "walletOutcomeUnknown":
      // No approve action here: the wallet may have sent it, so this preview is never offered again.
      stage = <AlertNotice title={copy.error.walletUnknown.title} titleRef={refs.errorTitle}><p>{copy.error.walletUnknown.body}</p></AlertNotice>;
      actions = (
        <>
          <button className="button button--outline" type="button" onClick={handlers.onStartNew}>{copy.action.startNew}</button>
          {externalLink(PURCHASE_CONFIG.explorerAddressUrl(attempt.preview.walletAddress), copy.error.walletUnknown.explorer, locale)}
        </>
      );
      break;
    case "submitted":
    case "confirmed":
      stage = (
        <>
          <PurchaseTrail steps={trailSteps(attempt, copy, locale)} locale={locale} />
          <SignatureLine tracking={attempt.tracking} copy={copy} locale={locale} />
          <p className="purchase-panel__status">{copy.trail.keepOpen}</p>
        </>
      );
      actions = explorerLink(attempt.tracking.signature, copy.result.explorer, locale);
      break;
    case "notFinalized": {
      const error = attempt.reason === "relay" ? copy.error.trackingRelay : { title: copy.error.notFinalized.title, body: copy.error.notFinalized.body(minutesText(PURCHASE_CONFIG.statusPollTimeoutMs)) };
      stage = (
        <>
          <AlertNotice title={error.title} titleRef={refs.errorTitle}><p>{error.body}</p></AlertNotice>
          <PurchaseTrail steps={trailSteps(attempt, copy, locale)} locale={locale} />
          <SignatureLine tracking={attempt.tracking} copy={copy} locale={locale} full />
        </>
      );
      actions = (
        <>
          <button className="button button--primary" type="button" onClick={handlers.onCheckAgain}>{copy.action.checkAgain}</button>
          {explorerLink(attempt.tracking.signature, copy.result.explorerCheck, locale)}
        </>
      );
      break;
    }
    case "finalized":
      stage = (
        <>
          <PurchaseTrail steps={trailSteps(attempt, copy, locale)} locale={locale} />
          <p className="purchase-panel__status">{copy.trail.readingResult}</p>
        </>
      );
      break;
    case "result": {
      const result = attempt.result;
      const scaled = nvdaxText(result.nvdaxDeltaRaw < 0n ? -result.nvdaxDeltaRaw : result.nvdaxDeltaRaw, result.nvdaxMultiplier, locale);
      const sign = result.nvdaxDeltaRaw < 0n ? "-" : "+";
      stage = (
        <>
          <PurchaseTrail steps={trailSteps(attempt, copy, locale)} locale={locale} />
          <div className="purchase-result">
            <h3 className="purchase-panel__subheading" ref={refs.resultHeading} tabIndex={-1}>{copy.result.heading}</h3>
            <p className="purchase-result__label">{copy.result.receivedLabel}</p>
            <p className="purchase-result__figure">{scaled === null ? `${sign}${copy.preview.rawOnly(result.nvdaxDeltaRaw.toString().replace("-", ""))}` : `${sign}${scaled} ${NVDAX_SYMBOL}`}</p>
            <p className="purchase-terms__raw">{copy.preview.raw(`${sign}${result.nvdaxDeltaRaw.toString().replace("-", "")}`)}</p>
            <dl className="purchase-terms">
              <div className="purchase-terms__row">
                <dt>{copy.result.usdcPaid}</dt>
                <dd><span className="purchase-terms__value">{`${usdcText(result.usdcPaidRaw, locale)} ${USDC_SYMBOL}`}</span><span className="purchase-terms__raw">{copy.preview.raw(result.usdcPaidRaw.toString())}</span></dd>
              </div>
            </dl>
            <div className="purchase-panel__notes">
              <p>{copy.result.source}</p>
              <p>{result.nvdaxMultiplier ? copy.preview.multiplierNote(clockText(result.nvdaxMultiplier.readAt, locale)) : copy.preview.multiplierUnavailable}</p>
            </div>
          </div>
          <SignatureLine tracking={attempt.tracking} copy={copy} locale={locale} />
        </>
      );
      actions = (
        <>
          <button className="button button--outline" type="button" onClick={handlers.onStartNew}>{copy.action.startNew}</button>
          {explorerLink(attempt.tracking.signature, copy.result.explorer, locale)}
        </>
      );
      break;
    }
    case "resultUnreadable":
      stage = (
        <>
          <PurchaseTrail steps={trailSteps(attempt, copy, locale)} locale={locale} />
          <div className="notice"><p>{copy.result.unreadable}</p></div>
          <SignatureLine tracking={attempt.tracking} copy={copy} locale={locale} />
        </>
      );
      actions = (
        <>
          <button className="button button--primary" type="button" onClick={handlers.onCheckAgain}>{copy.action.checkAgain}</button>
          {explorerLink(attempt.tracking.signature, copy.result.explorer, locale)}
        </>
      );
      break;
    case "failedOnChain":
      stage = (
        <>
          <AlertNotice title={copy.error.failedOnChain.title} titleRef={refs.errorTitle}>
            <p>{copy.error.failedOnChain.body}</p>
            <details className="purchase-panel__details"><summary>{copy.error.technicalDetails}</summary><p className="mono">{attempt.errorCode}</p></details>
          </AlertNotice>
          <SignatureLine tracking={attempt.tracking} copy={copy} locale={locale} />
        </>
      );
      actions = (
        <>
          <button className="button button--outline" type="button" onClick={handlers.onStartNew}>{copy.action.startNew}</button>
          {explorerLink(attempt.tracking.signature, copy.result.explorer, locale)}
        </>
      );
      break;
    case "dropped":
      stage = (
        <>
          <AlertNotice title={copy.error.dropped.title} titleRef={refs.errorTitle}><p>{copy.error.dropped.body}</p></AlertNotice>
          <SignatureLine tracking={attempt.tracking} copy={copy} locale={locale} />
        </>
      );
      actions = <button className="button button--outline" type="button" onClick={handlers.onStartNew}>{copy.action.startNew}</button>;
      break;
  }

  const preview = PREVIEW_PHASES.has(attempt.phase) ? (attempt as Extract<Attempt, { preview: PreviewTerms }>).preview : null;
  return (
    <section className="purchase-panel" id="purchase" aria-labelledby="purchase-heading" data-phase={attempt.phase} lang={locale}>
      <h2 className="section__title" id="purchase-heading" tabIndex={-1}>{copy.heading}</h2>
      <p className="purchase-panel__route">
        {copy.routeLine(shortenAddress(pool))}{" "}
        <CopyValue value={pool} locale={locale} />
      </p>
      <PurchaseNotice locale={locale} />
      {!postSend ? <WalletStep state={state} copy={copy} handlers={handlers} locked={locked} /> : null}
      {showField ? <AmountField state={state} copy={copy} locale={locale} handlers={handlers} refs={refs} /> : null}
      {hasUnresolvedEarlierRequest(state) ? <AlertNotice title={copy.error.earlierRequest.title} announce={false}><p>{copy.error.earlierRequest.body}</p></AlertNotice> : null}
      {stage ? <div className="purchase-panel__stage" key={attempt.phase}>{stage}</div> : null}
      {actions ? <div className="purchase-actions">{actions}</div> : null}
      {/* The notes describe what the wallet shows on approval; an expired preview can no longer be approved, and a refreshed one shows them again. */}
      {preview && attempt.phase !== "previewExpired" ? <PreviewNotes preview={preview} copy={copy} locale={locale} /> : null}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
    </section>
  );
}

export function usePanelRefs(): PanelRefs {
  return {
    previewHeading: useRef<HTMLHeadingElement>(null),
    errorTitle: useRef<HTMLHeadingElement>(null),
    resultHeading: useRef<HTMLHeadingElement>(null),
    amountInput: useRef<HTMLInputElement>(null),
  };
}

const ERROR_PHASES: ReadonlySet<Attempt["phase"]> = new Set(["previewFailed", "previewExpired", "walletOutcomeUnknown", "notFinalized", "failedOnChain", "dropped"]);
const TRACKING_PHASES: ReadonlySet<Attempt["phase"]> = new Set(["submitted", "confirmed"]);

/** Move focus for the new phase (design contract section 10). */
function focusFor(previous: Attempt, next: Attempt, refs: PanelRefs): void {
  if (next.phase === previous.phase && !(next.phase === "reviewReady" && previous.phase === "reviewReady")) return;
  if (ERROR_PHASES.has(next.phase) || (next.phase === "reviewReady" && next.notice === "rejected")) refs.errorTitle.current?.focus();
  else if (next.phase === "reviewReady" && previous.phase === "previewing") refs.previewHeading.current?.focus();
  else if (next.phase === "result") refs.resultHeading.current?.focus();
  else if (next.phase === "editing" && (previous.phase === "result" || previous.phase === "failedOnChain" || previous.phase === "dropped" || previous.phase === "walletOutcomeUnknown")) refs.amountInput.current?.focus();
}

/** The live purchase island on the NVDAx stock page. */
export function PurchasePanel({ locale }: { locale: Locale }) {
  const copy = messagesFor(locale).purchase;
  const [state, setState] = useState<PurchaseState>(INITIAL_PURCHASE_STATE);
  const stateRef = useRef(state);
  const [now, setNow] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const [trackingRun, setTrackingRun] = useState(0);
  const singleReadRef = useRef(false);
  const warnedPreviewRef = useRef<number | null>(null);
  const refs = usePanelRefs();

  const send = useCallback((action: PurchaseAction) => {
    const previous = stateRef.current;
    const next = purchaseReducer(previous, action);
    stateRef.current = next;
    if (next !== previous) {
      setState(next);
      const entersTracking = TRACKING_PHASES.has(next.attempt.phase) && !TRACKING_PHASES.has(previous.attempt.phase);
      if (entersTracking) {
        singleReadRef.current = previous.attempt.phase === "notFinalized";
        setTrackingRun((run) => run + 1);
      }
    }
    return { previous, next };
  }, []);

  // Wallet discovery: every Wallet Standard wallet, now and as they register.
  useEffect(() => watchWallets(({ supported, unsupported }) => send({ type: "walletsDetected", wallets: supported, unsupported })), [send]);

  const connection = state.connection;
  const connectedId = connection.kind === "connected" ? connection.walletId : null;
  const connectedAddress = connection.kind === "connected" ? connection.address : null;

  useEffect(() => {
    if (!connectedId || !connectedAddress) return;
    return watchConnectedAccount(connectedId, connectedAddress, () => send({ type: "walletDisconnected" }));
  }, [connectedId, connectedAddress, send]);

  // USDC balance for the amount check.
  useEffect(() => {
    if (!connectedAddress || state.balance.kind !== "unknown") return;
    send({ type: "balanceRequested" });
    readUsdcBalance(createRelayConnection(), connectedAddress)
      .then((raw) => send({ type: "balanceLoaded", address: connectedAddress, raw }))
      .catch(() => send({ type: "balanceFailed", address: connectedAddress }));
  }, [connectedAddress, state.balance.kind, send]);

  // Preview: build, audit and simulate in the browser, then hand the outcome to the reducer.
  const previewRequest = state.attempt.phase === "previewing" ? state.attempt : null;
  useEffect(() => {
    if (!previewRequest || !connectedAddress) return;
    const { requestId, inputRaw } = previewRequest;
    let active = true;
    import("@benten/purchase/preview")
      .then(({ preparePreview }) => preparePreview(connectedAddress, inputRaw))
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one run per preview request id.
  }, [previewRequest?.requestId]);

  // Countdown: visible timer only; announcements happen at ready, 10 s left and expiry.
  const reviewPreview = state.attempt.phase === "reviewReady" || state.attempt.phase === "awaitingWallet" ? state.attempt.preview : null;
  useEffect(() => {
    if (!reviewPreview) return;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      send({ type: "tick", now: current });
      if (reviewPreview.expiresAt - current <= PURCHASE_CONFIG.tenSecondWarningMs && warnedPreviewRef.current !== reviewPreview.id && current < reviewPreview.expiresAt) {
        warnedPreviewRef.current = reviewPreview.id;
        setAnnouncement(copy.preview.tenSecondsLeft);
      }
    };
    tick();
    const timer = window.setInterval(tick, PURCHASE_CONFIG.countdownTickMs);
    return () => window.clearInterval(timer);
  }, [reviewPreview, send, copy.preview.tenSecondsLeft]);

  // Tracking the known signature (never a resend).
  useEffect(() => {
    const attempt = stateRef.current.attempt;
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
  }, [trackingRun, send]);

  // Result: measured from the finalized transaction's token balances.
  const finalizedSignature = state.attempt.phase === "finalized" ? state.attempt.tracking.signature : null;
  const finalizedWallet = state.attempt.phase === "finalized" ? state.attempt.tracking.walletAddress : null;
  useEffect(() => {
    if (!finalizedSignature || !finalizedWallet) return;
    let active = true;
    const relay = createRelayConnection();
    Promise.all([relayPurchaseRpc(relay).finalizedTransactionMeta(finalizedSignature), readNvdaxMultiplier(createRelayConnection(), Date.now)])
      .then(([meta, multiplier]) => {
        if (!active) return;
        const measured = measurePurchase(meta, finalizedWallet);
        if (measured) send({ type: "resultRead", signature: finalizedSignature, result: { ...measured, nvdaxMultiplier: multiplier } });
        else send({ type: "resultUnavailable", signature: finalizedSignature });
      })
      .catch(() => {
        if (active) send({ type: "resultUnavailable", signature: finalizedSignature });
      });
    return () => {
      active = false;
    };
  }, [finalizedSignature, finalizedWallet, send]);

  // Focus and polite announcements per phase.
  const previousAttemptRef = useRef<Attempt>(state.attempt);
  useEffect(() => {
    const previous = previousAttemptRef.current;
    const next = state.attempt;
    previousAttemptRef.current = next;
    if (previous === next) return;
    focusFor(previous, next, refs);
    const phaseChanged = previous.phase !== next.phase;
    if (!phaseChanged) return;
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

  useEffect(() => {
    if (state.connection.kind === "connecting") setAnnouncement(copy.wallet.connecting);
    else if (state.connection.kind === "connected") setAnnouncement(copy.wallet.connected);
  }, [state.connection.kind, copy.wallet.connecting, copy.wallet.connected]);

  const handlers: PanelHandlers = {
    onConnect(walletId) {
      const { next } = send({ type: "connectRequested", walletId });
      if (next.connection.kind !== "connecting") return;
      void connectWallet(walletId).then((outcome) => {
        if (outcome.kind === "connected") send({ type: "connectSucceeded", walletId, walletName: outcome.name, address: outcome.address });
        else send({ type: "connectFailed", reason: outcome.kind });
      });
    },
    onDisconnect() {
      const current = stateRef.current.connection;
      if (current.kind === "connected") void disconnectWallet(current.walletId);
      send({ type: "walletDisconnected" });
    },
    onAmountChange(text) {
      send({ type: "amountEdited", text });
    },
    onAmountBlur() {
      send({ type: "amountCommitted" });
    },
    onPreview() {
      send({ type: "previewRequested" });
    },
    onApprove() {
      const { previous, next } = send({ type: "approveRequested", now: Date.now() });
      // The single place that asks the wallet: only on the reviewReady -> awaitingWallet transition.
      if (!shouldRequestWalletApproval(previous, next) || next.attempt.phase !== "awaitingWallet" || previous.connection.kind !== "connected") return;
      const preview = next.attempt.preview;
      void requestWalletApproval(previous.connection.walletId, preview.walletAddress, preview.wireTransaction).then((outcome) => {
        if (outcome.kind === "signed") send({ type: "walletSigned", signature: outcome.signature, now: Date.now() });
        else if (outcome.kind === "rejected") send({ type: "walletRejected", now: Date.now() });
        else send({ type: "walletFailed" });
      });
    },
    onCheckAgain() {
      send({ type: "checkAgain" });
    },
    onStartNew() {
      send({ type: "startNew" });
    },
  };

  // Times are only rendered in client-created states, so reading the clock here cannot cause a hydration mismatch.
  const renderNow = now === 0 && PREVIEW_PHASES.has(state.attempt.phase) ? Date.now() : now;
  return <PurchasePanelView state={state} now={renderNow} locale={locale} handlers={handlers} refs={refs} announcement={announcement} />;
}
