/**
 * Living Catalog, financial statements section (development only; see
 * app/lib/dev-catalog-flag.ts). Every state of the statements section and
 * the evidence page's annual history, from the labelled fixture
 * (`features/statements/statement-fixture.ts`): each tab, a selected value
 * of each kind (reported, restated, cover-date count, not verified,
 * calculated, absent), chart loading
 * and error, a company with only some statements, and the annual history;
 * and, for both pages, what the document shows before the statements file
 * loads (the summary with the frame prerendered, loading, and failed with
 * Try again).
 * `?locale=` shows another locale.
 */
import { useSearchParams } from "react-router";
import { SiteShell } from "@/components/site/site-shell";
import { STATEMENTS_CONFIG } from "@/features/statements/statement-config";
import { lineCount, lineOf, newestYears, statementsSummary, type CompanyStatements, type StatementsSource, type StatementTab } from "@/features/statements/statement-data";
import type { StatementsFrameState } from "@/features/statements/statement-summary";
import { fixtureStatements } from "@/features/statements/statement-fixture";
import { EvidenceStatementsHistory, StatementsAnnualHistory } from "@/features/statements/statement-year-tables";
import { CompanyStatementsSection, StatementsSection } from "@/features/statements/statements-section";
import { DEFAULT_LOCALE, isPublicWebLocale } from "@/i18n/locales";

const FULL = fixtureStatements();
const LAST = FULL.years.length - 1;
/** Only the income statement and the ratios, as for a company whose other statements are not yet read. */
const PARTIAL: CompanyStatements = { ...FULL, tabs: { pl: FULL.tabs.pl, ratios: FULL.tabs.ratios } };
const UNVERIFIED_YEAR = lineOf(FULL, "revenue")!.cells.findIndex((cell) => cell?.status === "unverified");
const RESTATED_YEAR = lineOf(FULL, "total_assets")!.cells.findIndex((cell) => cell?.status === "verified" && Boolean(cell.restatement));
const WITHHELD_YEAR = lineOf(FULL, "inventories")!.excluded.findIndex((reason) => reason !== null);

/** What a document carries before the file loads; the catalog never reads the file (every specimen holds its frame state). */
function sourceOf(statements: CompanyStatements): StatementsSource {
  return {
    ticker: "NVDA",
    file: "/data/statements/NVDA.0000000000000000.json",
    summary: statementsSummary(statements, STATEMENTS_CONFIG.summary.rows, STATEMENTS_CONFIG.summary.years),
    items: lineCount(statements),
    first_period_end: statements.years[0]!.period_end,
    last_period_end: statements.years.at(-1)!.period_end,
    year_count: statements.years.length,
    fixture: true,
  };
}
const COMPANY_SOURCE = sourceOf(newestYears(FULL, STATEMENTS_CONFIG.maxYears));
const EVIDENCE_SOURCE = sourceOf(FULL);
const FRAME_STATES: ReadonlyArray<{ state: StatementsFrameState; title: string }> = [
  { state: "static", title: "prerendered summary (and without JavaScript)" },
  { state: "loading", title: "reading the statements file" },
  { state: "error", title: "the statements file failed, with Try again" },
];

const SELECTED: ReadonlyArray<{ title: string; tab: StatementTab; line: string; index: number }> = [
  { title: "Selected: a value reported in the filing", tab: "pl", line: "revenue", index: LAST },
  { title: "Selected: a restated value", tab: "bs", line: "total_assets", index: RESTATED_YEAR },
  { title: "Selected: a value not verified against the filing", tab: "pl", line: "revenue", index: UNVERIFIED_YEAR },
  { title: "Selected: a share count at the annual report's cover date", tab: "per_share", line: "shares_outstanding", index: LAST },
  { title: "Selected: free cash flow, calculated from reported figures", tab: "ratios", line: "free_cash_flow", index: LAST },
  { title: "Selected: a ratio with an input not verified against the filing", tab: "ratios", line: "gross_margin", index: UNVERIFIED_YEAR },
  { title: "Selected: no value, withheld by the source", tab: "bs", line: "inventories", index: WITHHELD_YEAR },
];

function Specimen({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function DevCatalogStatements() {
  const [params] = useSearchParams();
  const requested = params.get("locale");
  const locale = isPublicWebLocale(requested) ? requested : DEFAULT_LOCALE;
  return (
    <SiteShell locale={locale} page={{ kind: "home" }} parentHref="/_catalog">
      <div className="flex flex-col gap-10">
        <h1 className="text-3xl font-semibold tracking-tight">Living Catalog: financial statements</h1>
        <Specimen title="Default: income statement, nothing selected">
          <StatementsSection statements={FULL} locale={locale} />
        </Specimen>
        {SELECTED.map((specimen) => (
          <Specimen key={specimen.title} title={specimen.title}>
            <StatementsSection statements={FULL} locale={locale} initialSelection={{ tab: specimen.tab, selection: { line: specimen.line, index: specimen.index } }} />
          </Specimen>
        ))}
        <Specimen title="Chart loading (the island is not loaded yet)">
          <StatementsSection statements={PARTIAL} locale={locale} catalogState="loading" />
        </Specimen>
        <Specimen title="Chart error (the island failed to load)">
          <StatementsSection statements={PARTIAL} locale={locale} catalogState="error" />
        </Specimen>
        {FRAME_STATES.map(({ state, title }) => (
          <Specimen key={`company-${state}`} title={`Company page before the file loads: ${title}`}>
            <CompanyStatementsSection source={COMPANY_SOURCE} locale={locale} catalogState={state} />
          </Specimen>
        ))}
        {FRAME_STATES.map(({ state, title }) => (
          <Specimen key={`evidence-${state}`} title={`Evidence page before the file loads: ${title}`}>
            <EvidenceStatementsHistory source={EVIDENCE_SOURCE} locale={locale} catalogState={state} />
          </Specimen>
        ))}
        <Specimen title="Evidence page: the annual history from the statements">
          <StatementsAnnualHistory statements={FULL} locale={locale} />
        </Specimen>
      </div>
    </SiteShell>
  );
}
