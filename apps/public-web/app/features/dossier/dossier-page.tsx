import type { ReactNode } from "react";
import type { PurchaseFrame } from "@/features/purchase-island/purchase-panel-shell";
import { messagesFor } from "@/i18n/messages";
import type { PublicWebLocale } from "@/i18n/locales";
import { CoverageNotice } from "./coverage-notice";
import { DossierHeader } from "./dossier-header";
import { hasFinancialSections, type DossierView } from "./dossier-view";
import { LegacySnapshotSection } from "./legacy-snapshot-section";
import { PurchaseJumpLink } from "./purchase-jump-link";
import { PurchaseSlot } from "./purchase-slot";
import { RegistryRecordSection } from "./registry-record-section";
import { StickyAside } from "./sticky-aside";
import { VerifiedFactsSection } from "./verified-facts-section";

export { hasFinancialSections } from "./dossier-view";

/**
 * Reading order (DOM and tab order): overview, the purchase jump link (fixed
 * route only, narrow screens), technical identity, purchase, then company
 * facts and the legacy snapshot. The investor reads the exact token identity
 * before the purchase area. From `lg` the title spans the page and the
 * purchase area becomes a sticky right rail whose top aligns with the
 * registry record, without changing that order. `purchaseFrame` is the
 * prerendered purchase frame's copy (fixed route only); `purchaseFixture` is
 * passed only by the development-only fixture route.
 */
export function DossierPage({ view, locale, purchaseFrame = null, purchaseFixture }: { view: DossierView; locale: PublicWebLocale; purchaseFrame?: PurchaseFrame | null; purchaseFixture?: ReactNode }) {
  const copy = messagesFor(locale).dossier;
  return (
    <div className="grid gap-6 lg:grid-cols-(--dossier-columns) lg:items-start">
      <div className="flex flex-col gap-3 lg:col-span-2">
        <DossierHeader view={view} locale={locale} />
        {view.purchase === "fixed_route" ? <PurchaseJumpLink locale={locale} /> : null}
      </div>
      <div className="min-w-0 lg:col-start-1 lg:row-start-2"><RegistryRecordSection view={view} locale={locale} /></div>
      <StickyAside label={copy.purchase.heading}>
        <PurchaseSlot view={view} locale={locale} frame={purchaseFrame} fixture={purchaseFixture} />
      </StickyAside>
      <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-3">
        <CoverageNotice view={view} locale={locale} />
        {hasFinancialSections(view) ? (
          <>
            <VerifiedFactsSection view={view} locale={locale} />
            <LegacySnapshotSection view={view} locale={locale} />
          </>
        ) : null}
      </div>
    </div>
  );
}
