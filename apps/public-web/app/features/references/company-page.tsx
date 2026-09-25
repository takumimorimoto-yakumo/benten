import type { ReactNode } from "react";
import { InfoIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ExternalLink } from "@/components/external-link";
import { ShareButton } from "@/components/share-button";
import { FactList } from "@/components/fact-list";
import { NoteLink } from "@/components/note-link";
import { companyMessagesFor } from "@/i18n/company-messages";
import { formatCompactCurrency, formatNumber, formatSourceDate } from "@/i18n/format";
import { dossierPath, type PublicWebLocale } from "@/i18n/locales";
import { fiscalYearLabel } from "@/i18n/fiscal-year";
import { messagesFor } from "@/i18n/messages";
import { ChartSection } from "@/features/charts/chart-section";
import type { ChartData } from "@/features/charts/chart-data";
import type { StatementsSource } from "@/features/statements/statement-data";
import { CompanyStatementsSection } from "@/features/statements/statements-section";
import { cn } from "@/lib/utils";
import { CompanyProductCard } from "./company-product-card";
import type { CompanyFactsView, CompanyView } from "./company-view";

function PageSection({ id, heading, children }: { id: string; heading: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-3">
      <h2 id={`${id}-heading`} className="text-xl font-semibold tracking-tight">{heading}</h2>
      {children}
    </section>
  );
}

/** The ways to hold the company, in map order. With two or more, the notice says they are not interchangeable. */
export function CompanyProducts({ view, locale }: { view: CompanyView; locale: PublicWebLocale }) {
  const copy = companyMessagesFor(locale).company;
  return (
    <PageSection id="company-products" heading={copy.waysHeading(formatNumber(view.products.length, locale))}>
      {view.products.length >= 2 ? (
        <Alert role="note" data-company-notice="">
          <InfoIcon aria-hidden="true" />
          <AlertTitle>{copy.notice.title}</AlertTitle>
          <AlertDescription><p>{copy.notice.body}</p></AlertDescription>
        </Alert>
      ) : null}
      <ul className="flex flex-col gap-4">
        {view.products.map((product) => <li key={product.key}><CompanyProductCard product={product} locale={locale} /></li>)}
      </ul>
    </PageSection>
  );
}

/** US-listed: the newest filing-verified SEC facts of the annual history with their filings, or the not-yet-verified note. Private: the source note. */
export function CompanyFacts({ facts, name, symbol, locale }: { facts: CompanyFactsView; name: string; symbol: string; locale: PublicWebLocale }) {
  const copy = companyMessagesFor(locale).company;
  if (facts.kind === "private") {
    return (
      <PageSection id="company-facts" heading={copy.sources.heading}>
        <p className="max-w-prose text-muted-foreground">{copy.sources.private(name)}</p>
      </PageSection>
    );
  }
  const record = <NoteLink href={dossierPath(locale, facts.ticker)} data-company-record={facts.ticker}>{copy.facts.record(symbol)}</NoteLink>;
  if (facts.kind === "not_verified") {
    return (
      <PageSection id="company-facts" heading={copy.facts.heading}>
        <p className="max-w-prose text-muted-foreground">{copy.facts.notVerified(name)}</p>
        {record}
      </PageSection>
    );
  }
  const verified = messagesFor(locale).dossier.verified;
  return (
    <PageSection id="company-facts" heading={copy.facts.heading}>
      <FactList
        items={facts.rows.map((row) => ({
          label: verified.labels[row.name],
          value: (
            <span data-company-fact={row.name}>
              {/* Short for reading; the exact reported amount is on the evidence page (and in `value`). */}
              <data value={row.value} className="font-medium tabular-nums">{formatCompactCurrency(row.value, row.currency, locale)}</data>{" "}
              <span className="text-muted-foreground">{fiscalYearLabel(row.label.periodEnd, locale)}</span>
            </span>
          ),
        }))}
      />
      <ul className="flex flex-col gap-1 text-sm">
        {facts.sources.map((source) => (
          <li key={source.accessionNumber}>
            <span className="text-muted-foreground">{verified.sourceColumn}: </span>
            <ExternalLink href={source.filingUrl} newTabLabel={verified.opensNewTab}>{verified.filedLink(source.form, formatSourceDate(source.filedAt, locale))}</ExternalLink>
          </li>
        ))}
      </ul>
      {record}
    </PageSection>
  );
}

function CompanyMethod({ view, locale }: { view: CompanyView; locale: PublicWebLocale }) {
  const copy = companyMessagesFor(locale).company.method;
  const method = view.method;
  const revision = formatNumber(method.revision, locale, "identifier");
  return (
    <PageSection id="company-method" heading={copy.heading}>
      {method.kind === "reviewed" ? (
        <p className="max-w-prose text-sm text-muted-foreground">{copy.reviewed(view.displayName, revision, formatSourceDate(method.reviewedOn, locale), formatSourceDate(method.providerFetchedOn, locale))}</p>
      ) : (
        <>
          <p className="max-w-prose text-sm text-muted-foreground" data-company-map-review={method.humanReview}>{copy.generated(view.displayName, method.secCik, revision, formatSourceDate(method.generatedOn, locale), formatSourceDate(method.checkedOn, locale))}</p>
          {method.humanReview === "approved" ? <p className="max-w-prose text-sm font-medium">{copy.approved}</p> : null}
        </>
      )}
    </PageSection>
  );
}

/**
 * Can I hold this company, through what, with what rights (app IA section
 * 4.4). Reading order: title band, the ways to hold it (so the Pyth
 * reference price and the buy action are on the first screen), the price
 * and figures chart (when the page has chart data), the financial
 * statements (US-listed, when Benten has them), the company facts or source
 * note, the reserved agent slot (renders nothing), and how Benten links
 * these. From `lg`, one product sits in the right column beside the title
 * band's content, where the purchase panel sits on a product page, and
 * stays in view while the left column scrolls; two or more stack in one
 * column before the chart.
 */
export function CompanyPage({ view, chart = null, statements = null, locale }: { view: CompanyView; chart?: ChartData | null; statements?: StatementsSource | null; locale: PublicWebLocale }) {
  const copy = companyMessagesFor(locale).company;
  const single = view.products.length === 1;
  const firstXStock = view.products.find((product) => product.provider === "xstocks");
  // The chart's token: the xStock of a US-listed company, the first provider token of a private one (see chart.server.ts).
  const chartProduct = view.listingStatus === "us_listed" ? firstXStock : view.products.find((product) => product.provider !== "xstocks");
  return (
    <div data-reference-page="company" data-company-listing={view.listingStatus} className="flex flex-col gap-8">
      <header data-company-title="" className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight text-balance">{view.displayName}</h1>
        <p className="text-muted-foreground">{copy.status[view.listingStatus]}</p>
        <ShareButton locale={locale} className="self-start" />
        {view.secRegistrant ? <p className="text-sm text-muted-foreground" data-sec-registrant="">{copy.secRegistrant(view.secRegistrant)}</p> : null}
      </header>
      <div className={cn("grid gap-8", single && "lg:grid-cols-(--company-columns) lg:items-start")}>
        <div className={cn(single && "lg:sticky lg:top-(--company-products-sticky-top) lg:col-start-2 lg:row-start-1")}>
          <CompanyProducts view={view} locale={locale} />
        </div>
        <div className={cn("flex min-w-0 flex-col gap-8", single && "lg:col-start-1 lg:row-start-1")}>
          {/* The token's on-chain trade price against the company's annual figures. */}
          {chart && chartProduct ? <ChartSection data={chart} variant="company" symbol={chartProduct.symbol} company={view.displayName} provider={chartProduct.provider} locale={locale} /> : null}
          {/* The main lines prerendered; every reported line of the four statements, ten fiscal years, from the ticker's statements file. US-listed companies only. */}
          {statements && view.listingStatus === "us_listed" ? <CompanyStatementsSection source={statements} locale={locale} /> : null}
          <CompanyFacts facts={view.facts} name={view.displayName} symbol={firstXStock?.symbol ?? ""} locale={locale} />
          {/* Reserved for checking the company against the reader's own conditions (agent-first ADR). Renders nothing in this build. */}
          <div data-slot="consider-with-my-conditions" className="empty:hidden" />
          <CompanyMethod view={view} locale={locale} />
        </div>
      </div>
    </div>
  );
}
