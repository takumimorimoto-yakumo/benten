import { ExternalLink } from "@/components/external-link";
import { Card, CardContent } from "@/components/ui/card";
import type { ChartData } from "@/features/charts/chart-data";
import { ChartSection } from "@/features/charts/chart-section";
import { PythReferencePrice } from "@/features/pricing/pyth-reference-price";
import { LearnLink, PROVIDER_LEARN_TOPIC } from "@/features/static-pages/learn-links";
import { rightsValue } from "@/features/references/reference-terms";
import type { ProviderView } from "@/features/references/provider-view";
import { companyPath, providerEvidencePath, type PublicWebLocale } from "@/i18n/locales";
import { messagesFor, referenceMessagesFor } from "@/i18n/messages";
import { productMessagesFor } from "@/i18n/product-messages";
import { CapabilityNote, ProductHeader, SectionCard, TokenIdentity } from "./product-parts";

/**
 * A provider instrument's product page (app IA section 4.5): what the token
 * is, its Pyth reference price when the reviewed feed map binds one, what
 * the provider says you own, that Benten shows it for comparison only, and
 * its exact identity. Provider-published reference numbers, unknowns and
 * sources are on the evidence page.
 */
export function ProviderProductPage({ view, chart = null, locale }: { view: ProviderView; chart?: ChartData | null; locale: PublicWebLocale }) {
  const copy = productMessagesFor(locale).product;
  const refs = referenceMessagesFor(locale);
  const home = messagesFor(locale).home.providers;
  const providerName = home.names[view.provider];
  const companyName = view.company.page?.displayName ?? view.company.name;
  return (
    <div data-product-page="provider" className="grid gap-6 lg:grid-cols-(--dossier-columns) lg:items-start">
      <div className="lg:col-span-2">
        <ProductHeader
          symbol={view.symbol}
          name={view.displayName}
          provider={providerName}
          company={{ name: companyName, href: view.company.page ? companyPath(locale, view.company.page.slug) : null, slug: view.company.page?.slug ?? null }}
          locale={locale}
        />
      </div>
      <aside aria-label={productMessagesFor(locale).price.label} data-product-aside="" className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-(--purchase-panel-sticky-top) lg:col-start-2 lg:row-start-2">
        <PythReferencePrice mint={view.mint} locale={locale} />
        <CapabilityNote kind="compare-only" heading={copy.capability.compareOnlyHeading} body={copy.capability.compareOnlyBody(view.symbol)} data-provider-purchase="unsupported" />
      </aside>
      <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-2">
        {chart ? (
          <Card><CardContent><ChartSection data={chart} variant="product" symbol={view.symbol} company={companyName} provider="prestocks" locale={locale} /></CardContent></Card>
        ) : null}
        <SectionCard id="what-you-own" heading={copy.whatYouOwn.heading}>
          <p className="max-w-prose">{copy.whatYouOwn.prestocks(providerName, companyName)}</p>
          <p className="max-w-prose text-muted-foreground">{copy.whatYouOwn.prestocksRights(rightsValue(view.rights.equityOwnership, locale), rightsValue(view.rights.votingRights, locale))}</p>
          <LearnLink topic={PROVIDER_LEARN_TOPIC[view.provider]} locale={locale} />
        </SectionCard>
        <TokenIdentity
          mint={view.mint}
          evidenceHref={providerEvidencePath(locale, view.provider, view.providerAssetId)}
          locale={locale}
          rows={[
            { label: copy.identity.provider, value: providerName },
            { label: refs.provider.identity.instrument, value: home.instrumentKinds[view.instrumentKind] },
            { label: refs.provider.identity.providerPage, value: <ExternalLink href={view.externalUrl} newTabLabel={refs.provider.sources.opensNewTab}>{refs.provider.identity.openOn(providerName)}</ExternalLink> },
          ]}
        />
      </div>
    </div>
  );
}
