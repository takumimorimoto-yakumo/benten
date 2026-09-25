import { Card, CardContent } from "@/components/ui/card";
import type { ChartData } from "@/features/charts/chart-data";
import { ChartSection } from "@/features/charts/chart-section";
import { CopyValue } from "@/features/purchase-island/copy-value";
import { PriceComparisonPanel } from "@/features/price-comparison";
import { PythReferencePrice } from "@/features/pricing/pyth-reference-price";
import { LearnLink, PROVIDER_LEARN_TOPIC } from "@/features/static-pages/learn-links";
import { formatNumber } from "@/i18n/format";
import { buyPath, companyPath, stockEvidencePath, type PublicWebLocale } from "@/i18n/locales";
import { messagesFor } from "@/i18n/messages";
import { productMessagesFor } from "@/i18n/product-messages";
import { BuyCapability, CapabilityNote, ProductHeader, SectionCard, TokenIdentity } from "./product-parts";
import type { StockProductView } from "./product-view";

/**
 * The xStock product page (app IA section 4.5): what the token is, its Pyth
 * reference price, what you own, the route and fees, whether Benten can buy
 * it, and its exact identity. Reading order (DOM and tab order): title,
 * price and capability, then the on-chain trade price chart (when the page
 * has chart data), the Pyth and on-chain comparison, what you own, route, identity. From `lg` the
 * price and capability sit in a sticky right column; below `md` the buy
 * action is pinned above the tab bar. The long source tables live on the
 * evidence page.
 */
export function StockProductPage({ view, chart = null, locale }: { view: StockProductView; chart?: ChartData | null; locale: PublicWebLocale }) {
  const copy = productMessagesFor(locale).product;
  const dossier = messagesFor(locale).dossier;
  const { identity } = view;
  const underlying = view.company?.displayName ?? identity.underlyingCompany;
  return (
    <div data-product-page="stock" className="grid gap-6 lg:grid-cols-(--dossier-columns) lg:items-start">
      <div className="lg:col-span-2">
        <ProductHeader
          symbol={identity.symbol}
          name={identity.tokenName}
          provider={copy.xstockProvider}
          company={underlying ? { name: underlying, href: view.company ? companyPath(locale, view.company.slug) : null, slug: view.company?.slug ?? null } : null}
          locale={locale}
        />
      </div>
      <aside aria-label={productMessagesFor(locale).price.label} data-product-aside="" className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-(--purchase-panel-sticky-top) lg:col-start-2 lg:row-start-2">
        <PythReferencePrice mint={identity.mint} locale={locale} />
        {view.purchase === "fixed_route" ? (
          <BuyCapability symbol={identity.symbol} href={buyPath(locale, identity.ticker)} locale={locale} />
        ) : (
          <CapabilityNote kind="not-buyable" heading={copy.capability.notBuyableHeading} body={copy.capability.notBuyableBody} />
        )}
      </aside>
      <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-2">
        {chart ? (
          <Card><CardContent><ChartSection data={chart} variant="product" symbol={identity.symbol} company={underlying} provider="xstocks" locale={locale} /></CardContent></Card>
        ) : null}
        <PriceComparisonPanel ticker={identity.ticker} symbol={identity.symbol} chart={chart} locale={locale} />
        <SectionCard id="what-you-own" heading={copy.whatYouOwn.heading}>
          <p className="max-w-prose">{copy.whatYouOwn.xstock(underlying ?? identity.ticker)}</p>
          <LearnLink topic={PROVIDER_LEARN_TOPIC.xstocks} locale={locale} />
        </SectionCard>
        {view.route ? (
          <SectionCard id="route-and-fees" heading={copy.route.heading}>
            <p className="max-w-prose wrap-anywhere text-muted-foreground" data-product-route="">
              {view.route.routeLine}{" "}
              <CopyValue value={view.route.pool} copy={copy.route.copyPool} />
            </p>
            {view.route.liquidity ? <p className="max-w-prose text-muted-foreground" data-product-route-liquidity="">{copy.route.liquidity(view.route.liquidity.amount, view.route.liquidity.date)}</p> : null}
            <p className="max-w-prose">{copy.route.fees(view.route.slippage)}</p>
          </SectionCard>
        ) : null}
        <TokenIdentity
          mint={identity.mint}
          evidenceHref={stockEvidencePath(locale, identity.ticker)}
          locale={locale}
          rows={[
            { label: copy.identity.issuer, value: identity.issuer, identifier: true },
            { label: copy.identity.decimals, value: formatNumber(identity.decimals, locale, "identifier") },
            { label: dossier.registry.underlyingTicker, value: identity.ticker },
          ]}
        />
      </div>
    </div>
  );
}
