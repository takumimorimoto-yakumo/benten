import Link from "next/link";
import { companyForProviderAsset, listCompanies, listProviderAssets, providerAssetsManifest } from "@benten/registry";
import { RecordTable, type RecordTableColumn } from "@/components/record-table";
import { localizedPath, type Locale } from "@/lib/i18n/config";
import { formatSourceDate, listItemsWithSeparators } from "@/lib/i18n/format";
import { messagesFor } from "@/lib/i18n/messages";
import { providerName, summaryReference, utcDatePart } from "@/lib/provider-presentation";

const catalog = listProviderAssets();
const providerEntries = catalog.found ? catalog.items : [];

/**
 * Links to every company page, in map order (alphabetical by slug), so the
 * order is never read as a ranking.
 */
function CompanyIndex({ locale }: { locale: Locale }) {
  const companies = listCompanies();
  const pieces = listItemsWithSeparators(companies.map((company) => company.display_name), locale);
  return <p className="company-index">
    <span>{messagesFor(locale).providers.home.byCompany}</span>{" "}
    {pieces.map((piece, index) => <span className="company-index__item" key={companies[index].slug}>
      <Link href={localizedPath(locale, `/company/${companies[index].slug}`)!}>{piece.item}</Link>{piece.separator}
    </span>)}
  </p>;
}

/**
 * Other-provider references, kept structurally separate from the xStocks registry.
 *
 * These rows are PreStocks and Tessera claims about their own instruments. They
 * never share the xStocks table, the xStocks coverage badge or the xStocks
 * filing-eligibility vocabulary, because a shared company name does not make two
 * instruments the same asset.
 */
export function ProviderReferencesSection({ locale }: { locale: Locale }) {
  const copy = messagesFor(locale).providers;
  const fetched = formatSourceDate(utcDatePart(providerAssetsManifest.fetched_at), locale);
  const columns: RecordTableColumn[] = [
    { label: copy.home.provider, role: "aside" },
    { label: copy.home.symbol, role: "rowheader" },
    { label: copy.home.underlyingCompany, role: "field" },
    { label: copy.home.instrument, role: "field" },
    { label: copy.home.rights, role: "field" },
    { label: copy.home.reference, role: "field" },
    { label: copy.home.observed, role: "field" },
  ];

  return (
    <section className="registry-section" id="provider-references" aria-labelledby="provider-references-heading">
      <div className="section-heading">
        <div><p className="eyebrow">{copy.home.eyebrow}</p><h2 id="provider-references-heading">{copy.home.heading}</h2></div>
        <p>{copy.home.note}</p>
      </div>
      <CompanyIndex locale={locale} />
      <RecordTable
        caption={copy.home.heading}
        columns={columns}
        rows={providerEntries.map((entry) => {
          const reference = summaryReference(entry);
          const company = companyForProviderAsset(entry.provider, entry.provider_asset_id);
          return {
            key: `${entry.provider}/${entry.provider_asset_id}`,
            cells: [
              providerName(entry, locale),
              <Link href={localizedPath(locale, `/provider/${entry.provider}/${entry.provider_asset_id}`)!}>{entry.symbol}</Link>,
              company
                ? <Link href={localizedPath(locale, `/company/${company.slug}`)!}>{entry.company_binding.company_name}</Link>
                : entry.company_binding.company_name,
              copy.instrumentKinds[entry.rights.instrument_kind],
              copy.rightsStatus[entry.rights.status],
              /* The fetch date belongs to Benten's read, never to the value: the
                 provider publishes no currency and no as-of, so both stay unknown. */
              reference
                ? <><span className="mono">{reference}</span> <span className="provider-label">{copy.home.referenceLabel}</span> <span className="provider-label">{copy.home.referenceUnknowns}</span></>
                : <span className="provider-label">{copy.home.noReference}</span>,
              <span className="provider-label">{copy.home.fetched(fetched)}</span>,
            ],
          };
        })}
      />
    </section>
  );
}
