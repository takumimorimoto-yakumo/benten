import { InfoIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "@/components/external-link";
import { FactList } from "@/components/fact-list";
import { NoteLink } from "@/components/note-link";
import { RecordSection } from "@/components/record-section";
import { StackingTable, type StackingTableColumn } from "@/components/stacking-table";
import { formatDecimalString, formatSourceDate } from "@/i18n/format";
import { companyPath, type PublicWebLocale } from "@/i18n/locales";
import { messagesFor, referenceMessagesFor, type KnownRestrictionCode } from "@/i18n/messages";
import { ReferenceSemantics, rightsValue } from "./reference-terms";
import type { ProviderView } from "./provider-view";

function restrictionLabel(code: string, locale: PublicWebLocale): string {
  const labels: Readonly<Record<string, string | undefined>> = referenceMessagesFor(locale).terms.restrictions satisfies Record<KnownRestrictionCode, string>;
  return labels[code] ?? code.replaceAll("_", " ");
}

/** Where a source URL points, without its scheme; the link itself keeps the exact URL. */
function sourceLabel(url: string): string {
  const parsed = new URL(url);
  return `${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`;
}

function ProviderHeader({ view, locale }: { view: ProviderView; locale: PublicWebLocale }) {
  const refs = referenceMessagesFor(locale);
  const providerName = messagesFor(locale).home.providers.names[view.provider];
  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <h1 className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-3xl font-semibold tracking-tight">
          <span>{view.symbol}</span>
          <span className="text-lg font-normal text-muted-foreground">{view.displayName}</span>
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{providerName}</Badge>
        </div>
        <p className="max-w-prose text-sm text-muted-foreground">{refs.provider.lede(providerName)}</p>
      </div>
    </header>
  );
}

export function IdentitySection({ view, locale }: { view: ProviderView; locale: PublicWebLocale }) {
  const refs = referenceMessagesFor(locale);
  const copy = refs.provider.identity;
  const home = messagesFor(locale).home.providers;
  const providerName = home.names[view.provider];
  return (
    <RecordSection id="provider-identity" heading={copy.heading} description={copy.note}>
      <FactList
        items={[
          { label: copy.provider, value: providerName },
          { label: copy.symbol, value: view.symbol },
          { label: copy.displayName, value: view.displayName },
          { label: copy.instrument, value: home.instrumentKinds[view.instrumentKind] },
          { label: copy.mint, value: view.mint, identifier: true },
          { label: copy.tokenProgram, value: <span className="text-muted-foreground">{copy.notReported}</span> },
          { label: copy.providerPage, value: <ExternalLink href={view.externalUrl} newTabLabel={refs.provider.sources.opensNewTab}>{copy.openOn(providerName)}</ExternalLink> },
        ]}
      />
    </RecordSection>
  );
}

export function CompanySection({ view, locale }: { view: ProviderView; locale: PublicWebLocale }) {
  const refs = referenceMessagesFor(locale);
  const copy = refs.provider.company;
  return (
    <RecordSection id="provider-company" heading={copy.heading} description={copy.note}>
      <FactList
        items={[
          { label: copy.company, value: view.company.name },
          { label: copy.binding, value: refs.terms.bindingStatus[view.company.bindingStatus] },
        ]}
      />
      <p className="text-sm text-muted-foreground">{copy.noFilingCoverage}</p>
      {view.company.page ? (
        <NoteLink href={companyPath(locale, view.company.page.slug)} data-company-page-link={view.company.page.slug}>
          {refs.companyPageLink(view.company.page.displayName)}
        </NoteLink>
      ) : null}
    </RecordSection>
  );
}

export function RightsSection({ view, locale }: { view: ProviderView; locale: PublicWebLocale }) {
  const refs = referenceMessagesFor(locale);
  const copy = refs.provider.rights;
  const home = messagesFor(locale).home.providers;
  const providerName = home.names[view.provider];
  return (
    <RecordSection id="provider-rights" heading={copy.heading} description={copy.note(providerName)}>
      <FactList
        items={[
          { label: copy.status, value: home.rightsStatus[view.rights.status] },
          { label: copy.equity, value: rightsValue(view.rights.equityOwnership, locale) },
          { label: copy.voting, value: rightsValue(view.rights.votingRights, locale) },
          { label: copy.redemption, value: view.rights.redemptionKind === "unknown" ? refs.terms.unknownValue : refs.terms.redemption[view.rights.redemptionKind] },
          {
            label: copy.restrictions,
            value: (
              <ul className="flex list-disc flex-col gap-1 ps-4">
                {view.rights.restrictions.map((code) => <li key={code}>{restrictionLabel(code, locale)}</li>)}
              </ul>
            ),
          },
          ...(view.rights.termsUrl
            ? [{ label: copy.terms(providerName), value: <ExternalLink href={view.rights.termsUrl} newTabLabel={refs.provider.sources.opensNewTab}>{sourceLabel(view.rights.termsUrl)}</ExternalLink> }]
            : []),
        ]}
      />
    </RecordSection>
  );
}

export function ReferenceValuesSection({ view, locale }: { view: ProviderView; locale: PublicWebLocale }) {
  const refs = referenceMessagesFor(locale);
  const copy = refs.provider.values;
  const providerName = messagesFor(locale).home.providers.names[view.provider];
  const fetched = formatSourceDate(view.fetchedOn, locale);
  const kinds = [...new Set(view.references.map((reference) => reference.kind))];
  const unknownCodes = new Set(view.unknowns.map((unknown) => unknown.code));
  const columns: StackingTableColumn[] = [
    { key: "kind", label: copy.kind, role: "rowheader" },
    { key: "value", label: copy.value, role: "field" },
    { key: "currency", label: copy.currency, role: "field" },
    { key: "asOf", label: copy.asOf, role: "field" },
    { key: "fetched", label: copy.fetched, role: "field" },
  ];
  return (
    <RecordSection id="provider-reference-values" heading={copy.heading} description={copy.note(providerName, fetched)}>
      <ReferenceSemantics kinds={kinds} currencyUnknown={unknownCodes.has("currency_unknown")} asOfUnknown={unknownCodes.has("source_as_of_unknown")} locale={locale} />
      {view.references.length > 0 ? (
        <StackingTable
          caption={copy.caption(view.symbol)}
          columns={columns}
          rows={view.references.map((reference) => ({
            key: reference.kind,
            attributes: { "data-provider-reference": reference.kind },
            cells: [
              refs.terms.referenceKinds[reference.kind],
              <span className="font-mono tabular-nums break-all md:whitespace-nowrap">{formatDecimalString(reference.value)}</span>,
              reference.currency ?? <span className="text-muted-foreground">{refs.terms.unknownValue}</span>,
              reference.asOf ?? <span className="text-muted-foreground">{refs.terms.unknownValue}</span>,
              <span className="text-muted-foreground">{fetched}</span>,
            ],
          }))}
        />
      ) : null}
    </RecordSection>
  );
}

/** Outstanding supply is a unit count, not a value in a currency, so it never shares the reference table. */
export function SupplySection({ view, locale }: { view: ProviderView; locale: PublicWebLocale }) {
  if (!view.supply) return null;
  const refs = referenceMessagesFor(locale);
  const copy = refs.provider.values;
  return (
    <RecordSection id="provider-supply" heading={copy.supplyHeading} description={copy.supplyNote}>
      <FactList
        items={[
          { label: copy.supply, value: formatDecimalString(view.supply.value), identifier: true },
          { label: copy.asOf, value: view.supply.asOf ?? <span className="text-muted-foreground">{refs.terms.unknownValue}</span> },
          { label: copy.fetched, value: formatSourceDate(view.fetchedOn, locale) },
        ]}
      />
    </RecordSection>
  );
}

export function UnknownsSection({ view, locale }: { view: ProviderView; locale: PublicWebLocale }) {
  const refs = referenceMessagesFor(locale);
  const copy = refs.provider.unknowns;
  return (
    <RecordSection id="provider-unknowns" heading={copy.heading} description={copy.note}>
      <ul className="flex flex-col gap-2 text-sm">
        {view.unknowns.map((unknown) => (
          <li key={unknown.code} data-provider-unknown={unknown.code} className="flex flex-col gap-0.5">
            <span>{refs.terms.unknownCodes[unknown.code]}</span>
            <span className="text-muted-foreground">{copy.blocks(new Intl.ListFormat(locale, { type: "conjunction" }).format(unknown.blocks.map((block) => refs.terms.blocks[block])))}</span>
          </li>
        ))}
      </ul>
    </RecordSection>
  );
}

export function SourcesSection({ view, locale }: { view: ProviderView; locale: PublicWebLocale }) {
  const copy = referenceMessagesFor(locale).provider.sources;
  return (
    <RecordSection id="provider-sources" heading={copy.heading} description={copy.note}>
      <ul className="flex flex-col gap-2 text-sm">
        {view.sources.map((source) => (
          <li key={source.url} className="flex flex-col gap-0.5">
            <span className="wrap-anywhere"><ExternalLink href={source.url} newTabLabel={copy.opensNewTab}>{sourceLabel(source.url)}</ExternalLink></span>
            <span className="text-muted-foreground">{copy.observed(formatSourceDate(source.observedOn, locale))}</span>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">{copy.fetched(formatSourceDate(view.fetchedOn, locale))}</p>
    </RecordSection>
  );
}

/** A static statement: Benten offers no purchase for provider instruments. No island, wallet, or form. */
function NoPurchaseNote({ view, locale }: { view: ProviderView; locale: PublicWebLocale }) {
  const copy = referenceMessagesFor(locale).provider.purchase;
  return (
    <div data-provider-purchase="unsupported">
      <Alert role="note" className="border-0 bg-muted">
        <InfoIcon aria-hidden="true" />
        <AlertTitle><h2>{copy.heading}</h2></AlertTitle>
        <AlertDescription><p>{copy.body(view.symbol)}</p></AlertDescription>
      </Alert>
    </div>
  );
}

/**
 * One provider instrument. Reading order (DOM and tab order): overview,
 * identity, the no-purchase statement, then company, rights, reference
 * values, supply, unknowns and sources. From `lg` the statement sits in the
 * right rail, like the Dossier's purchase area, without changing that order.
 */
export function ProviderPage({ view, locale }: { view: ProviderView; locale: PublicWebLocale }) {
  return (
    <div data-reference-page="provider" className="grid gap-6 lg:grid-cols-(--dossier-columns) lg:items-start">
      <div className="lg:col-span-2"><ProviderHeader view={view} locale={locale} /></div>
      <div className="min-w-0 lg:col-start-1 lg:row-start-2"><IdentitySection view={view} locale={locale} /></div>
      <div className="min-w-0 lg:col-start-2 lg:row-start-2"><NoPurchaseNote view={view} locale={locale} /></div>
      <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-3">
        <CompanySection view={view} locale={locale} />
        <RightsSection view={view} locale={locale} />
        <ReferenceValuesSection view={view} locale={locale} />
        <SupplySection view={view} locale={locale} />
        <UnknownsSection view={view} locale={locale} />
        <SourcesSection view={view} locale={locale} />
      </div>
    </div>
  );
}
