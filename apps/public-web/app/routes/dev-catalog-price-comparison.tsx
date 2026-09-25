/**
 * Living Catalog, price comparison section (development only; see
 * app/lib/dev-catalog-flag.ts). Every state of the Pyth and on-chain price
 * comparison panel and the review steps' Pyth reference check line, from the
 * labelled fixture (`features/price-comparison/comparison-fixture.ts`).
 * `?locale=` shows another locale.
 */
import { useSearchParams } from "react-router";
import { SiteShell } from "@/components/site/site-shell";
import { COMPARISON_FIXTURES, REFERENCE_CHECK_FIXTURE } from "@/features/price-comparison/comparison-fixture";
import { PriceComparisonView } from "@/features/price-comparison/price-comparison-panel";
import { PythReferenceCheckLine } from "@/features/price-comparison/reference-check";
import { DEFAULT_LOCALE, isPublicWebLocale } from "@/i18n/locales";

const SPECIMENS: readonly { title: string; facts: (typeof COMPARISON_FIXTURES)[keyof typeof COMPARISON_FIXTURES] }[] = [
  { title: "Both Pyth prices live, outside the regular session", facts: COMPARISON_FIXTURES.bothLive },
  { title: "Token feed's Solana account not updated for days (as observed 2026-09-25)", facts: COMPARISON_FIXTURES.tokenAccountNotUpdated },
  { title: "Underlying last updated at the previous close", facts: COMPARISON_FIXTURES.underlyingStale },
  { title: "Reads failed; trade without a value for one share", facts: COMPARISON_FIXTURES.unavailable },
  { title: "No token feed in the feed map, reading", facts: COMPARISON_FIXTURES.noTokenFeed },
];

export default function DevCatalogPriceComparison() {
  const [params] = useSearchParams();
  const requested = params.get("locale");
  const locale = isPublicWebLocale(requested) ? requested : DEFAULT_LOCALE;
  return (
    <SiteShell locale={locale} page={{ kind: "home" }} parentHref="/_catalog">
      <div className="flex flex-col gap-10">
        <h1 className="text-3xl font-semibold tracking-tight">Living Catalog: price comparison</h1>
        {SPECIMENS.map(({ title, facts }) => (
          <section key={title} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{title}</h2>
            <PriceComparisonView facts={facts} symbol="EXAMPLEx" busy={false} hydrated onRetry={() => undefined} locale={locale} />
          </section>
        ))}
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Review step: Pyth reference check line (display hook only)</h2>
          <PythReferenceCheckLine check={{ price: REFERENCE_CHECK_FIXTURE, valueText: "$20.00" }} locale={locale} />
          <PythReferenceCheckLine check={{ price: REFERENCE_CHECK_FIXTURE }} locale={locale} />
        </section>
      </div>
    </SiteShell>
  );
}
