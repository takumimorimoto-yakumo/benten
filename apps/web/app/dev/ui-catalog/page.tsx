import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findByTicker, findCompany, getLegacyStatementsAsOf, readPublicFinancials, type LegacySnapshotBlock } from "@benten/registry";
import { CompanyInstrumentTable } from "@/components/company-page";
import { CoverageStrip } from "@/components/coverage-strip";
import { CatalogMintJourney } from "@/components/catalog-mint-journey";
import { CatalogLookupStates } from "@/components/catalog-lookup-states";
import { DataStateNotice } from "@/components/data-state-notice";
import { IdentityProofRail } from "@/components/identity-proof-rail";
import { LegacyStatementPeriods } from "@/components/legacy-statement-periods";
import { McpSetupPanel } from "@/components/mcp-setup-panel";
import { PurchasePanelFixture } from "@/components/purchase-panel-fixture";
import { PurchaseUnavailable } from "@/components/purchase-unavailable";
import { VerifiedFactList } from "@/components/verified-fact-list";
import { getFundamentalsV2 } from "@/lib/public-v2";
import type { FinancialResult } from "@/lib/public-result";
import { PURCHASE_FIXTURES, type PurchaseFixtureName } from "@benten/purchase/fixtures";

export const metadata: Metadata = { robots: { index: false, follow: false }, title: "Benten UI catalog" };

function resultFor(ticker: string): FinancialResult {
  const entry = findByTicker(ticker);
  if (!entry) throw new Error(`Missing public catalog fixture: ${ticker}`);
  return getFundamentalsV2({ mint: entry.mint }) as FinancialResult;
}

function statementPeriodsFor(ticker: string) {
  const result = readPublicFinancials({ ticker }, { isValidMint: () => false });
  const recordAsOf = getLegacyStatementsAsOf(ticker);
  if (!result.found || !recordAsOf) throw new Error(`Missing legacy statement fixture: ${ticker}`);
  return {
    recordAsOf,
    statements: Object.fromEntries(
      Object.entries(result.statements).map(([statement, value]) => [statement, value?.legacy_snapshot ?? null]),
    ) as Partial<Record<"pl" | "bs" | "cf", LegacySnapshotBlock | null>>,
  };
}

export default function UiCatalogPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const nvda = resultFor("NVDA");
  const amzn = resultFor("AMZN");
  const abnb = resultFor("ABNB");
  const asml = resultFor("ASML");
  const spy = resultFor("SPY");
  const gmePeriods = statementPeriodsFor("GME");
  const spacex = findCompany("spacex");
  if (!spacex) throw new Error("Missing company catalog fixture: spacex");
  const unknown: FinancialResult = { ...nvda, data: { found: false, reason: "unknown_mint", requested_identifier: "11111111111111111111111111111111", identity: null, coverage: null, retryable: false } };

  return <main className="catalog" aria-labelledby="catalog-heading">
    <p className="eyebrow">Development only</p><h1 id="catalog-heading" className="page-title">Homepage component catalog</h1>
    <section className="catalog__section"><h2>Mint resolver: idle, loading, malformed, unknown</h2><CatalogMintJourney defaultMint={findByTicker("NVDA")!.mint} fixtures={{ [findByTicker("NVDA")!.mint]: nvda }} /><CatalogLookupStates unknown={unknown.data} /></section>
    <section className="catalog__section"><h2>Proof rail: verified identity</h2>{nvda.data.found ? <IdentityProofRail identity={nvda.data.identity} verifiedFacts={nvda.data.verified_facts} /> : null}</section>
    <section className="catalog__section"><h2>Verified facts: five and four</h2>{nvda.data.found && nvda.data.verified_facts ? <VerifiedFactList facts={nvda.data.verified_facts} /> : null}{amzn.data.found && amzn.data.verified_facts ? <VerifiedFactList facts={amzn.data.verified_facts} /> : null}</section>
    <section className="catalog__section"><h2>State notices: partial overlay, legacy, no data, exclusion, unknown</h2>{nvda.data.found ? <DataStateNotice data={nvda.data} /> : null}<DataStateNotice data={abnb.data} /><DataStateNotice data={asml.data} /><DataStateNotice data={spy.data} /><DataStateNotice data={unknown.data} /></section>
    <section className="catalog__section"><h2>Legacy financial statement periods: selected and mixed-year states</h2><LegacyStatementPeriods recordAsOf={gmePeriods.recordAsOf} statements={gmePeriods.statements} selectedStatement="bs" /><LegacyStatementPeriods recordAsOf={gmePeriods.recordAsOf} statements={gmePeriods.statements} /></section>
    <section className="catalog__section"><h2>Purchase panel: every state, rendered from reducer fixtures (no RPC, no wallet)</h2><div className="catalog__purchase-grid">
      <div><h3>unsupportedToken (any non-NVDAx page)</h3><PurchaseUnavailable symbol="TSLAx" locale="en" /></div>
      {(Object.keys(PURCHASE_FIXTURES) as PurchaseFixtureName[]).map((name) => <div key={name}><h3>{PURCHASE_FIXTURES[name].label}</h3><PurchasePanelFixture name={name} locale="en" /></div>)}
    </div></section>
    <section className="catalog__section"><h2>Record table: three instruments (SpaceX), a table at 52rem and wider, stacked cards below</h2><CompanyInstrumentTable company={spacex} locale="en" /></section>
    <section className="catalog__section catalog__two-column"><McpSetupPanel /><McpSetupPanel initiallyCopied /><CoverageStrip registry={154} eligible={129} available={128} /></section>
  </main>;
}
