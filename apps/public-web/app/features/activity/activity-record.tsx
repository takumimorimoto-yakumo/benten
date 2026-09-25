/**
 * One purchase record of the Activity tab (app IA section 5.4): what was
 * asked, what Solana says now, and the one safe next action, `Check again`,
 * which reads the same signature and never resends. Status is always a word
 * and an icon; colour is only supplementary.
 */
import { useRef, useState, type ReactNode } from "react";
import { BanIcon, CircleCheckIcon, CircleHelpIcon, ClockIcon, CircleXIcon, LoaderCircleIcon } from "lucide-react";
import { formatRawUnits } from "@benten/purchase/amount";
import { PURCHASE_CONFIG } from "@benten/purchase/config";
import { ExternalLink } from "@/components/external-link";
import { FactList } from "@/components/fact-list";
import { Button } from "@/components/ui/button";
import { portfolioMessagesFor, type ActivityCopy } from "@/i18n/holdings-messages";
import type { PublicWebLocale } from "@/i18n/locales";
import { COPY_FEEDBACK_MS, copyText } from "@/lib/clipboard";
import { formatObservationTime, formatTokenAmount } from "@/lib/observation-format";
import { shortenAddress } from "@/lib/short-address";
import type { ActivityToken } from "./activity-catalog";
import { ACTIVITY_CONFIG } from "./activity-config";
import type { CheckOutcome } from "./activity-check";
import { isFinalPhase, type ActivityPhase, type ActivityRecord } from "./activity-store";

export type RecordCheckState = { readonly kind: "idle" } | { readonly kind: "checking" } | { readonly kind: "done"; readonly outcome: CheckOutcome };

const PHASE_ICON: Record<ActivityPhase, ReactNode> = {
  opened: <CircleHelpIcon aria-hidden="true" />,
  outcome_unknown: <CircleHelpIcon aria-hidden="true" />,
  sent: <ClockIcon aria-hidden="true" />,
  confirmed: <ClockIcon aria-hidden="true" />,
  not_finalized: <ClockIcon aria-hidden="true" />,
  finalized: <CircleCheckIcon aria-hidden="true" />,
  failed: <CircleXIcon aria-hidden="true" />,
  dropped: <BanIcon aria-hidden="true" />,
};

/**
 * A token amount for display. A Scaled UI token's raw amount is not its
 * display amount, so without the display amount measured by the purchase flow
 * it is shown in raw units, labelled as such.
 */
export function amountText(raw: string, token: ActivityToken | undefined, display: string | null, locale: PublicWebLocale, copy: ActivityCopy): string {
  if (!token) return copy.rawAmount(raw, "");
  if (display !== null) return `${formatTokenAmount(display, locale)} ${token.symbol}`;
  if (token.scaledUi) return copy.rawAmount(raw, token.symbol);
  return `${formatTokenAmount(formatRawUnits(BigInt(raw), token.decimals), locale)} ${token.symbol}`;
}

function checkMessage(outcome: CheckOutcome, copy: ActivityCopy): string {
  if (outcome.kind === "checked") return copy.checkResult[outcome.state];
  if (outcome.kind === "unavailable") return copy.checkResult[outcome.reason];
  return outcome.reason === "other_network" ? copy.checkResult.other_network : "";
}

/** A swap-preview amount kept with the record: never a result, and labelled so. */
function PreviewValue({ raw, note }: { raw: string; note: string }) {
  return (
    <>
      <span className="block font-mono tabular-nums">{raw}</span>
      <span className="block text-muted-foreground">{note}</span>
    </>
  );
}

function CopySignature({ signature, copy }: { signature: string; copy: ActivityCopy }) {
  const [state, setState] = useState<"idle" | "copied" | "unavailable">("idle");
  const timer = useRef<number | null>(null);
  const label = state === "copied" ? copy.signatureCopied : state === "unavailable" ? copy.copyUnavailable : copy.copySignature;
  return (
    <>
      <Button
        variant="ghost"
        className="h-(--touch-target-min) md:h-8"
        data-activity-copy=""
        onClick={async () => {
          if (timer.current) window.clearTimeout(timer.current);
          setState((await copyText(signature)) ? "copied" : "unavailable");
          timer.current = window.setTimeout(() => setState("idle"), COPY_FEEDBACK_MS);
        }}
      >
        {label}
      </Button>
      <span className="sr-only" role="status" aria-live="polite">{state === "idle" ? "" : label}</span>
    </>
  );
}

/**
 * A sale on the fixed route: the Scaled UI token (NVDAx) went in and a plain
 * token (USDC) came out. Every purchase is the other way round.
 */
export function isSaleRecord(record: Pick<ActivityRecord, "inputMint" | "outputMint">, tokens: ReadonlyMap<string, ActivityToken>): boolean {
  return tokens.get(record.inputMint)?.scaledUi === true && tokens.get(record.outputMint)?.scaledUi === false;
}

export function ActivityRecordCard({ record, locale, tokens, productHref, connected, check, onCheck, nowMs, copyable }: {
  record: ActivityRecord;
  locale: PublicWebLocale;
  tokens: ReadonlyMap<string, ActivityToken>;
  productHref: string | null;
  /** The record's wallet is the connected one. */
  connected: boolean;
  check: RecordCheckState;
  onCheck?: (record: ActivityRecord) => void;
  nowMs: number;
  /** Copy needs the hydrated page. */
  copyable: boolean;
}) {
  const copy = portfolioMessagesFor(locale).activity;
  const headingId = `activity-${record.id}`;
  const input = tokens.get(record.inputMint);
  const output = tokens.get(record.outputMint);
  const sale = isSaleRecord(record, tokens);
  // A purchase is named by the token it bought, a sale by the token it sold.
  const symbol = output?.symbol ?? shortenAddress(record.outputMint);
  const tradedSymbol = sale ? (input?.symbol ?? shortenAddress(record.inputMint)) : symbol;
  const heading = sale ? copy.sell(tradedSymbol) : copy.buy(tradedSymbol);
  const finalized = record.phase === "finalized";
  const onMainnet = record.genesisHash === ACTIVITY_CONFIG.mainnetGenesisHash;
  const checkable = record.signature !== null && onMainnet && (!isFinalPhase(record.phase) || (finalized && record.receivedRaw === null));
  const note = (sale ? copy.salePhaseNote[record.phase] : undefined) ?? copy.phaseNote[record.phase];
  const time = (value: number) => formatObservationTime(value, locale, nowMs);
  return (
    <article aria-labelledby={headingId} className="flex flex-col gap-3 rounded-lg border bg-card p-4" data-activity-record={record.phase}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id={headingId} className="text-base font-semibold">
          {productHref ? <a href={productHref} className="underline-offset-4 hover:underline">{heading}</a> : heading}
        </h2>
        <p className="flex items-center gap-1.5 text-sm font-medium [&>svg]:size-4" data-activity-phase={record.phase}>
          {PHASE_ICON[record.phase]}
          {copy.phase[record.phase]}
        </p>
      </header>

      {finalized && record.receivedRaw !== null ? (
        <div className="flex flex-col gap-0.5" data-activity-result="">
          <p className="text-lg font-semibold tabular-nums">{copy.received(amountText(record.receivedRaw, output, record.receivedDisplay, locale, copy))}</p>
          {record.paidRaw !== null ? <p className="tabular-nums">{copy.paid(amountText(record.paidRaw, input, null, locale, copy))}</p> : null}
          <p className="text-sm text-muted-foreground">{copy.measured}</p>
        </div>
      ) : finalized ? (
        <p className="text-sm">{copy.resultUnreadable}</p>
      ) : (
        <div className="flex flex-col gap-0.5">
          <p className="tabular-nums">{copy.entered(amountText(record.inputRaw, input, null, locale, copy))}</p>
          {note ? <p className="text-sm font-medium">{note}</p> : null}
        </div>
      )}

      <div className="flex flex-col gap-0.5 text-sm text-muted-foreground">
        <p>{copy.started(time(record.createdAt))}</p>
        <p>
          <span className="font-mono">{copy.wallet(shortenAddress(record.walletAddress))}</span>
          {connected ? <span> ({copy.thisWallet})</span> : null}
        </p>
        {record.lastCheckedAt !== null ? <p>{copy.lastChecked(time(record.lastCheckedAt))}</p> : null}
      </div>

      {record.signature ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="text-muted-foreground">{copy.signature}</span>
          <span className="font-mono" title={record.signature} data-activity-signature="">{shortenAddress(record.signature)}</span>
          {copyable ? <CopySignature signature={record.signature} copy={copy} /> : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {checkable ? (
          <Button
            variant="outline"
            className="h-(--touch-target-min) md:h-8"
            disabled={!onCheck || check.kind === "checking"}
            aria-busy={check.kind === "checking" || undefined}
            onClick={() => onCheck?.(record)}
            data-activity-check=""
          >
            {check.kind === "checking" ? <LoaderCircleIcon aria-hidden="true" className="motion-safe:animate-spin" /> : null}
            {check.kind === "checking" ? copy.checking : copy.checkAgain}
          </Button>
        ) : null}
        <ExternalLink
          href={record.signature ? PURCHASE_CONFIG.explorerTxUrl(record.signature) : PURCHASE_CONFIG.explorerAddressUrl(record.walletAddress)}
          newTabLabel={copy.newTab}
          className="text-sm"
        >
          {record.signature ? copy.explorer : copy.explorerWallet}
        </ExternalLink>
      </div>
      {/* Always present, so the check result is announced; shown only when it has something to say. */}
      <p className="text-sm font-medium empty:sr-only" role="status" aria-live="polite" data-activity-check-result={check.kind === "done" ? check.outcome.kind : ""}>
        {check.kind === "done" ? checkMessage(check.outcome, copy) : !onMainnet ? copy.checkResult.other_network : ""}
      </p>

      <details className="group text-sm">
        <summary className="flex min-h-(--touch-target-min) cursor-pointer items-center font-medium underline-offset-4 hover:underline md:min-h-8">{copy.details}</summary>
        <div className="pt-2">
          <FactList
            items={[
              { label: copy.detail.record, value: record.id, identifier: true },
              { label: copy.detail.started, value: time(record.createdAt) },
              { label: copy.detail.network, value: onMainnet ? copy.detail.mainnet : copy.detail.otherNetwork },
              { label: copy.detail.route, value: record.routeId, identifier: true },
              ...(record.signature ? [{ label: copy.signature, value: record.signature, identifier: true }] : []),
              ...(record.expectedOutputRaw !== null ? [{ label: copy.detail.expected, value: <PreviewValue raw={copy.rawAmount(record.expectedOutputRaw, symbol)} note={copy.detail.previewNote} /> }] : []),
              ...(record.minimumOutputRaw !== null ? [{ label: copy.detail.minimum, value: <PreviewValue raw={copy.rawAmount(record.minimumOutputRaw, symbol)} note={copy.detail.previewNote} /> }] : []),
              ...(record.finalizedAt !== null ? [{ label: copy.detail.finalizedAt, value: time(record.finalizedAt) }] : []),
              { label: copy.detail.lastChecked, value: record.lastCheckedAt !== null ? time(record.lastCheckedAt) : copy.detail.never },
            ]}
          />
        </div>
      </details>
    </article>
  );
}
