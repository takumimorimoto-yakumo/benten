import Link from "next/link";
import { notFound } from "next/navigation";
import { companyForXStock, getFundamentalsSnapshot, getLegacyStatements, getLegacyStatementsAsOf, resolveTicker, type XStockEntry } from "@benten/registry";
import { FactTable, type Fact } from "@/components/FactTable";
import { CoverageBadge } from "@/components/CoverageBadge";
import { LegacyStatementPeriods } from "@/components/legacy-statement-periods";
import { PurchaseJumpLink } from "@/components/purchase-jump-link";
import { PurchasePanel } from "@/components/purchase-panel";
import { PurchasePanelFixture } from "@/components/purchase-panel-fixture";
import { PurchaseUnavailable } from "@/components/purchase-unavailable";
import { StickyAside } from "@/components/sticky-aside";
import { exclusionReasonExplanation, exclusionReasonLabel } from "@/lib/exclusion-reason";
import { FUNDAMENTALS_GROUPS, fundamentalsFacts } from "@/lib/fundamentals-fields";
import { shortenAddress } from "@/lib/format";
import { localizedPath, type Locale } from "@/lib/i18n/config";
import { legacyPeriodMessagesFor, messagesFor } from "@/lib/i18n/messages";
import type { PurchaseFixtureName } from "@benten/purchase/fixtures";
import { isPurchasableMint } from "@benten/purchase/route";

type FundamentalsOutcome = { kind: "ok"; data: Record<string, unknown>; asOf: string; source: string } | { kind: "unavailable" };
async function loadFundamentals(ticker: string): Promise<FundamentalsOutcome> {
  const record = getFundamentalsSnapshot(ticker); if (!record) return { kind: "unavailable" };
  return { kind: "ok", data: record.data, asOf: record.as_of, source: "" };
}
function registryFacts(entry: XStockEntry, locale: Locale): Fact[] {
  const copy = messagesFor(locale).stock;
  return [
    { label: copy.underlyingTicker, value: entry.ticker }, { label: copy.tokenSymbol, value: entry.symbol }, { label: copy.tokenName, value: entry.name },
    { label: copy.mint, value: shortenAddress(entry.mint), mono: true, title: entry.mint }, { label: copy.issuer, value: shortenAddress(entry.issuer), mono: true, title: entry.issuer },
    { label: copy.issuerVerified, value: entry.issuer_verified ? copy.true : copy.false }, { label: copy.tokenDecimals, value: entry.decimals },
  ];
}
const GROUP_KEYS = ["entity", "income", "balance", "cashflow"] as const;
/**
 * `purchaseFixture` is only passed by the development fixture route
 * (`app/dev/purchase-states`): it renders the panel from a reducer fixture
 * instead of the live island. Public routes never pass it.
 */
export async function StockPage({ ticker, locale, purchaseFixture }: { ticker: string; locale: Locale; purchaseFixture?: PurchaseFixtureName }) {
  const entry = resolveTicker(ticker); if (!entry) notFound(); const copy = messagesFor(locale); const stock = copy.stock;
  // Exact mint comparison against the pinned route constant; never a ticker or name match.
  const purchasable = isPurchasableMint(entry.mint);
  const fundamentals = entry.fundamentals_available ? await loadFundamentals(entry.ticker) : null;
  const legacyStatements = getLegacyStatements(entry.ticker);
  const statementRecordAsOf = getLegacyStatementsAsOf(entry.ticker);
  const hasLegacyStatements = Object.values(legacyStatements).some(Boolean);
  const periodCopy = legacyPeriodMessagesFor(locale);
  const company = companyForXStock(entry.ticker);
  return <>
    <p className="breadcrumb"><Link href={localizedPath(locale, "/") ?? "/"}>← {stock.back}</Link></p>
    <h1 className="page-title">{entry.ticker} <span className="muted">{entry.name}</span></h1>
    <p className="page-lede"><CoverageBadge covered={entry.fundamentals_available} locale={locale} /></p>
    {purchasable ? <PurchaseJumpLink label={copy.purchase.jumpLink} /> : null}
    <div className="stock-band">
    <section className="section stock-band__registry" aria-labelledby="registry-facts-heading"><h2 className="section__title" id="registry-facts-heading">{stock.registryRecord}</h2><p className="section__note">{stock.registryNote}</p>{company ? <p className="section__note"><Link className="note-link" href={localizedPath(locale, `/company/${company.slug}`)!}>{stock.companyPageLink(company.display_name)}</Link></p> : null}<FactTable facts={registryFacts(entry, locale)} /></section>
    <StickyAside className="stock-band__aside" labelledBy={purchasable ? "purchase-heading" : "purchase-unavailable-heading"}>
      {!purchasable ? <PurchaseUnavailable symbol={entry.symbol} locale={locale} /> : purchaseFixture ? <PurchasePanelFixture name={purchaseFixture} locale={locale} /> : <PurchasePanel locale={locale} />}
    </StickyAside>
    <div className="stock-band__rest">
    {!entry.fundamentals_available ? <section className="section" aria-labelledby="exclusion-heading"><h2 className="section__title" id="exclusion-heading">{stock.noCoverageHeading}</h2><div className="notice"><p><strong>{exclusionReasonLabel(entry.exclusion_reason, locale)}.</strong> {exclusionReasonExplanation(entry.exclusion_reason, locale)}</p></div></section> : null}
    {fundamentals?.kind === "unavailable" ? <section className="section" aria-labelledby="financials-heading"><h2 className="section__title" id="financials-heading">{stock.legacyHeading}</h2><div className="notice"><p>{stock.legacyUnavailable}</p></div></section> : null}
    {fundamentals?.kind === "ok" ? <section className="section" aria-labelledby="financials-heading"><h2 className="section__title" id="financials-heading">{stock.legacyHeading}</h2><p className="section__note">{stock.legacyNote(fundamentals.asOf, stock.legacySource)}</p>{FUNDAMENTALS_GROUPS.map((group, index) => <div key={GROUP_KEYS[index]} className="section"><FactTable caption={copy.legacy.groups[GROUP_KEYS[index]]} valueLabel={stock.value} facts={fundamentalsFacts(fundamentals.data, group.fields, copy.legacy.fields)} /></div>)}</section> : null}
    {hasLegacyStatements && statementRecordAsOf ? <section className="section" aria-labelledby="legacy-period-heading"><h2 className="section__title" id="legacy-period-heading">{periodCopy.context}</h2><LegacyStatementPeriods locale={locale} recordAsOf={statementRecordAsOf} statements={legacyStatements} explanatoryNote={periodCopy.separateSnapshotNote} /></section> : null}
    </div>
    </div>
  </>;
}
