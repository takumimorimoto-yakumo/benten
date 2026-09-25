/**
 * Living Catalog (development only; see app/lib/dev-catalog-flag.ts). Shows the
 * generated shadcn primitives with their initial tokens and every Benten
 * component in each variant. Fixture values are placeholders, not registry data.
 */
import { InfoIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExternalLink } from "@/components/external-link";
import { FactList } from "@/components/fact-list";
import { SiteShell } from "@/components/site/site-shell";
import { CoverageNotice } from "@/features/dossier/coverage-notice";
import { DossierHeader } from "@/features/dossier/dossier-header";
import type { DossierView } from "@/features/dossier/dossier-view";
import { LegacySnapshotSection } from "@/features/dossier/legacy-snapshot-section";
import { PurchaseSlot } from "@/features/dossier/purchase-slot";
import { RegistryRecordSection } from "@/features/dossier/registry-record-section";
import { VerifiedFactsSection } from "@/features/dossier/verified-facts-section";
import { AnnualHistorySection } from "@/features/dossier/annual-history-section";
import { PurchasePanelFixture } from "@/features/purchase-island/purchase-panel-fixture";
import { PurchaseStatusLineView } from "@/features/purchase-island/purchase-status-line";
import { Input } from "@/components/ui/input";
import { BackLink } from "@/components/back-link";
import { NoteLink } from "@/components/note-link";
import { LearnLink, LearnLinks } from "@/features/static-pages/learn-links";
import { RecordSection } from "@/components/record-section";
import { StackingTable } from "@/components/stacking-table";
import { DirectoryCatalogSpecimens } from "@/features/explore/directory-catalog-specimens";
import { NotFoundPage } from "@/features/references/not-found-page";
import { ProviderPage } from "@/features/references/provider-page";
import type { ProviderView } from "@/features/references/provider-view";
import { PANEL_FIXTURES, type PanelFixtureName } from "@benten/purchase/fixtures";
import { ProductCatalogSpecimens } from "@/features/product/product-catalog";

const FIXTURE_SOURCE = {
  sourceRef: "example-10k",
  form: "10-K",
  accessionNumber: "0000000000-00-000000",
  filedAt: "2000-01-31",
  filingUrl: "https://www.sec.gov/",
  authority: "SEC EDGAR",
} as const;

const FIXTURE_ANNUAL_REPORT = { form: "10-K", accessionNumber: "0000000000-00-000000", filedAt: "2000-03-31", filingUrl: "https://www.sec.gov/" } as const;
const FIXTURE_LATER_REPORT = { form: "10-K", accessionNumber: "0000000000-01-000000", filedAt: "2001-03-30", filingUrl: "https://www.sec.gov/" } as const;

const FIXTURE: DossierView = {
  identity: {
    ticker: "EXAMPLE",
    symbol: "EXAMPLEx",
    tokenName: "Example fixture token",
    underlyingCompany: "EXAMPLE FIXTURE INC",
    companyDisplayName: "Example Fixture",
    secRegistrant: { name: "EXAMPLE FIXTURE INC", cik: "0000000000" },
    mint: "11111111111111111111111111111111",
    issuer: "11111111111111111111111111111111",
    issuerVerified: true,
    decimals: 8,
    registryAsOf: "2000-01-01",
    registrySourceUrl: "https://docs.xstocks.fi/developers",
  },
  coverage: { filingEligible: true, sourceStatus: "source_verified", exclusion: null },
  verified: {
    rows: [
      { name: "revenue", value: 1234, currency: "USD", unit: "currency", scale: 1, concept: "us-gaap:Revenues", period: { fiscalYear: 1999, type: "duration", start: "1999-02-01", end: "2000-01-30" }, label: { fiscalYear: 2000, periodEnd: "2000-01-30" }, source: FIXTURE_SOURCE },
      { name: "total_assets", value: 5678, currency: "USD", unit: "currency", scale: 1, concept: "us-gaap:Assets", period: { fiscalYear: 1999, type: "instant", start: null, end: "2000-01-30" }, label: { fiscalYear: 2000, periodEnd: "2000-01-30" }, source: FIXTURE_SOURCE },
    ],
    sources: [FIXTURE_SOURCE],
  },
  annual: {
    years: [
      {
        // A January year end: every state of a value in one year.
        label: { fiscalYear: 2000, periodEnd: "2000-01-30" },
        periodStart: "1999-02-01",
        annualReport: FIXTURE_ANNUAL_REPORT,
        cells: [
          { name: "revenue", point: { name: "revenue", value: 1234, currency: "USD", status: "verified_reported", provenance: "annual_report", concept: "us-gaap:Revenues", reason: null, filing: FIXTURE_ANNUAL_REPORT, restatement: null }, excluded: null },
          { name: "net_income_parent", point: { name: "net_income_parent", value: 120, currency: "USD", status: "verified_reported", provenance: "restated_in_later_report", concept: "us-gaap:NetIncomeLoss", reason: null, filing: FIXTURE_LATER_REPORT, restatement: { originalValue: 118, originalConcept: "us-gaap:NetIncomeLoss", originalFiling: FIXTURE_ANNUAL_REPORT } }, excluded: null },
          { name: "total_assets", point: { name: "total_assets", value: 5678, currency: "USD", status: "verified_reported", provenance: "reported_in_later_report", concept: "us-gaap:Assets", reason: null, filing: FIXTURE_LATER_REPORT, restatement: null }, excluded: null },
          { name: "total_liabilities", point: { name: "total_liabilities", value: 3000, currency: "USD", status: "unverified_or_derived", provenance: null, concept: null, reason: "derived_by_source", filing: FIXTURE_ANNUAL_REPORT, restatement: null }, excluded: null },
          { name: "operating_cf", point: null, excluded: "not_in_source" },
        ],
      },
      {
        label: { fiscalYear: 1998, periodEnd: "1998-12-31" },
        periodStart: "1998-01-01",
        annualReport: null,
        cells: [
          { name: "revenue", point: null, excluded: "no_annual_report_to_cite" },
          { name: "net_income_parent", point: null, excluded: "no_annual_report_to_cite" },
          { name: "total_assets", point: null, excluded: null },
          { name: "total_liabilities", point: null, excluded: null },
          { name: "operating_cf", point: null, excluded: "unsafe_value" },
        ],
      },
    ],
  },
  legacy: {
    asOf: "FY1999",
    values: { company_name: "Example Fixture Inc.", metrics_fiscal_year: 1999, revenue: 1234, op_income: null, gross_profit: null, net_income_parent: null, total_assets: 5678, total_equity: null, total_liabilities: null, long_term_debt: null, operating_cf: null, investing_cf: null, fcf: null },
  },
  purchase: "unsupported",
};

const PROVIDER_FIXTURE: ProviderView = {
  provider: "prestocks",
  providerAssetId: "EXAMPLE",
  symbol: "EXAMPLE",
  displayName: "Example PreStocks",
  mint: "11111111111111111111111111111111",
  externalUrl: "https://example.com/",
  instrumentKind: "economic_exposure_instrument",
  company: { name: "Example Co", bindingStatus: "provider_claim_only", page: { slug: "example", displayName: "Example Co" } },
  rights: { status: "provider_claim_only", equityOwnership: "unknown", votingRights: "unknown", redemptionKind: "unknown", restrictions: ["provider_terms_not_reviewed", "unreviewed_code"], termsUrl: "https://example.com/terms" },
  references: [{ kind: "prestock_mark_reference", value: "1234.5", currency: null, asOf: null }],
  supply: { value: "100", asOf: null },
  unknowns: [{ code: "source_as_of_unknown", blocks: ["display", "comparison"] }],
  sources: [{ url: "https://example.com/api", observedOn: "2000-01-01" }],
  fetchedOn: "2000-01-01",
};

const VARIANTS = {
  button: ["default", "outline", "secondary", "ghost", "destructive", "link"],
  badge: ["default", "secondary", "outline", "destructive", "ghost", "link"],
} as const;

function Specimen({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function DevCatalog() {
  const locale = "en";
  return (
    <SiteShell locale={locale} page={{ kind: "home" }}>
      <div className="flex flex-col gap-10">
        <h1 className="text-3xl font-semibold tracking-tight">Living Catalog</h1>
        <Specimen title="Button">
          <div className="flex flex-wrap gap-2">
            {VARIANTS.button.map((variant) => <Button key={variant} variant={variant}>{variant}</Button>)}
            <Button disabled>disabled</Button>
          </div>
        </Specimen>
        <Specimen title="Badge">
          <div className="flex flex-wrap gap-2">
            {VARIANTS.badge.map((variant) => <Badge key={variant} variant={variant}>{variant}</Badge>)}
          </div>
        </Specimen>
        <Specimen title="Alert">
          <Alert role="note"><InfoIcon aria-hidden="true" /><AlertTitle>Default alert</AlertTitle><AlertDescription>Description text.</AlertDescription></Alert>
          <Alert role="note" variant="destructive"><InfoIcon aria-hidden="true" /><AlertTitle>Destructive alert</AlertTitle><AlertDescription>Description text.</AlertDescription></Alert>
        </Specimen>
        <Specimen title="Card, Table, Separator">
          <Card>
            <CardHeader><CardTitle>Card title</CardTitle><CardDescription>Card description.</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Table>
                <TableHeader><TableRow><TableHead>Column</TableHead><TableHead className="text-right">Value</TableHead></TableRow></TableHeader>
                <TableBody><TableRow><TableCell>Row</TableCell><TableCell className="text-right">1</TableCell></TableRow></TableBody>
              </Table>
              <Separator />
            </CardContent>
          </Card>
          <Card size="sm"><CardHeader><CardTitle>Small card</CardTitle></CardHeader></Card>
        </Specimen>
        <Specimen title="FactList and ExternalLink">
          <FactList items={[
            { label: "Text", value: "Plain value" },
            { label: "Identifier", value: FIXTURE.identity.mint, identifier: true },
            { label: "External", value: <ExternalLink href="https://www.sec.gov/" newTabLabel="(opens in a new tab)">Primary source</ExternalLink> },
          ]} />
        </Specimen>
        <Specimen title="Dossier sections (fixture)">
          <DossierHeader view={FIXTURE} locale={locale} />
          <VerifiedFactsSection view={FIXTURE} locale={locale} />
          <VerifiedFactsSection view={{ ...FIXTURE, verified: null }} locale={locale} />
          <AnnualHistorySection view={FIXTURE} locale={locale} />
          <LegacySnapshotSection view={FIXTURE} locale={locale} />
          <LegacySnapshotSection view={{ ...FIXTURE, legacy: null }} locale={locale} />
          <RegistryRecordSection view={FIXTURE} locale={locale} />
          <CoverageNotice view={{ ...FIXTURE, coverage: { filingEligible: false, sourceStatus: "not_applicable", exclusion: "etf" } }} locale={locale} />
          <CoverageNotice view={{ ...FIXTURE, verified: null, legacy: null }} locale={locale} />
        </Specimen>
        <Specimen title="StackingTable (rows and cards; narrow the window below md to see them stack)">
          {(["rows", "cards"] as const).map((layout) => (
            <StackingTable
              key={layout}
              layout={layout}
              caption={`${layout} layout`}
              columns={[{ key: "a", label: "Row header", role: "rowheader" }, { key: "b", label: "Aside", role: "aside" }, { key: "c", label: "Field", role: "field" }]}
              rows={[{ key: "1", cells: ["Record", "Provider", "A long value that wraps inside the record on narrow screens."] }, { key: "2", cells: ["Record", "Provider", null] }]}
            />
          ))}
        </Specimen>
        <Specimen title="BackLink, NoteLink, RecordSection">
          <BackLink href="/">Back link</BackLink>
          <RecordSection id="catalog-record" heading="Record section" description="Where the content comes from.">
            <NoteLink href="/">Note link</NoteLink>
          </RecordSection>
        </Specimen>
        <Specimen title="LearnLink and LearnLinks (Explore, company card, product What you own)">
          <LearnLink topic="xstocks" locale={locale} />
          <LearnLinks id="catalog-learn-heading" topics={["xstocks", "prestocks", "reference-prices"]} locale={locale} />
        </Specimen>
        <DirectoryCatalogSpecimens />
        <Specimen title="Provider page (fixture)">
          <ProviderPage view={PROVIDER_FIXTURE} locale={locale} />
        </Specimen>
        <Specimen title="Not-found bodies">
          {(["company", "provider", "stock", "page"] as const).map((scope) => <NotFoundPage key={scope} scope={scope} locale={locale} />)}
        </Specimen>
        <Specimen title="Input">
          <div className="flex max-w-sm flex-col gap-2">
            <Input aria-label="Default input" placeholder="Default" />
            <Input aria-label="Invalid input" aria-invalid defaultValue="Invalid" />
            <Input aria-label="Read-only input" readOnly defaultValue="Read-only" />
          </div>
        </Specimen>
        <Specimen title="Purchase and sale panel (every reducer fixture; no RPC, no wallet)">
          <p className="text-sm text-muted-foreground">Each state also opens in the real NVDA Dossier at <code>/_catalog/purchase/&lt;fixture&gt;?locale=&lt;locale&gt;</code>.</p>
          <div className="grid items-start gap-6 md:grid-cols-[repeat(auto-fill,minmax(min(100%,var(--purchase-panel-width)),1fr))]">
            {(Object.keys(PANEL_FIXTURES) as PanelFixtureName[]).map((name) => (
              <div key={name} className="flex flex-col gap-2">
                <h3 className="text-sm font-medium"><a className="underline underline-offset-4" href={`/_catalog/purchase/${name}`}>{PANEL_FIXTURES[name].label}</a></h3>
                <PurchasePanelFixture name={name} locale={locale} />
              </div>
            ))}
          </div>
        </Specimen>
        <Specimen title="Purchase status line (sent, tracked; shown by the shell outside the buy flow)">
          <p className="text-sm text-muted-foreground">Below md it is pinned above the tab bar; here it is shown in place.</p>
          <div className="[&_[data-purchase-status]]:static">
            <PurchaseStatusLineView locale={locale} />
          </div>
        </Specimen>
        <Specimen title="Price and financials charts">
          <p className="text-sm text-muted-foreground">Every chart state, from the labelled fixture, is on <a className="underline underline-offset-4" href="/_catalog/charts">/_catalog/charts</a>; every state of the financial statements (tabs, cell states, readouts, chart states) is on <a className="underline underline-offset-4" href="/_catalog/statements">/_catalog/statements</a>; every state of the Pyth and on-chain price comparison and the review steps' Pyth reference check line is on <a className="underline underline-offset-4" href="/_catalog/price-comparison">/_catalog/price-comparison</a>.</p>
        </Specimen>
        {/* Product pages, the Pyth reference price and the buy flow. */}
        <ProductCatalogSpecimens locale={locale} />
        <Specimen title="PurchaseSlot">
          <PurchaseSlot view={FIXTURE} locale={locale} />
          <p className="text-sm text-muted-foreground">fixed_route renders an empty frame:</p>
          <div className="rounded-lg border border-dashed p-2"><PurchaseSlot view={{ ...FIXTURE, purchase: "fixed_route" }} locale={locale} /></div>
        </Specimen>
      </div>
    </SiteShell>
  );
}
