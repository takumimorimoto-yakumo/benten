/**
 * Evidence pages (app IA section 4.6): every record Benten uses for one
 * product, moved here unchanged in content from the former product pages so
 * the product page stays short. No action on these pages.
 */
import { BackLink } from "@/components/back-link";
import { AnnualHistorySection } from "@/features/dossier/annual-history-section";
import { CoverageNotice } from "@/features/dossier/coverage-notice";
import { hasFinancialSections, type DossierView } from "@/features/dossier/dossier-view";
import type { StatementsSource } from "@/features/statements/statement-data";
import { LegacySnapshotSection } from "@/features/dossier/legacy-snapshot-section";
import { RegistryRecordSection } from "@/features/dossier/registry-record-section";
import { VerifiedFactsSection } from "@/features/dossier/verified-facts-section";
import {
  CompanySection,
  IdentitySection,
  ReferenceValuesSection,
  RightsSection,
  SourcesSection,
  SupplySection,
  UnknownsSection,
} from "@/features/references/provider-page";
import type { ProviderView } from "@/features/references/provider-view";
import { dossierPath, providerPath, type PublicWebLocale } from "@/i18n/locales";
import { productMessagesFor } from "@/i18n/product-messages";

function EvidenceHeader({ symbol, backHref, locale }: { symbol: string; backHref: string; locale: PublicWebLocale }) {
  const copy = productMessagesFor(locale).evidence;
  return (
    <header className="flex flex-col gap-2">
      <BackLink href={backHref}>{copy.back(symbol)}</BackLink>
      <h1 className="text-3xl font-semibold tracking-tight">{copy.heading(symbol)}</h1>
      <p className="max-w-prose text-sm text-muted-foreground">{copy.lead}</p>
    </header>
  );
}

/** `/stock/{ticker}/evidence`: registry record with full addresses, coverage, verified facts, the annual history and the legacy snapshot. */
export function StockEvidencePage({ view, statements = null, locale }: { view: DossierView; statements?: StatementsSource | null; locale: PublicWebLocale }) {
  return (
    <div data-evidence-page="stock" className="flex flex-col gap-6">
      <EvidenceHeader symbol={view.identity.symbol} backHref={dossierPath(locale, view.identity.ticker)} locale={locale} />
      <RegistryRecordSection view={view} locale={locale} />
      <CoverageNotice view={view} locale={locale} />
      {hasFinancialSections(view) || (view.coverage.filingEligible && statements) ? (
        <>
          <VerifiedFactsSection view={view} locale={locale} />
          <AnnualHistorySection view={view} statements={statements} locale={locale} />
          <LegacySnapshotSection view={view} locale={locale} />
        </>
      ) : null}
    </div>
  );
}

/** `/provider/{provider}/{id}/evidence`: the provider's record, rights claim, references, supply, unknowns and sources. */
export function ProviderEvidencePage({ view, locale }: { view: ProviderView; locale: PublicWebLocale }) {
  return (
    <div data-evidence-page="provider" className="flex flex-col gap-6">
      <EvidenceHeader symbol={view.symbol} backHref={providerPath(locale, view.provider, view.providerAssetId)} locale={locale} />
      <IdentitySection view={view} locale={locale} />
      <CompanySection view={view} locale={locale} />
      <RightsSection view={view} locale={locale} />
      <ReferenceValuesSection view={view} locale={locale} />
      <SupplySection view={view} locale={locale} />
      <UnknownsSection view={view} locale={locale} />
      <SourcesSection view={view} locale={locale} />
    </div>
  );
}
