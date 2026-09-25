import { useEffect, useState, type ReactNode } from "react";
import { InfoIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PurchasePanelShell, WalletStepReserve, type PurchaseFrame } from "@/features/purchase-island/purchase-panel-shell";
import { useAppSession } from "@/features/wallet-session/app-session";
import { messagesFor } from "@/i18n/messages";
import type { PublicWebLocale } from "@/i18n/locales";
import type { DossierView } from "./dossier-view";

/** Stable DOM contract for the purchase island that mounts after hydration. */
export const PURCHASE_SLOT_ID = "purchase-slot";
/** The slot is a jump target (`#purchase-slot`); it stops below the viewport edge instead of touching it. */
const SLOT_CLASS = "scroll-mt-(--anchor-scroll-margin)";

/**
 * The prerendered panel frame: heading, route line and the four "Before you
 * buy" sentences, readable without JavaScript. The wallet step's place keeps
 * the island's pre-connection height (see `WalletStepReserve`), so the island
 * replaces the frame without moving anything below it; without JavaScript it
 * says that buying needs JavaScript and a wallet. "Copy address" becomes
 * usable only once the page has hydrated.
 */
function PurchaseFramePlaceholder({ frame, locale, hydrated }: { frame: PurchaseFrame; locale: PublicWebLocale; hydrated: boolean }) {
  return (
    <PurchasePanelShell frame={frame} locale={locale} phase="frame" copyable={hydrated}>
      <WalletStepReserve reserve={frame.walletReserve}>
        <noscript><p data-purchase-noscript="" className="text-sm text-muted-foreground">{frame.noScript}</p></noscript>
      </WalletStepReserve>
    </PurchasePanelShell>
  );
}

/**
 * Loads the purchase island after hydration. The first render (and so every
 * prerendered document) is the static frame, and the island module is reached
 * only through this dynamic import, so no wallet or DEX code is in the static
 * page graph. The island installs into the app shell once per visit: coming
 * back to this page shows the same purchase, still tracked, instead of a new
 * one.
 */
function FixedRoutePurchase({ mint, ticker, locale, frame }: { mint: string; ticker: string; locale: PublicWebLocale; frame: PurchaseFrame | null }) {
  const { purchase, installPurchase } = useAppSession();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
    if (purchase) return;
    let active = true;
    void import("@/features/purchase-island").then((module) => {
      if (active) installPurchase(module.createInstalledPurchase);
    });
    return () => {
      active = false;
    };
    // Once per mount; an installed island is kept by the shell.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const Panel = purchase?.Panel;
  return (
    <div id={PURCHASE_SLOT_ID} className={SLOT_CLASS} data-purchase-slot="fixed_route" data-purchase-mint={mint}>
      {Panel ? <Panel locale={locale} product={ticker} /> : frame ? <PurchaseFramePlaceholder frame={frame} locale={locale} hydrated={hydrated} /> : null}
    </div>
  );
}

/**
 * The purchase area of the Dossier. For the one fixed-route token it hosts
 * the purchase island; every other token states, statically, that Benten
 * offers no purchase for it. `frame` is the fixed-route frame's copy from
 * loader data; `fixture` is passed only by the development-only fixture route.
 */
export function PurchaseSlot({ view, locale, frame = null, fixture }: { view: DossierView; locale: PublicWebLocale; frame?: PurchaseFrame | null; fixture?: ReactNode }) {
  if (view.purchase === "fixed_route") {
    // Development-only Living Catalog fixtures render a reducer state in place of the live island.
    if (fixture) return <div id={PURCHASE_SLOT_ID} className={SLOT_CLASS} data-purchase-slot="fixed_route" data-purchase-mint={view.identity.mint}>{fixture}</div>;
    return <FixedRoutePurchase mint={view.identity.mint} ticker={view.identity.ticker} locale={locale} frame={frame} />;
  }
  const copy = messagesFor(locale).dossier.purchase;
  return (
    <div id={PURCHASE_SLOT_ID} className={SLOT_CLASS} data-purchase-slot="unsupported">
      <Alert role="note" className="border-0 bg-muted">
        <InfoIcon aria-hidden="true" />
        <AlertTitle><h2>{copy.unsupportedHeading(view.identity.symbol)}</h2></AlertTitle>
        <AlertDescription><p>{copy.unsupportedBody}</p></AlertDescription>
      </Alert>
    </div>
  );
}
