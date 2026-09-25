import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InfoIcon, LockIcon } from "lucide-react";
import { NoteLink } from "@/components/note-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useWalletSessionState } from "@/features/wallet-session/app-session";
import { portfolioMessagesFor } from "@/i18n/holdings-messages";
import { homePath, localePrefix, type PublicWebLocale } from "@/i18n/locales";
import { shellMessagesFor } from "@/i18n/shell-messages";
import { useHydrated } from "@/lib/use-hydrated";
import { EMPTY_ACTIVITY_CATALOG, type ActivityCatalog } from "./activity-catalog";
import { checkPurchaseThroughRelay, type CheckOutcome } from "./activity-check";
import { ACTIVITY_CONFIG } from "./activity-config";
import { ActivityRecordCard, type RecordCheckState } from "./activity-record";
import { activityStore, recordPurchaseAttempt, type ActivityList, type ActivityRecord, type ActivityStore } from "./activity-store";

export type ActivityChecker = (record: ActivityRecord) => Promise<CheckOutcome>;

const browserCheck: ActivityChecker = (record) => checkPurchaseThroughRelay(record, recordPurchaseAttempt);
const IDLE: RecordCheckState = { kind: "idle" };

/** This browser's history, read after hydration and again on every write (this tab or another). */
function useActivityList(store: ActivityStore): ActivityList | null {
  const [list, setList] = useState<ActivityList | null>(null);
  useEffect(() => {
    const read = () => setList(store.list());
    read();
    return store.subscribe(read);
  }, [store]);
  return list;
}

/** Records of the connected wallet first, then the others; each group newest first (the store's order). */
function ordered(records: readonly ActivityRecord[], connectedAddress: string | null): ActivityRecord[] {
  if (!connectedAddress) return [...records];
  return [...records.filter((record) => record.walletAddress === connectedAddress), ...records.filter((record) => record.walletAddress !== connectedAddress)];
}

function ClearHistory({ locale, onClear }: { locale: PublicWebLocale; onClear: () => boolean }) {
  const copy = portfolioMessagesFor(locale).activity;
  const dialog = useRef<HTMLDialogElement>(null);
  const [notice, setNotice] = useState<"cleared" | "failed" | null>(null);
  return (
    <div className="flex flex-col gap-2 border-t pt-4">
      <div>
        <Button variant="destructive" className="h-(--touch-target-min) md:h-8" onClick={() => dialog.current?.showModal()} data-activity-clear="">
          {copy.clear}
        </Button>
      </div>
      <p className="text-sm" role="status" aria-live="polite">{notice === "cleared" ? copy.cleared : notice === "failed" ? copy.clearFailed : ""}</p>
      <dialog
        ref={dialog}
        aria-labelledby="activity-clear-title"
        aria-describedby="activity-clear-body"
        className="m-auto w-full max-w-md rounded-lg border bg-popover p-4 text-popover-foreground backdrop:bg-(color:--scrim)/40"
        data-activity-clear-dialog=""
      >
        <h2 id="activity-clear-title" className="text-base font-semibold">{copy.clearTitle}</h2>
        <p id="activity-clear-body" className="mt-2 text-sm text-muted-foreground">{copy.clearBody}</p>
        <form method="dialog" className="mt-4 flex flex-wrap justify-end gap-2">
          <Button type="submit" variant="outline" className="h-(--touch-target-min) md:h-8" autoFocus>{copy.clearCancel}</Button>
          <Button
            type="button"
            variant="destructive"
            className="h-(--touch-target-min) md:h-8"
            data-activity-clear-confirm=""
            onClick={() => {
              setNotice(onClear() ? "cleared" : "failed");
              dialog.current?.close();
            }}
          >
            {copy.clearConfirm}
          </Button>
        </form>
      </dialog>
    </div>
  );
}

function PrivacyNote({ locale }: { locale: PublicWebLocale }) {
  const copy = portfolioMessagesFor(locale).activity;
  const privacyHref = ACTIVITY_CONFIG.privacyPath?.(localePrefix(locale)) ?? null;
  return (
    <section aria-labelledby="activity-privacy" className="flex flex-col gap-1 text-sm text-muted-foreground" data-activity-privacy="">
      <h2 id="activity-privacy" className="flex items-center gap-1.5 font-medium text-foreground">
        <LockIcon aria-hidden="true" className="size-3.5" />
        {copy.privacyTitle}
      </h2>
      <p>{copy.privacyBody}</p>
      {/* The privacy page (ACTIVITY_CONFIG.privacyPath); without a path the explanation stands alone. */}
      {privacyHref ? <NoteLink href={privacyHref}>{copy.privacyLink}</NoteLink> : null}
    </section>
  );
}

/**
 * The Activity tab (app IA section 5.4): purchases made in Benten from this
 * browser, newest first, the connected wallet's first. The prerendered
 * document is the empty state (the history lives in this browser only); the
 * list replaces it after hydration. `store` and `check` are the browser's by
 * default; the Living Catalog passes fixtures.
 */
export function ActivityPage({ locale, catalog = EMPTY_ACTIVITY_CATALOG, store = activityStore, check = browserCheck, nowMs }: {
  locale: PublicWebLocale;
  catalog?: ActivityCatalog;
  store?: ActivityStore;
  check?: ActivityChecker;
  /** Fixed clock for catalog specimens. */
  nowMs?: number;
}) {
  const shell = shellMessagesFor(locale).activity;
  const copy = portfolioMessagesFor(locale).activity;
  const list = useActivityList(store);
  const hydrated = useHydrated();
  const session = useWalletSessionState();
  const connectedAddress = session.connection.kind === "connected" ? session.connection.address : null;
  const tokens = useMemo(() => new Map(catalog.tokens.map((token) => [token.mint, token])), [catalog]);
  const [checks, setChecks] = useState<ReadonlyMap<string, RecordCheckState>>(new Map());
  const runCheck = useCallback((record: ActivityRecord) => {
    setChecks((current) => new Map(current).set(record.id, { kind: "checking" }));
    void check(record).then((outcome) => setChecks((current) => new Map(current).set(record.id, { kind: "done", outcome })));
  }, [check]);

  const records = list?.status === "available" ? ordered(list.records, connectedAddress) : [];
  const state = list?.status === "unavailable" ? "unavailable" : records.length > 0 ? "list" : "empty";
  const now = nowMs ?? Date.now();

  return (
    <div className="flex max-w-3xl flex-col gap-4" data-activity-state={state}>
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">{shell.heading}</h1>
        <p className="text-muted-foreground">{shell.lead}</p>
      </div>

      {state === "unavailable" ? (
        <Alert role="note" data-activity-unavailable="">
          <InfoIcon aria-hidden="true" />
          <AlertTitle><h2>{copy.privacyTitle}</h2></AlertTitle>
          <AlertDescription><p>{copy.storageUnavailable}</p></AlertDescription>
        </Alert>
      ) : state === "list" ? (
        <ul className="flex flex-col gap-4" aria-label={copy.listLabel}>
          {records.map((record) => (
            <li key={record.id}>
              <ActivityRecordCard
                record={record}
                locale={locale}
                tokens={tokens}
                productHref={catalog.productHrefs[record.outputMint] ?? null}
                connected={record.walletAddress === connectedAddress}
                check={checks.get(record.id) ?? IDLE}
                onCheck={runCheck}
                nowMs={now}
                copyable={hydrated}
              />
            </li>
          ))}
        </ul>
      ) : (
        <>
          <p>{shell.empty}</p>
          <NoteLink href={homePath(locale)}>{shell.explore}</NoteLink>
        </>
      )}

      {list?.status === "available" && list.skipped > 0 ? <p className="text-sm text-muted-foreground" data-activity-skipped="">{copy.skipped(list.skipped)}</p> : null}
      {state !== "unavailable" ? <PrivacyNote locale={locale} /> : null}
      {state === "list" ? <ClearHistory locale={locale} onClear={() => store.clear()} /> : null}
    </div>
  );
}
