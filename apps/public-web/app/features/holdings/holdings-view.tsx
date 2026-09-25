/**
 * What the Holdings tab shows for one connected wallet (app IA sections 6.1
 * to 6.5), from explicit inputs so the Living Catalog can show every state.
 * The page's one filled button is Refresh; a row's `Buy {symbol}` is
 * outlined (IA section 5.3). The total, when it exists, is the screen's one
 * large figure.
 */
import type { ReactNode } from "react";
import { AlertTriangleIcon, BanIcon, ClockIcon, LoaderCircleIcon, RefreshCwIcon } from "lucide-react";
import { HOLDINGS_CONFIG } from "@benten/holdings/config";
import type { HoldingsObservation, HoldingsReason } from "@benten/holdings/read-holdings";
import { NoteLink } from "@/components/note-link";
import { ShortAddress } from "@/components/short-address";
import { StackingTable, type StackingTableColumn } from "@/components/stacking-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { PythReferencePriceView, pythPriceView } from "@/features/pricing";
import { CopyValue } from "@/features/purchase-island/copy-value";
import { formatNumber } from "@/i18n/format";
import { portfolioMessagesFor, type HoldingsCopy } from "@/i18n/holdings-messages";
import { homePath, type PublicWebLocale } from "@/i18n/locales";
import { shellMessagesFor } from "@/i18n/shell-messages";
import { formatObservationTime, formatTokenAmount, formatUsdValue } from "@/lib/observation-format";
import { cn } from "@/lib/utils";
import type { HoldingRow, HoldingsView } from "./holdings-model";

type ReadObservation = Extract<HoldingsObservation, { status: "available" | "partial" }>;

/** The connected wallet's screen, one of these at a time. */
export type HoldingsScreen =
  /** Nothing read for this address in this visit (after a wallet switch), or the first read running. */
  | { readonly kind: "not-read"; readonly reading: boolean }
  | { readonly kind: "unavailable"; readonly reason: HoldingsReason; readonly reading: boolean }
  | {
    readonly kind: "read";
    readonly observation: ReadObservation;
    readonly view: HoldingsView;
    readonly prices: "loading" | "loaded";
    /** Read earlier in this visit, before the page was opened again. */
    readonly stale: boolean;
    readonly reading: boolean;
  };

export type HoldingsStateName = "reading" | "not-read" | "error" | "none-held" | "list" | "partial" | "stale";

export function holdingsStateName(screen: HoldingsScreen): HoldingsStateName {
  if (screen.kind === "not-read") return screen.reading ? "reading" : "not-read";
  if (screen.kind === "unavailable") return "error";
  if (screen.stale) return "stale";
  if (screen.observation.status === "partial") return "partial";
  return screen.view.rows.length === 0 ? "none-held" : "list";
}

function errorTitle(reason: HoldingsReason, copy: HoldingsCopy["errors"]): string {
  switch (reason) {
    case "rate_limited":
      return copy.busy;
    case "upstream_unavailable":
    case "timeout":
      return copy.unreachable;
    case "account_limit":
      return copy.accountLimit;
    case "mint_limit":
      return copy.limit;
    default:
      return copy.invalid;
  }
}

function partialNote(reason: HoldingsReason | null, copy: HoldingsCopy["partial"]): string | null {
  if (reason === null) return null;
  if (reason === "unidentified_accounts") return copy.unidentified;
  if (reason === "mint_limit" || reason === "account_limit") return copy.limit;
  if (reason === "mint_unavailable" || reason === "clock_unavailable" || reason === "malformed_account") return copy.metadata;
  return copy.transport;
}

function RefreshButton({ reading, label, busyLabel }: { reading: boolean; label: string; busyLabel: string }) {
  return (
    <span className="contents" data-holdings-refresh-slot="">
      {reading ? <LoaderCircleIcon aria-hidden="true" className="motion-safe:animate-spin" /> : <RefreshCwIcon aria-hidden="true" />}
      <span aria-live="polite">{reading ? busyLabel : label}</span>
    </span>
  );
}

/** The connected wallet: its short address (the full one for screen readers and on hover) and Copy, which copies the full address. */
function WalletLine({ address, copy, locale }: { address: string; copy: HoldingsCopy; locale: PublicWebLocale }) {
  const wallet = shellMessagesFor(locale).wallet;
  return (
    <p className="flex flex-wrap items-baseline gap-x-3 text-sm">
      <span className="text-muted-foreground">{copy.walletLabel}</span>
      <ShortAddress address={address} data-holdings-address="" />
      <CopyValue value={address} copy={{ copy: wallet.copyAddress, copied: wallet.addressCopied, unavailable: wallet.copyUnavailable }} />
    </p>
  );
}

/** One reason a row has no value: a word and an icon, colour only supplementary (IA section 11). */
function Reason({ children, icon }: { children: ReactNode; icon: ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-sm text-muted-foreground" data-holdings-reason="">
      <span className="mt-0.5 shrink-0 [&>svg]:size-3.5">{icon}</span>
      <span>{children}</span>
    </p>
  );
}

function ValueCell({ row, copy, locale, pricesLoading }: { row: HoldingRow; copy: HoldingsCopy; locale: PublicWebLocale; pricesLoading: boolean }) {
  if (row.value !== null) {
    return <p className="text-base font-medium tabular-nums" data-holdings-value="">{formatUsdValue(row.value, locale)}</p>;
  }
  if (pricesLoading && (row.valueReason === "price_unavailable" || row.valueReason === "price_too_old" || row.valueReason === "price_confidence_too_wide")) {
    return <Reason icon={<LoaderCircleIcon aria-hidden="true" className="motion-safe:animate-spin" />}>{copy.readingPrices}</Reason>;
  }
  const reason = row.valueReason ?? "price_unavailable";
  const icon = reason === "price_stale" || reason === "price_too_old" ? <ClockIcon aria-hidden="true" /> : <BanIcon aria-hidden="true" />;
  return <Reason icon={icon}>{copy.reasons[reason]}</Reason>;
}

/**
 * The row's Pyth reference price: the same block, states and wording as the
 * product and company pages (`PythReferencePriceView`, compact), for the
 * feed that may value the holding. The column header names it, so its own
 * label is kept for assistive technology only.
 */
function PriceCell({ row, locale, nowMs, pricesLoading, onRetry }: { row: HoldingRow; locale: PublicWebLocale; nowMs: number; pricesLoading: boolean; onRetry?: () => void }) {
  if (!row.feed) return null;
  const read = row.priceRead ?? (pricesLoading ? null : { result: null, readAtMs: nowMs });
  return <PythReferencePriceView view={pythPriceView(row.feed, read, nowMs)} locale={locale} size="sm" labelHidden onRetry={onRetry ?? (() => undefined)} />;
}

function ProductCell({ row, copy }: { row: HoldingRow; copy: HoldingsCopy }) {
  const flags = [
    row.frozenAccounts > 0 ? copy.frozen(row.frozenAccounts) : null,
    row.delegatedAccounts > 0 ? copy.delegated(row.delegatedAccounts) : null,
  ].filter((flag): flag is string => flag !== null);
  return (
    <div className="flex flex-col gap-0.5">
      <a href={row.product.href} className="font-medium underline-offset-4 hover:underline" data-holdings-product={row.product.symbol}>
        {row.product.name}
      </a>
      <span className="font-mono text-sm text-muted-foreground">{row.product.symbol}</span>
      {flags.map((flag) => (
        <span key={flag} className="flex items-center gap-1 text-sm" data-holdings-account-flag="">
          <AlertTriangleIcon aria-hidden="true" className="size-3.5 shrink-0" />
          {flag}
        </span>
      ))}
    </div>
  );
}

function QuantityCell({ row, copy, locale }: { row: HoldingRow; copy: HoldingsCopy; locale: PublicWebLocale }) {
  return (
    <div className="flex flex-col gap-0.5">
      {row.displayAmount !== null ? (
        <p className="tabular-nums"><span className="font-medium">{formatTokenAmount(row.displayAmount, locale)}</span> {row.product.symbol}</p>
      ) : (
        <p className="text-sm text-muted-foreground">{copy.quantityUnknown}</p>
      )}
      <p className="font-mono text-xs break-all text-muted-foreground" data-holdings-raw="">{copy.raw(row.rawAmount)}</p>
    </div>
  );
}

function BuyCell({ row, copy }: { row: HoldingRow; copy: HoldingsCopy }) {
  if (!row.product.buyHref) return null;
  return (
    <a href={row.product.buyHref} data-cta="buy" className={cn(buttonVariants({ variant: "outline" }), "h-(--touch-target-min) md:h-8")}>
      {copy.buy(row.product.symbol)}
    </a>
  );
}

function TotalBlock({ view, copy, locale, pricesLoading, nowMs }: { view: HoldingsView; copy: HoldingsCopy; locale: PublicWebLocale; pricesLoading: boolean; nowMs: number }) {
  if (view.rows.length === 0 || pricesLoading) return null;
  if (view.total) {
    const from = formatObservationTime(view.total.oldestPriceUnix * 1000, locale, nowMs);
    const to = formatObservationTime(view.total.newestPriceUnix * 1000, locale, nowMs);
    return (
      <section aria-labelledby="holdings-total-label" className="flex flex-col gap-1" data-holdings-total="">
        <h2 id="holdings-total-label" className="text-sm font-medium text-muted-foreground">{copy.totalLabel}</h2>
        <p className="text-4xl font-semibold tracking-tight tabular-nums">{formatUsdValue(view.total.value, locale)}</p>
        <p className="text-sm text-muted-foreground">{copy.totalPrices(from, to)}</p>
      </section>
    );
  }
  return (
    <p className="text-sm text-muted-foreground" data-holdings-total="not-shown">
      {view.readComplete ? copy.totalNotShown(view.withoutValue, view.rows.length) : copy.totalIncompleteRead}
    </p>
  );
}

function ReadingRows() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true" data-holdings-skeleton="">
      {[0, 1].map((key) => (
        <div key={key} className="flex flex-col gap-2 rounded-lg border p-4">
          <div className="h-4 w-1/3 rounded bg-muted motion-safe:animate-pulse" />
          <div className="h-4 w-2/3 rounded bg-muted motion-safe:animate-pulse" />
        </div>
      ))}
    </div>
  );
}

export function HoldingsList({ view, locale, pricesLoading, nowMs, onRetryPrices }: { view: HoldingsView; locale: PublicWebLocale; pricesLoading: boolean; nowMs: number; onRetryPrices?: () => void }) {
  const copy = portfolioMessagesFor(locale).holdings;
  const columns: StackingTableColumn[] = [
    { key: "product", label: copy.columns.product, role: "rowheader" },
    { key: "quantity", label: copy.columns.quantity, role: "field" },
    { key: "value", label: copy.columns.value, role: "field" },
    { key: "price", label: copy.columns.price, role: "field" },
    { key: "action", label: copy.columns.action, role: "field" },
  ];
  return (
    <StackingTable
      caption={copy.listCaption}
      layout="cards"
      columns={columns}
      rows={view.rows.map((row) => ({
        key: row.mint,
        attributes: { "data-holdings-row": row.product.symbol },
        cells: [
          <ProductCell key="product" row={row} copy={copy} />,
          <QuantityCell key="quantity" row={row} copy={copy} locale={locale} />,
          <ValueCell key="value" row={row} copy={copy} locale={locale} pricesLoading={pricesLoading} />,
          row.feed ? <PriceCell key="price" row={row} locale={locale} nowMs={nowMs} pricesLoading={pricesLoading} onRetry={onRetryPrices} /> : null,
          row.product.buyHref ? <BuyCell key="action" row={row} copy={copy} /> : null,
        ],
      }))}
    />
  );
}

/**
 * The connected wallet's Holdings content. `onRefresh` is the page's one
 * primary action; it is absent in static catalog specimens.
 */
export function HoldingsConnected({ locale, address, screen, onRefresh, onRetryPrices, nowMs }: {
  locale: PublicWebLocale;
  address: string;
  screen: HoldingsScreen;
  onRefresh?: () => void;
  /** Read the prices of this observation again (a row's `Try again`). */
  onRetryPrices?: () => void;
  nowMs: number;
}) {
  const copy = portfolioMessagesFor(locale).holdings;
  const reading = screen.reading;
  const pricesLoading = screen.kind === "read" && screen.prices === "loading";
  const observedAt = screen.kind === "read" ? formatObservationTime(screen.observation.observedAt, locale, nowMs) : null;
  const refreshLabel = screen.kind === "unavailable" ? copy.tryAgain : copy.refresh;
  return (
    <div className="flex flex-col gap-6" data-holdings-screen={holdingsStateName(screen)}>
      <div className="flex flex-col gap-3">
        <WalletLine address={address} copy={copy} locale={locale} />
        {screen.kind === "read" ? (
          <div className="flex flex-col gap-0.5 text-sm text-muted-foreground" data-holdings-observation="">
            <p>{screen.stale ? copy.staleRead(observedAt!) : copy.readAt(observedAt!)}</p>
            {/* The slots are evidence for checking the read on-chain, not something to read first: kept, collapsed. */}
            <details data-holdings-slots="" className="text-xs">
              <summary className="w-fit cursor-pointer max-md:py-3.5">{copy.slotsDetails}</summary>
              <p className="mt-1 font-mono">{copy.slots(screen.observation.holdingsSlots.splToken, screen.observation.holdingsSlots.token2022)}</p>
            </details>
          </div>
        ) : screen.kind === "not-read" && !reading ? (
          <p className="text-sm text-muted-foreground">{copy.notRead}</p>
        ) : null}
        <div>
          <Button
            onClick={onRefresh}
            disabled={reading || !onRefresh}
            aria-busy={reading || undefined}
            className="h-(--touch-target-min) md:h-8"
            data-holdings-refresh=""
          >
            <RefreshButton reading={reading} label={refreshLabel} busyLabel={copy.refreshing} />
          </Button>
        </div>
      </div>

      {screen.kind === "not-read" && reading ? (
        <>
          <p className="text-sm" role="status" aria-live="polite">{copy.reading}</p>
          <ReadingRows />
        </>
      ) : null}

      {screen.kind === "unavailable" ? (
        <Alert variant="destructive" data-holdings-error={screen.reason}>
          <AlertTriangleIcon aria-hidden="true" />
          <AlertTitle><h2>{errorTitle(screen.reason, copy.errors)}</h2></AlertTitle>
          <AlertDescription><p>{screen.reason === "account_limit" ? copy.errors.accountLimitBody(formatNumber(HOLDINGS_CONFIG.maxAccountsPerProgram, locale)) : copy.errors.body}</p></AlertDescription>
        </Alert>
      ) : null}

      {screen.kind === "read" ? (
        <>
          {reading ? <p className="sr-only" role="status" aria-live="polite">{copy.reading}</p> : null}
          <TotalBlock view={screen.view} copy={copy} locale={locale} pricesLoading={pricesLoading} nowMs={nowMs} />
          {/* "Holds none" is claimed only by a complete read; a partial one says what is missing in its note. */}
          {screen.view.rows.length === 0 && screen.view.readComplete ? (
            <div className="flex flex-col gap-2" data-holdings-none="">
              <p>{copy.noneHeld}</p>
              <NoteLink href={homePath(locale)}>{copy.explore}</NoteLink>
            </div>
          ) : screen.view.rows.length > 0 ? (
            <HoldingsList view={screen.view} locale={locale} pricesLoading={pricesLoading} nowMs={nowMs} onRetryPrices={onRetryPrices} />
          ) : null}
          <div className="flex flex-col gap-1 text-sm text-muted-foreground" data-holdings-notes="">
            {partialNote(screen.observation.reason, copy.partial) ? <p data-holdings-partial="">{partialNote(screen.observation.reason, copy.partial)}</p> : null}
            {screen.view.otherAccounts > 0 ? <p data-holdings-other="">{copy.otherAccounts(screen.view.otherAccounts, screen.view.unreadableAccounts)}</p> : null}
            {screen.view.frozenAccounts > 0 ? <p data-holdings-frozen="">{copy.frozen(screen.view.frozenAccounts)}</p> : null}
            {screen.view.delegatedAccounts > 0 ? <p data-holdings-delegated="">{copy.delegated(screen.view.delegatedAccounts)}</p> : null}
            <p>{copy.readOnly}</p>
          </div>
        </>
      ) : null}
    </div>
  );
}
