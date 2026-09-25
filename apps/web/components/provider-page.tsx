import Link from "next/link";
import { notFound } from "next/navigation";
import { companyForProviderAsset, findProviderAsset, providerAssetsManifest, type ProviderAssetEntryV1 } from "@benten/registry";
import { CopyValue } from "@/components/copy-value";
import { localizedPath, type Locale } from "@/lib/i18n/config";
import { formatSourceDate } from "@/lib/i18n/format";
import { messagesFor } from "@/lib/i18n/messages";
import { groupDecimalString, providerName, referenceKindLabel, restrictionLabel, utcDatePart } from "@/lib/provider-presentation";

type Row = { label: string; value: React.ReactNode };

function FactRows({ rows }: { rows: ReadonlyArray<Row> }) {
  return <div className="table-scroll fact-table"><table><tbody>{rows.map((row) => (
    <tr key={row.label}><td className="cell--key">{row.label}</td><td>{row.value}</td></tr>
  ))}</tbody></table></div>;
}

/**
 * One reviewed provider instrument: identity, company claim, rights claim,
 * provider-reported reference values and the unknowns that block promotion.
 *
 * Nothing here is an xStock, a quote, a valuation or an authorization, and no
 * value is compared, converted or combined with another provider's value.
 */
export function ProviderPage({ provider, id, locale }: { provider: string; id: string; locale: Locale }) {
  const entry: ProviderAssetEntryV1 | undefined = findProviderAsset(provider, id);
  if (!entry) notFound();
  const messages = messagesFor(locale);
  const copy = messages.providers;
  const page = copy.page;
  const label = providerName(entry, locale);
  const fetched = formatSourceDate(utcDatePart(providerAssetsManifest.fetched_at), locale);
  const company = companyForProviderAsset(entry.provider, entry.provider_asset_id);

  return <>
    <p className="breadcrumb"><Link href={`${localizedPath(locale, "/") ?? "/"}#provider-references`}>← {page.back}</Link></p>
    <h1 className="page-title">{entry.symbol} <span className="muted">{entry.display_name}</span></h1>
    <p className="page-lede">{copy.home.note}</p>

    <section className="section" aria-labelledby="provider-identity-heading">
      <h2 className="section__title" id="provider-identity-heading">{page.identityHeading}</h2>
      <FactRows rows={[
        { label: page.provider, value: label },
        { label: page.symbol, value: entry.symbol },
        { label: page.displayName, value: entry.display_name },
        { label: page.instrument, value: copy.instrumentKinds[entry.rights.instrument_kind] },
        { label: page.contract, value: <><span className="mono provider-address">{entry.mint_or_contract}</span> <CopyValue value={entry.mint_or_contract} locale={locale} /></> },
      ]} />
      <p className="section__note"><a href={entry.external_url} rel="noopener noreferrer nofollow" target="_blank">{page.externalLink(label)}</a> <span className="provider-label">{page.opensNewTab}</span></p>
    </section>

    <section className="section" aria-labelledby="provider-company-heading">
      <h2 className="section__title" id="provider-company-heading">{page.companyHeading}</h2>
      <FactRows rows={[
        { label: page.company, value: entry.company_binding.company_name },
        { label: page.binding, value: copy.bindingStatus[entry.company_binding.binding_status] },
        ...(entry.underlying_kind ? [{ label: page.underlyingKind, value: copy.underlyingKinds[entry.underlying_kind] }] : []),
      ]} />
      {company ? <p className="section__note"><Link className="note-link" href={localizedPath(locale, `/company/${company.slug}`)!}>{page.companyPageLink(company.display_name)}</Link></p> : null}
      <p className="section__note">{page.noFilingCoverage}</p>
    </section>

    <section className="section" aria-labelledby="provider-rights-heading">
      <h2 className="section__title" id="provider-rights-heading">{page.rightsHeading}</h2>
      <FactRows rows={[
        { label: page.rightsStatusLabel, value: copy.rightsStatus[entry.rights.status] },
        { label: page.equityOwnership, value: entry.rights.equity_ownership === false ? page.noValue : page.unknownValue },
        { label: page.votingRights, value: entry.rights.voting_rights === false ? page.noValue : page.unknownValue },
        { label: page.redemption, value: copy.redemption[entry.rights.redemption_kind] },
      ]} />
      <p className="section__note">{page.statementAttribution(label)}</p>
      <blockquote className="provider-statement"><p>“{entry.rights.provider_statement}”</p></blockquote>
      {entry.rights.terms_url ? <p className="section__note"><a href={entry.rights.terms_url} rel="noopener noreferrer nofollow" target="_blank">{page.terms}</a> <span className="provider-label">{page.opensNewTab}</span></p> : null}
      <h3 className="provider-subheading">{page.restrictionsLabel}</h3>
      <ul className="provider-list">{entry.rights.restrictions.map((code) => <li key={code}>{restrictionLabel(code, locale)}</li>)}</ul>
    </section>

    <section className="section" aria-labelledby="provider-references-heading">
      <h2 className="section__title" id="provider-references-heading">{page.referencesHeading}</h2>
      <p className="section__note">{page.referencesNote}</p>
      {entry.references.length === 0 ? <p className="section__note">{page.noReferences}</p> : null}
      {entry.references.length > 0 ? <div className="table-scroll"><table>
        <thead><tr>
          <th scope="col">{page.referenceColumn}</th>
          <th scope="col">{page.valueColumn}</th>
          <th scope="col">{page.currencyColumn}</th>
          <th scope="col">{page.asOfColumn}</th>
          <th scope="col">{page.fetchedColumn}</th>
        </tr></thead>
        <tbody>
          {entry.references.map((reference) => <tr key={reference.kind}>
            <td>{referenceKindLabel(reference.kind, locale)}</td>
            <td className="mono">{groupDecimalString(reference.value)}</td>
            <td>{reference.currency ?? page.unknownValue}</td>
            <td>{reference.provider_reported_as_of ?? page.unknownValue}</td>
            <td>{fetched}</td>
          </tr>)}
        </tbody>
      </table></div> : null}
    </section>

    {/* Outstanding supply is a unit count, not a reference value in a currency,
        so it never shares the reference table or its currency column. */}
    {entry.supply_reference ? <section className="section" aria-labelledby="provider-supply-heading">
      <h2 className="section__title" id="provider-supply-heading">{page.supplyHeading}</h2>
      <FactRows rows={[
        { label: page.supplyReference, value: <span className="mono">{groupDecimalString(entry.supply_reference.value)}</span> },
        { label: page.asOfColumn, value: entry.supply_reference.provider_reported_as_of ?? page.unknownValue },
        { label: page.fetchedColumn, value: fetched },
      ]} />
    </section> : null}

    <section className="section" aria-labelledby="provider-unknowns-heading">
      <h2 className="section__title" id="provider-unknowns-heading">{page.unknownsHeading}</h2>
      <ul className="provider-list">{entry.unknowns.map((unknown) => <li key={unknown.code}>
        {copy.unknownCodes[unknown.code]} <span className="provider-label">{page.blocksLabel(unknown.blocks.map((block) => copy.blocks[block]).join(", "))}</span>
      </li>)}</ul>
    </section>

    <div className="notice provider-disclaimer">
      <p>{messages.footer.disclaimer}</p>
      <p><strong>{page.notXStock}</strong></p>
    </div>
  </>;
}
