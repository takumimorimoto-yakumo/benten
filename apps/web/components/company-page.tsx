import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { companyMap, findCompany, providerAssetsManifest, type CompanyInstrument, type CompanyRecord } from "@benten/registry";
import { RecordTable, type RecordTableColumn } from "@/components/record-table";
import { exclusionReasonLabel } from "@/lib/exclusion-reason";
import { shortenAddress } from "@/lib/format";
import { localizedPath, type Locale } from "@/lib/i18n/config";
import { formatConjunction, formatSourceDate } from "@/lib/i18n/format";
import { messagesFor } from "@/lib/i18n/messages";
import { utcDatePart } from "@/lib/provider-presentation";

function hasUnknown(instrument: CompanyInstrument & { source: "provider_assets" }, code: string): boolean {
  return instrument.entry.unknowns.some((unknown) => unknown.code === code);
}

function instrumentKey(instrument: CompanyInstrument): string {
  return instrument.source === "xstocks_registry"
    ? `xstocks/${instrument.entry.ticker}`
    : `${instrument.entry.provider}/${instrument.entry.provider_asset_id}`;
}

/** The cells of one instrument row. No reference or supply value is ever rendered. */
function instrumentCells(instrument: CompanyInstrument, locale: Locale): ReactNode[] {
  const messages = messagesFor(locale);
  const copy = messages.company;
  const providers = messages.providers;
  const mint = (address: string) => <span className="mono record-table__sub record-table__mint" title={address}>{shortenAddress(address)}</span>;

  if (instrument.source === "xstocks_registry") {
    const entry = instrument.entry;
    return [
      <><Link href={localizedPath(locale, `/stock/${entry.ticker}`)!}>{entry.ticker}</Link><span className="muted record-table__sub">{entry.name}</span>{mint(entry.mint)}</>,
      copy.xstockProvider,
      copy.xstockKind,
      <strong>{copy.rights.notRecorded}</strong>,
      copy.reference.xstock,
      <ul className="provider-list">
        <li>{entry.fundamentals_available ? copy.unknowns.none : copy.unknowns.noFilingCoverage(exclusionReasonLabel(entry.exclusion_reason, locale))}</li>
      </ul>,
    ];
  }

  const entry = instrument.entry;
  const providerLabel = providers.names[entry.provider];
  const yesNo = (value: false | "unknown") => value === false ? providers.page.noValue : providers.page.unknownValue;
  const kinds = [...new Set(entry.references.map((reference) => reference.kind))];
  const units = [
    hasUnknown(instrument, "currency_unknown") ? copy.reference.currencyUnknown : null,
    hasUnknown(instrument, "source_as_of_unknown") ? copy.reference.asOfUnknown : null,
  ].filter((sentence): sentence is string => sentence !== null);

  return [
    <><Link href={localizedPath(locale, `/provider/${entry.provider}/${entry.provider_asset_id}`)!}>{entry.symbol}</Link><span className="muted record-table__sub">{entry.display_name}</span>{mint(entry.mint_or_contract)}</>,
    providerLabel,
    providers.instrumentKinds[entry.rights.instrument_kind],
    <>
      <strong className="record-table__sub">{providers.rightsStatus[entry.rights.status]}</strong>
      {entry.rights.status === "provider_claim_only" ? <span className="muted record-table__sub">{copy.rights.claimedBy(providerLabel)}</span> : null}
      <span className="muted record-table__sub">{copy.rights.equity(yesNo(entry.rights.equity_ownership))}</span>
      <span className="muted record-table__sub">{copy.rights.voting(yesNo(entry.rights.voting_rights))}</span>
      <span className="muted record-table__sub">{copy.rights.redemption(entry.rights.redemption_kind === "unknown" ? providers.page.unknownValue : providers.redemption[entry.rights.redemption_kind])}</span>
    </>,
    kinds.length
      ? <>
        <span className="record-table__sub">{copy.reference.publishes(formatConjunction(kinds.map((kind) => copy.referenceNouns[kind]), locale))}</span>
        {units.length ? <span className="muted record-table__sub">{units.join(copy.reference.sentenceSeparator)}</span> : null}
      </>
      : copy.reference.none,
    <ul className="provider-list">{entry.unknowns.map((unknown) => <li key={unknown.code}>{providers.unknownCodes[unknown.code]}</li>)}</ul>,
  ];
}

/** The instrument table of one company, in map order. Also shown in the UI catalog. */
export function CompanyInstrumentTable({ company, locale }: { company: CompanyRecord; locale: Locale }) {
  const column = messagesFor(locale).company.column;
  const columns: RecordTableColumn[] = [
    { label: column.instrument, role: "rowheader" },
    { label: column.provider, role: "aside" },
    { label: column.kind, role: "field" },
    { label: column.rights, role: "field" },
    { label: column.reference, role: "field" },
    { label: column.unknowns, role: "field" },
  ];
  return <RecordTable
    variant="instruments"
    caption={messagesFor(locale).company.caption(company.display_name)}
    columns={columns}
    rows={company.instruments.map((instrument) => ({ key: instrumentKey(instrument), cells: instrumentCells(instrument, locale) }))}
  />;
}

/**
 * Every instrument the reviewed company map links to one company, side by side.
 *
 * Listing instruments together never makes them interchangeable: the page shows
 * no reference value, no ordering by any value and no aggregate. It offers no
 * purchase: instrument pages are reached by ordinary links.
 */
export function CompanyPage({ slug, locale }: { slug: string; locale: Locale }) {
  const company = findCompany(slug);
  if (!company) notFound();
  const messages = messagesFor(locale);
  const copy = messages.company;
  const name = company.display_name;
  const single = company.instruments.length === 1;
  const fetched = formatSourceDate(utcDatePart(providerAssetsManifest.fetched_at), locale);
  const status = company.listing_status === "private" ? copy.status.private : copy.status.usListed;

  return <>
    <p className="breadcrumb"><Link href={`${localizedPath(locale, "/") ?? "/"}#provider-references`}>← {messages.providers.page.back}</Link></p>
    <h1 className="page-title">{name} <span className="muted">{status}</span></h1>
    <p className="page-lede company-page__measure">{single ? copy.lede.single(name) : copy.lede.multiple(name)}</p>
    <div className="notice company-page__notice">
      <p><strong>{copy.notice.heading}</strong></p>
      <p className="company-page__measure">{single ? copy.notice.bodySingle : copy.notice.body}</p>
    </div>

    <section className="section" aria-labelledby="company-instruments-heading">
      <h2 className="section__title" id="company-instruments-heading">{copy.instrumentsHeading(company.instruments.length)}</h2>
      <CompanyInstrumentTable company={company} locale={locale} />
    </section>

    <section className="section" aria-labelledby="company-sources-heading">
      <h2 className="section__title" id="company-sources-heading">{copy.sources.heading}</h2>
      {company.listing_status === "private" ? <p className="section__note">{copy.sources.noSec(name)}</p> : null}
    </section>

    <section className="section" aria-labelledby="company-method-heading">
      <h2 className="section__title" id="company-method-heading">{copy.method.heading}</h2>
      <p className="section__note">{copy.method.body(name, companyMap.revision, fetched)}</p>
    </section>
  </>;
}
