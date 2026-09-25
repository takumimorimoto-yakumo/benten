/**
 * The purchase panel's outer frame: card, heading, route line and the four
 * "Before you buy" sentences (design contract sections 3 and 3.1).
 *
 * Static-safe: the Dossier imports it to prerender the frame before the
 * island loads, so it must not import the purchase catalog, the SDK or
 * anything else that belongs to the island chunk. Its copy arrives as a
 * `PurchaseFrame` value: from loader data on the static page, from the
 * island's own catalog inside the island. Both render this one component, so
 * the island replaces the prerendered frame without moving it.
 */
import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PublicWebLocale } from "@/i18n/locales";
import type { PurchaseCopy } from "@/i18n/purchase-messages";
import { CopyValue } from "./copy-value";
import { shortenAddress } from "./display";
import { PurchaseNotice } from "./purchase-notice";

/** Stable ids inside the panel (design contract section 10). */
export const PURCHASE_SECTION_ID = "purchase";
export const PURCHASE_HEADING_ID = "purchase-heading";

/** The copy and pool address the frame shows. Plain data, so it can travel as loader data. */
export type PurchaseFrame = {
  readonly heading: string;
  readonly routeLine: string;
  /** Full pool address for Copy; the route line shows it shortened. */
  readonly pool: string;
  readonly copyValue: PurchaseCopy["copyValue"];
  readonly notice: PurchaseCopy["notice"];
  /** Shown only without JavaScript, in the wallet step's place. */
  readonly noScript: string;
  /** The no-wallet message, whose height the wallet step reserves before a wallet is connected. */
  readonly walletReserve: WalletReserveCopy;
};

export type WalletReserveCopy = { readonly title: string; readonly body: string };

/** The frame for one locale's purchase copy and the pinned pool. */
export function purchaseFrameFrom(copy: PurchaseCopy, pool: string): PurchaseFrame {
  return {
    heading: copy.heading, routeLine: copy.routeLine(shortenAddress(pool)), pool, copyValue: copy.copyValue, notice: copy.notice,
    noScript: copy.noScript, walletReserve: { title: copy.wallet.notDetectedTitle, body: copy.wallet.notDetectedBody },
  };
}

/**
 * The wallet step's area until a wallet is connected. It keeps the height of
 * the no-wallet message (title and body, the tallest usual outcome) with an
 * invisible copy stacked under its content, so the prerendered frame, the
 * island's "looking for a wallet" line, the no-wallet message and a single
 * Connect button all take the same height, and the cards below the panel do
 * not move when the island replaces the frame or detection finishes. The
 * invisible copy is hidden from assistive technology.
 */
export function WalletStepReserve({ reserve, children }: { reserve: WalletReserveCopy; children?: ReactNode }) {
  return (
    <div data-purchase-reserve="" className="grid min-h-(--touch-target-min) items-start *:col-start-1 *:row-start-1">
      <div aria-hidden="true" className="invisible flex flex-col gap-1">
        <p className="text-sm font-semibold">{reserve.title}</p>
        <p className="text-sm">{reserve.body}</p>
      </div>
      {children}
    </div>
  );
}

/**
 * `copyable`: whether "Copy address" can be used. The prerendered frame passes
 * `false` until hydration: the button then keeps its place in the route line
 * (so the line does not reflow when it appears) but is invisible, unfocusable
 * and hidden from assistive technology, because without JavaScript it would
 * do nothing.
 */
export function PurchasePanelShell({ frame, locale, phase, copyable = true, flow, children }: { frame: PurchaseFrame; locale: PublicWebLocale; phase: string; copyable?: boolean; flow?: PurchaseFlowChrome; children?: ReactNode }) {
  if (flow) return <PurchaseFlowShell frame={frame} locale={locale} phase={phase} copyable={copyable} flow={flow}>{children}</PurchaseFlowShell>;
  return (
    <section id={PURCHASE_SECTION_ID} aria-labelledby={PURCHASE_HEADING_ID} data-purchase-panel="" data-phase={phase} lang={locale}>
      {/* Default card size and title scale, like every other card on the Dossier. */}
      <Card>
        <CardHeader>
          <CardTitle>
            {/* A jump lands with the card edge, not the heading, at the anchor margin: the card padding is added. */}
            <h2 id={PURCHASE_HEADING_ID} tabIndex={-1} className="scroll-mt-[calc(var(--anchor-scroll-margin)+var(--card-spacing))]">{frame.heading}</h2>
          </CardTitle>
          <p data-purchase-route="" className="text-sm text-muted-foreground wrap-anywhere">
            {frame.routeLine}{" "}
            {copyable ? <CopyValue value={frame.pool} copy={frame.copyValue} /> : <span aria-hidden="true" data-purchase-copy-pending="" className="invisible"><CopyValue value={frame.pool} copy={frame.copyValue} /></span>}
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-2.5">
          <PurchaseNotice copy={frame.notice} />
          {children}
        </CardContent>
      </Card>
    </section>
  );
}

/**
 * The buy flow's chrome around the same panel content (app IA section 5.1):
 * `leading` sits before the heading in the top bar (the Close control), and
 * `step` is the "Step n of 3" line under it.
 */
export type PurchaseFlowChrome = { readonly leading: ReactNode; readonly step: string };

/** Route line with its Copy, in the same form as the card's. */
function RouteLine({ frame, copyable }: { frame: PurchaseFrame; copyable: boolean }) {
  return (
    <p data-purchase-route="" className="text-sm text-muted-foreground wrap-anywhere">
      {frame.routeLine}{" "}
      {copyable ? <CopyValue value={frame.pool} copy={frame.copyValue} /> : <span aria-hidden="true" data-purchase-copy-pending="" className="invisible"><CopyValue value={frame.pool} copy={frame.copyValue} /></span>}
    </p>
  );
}

/**
 * The buy flow's version of the panel: a top bar with Close and the
 * heading, the step line, then the unchanged content order (route line,
 * "Before you buy", the state's content, its actions). The flow container
 * scrolls; the actions are pinned to its bottom by the `data-purchase-variant`
 * rule in `static.css`, above the bottom safe area.
 */
function PurchaseFlowShell({ frame, locale, phase, copyable, flow, children }: { frame: PurchaseFrame; locale: PublicWebLocale; phase: string; copyable: boolean; flow: PurchaseFlowChrome; children?: ReactNode }) {
  return (
    <section id={PURCHASE_SECTION_ID} aria-labelledby={PURCHASE_HEADING_ID} data-purchase-panel="" data-purchase-variant="flow" data-phase={phase} lang={locale} className="flex min-h-full flex-col">
      <div data-purchase-flow-bar="" className="sticky top-0 z-10 flex min-h-(--app-header-height) items-center gap-2 border-b bg-background ps-2 pe-(--flow-inline-padding) pt-(--safe-area-top)">
        {flow.leading}
        <h2 id={PURCHASE_HEADING_ID} tabIndex={-1} className="min-w-0 font-heading text-base font-medium">{frame.heading}</h2>
      </div>
      <div data-purchase-flow-body="" className="flex flex-1 flex-col gap-2.5 px-(--flow-inline-padding) pt-4 pb-4">
        <p data-purchase-step="" className="text-sm font-medium">{flow.step}</p>
        <RouteLine frame={frame} copyable={copyable} />
        <PurchaseNotice copy={frame.notice} />
        {children}
      </div>
    </section>
  );
}
