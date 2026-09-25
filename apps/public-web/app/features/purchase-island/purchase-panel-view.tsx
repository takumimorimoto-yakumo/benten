/**
 * Presentational purchase panel: renders one reducer state (design contract
 * sections 3, 5 and 6). Used by the live island and by the Living Catalog
 * fixtures; it performs no I/O and never talks to a wallet itself.
 */
import { useId, type ReactNode, type RefObject } from "react";
import { parseTokenInput, type AmountError } from "@benten/purchase/amount";
import { PURCHASE_CONFIG } from "@benten/purchase/config";
import { clockText, minutesText, nvdaxText, tokenText, usdcText } from "@benten/purchase/display";
import { PAY_CONFIG } from "@benten/purchase/pay-config";
import {
  hasUnresolvedEarlierRequest,
  isAmountLocked,
  isPostSend,
  spendableRaw,
  type Attempt,
  type PreviewTerms,
  type PurchaseState,
  type Tracking,
} from "@benten/purchase/purchase-machine";
import { NVDAX_SYMBOL, NVDAX_USDC_POOL, PAY_TOKEN_IDS, PAY_TOKEN_UNITS, USDC_SYMBOL, type PayTokenId } from "@benten/purchase/route";
import { ExternalLink } from "@/components/external-link";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { EMPTY_VALUE, joinSentences } from "@/i18n/format";
import type { PublicWebLocale } from "@/i18n/locales";
import { purchaseMessagesFor, type PurchaseCopy } from "@/i18n/purchase-messages";
import { cn } from "@/lib/utils";
import { CopyValue } from "./copy-value";
import { shortenAddress } from "./display";
import { PanelButton } from "./panel-button";
import { PurchaseAlert } from "./purchase-alert";
import { PURCHASE_HEADING_ID, PURCHASE_SECTION_ID, PurchasePanelShell, purchaseFrameFrom, WalletStepReserve, type PurchaseFlowChrome } from "./purchase-panel-shell";
import { PurchaseTermsList } from "./purchase-terms-list";
import { PurchaseTrail, type TrailStep } from "./purchase-trail";

export type PanelHandlers = {
  onConnect(walletId: string): void;
  onDisconnect(): void;
  onAmountChange(text: string): void;
  onAmountBlur(): void;
  onPreview(): void;
  onApprove(): void;
  onCheckAgain(): void;
  onStartNew(): void;
  /** Pay token choice; the reducer resolves the id against the allowlist. Optional for views that only render. */
  onPayTokenChange?(payToken: string): void;
};

export type PanelRefs = {
  readonly previewHeading: RefObject<HTMLHeadingElement | null>;
  readonly errorTitle: RefObject<HTMLHeadingElement | null>;
  readonly resultHeading: RefObject<HTMLHeadingElement | null>;
  readonly amountInput: RefObject<HTMLInputElement | null>;
};

/** Stable ids inside the panel (design contract section 10), owned by the static-safe shell. */
export { PURCHASE_HEADING_ID, PURCHASE_SECTION_ID };

const PREVIEW_PHASES: ReadonlySet<Attempt["phase"]> = new Set(["reviewReady", "previewExpired", "awaitingWallet"]);
/** Largest raw value the helper line echoes while typing (the limit check itself lives in the reducer). */
const HELPER_PARSE_CEILING = 10n ** 30n;
/**
 * Disconnect on the one-line wallet row: a touch-sized box whose extra height is taken back with an equal negative
 * margin, so the row is one text line tall and the hit area still reaches the touch-target minimum.
 */
const WALLET_LINE_TOUCH_TARGET = "-my-[calc((var(--touch-target-min)-1lh)/2)]";
/** Quiet external links in the panel keep the touch-target height. */
const PANEL_LINK = "inline-flex min-h-(--touch-target-min) items-center text-sm";

/** A pay token amount with its symbol (the symbol is the pay token id). */
function payText(raw: bigint, payToken: PayTokenId, locale: PublicWebLocale): string {
  return `${tokenText(raw, PAY_TOKEN_UNITS[payToken].decimals, locale)} ${payToken}`;
}

function amountErrorText(error: AmountError, state: PurchaseState, copy: PurchaseCopy, locale: PublicWebLocale): string {
  const token = state.payToken;
  if (token !== "USDC") {
    const decimals = String(PAY_TOKEN_UNITS[token].decimals);
    switch (error) {
      case "empty": return copy.pay.errorEmpty(token);
      case "precision": return copy.pay.errorPrecision(token, decimals);
      case "overBalance": return copy.pay.errorOverBalance(state.balance.kind === "loaded" ? payText(spendableRaw(token, state.balance.raw), token, locale) : "");
      default: break;
    }
  }
  switch (error) {
    case "empty": return copy.amount.errorEmpty;
    case "format": return copy.amount.errorFormat;
    case "precision": return copy.amount.errorPrecision;
    case "zero": return copy.amount.errorZero;
    case "overLimit": return copy.amount.errorOverLimit(usdcText(PURCHASE_CONFIG.maxUsdcInRaw, locale));
    case "overBalance": return copy.amount.errorOverBalance(state.balance.kind === "loaded" ? usdcText(state.balance.raw, locale) : "");
  }
}

function PanelLink({ href, children, copy }: { href: string; children: ReactNode; copy: PurchaseCopy }) {
  return <ExternalLink href={href} newTabLabel={copy.opensNewTab} className={PANEL_LINK}>{children}</ExternalLink>;
}

function trailSteps(attempt: Attempt, copy: PurchaseCopy, locale: PublicWebLocale): TrailStep[] {
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

function SignatureLine({ tracking, copy, full = false }: { tracking: Tracking; copy: PurchaseCopy; full?: boolean }) {
  return (
    // The Copy button takes its full touch height here, so its hit area never overlaps the action buttons below.
    <p data-purchase-signature="" className="flex flex-wrap items-center gap-x-2 text-sm wrap-anywhere">
      <span className="text-muted-foreground">{copy.trail.signature}</span>
      <span className="font-mono text-xs" title={tracking.signature}>{full ? tracking.signature : shortenAddress(tracking.signature)}</span>
      <CopyValue value={tracking.signature} copy={copy.copyValue} label={copy.result.copySignature} touch="block" />
    </p>
  );
}

/** The notes under the preview, run together as one short paragraph so the sticky panel keeps its top margin. */
function PreviewNotes({ preview, copy, locale }: { preview: PreviewTerms; copy: PurchaseCopy; locale: PublicWebLocale }) {
  const notes = [
    preview.nvdaxMultiplier ? copy.preview.multiplierNote(clockText(preview.nvdaxMultiplier.readAt, locale)) : copy.preview.multiplierUnavailable,
    // Two legs may also create the USDC and wrapped SOL accounts, whether or not the NVDAx one exists.
    ...(preview.firstLeg !== null ? [copy.pay.accountCreation] : preview.createsNvdaxAccount ? [copy.preview.accountCreation] : []),
    copy.preview.networkFee,
  ];
  return <p data-purchase-notes="" className="text-xs text-muted-foreground">{joinSentences(notes, locale)}</p>;
}

function ConnectedMark({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-medium">
      <span aria-hidden="true" className="size-2 rounded-full bg-(--verified)" />
      {children}
    </span>
  );
}

function WalletStep({ state, copy, handlers, locked }: { state: PurchaseState; copy: PurchaseCopy; handlers: PanelHandlers; locked: boolean }) {
  const connection = state.connection;
  if (connection.kind === "connected") {
    // One line: status, short address, then Disconnect at the end. Disconnect keeps its touch-sized hit area by
    // overhanging the line (as Copy does in the route line), so the line stays one text line tall; it wraps only when narrow.
    return (
      <div data-purchase-wallet="connected" className="flex flex-wrap items-center gap-x-3 text-sm">
        <ConnectedMark>{copy.wallet.connected}</ConnectedMark>
        <span className="font-mono text-xs" title={connection.address}>{shortenAddress(connection.address)}</span>
        <span className="sr-only">{copy.wallet.address(connection.address)}</span>
        <PanelButton variant="ghost" className={cn("ms-auto px-2", WALLET_LINE_TOUCH_TARGET)} onClick={handlers.onDisconnect} disabled={locked}>{copy.wallet.disconnect}</PanelButton>
      </div>
    );
  }
  if (connection.kind === "connecting") {
    return <div className="flex"><PanelButton busy className="flex-1">{copy.wallet.connecting}</PanelButton></div>;
  }
  // Before a wallet is connected the step keeps the prerendered frame's reserved height, so nothing below moves.
  const reserve = { title: copy.wallet.notDetectedTitle, body: copy.wallet.notDetectedBody };
  // Not connected yet still names the accepted pay tokens, so a reviewer who has no wallet extension
  // installed can still see that USDC, SOL and SKR are all accepted; a link's own pay token (`?pay=sol`) is named once it is prefilled, ahead of the wallet.
  const payHint = state.payToken === "USDC" ? copy.wallet.payTokensHint : copy.wallet.payTokenSelectedHint(state.payToken);
  const payHintLine = <p data-purchase-pay-hint="" className="text-sm text-muted-foreground">{payHint}</p>;
  if (state.detection === "pending") {
    return (
      <WalletStepReserve reserve={reserve}>
        <div className="flex flex-col gap-2">
          {payHintLine}
          <p className="flex min-h-(--touch-target-min) items-center text-sm text-muted-foreground">{copy.wallet.detecting}</p>
        </div>
      </WalletStepReserve>
    );
  }
  return (
    <WalletStepReserve reserve={reserve}>
    <div data-purchase-wallet="disconnected" className="flex flex-col gap-2">
      {payHintLine}
      {state.wallets.length === 0 ? (
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">{copy.wallet.notDetectedTitle}</h3>
          <p className="text-sm text-muted-foreground">{copy.wallet.notDetectedBody}</p>
        </div>
      ) : state.wallets.length === 1 ? (
        <div className="flex">
          <PanelButton className="flex-1" onClick={() => handlers.onConnect(state.wallets[0].id)}>{copy.wallet.connect}</PanelButton>
        </div>
      ) : (
        <ul aria-label={copy.wallet.listLabel} className="flex flex-col gap-2">
          {state.wallets.map((wallet) => (
            <li key={wallet.id}><PanelButton variant="outline" className="w-full" onClick={() => handlers.onConnect(wallet.id)}>{copy.wallet.connectNamed(wallet.name)}</PanelButton></li>
          ))}
        </ul>
      )}
      {state.connectNotice ? <p className="text-sm" role="status">{state.connectNotice === "rejected" ? copy.wallet.connectRejected : copy.wallet.connectFailed}</p> : null}
      {state.unsupportedWallets.map((name) => <p key={name} className="text-sm text-muted-foreground">{copy.wallet.unsupported(name)}</p>)}
    </div>
    </WalletStepReserve>
  );
}

/** Step 1: the token to pay with. Buttons in a labelled group; the pressed one is the current choice. */
function PayTokenField({ state, copy, handlers }: { state: PurchaseState; copy: PurchaseCopy; handlers: PanelHandlers }) {
  const id = useId();
  const locked = isAmountLocked(state.attempt.phase);
  return (
    <div data-purchase-pay-token={state.payToken} className="flex flex-col gap-1">
      <p id={`${id}-label`} className="text-sm font-semibold">{copy.pay.label}</p>
      <div role="group" aria-labelledby={`${id}-label`} className="grid grid-cols-3 gap-2">
        {PAY_TOKEN_IDS.map((token) => (
          <PanelButton
            key={token}
            // Not the filled primary variant: the panel keeps at most one primary action.
            variant={token === state.payToken ? "secondary" : "outline"}
            className={token === state.payToken ? "border-foreground" : undefined}
            aria-pressed={token === state.payToken}
            disabled={locked}
            onClick={() => handlers.onPayTokenChange?.(token)}
          >
            {token}
          </PanelButton>
        ))}
      </div>
      {state.payToken !== "USDC" ? <p className="text-xs text-muted-foreground">{copy.pay.route(state.payToken)}</p> : null}
    </div>
  );
}

function AmountField({ state, copy, locale, handlers, refs }: { state: PurchaseState; copy: PurchaseCopy; locale: PublicWebLocale; handlers: PanelHandlers; refs: PanelRefs }) {
  const id = useId();
  const locked = isAmountLocked(state.attempt.phase);
  const token = state.payToken;
  const decimals = PAY_TOKEN_UNITS[token].decimals;
  const helper = parseTokenInput(state.amountText, decimals, null, HELPER_PARSE_CEILING);
  const usdc = token === "USDC";
  const balanceText = state.balance.kind === "loaded"
    ? (usdc ? copy.balance.usdc(`${usdcText(state.balance.raw, locale)} ${USDC_SYMBOL}`) : copy.pay.balance(payText(state.balance.raw, token, locale)))
    : state.balance.kind === "unavailable" ? (usdc ? copy.balance.unavailable : copy.pay.balanceUnavailable(token)) : (usdc ? copy.balance.loading : copy.pay.balanceLoading(token));
  const describedBy = [`${id}-helper`, state.amountError ? `${id}-error` : null].filter(Boolean).join(" ");
  return (
    <div data-purchase-field="" className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <label htmlFor={`${id}-input`} className="text-sm font-semibold">{usdc ? copy.amount.label : copy.pay.amountLabel(token)}</label>
        <span className="text-xs text-muted-foreground tabular-nums">{balanceText}</span>
      </div>
      <Input
        ref={refs.amountInput}
        id={`${id}-input`}
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        value={state.amountText}
        readOnly={locked}
        aria-invalid={state.amountError ? true : undefined}
        aria-describedby={describedBy}
        className="h-(--touch-target-min) border-(--control-border) text-base tabular-nums read-only:bg-muted"
        onChange={(event) => handlers.onAmountChange(event.target.value)}
        onBlur={handlers.onAmountBlur}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !locked) handlers.onPreview();
        }}
      />
      <p id={`${id}-helper`} className="text-xs text-muted-foreground">
        {helper.ok ? (usdc ? copy.amount.helperRaw(helper.raw.toString()) : copy.pay.helperRaw(helper.raw.toString(), token, String(decimals))) : copy.amount.helperSeparator}
      </p>
      {PAY_TOKEN_UNITS[token].native ? <p className="text-xs text-muted-foreground">{copy.pay.solReserve(tokenText(PAY_CONFIG.solFeeReserveLamports, decimals, locale))}</p> : null}
      {state.amountError ? <p id={`${id}-error`} className="text-sm font-medium text-destructive">{amountErrorText(state.amountError, state, copy, locale)}</p> : null}
    </div>
  );
}

function ResultBlock({ attempt, copy, locale, refs }: { attempt: Extract<Attempt, { phase: "result" }>; copy: PurchaseCopy; locale: PublicWebLocale; refs: PanelRefs }) {
  const result = attempt.result;
  const magnitude = result.nvdaxDeltaRaw < 0n ? -result.nvdaxDeltaRaw : result.nvdaxDeltaRaw;
  const scaled = nvdaxText(magnitude, result.nvdaxMultiplier, locale);
  const sign = result.nvdaxDeltaRaw < 0n ? "-" : "+";
  return (
    <div data-purchase-result="" className="flex flex-col gap-1">
      <h3 ref={refs.resultHeading} tabIndex={-1} className="text-base font-semibold">{copy.result.heading}</h3>
      <p className="text-sm">{copy.result.receivedLabel}</p>
      <p className="text-2xl leading-tight font-bold tracking-tight tabular-nums wrap-anywhere">{scaled === null ? `${sign}${copy.preview.rawOnly(magnitude.toString())}` : `${sign}${scaled} ${NVDAX_SYMBOL}`}</p>
      <p className="text-xs text-muted-foreground tabular-nums">{copy.preview.raw(`${sign}${magnitude.toString()}`)}</p>
      <dl className="mt-2 border-y">
        <div className="grid grid-cols-1 gap-x-3 py-1.5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-baseline">
          <dt className="text-sm text-muted-foreground">{result.payToken === "USDC" ? copy.result.usdcPaid : copy.pay.paid(result.payToken)}</dt>
          <dd className="flex flex-col lg:items-end">
            {result.payToken === "USDC" ? (
              <>
                <span className="text-sm font-semibold tabular-nums">{`${usdcText(result.usdcPaidRaw, locale)} ${USDC_SYMBOL}`}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{copy.preview.raw(result.usdcPaidRaw.toString())}</span>
              </>
            ) : result.paidRaw === null ? (
              <span className="text-sm tabular-nums">{EMPTY_VALUE}</span>
            ) : (
              <>
                <span className="text-sm font-semibold tabular-nums">{payText(result.paidRaw, result.payToken, locale)}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{copy.preview.raw(result.paidRaw.toString())}</span>
              </>
            )}
          </dd>
        </div>
        {result.payToken !== "USDC" && result.usdcPaidRaw < 0n ? (
          <div className="grid grid-cols-1 gap-x-3 py-1.5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-baseline">
            <dt className="text-sm text-muted-foreground">{copy.pay.usdcLeft}</dt>
            <dd className="flex flex-col lg:items-end">
              <span className="text-sm font-semibold tabular-nums">{`${usdcText(-result.usdcPaidRaw, locale)} ${USDC_SYMBOL}`}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{copy.preview.raw((-result.usdcPaidRaw).toString())}</span>
            </dd>
          </div>
        ) : null}
      </dl>
      <div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
        <p>{copy.result.source}</p>
        {result.payToken !== "USDC" && PAY_TOKEN_UNITS[result.payToken].native ? <p>{copy.pay.solPaidNote}</p> : null}
        <p>{result.nvdaxMultiplier ? copy.preview.multiplierNote(clockText(result.nvdaxMultiplier.readAt, locale)) : copy.preview.multiplierUnavailable}</p>
      </div>
    </div>
  );
}

function TechnicalDetails({ label, details }: { label: string; details: string }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer">{label}</summary>
      <p className="mt-1 font-mono text-xs wrap-anywhere">{details}</p>
    </details>
  );
}

/** Stage (preview, trail, result or error) and the state's actions, in contract order. */
function stageAndActions(state: PurchaseState, now: number, copy: PurchaseCopy, locale: PublicWebLocale, handlers: PanelHandlers, refs: PanelRefs): { stage: ReactNode; actions: ReactNode } {
  const attempt = state.attempt;
  const connected = state.connection.kind === "connected";
  switch (attempt.phase) {
    case "editing":
      return { stage: null, actions: connected ? <PanelButton className="flex-1" onClick={handlers.onPreview}>{copy.action.preview}</PanelButton> : null };
    case "previewing":
      return { stage: null, actions: <PanelButton busy className="flex-1">{copy.action.previewing}</PanelButton> };
    case "previewFailed": {
      const limit = usdcText(PURCHASE_CONFIG.maxUsdcInRaw, locale);
      const quotedUsdc = attempt.failure === "overLimit" && attempt.details && /^\d+$/.test(attempt.details) ? usdcText(BigInt(attempt.details), locale) : "";
      const error = attempt.failure === "overLimit" ? copy.pay.overLimit : copy.error[attempt.failure];
      const body = attempt.failure === "notEnoughSol"
        ? copy.error.notEnoughSol.body(attempt.createsNvdaxAccount)
        : attempt.failure === "overLimit" ? copy.pay.overLimit.body(quotedUsdc, limit) : (error as { body: string }).body;
      const showDetails = attempt.details && attempt.failure !== "relayBusy" && attempt.failure !== "relayUnavailable" && attempt.failure !== "overLimit";
      const stage = (
        <PurchaseAlert title={error.title} titleRef={refs.errorTitle}>
          <p>{body}</p>
          {showDetails ? <TechnicalDetails label={copy.error.technicalDetails} details={attempt.details!} /> : null}
        </PurchaseAlert>
      );
      // A route check failure is fail-closed: no retry from the panel.
      if (attempt.failure === "routeCheck") return { stage, actions: null };
      const retry = attempt.failure === "relayBusy" || attempt.failure === "relayUnavailable" ? copy.action.tryAgain : copy.action.refresh;
      return { stage, actions: <PanelButton className="flex-1" onClick={handlers.onPreview}>{retry}</PanelButton> };
    }
    case "reviewReady":
    case "previewExpired":
    case "awaitingWallet": {
      const expired = attempt.phase === "previewExpired";
      const preview = attempt.preview;
      const stage = (
        <>
          {expired ? <PurchaseAlert title={copy.error.expired.title} titleRef={refs.errorTitle}><p>{copy.error.expired.body(clockText(preview.builtAt, locale))}</p></PurchaseAlert> : null}
          {attempt.phase === "reviewReady" && attempt.notice === "rejected" ? <PurchaseAlert title={copy.error.rejected.title} titleRef={refs.errorTitle}><p>{copy.error.rejected.body}</p></PurchaseAlert> : null}
          <h3 ref={refs.previewHeading} tabIndex={-1} className="text-base font-semibold">{expired ? copy.preview.headingExpired : copy.preview.heading}</h3>
          <PurchaseTermsList preview={preview} now={now} expired={expired} copy={copy.preview} payCopy={copy.pay} locale={locale} />
          {attempt.phase === "awaitingWallet" ? <PurchaseTrail steps={trailSteps(attempt, copy, locale)} copy={copy.trail} /> : null}
        </>
      );
      if (expired) {
        return {
          stage,
          actions: (
            <>
              <PanelButton className="flex-1" onClick={handlers.onPreview}>{copy.action.refresh}</PanelButton>
              <PanelButton variant="secondary" className="flex-1 cursor-not-allowed bg-(--disabled-surface) text-(--disabled-ink) opacity-100 hover:bg-(--disabled-surface)" disabled focusableWhenDisabled>{copy.action.approve}</PanelButton>
            </>
          ),
        };
      }
      if (attempt.phase === "awaitingWallet") return { stage, actions: <PanelButton busy className="flex-1">{copy.action.approving}</PanelButton> };
      return {
        stage,
        actions: (
          <>
            <PanelButton className="flex-1" onClick={handlers.onApprove}>{copy.action.approve}</PanelButton>
            <PanelButton variant="ghost" onClick={handlers.onPreview}>{copy.action.refresh}</PanelButton>
          </>
        ),
      };
    }
    case "walletOutcomeUnknown":
      // No approve action: the wallet may have sent it, so this preview is never offered again.
      return {
        stage: <PurchaseAlert title={copy.error.walletUnknown.title} titleRef={refs.errorTitle}><p>{copy.error.walletUnknown.body}</p></PurchaseAlert>,
        actions: (
          <>
            <PanelButton variant="outline" onClick={handlers.onStartNew}>{copy.action.startNew}</PanelButton>
            <PanelLink href={PURCHASE_CONFIG.explorerAddressUrl(attempt.preview.walletAddress)} copy={copy}>{copy.error.walletUnknown.explorer}</PanelLink>
          </>
        ),
      };
    case "submitted":
    case "confirmed":
      return {
        stage: (
          <>
            <PurchaseTrail steps={trailSteps(attempt, copy, locale)} copy={copy.trail} />
            <SignatureLine tracking={attempt.tracking} copy={copy} />
            <p className="text-sm font-medium">{copy.trail.keepOpen}</p>
          </>
        ),
        actions: <PanelLink href={PURCHASE_CONFIG.explorerTxUrl(attempt.tracking.signature)} copy={copy}>{copy.result.explorer}</PanelLink>,
      };
    case "notFinalized": {
      const error = attempt.reason === "relay" ? copy.error.trackingRelay : { title: copy.error.notFinalized.title, body: copy.error.notFinalized.body(minutesText(PURCHASE_CONFIG.statusPollTimeoutMs)) };
      return {
        stage: (
          <>
            <PurchaseAlert title={error.title} titleRef={refs.errorTitle}><p>{error.body}</p></PurchaseAlert>
            <PurchaseTrail steps={trailSteps(attempt, copy, locale)} copy={copy.trail} />
            <SignatureLine tracking={attempt.tracking} copy={copy} full />
          </>
        ),
        actions: (
          <>
            <PanelButton className="flex-1" onClick={handlers.onCheckAgain}>{copy.action.checkAgain}</PanelButton>
            <PanelLink href={PURCHASE_CONFIG.explorerTxUrl(attempt.tracking.signature)} copy={copy}>{copy.result.explorerCheck}</PanelLink>
          </>
        ),
      };
    }
    case "finalized":
      return {
        stage: (
          <>
            <PurchaseTrail steps={trailSteps(attempt, copy, locale)} copy={copy.trail} />
            <p className="text-sm">{copy.trail.readingResult}</p>
          </>
        ),
        actions: null,
      };
    case "result":
      return {
        stage: (
          <>
            <PurchaseTrail steps={trailSteps(attempt, copy, locale)} copy={copy.trail} />
            <ResultBlock attempt={attempt} copy={copy} locale={locale} refs={refs} />
            <SignatureLine tracking={attempt.tracking} copy={copy} />
          </>
        ),
        actions: (
          <>
            <PanelButton variant="outline" onClick={handlers.onStartNew}>{copy.action.startNew}</PanelButton>
            <PanelLink href={PURCHASE_CONFIG.explorerTxUrl(attempt.tracking.signature)} copy={copy}>{copy.result.explorer}</PanelLink>
          </>
        ),
      };
    case "resultUnreadable":
      return {
        stage: (
          <>
            <PurchaseTrail steps={trailSteps(attempt, copy, locale)} copy={copy.trail} />
            <p className="rounded-md bg-muted px-3 py-2.5 text-sm">{copy.result.unreadable}</p>
            <SignatureLine tracking={attempt.tracking} copy={copy} />
          </>
        ),
        actions: (
          <>
            <PanelButton className="flex-1" onClick={handlers.onCheckAgain}>{copy.action.checkAgain}</PanelButton>
            <PanelLink href={PURCHASE_CONFIG.explorerTxUrl(attempt.tracking.signature)} copy={copy}>{copy.result.explorer}</PanelLink>
          </>
        ),
      };
    case "failedOnChain":
      return {
        stage: (
          <>
            <PurchaseAlert title={copy.error.failedOnChain.title} titleRef={refs.errorTitle}>
              <p>{copy.error.failedOnChain.body}</p>
              <TechnicalDetails label={copy.error.technicalDetails} details={attempt.errorCode} />
            </PurchaseAlert>
            <SignatureLine tracking={attempt.tracking} copy={copy} />
          </>
        ),
        actions: (
          <>
            <PanelButton variant="outline" onClick={handlers.onStartNew}>{copy.action.startNew}</PanelButton>
            <PanelLink href={PURCHASE_CONFIG.explorerTxUrl(attempt.tracking.signature)} copy={copy}>{copy.result.explorer}</PanelLink>
          </>
        ),
      };
    case "dropped":
      return {
        stage: (
          <>
            <PurchaseAlert title={copy.error.dropped.title} titleRef={refs.errorTitle}><p>{copy.error.dropped.body}</p></PurchaseAlert>
            <SignatureLine tracking={attempt.tracking} copy={copy} />
          </>
        ),
        actions: <PanelButton variant="outline" onClick={handlers.onStartNew}>{copy.action.startNew}</PanelButton>,
      };
  }
}

export function PurchasePanelView({ state, now, locale, handlers, refs, announcement, flow }: { state: PurchaseState; now: number; locale: PublicWebLocale; handlers: PanelHandlers; refs: PanelRefs; announcement: string; flow?: PurchaseFlowChrome }) {
  const copy = purchaseMessagesFor(locale);
  const attempt = state.attempt;
  const postSend = isPostSend(attempt.phase);
  const pool = NVDAX_USDC_POOL.toBase58();
  const connected = state.connection.kind === "connected";
  const showField = connected && !postSend && attempt.phase !== "walletOutcomeUnknown";
  const locked = isAmountLocked(attempt.phase);
  const { stage, actions } = stageAndActions(state, now, copy, locale, handlers, refs);
  const preview = PREVIEW_PHASES.has(attempt.phase) ? (attempt as Extract<Attempt, { preview: PreviewTerms }>).preview : null;

  return (
    <PurchasePanelShell frame={purchaseFrameFrom(copy, pool)} locale={locale} phase={attempt.phase} flow={flow}>
      {!postSend ? <WalletStep state={state} copy={copy} handlers={handlers} locked={locked} /> : null}
      {showField ? <PayTokenField state={state} copy={copy} handlers={handlers} /> : null}
      {showField ? <AmountField state={state} copy={copy} locale={locale} handlers={handlers} refs={refs} /> : null}
      {hasUnresolvedEarlierRequest(state) ? <PurchaseAlert title={copy.error.earlierRequest.title} announce={false}><p>{copy.error.earlierRequest.body}</p></PurchaseAlert> : null}
      {stage ? <div key={attempt.phase} data-purchase-stage="" className="flex min-w-0 flex-col gap-1.5">{stage}</div> : null}
      {actions ? <div data-purchase-actions="" className={cn("flex flex-wrap items-center gap-2")}>{actions}</div> : null}
      {/* The notes describe what the wallet shows on approval; an expired preview can no longer be approved, and a refreshed one shows them again. */}
      {preview && attempt.phase !== "previewExpired" ? (
        <>
          <Separator />
          <PreviewNotes preview={preview} copy={copy} locale={locale} />
        </>
      ) : null}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
    </PurchasePanelShell>
  );
}
