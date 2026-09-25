import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PythReferencePrice } from "@/features/pricing";
import { LearnLink, PROVIDER_LEARN_TOPIC } from "@/features/static-pages/learn-links";
import { companyMessagesFor } from "@/i18n/company-messages";
import { joinSentences } from "@/i18n/format";
import { buyPath, dossierPath, providerPath, type PublicWebLocale } from "@/i18n/locales";
import { cn } from "@/lib/utils";
import type { CompanyProductView, ProductOwnership } from "./company-view";

/** A product's own page: the xStock Dossier or the provider instrument page. */
export function productPagePath(locale: PublicWebLocale, product: Pick<CompanyProductView, "provider" | "routeKey">): string {
  return product.provider === "xstocks" ? dossierPath(locale, product.routeKey) : providerPath(locale, product.provider, product.routeKey);
}

/**
 * Where `Buy {symbol}` goes: the buy flow's own route (`/stock/{ticker}/buy`,
 * app IA sections 5.1 and 5.3). Closing the flow returns to the product page,
 * its logical parent.
 */
export function purchaseEntryPath(locale: PublicWebLocale, ticker: string): string {
  return buyPath(locale, ticker);
}

/** What the holder owns, in plain sentences built from the record's fields only. */
export function ownershipSentences(ownership: ProductOwnership, provider: string, locale: PublicWebLocale): readonly string[] {
  const copy = companyMessagesFor(locale).company.own;
  if (ownership.kind === "xstock") return [copy.xstock];
  const { equityOwnership: equity, votingRights: voting } = ownership;
  const rights = equity === "unknown"
    ? voting === "unknown" ? copy.rights.unknownBoth : copy.rights.unknownEquityNoVoting
    : voting === "unknown" ? copy.rights.noEquityUnknownVoting : copy.rights.neither;
  return [copy.kind[ownership.instrumentKind](provider), rights, ...(ownership.claimOnly ? [copy.notVerified] : [])];
}

/**
 * One way to hold a company (app IA section 4.4): symbol and name linking to
 * the product page, who issues it, what it gives the holder in one or two
 * sentences with a link to the learn topic that explains it, its Pyth reference price (read after hydration; the reviewed
 * feed map decides whether it has one), and what Benten can do with it. Only
 * a product with the fixed purchase route carries the page's one filled
 * action.
 */
export function CompanyProductCard({ product, locale }: { product: CompanyProductView; locale: PublicWebLocale }) {
  const copy = companyMessagesFor(locale);
  const provider = copy.providers[product.provider];
  return (
    <Card data-company-product={product.key} data-product-capability={product.buyable ? "buy" : "compare"}>
      <CardHeader>
        <h3 className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <a href={productPagePath(locale, product)} className="text-lg font-semibold underline underline-offset-4 hover:text-muted-foreground max-md:inline-flex max-md:min-h-(--touch-target-min) max-md:items-center">{product.symbol}</a>
          <span className="font-normal text-muted-foreground">{product.name}</span>
        </h3>
        <p className="text-muted-foreground">{copy.company.from(provider)}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-base">{joinSentences(ownershipSentences(product.ownership, provider, locale), locale)}</p>
          <LearnLink topic={PROVIDER_LEARN_TOPIC[product.provider]} locale={locale} />
        </div>
        <Separator />
        <PythReferencePrice mint={product.mint} locale={locale} />
        <Separator />
        {product.buyable ? (
          <div data-cta="buy" className="flex flex-col gap-3">
            <p>{copy.company.capability.buy}</p>
            <a href={purchaseEntryPath(locale, product.routeKey)} className={cn(buttonVariants({ size: "lg" }), "h-auto min-h-(--touch-target-min) w-full text-base")}>
              {copy.company.cta(product.symbol)}
            </a>
          </div>
        ) : (
          <p data-product-compare-only="" className="rounded-lg bg-muted px-3 py-2 text-muted-foreground">{copy.company.capability.compare}</p>
        )}
      </CardContent>
    </Card>
  );
}
