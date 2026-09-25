/**
 * `StatementsSection`: a US-listed company's financial statements (app IA
 * section 4.9). Tabs for the income statement, balance sheet, cash flow,
 * per-share figures and key ratios; each tab has a small chart, a table of
 * up to ten fiscal years and a readout that says where the selected value
 * comes from (the filing, why it is not verified, or how Benten calculated
 * it).
 *
 * Static-safe: before hydration (and without JavaScript) every statement is
 * prerendered in order as a plain table, with no button; the tabs, the
 * selectable values and the readout exist once the page is interactive.
 * No text rates, ranks or forecasts; calculated values say so.
 */
import { AccountingTerm } from "./accounting-term";
import { useCallback, useId, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatNumber } from "@/i18n/format";
import { fiscalYearLabel } from "@/i18n/fiscal-year";
import type { PublicWebLocale } from "@/i18n/locales";
import { statementsMessagesFor } from "@/i18n/statements-messages";
import { useHydrated } from "@/lib/use-hydrated";
import { STATEMENTS_CONFIG } from "./statement-config";
import { newestYears, presentTabs, type CompanyStatements, type StatementsSource, type StatementTab } from "./statement-data";
import { StatementChart } from "./statement-chart";
import { StatementReadout } from "./statement-readout";
import { StatusLegend } from "./statement-legend";
import { StatementsFullFrame, StatementsLiveRegion, StatementsSummaryTable, type StatementsFrameState } from "./statement-summary";
import { useStatementsFile } from "./use-statements-file";
import { StatementTable, type StatementSelection } from "./statement-table";

/** The section's heading, lead and fixture note; shared by the summary and the loaded section so they read the same. */
function StatementsHeader({ headingId, years, first, last, fixture, locale }: { headingId: string; years: number; first: string; last: string; fixture: boolean; locale: PublicWebLocale }) {
  const copy = statementsMessagesFor(locale);
  // The lead names the first and last year by their month ("Jan 2017"); it says itself that these are years ended.
  return (
    <>
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-xl font-semibold tracking-tight">{copy.heading}</h2>
        <p className="max-w-prose text-sm text-muted-foreground">{copy.lead(formatNumber(years, locale), fiscalYearLabel(first, locale, "axis"), fiscalYearLabel(last, locale, "axis"))}</p>
      </div>
      {fixture ? <p data-statements-fixture="" className="rounded-lg border border-dashed px-3 py-2 text-sm font-medium">{copy.fixture}</p> : null}
    </>
  );
}

function StatementPanel({ statements, tab, locale, selection, onSelect, interactive, catalogState }: {
  statements: CompanyStatements;
  tab: StatementTab;
  locale: PublicWebLocale;
  selection: StatementSelection | null;
  onSelect: (selection: StatementSelection) => void;
  interactive: boolean;
  catalogState?: "loading" | "error";
}) {
  const copy = statementsMessagesFor(locale);
  const selectFromChart = useCallback((line: string, index: number) => onSelect({ line, index }), [onSelect]);
  return (
    <div className="flex min-w-0 flex-col gap-3" data-statement-panel={tab}>
      <StatementChart statements={statements} tab={tab} locale={locale} selectedIndex={selection?.index ?? null} onSelect={selectFromChart} catalogState={catalogState} />
      <StatementTable statements={statements} tab={tab} locale={locale} selection={selection} onSelect={onSelect} interactive={interactive} />
      <p className="text-sm text-muted-foreground" data-statement-units="">{copy.units[tab]}</p>
      {interactive ? <StatementReadout statements={statements} selection={selection} locale={locale} /> : null}
    </div>
  );
}

export function StatementsSection({ statements, locale, catalogState, initialSelection }: {
  statements: CompanyStatements;
  locale: PublicWebLocale;
  /** Development-only Living Catalog: force the small charts' state. */
  catalogState?: "loading" | "error";
  /** Development-only Living Catalog: open on this tab with this value selected. */
  initialSelection?: { readonly tab: StatementTab; readonly selection: StatementSelection };
}) {
  const copy = statementsMessagesFor(locale);
  const headingId = useId();
  const hydrated = useHydrated();
  const tabs = presentTabs(statements);
  const [tab, setTab] = useState<StatementTab>(initialSelection?.tab ?? (tabs.includes(STATEMENTS_CONFIG.defaultTab) ? STATEMENTS_CONFIG.defaultTab : tabs[0]!));
  const [selections, setSelections] = useState<Partial<Record<StatementTab, StatementSelection>>>(initialSelection ? { [initialSelection.tab]: initialSelection.selection } : {});
  const selectIn = useCallback((target: StatementTab) => (selection: StatementSelection) => setSelections((current) => ({ ...current, [target]: selection })), []);
  if (tabs.length === 0 || statements.years.length === 0) return null;

  return (
    <section aria-labelledby={headingId} data-statements-section="" data-statements-state={hydrated ? "interactive" : "static"} className="flex min-w-0 flex-col gap-4">
      <StatementsHeader headingId={headingId} years={statements.years.length} first={statements.years[0]!.period_end} last={statements.years.at(-1)!.period_end} fixture={statements.fixture === true} locale={locale} />
      <StatusLegend locale={locale} />
      {hydrated ? (
        <Tabs value={tab} onValueChange={(value) => setTab(value as StatementTab)} className="min-w-0 gap-4">
          <TabsList variant="line" aria-label={copy.tabsLabel} className="w-full flex-wrap justify-start gap-y-1 border-b pb-1.5 group-data-horizontal/tabs:h-auto">
            {tabs.map((value) => (
              <TabsTrigger key={value} value={value} data-statement-tab={value} className="h-auto min-h-(--touch-target-min) flex-none px-3 md:min-h-0"><AccountingTerm>{copy.tabs[value]}</AccountingTerm></TabsTrigger>
            ))}
          </TabsList>
          {tabs.map((value) => (
            <TabsContent key={value} value={value} className="min-w-0">
              <StatementPanel statements={statements} tab={value} locale={locale} selection={selections[value] ?? null} onSelect={selectIn(value)} interactive catalogState={catalogState} />
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        tabs.map((value) => (
          <section key={value} aria-labelledby={`${headingId}-${value}`} className="flex min-w-0 flex-col gap-3">
            <h3 id={`${headingId}-${value}`} className="font-semibold"><AccountingTerm>{copy.tabs[value]}</AccountingTerm></h3>
            <StatementPanel statements={statements} tab={value} locale={locale} selection={null} onSelect={() => undefined} interactive={false} catalogState={catalogState} />
          </section>
        ))
      )}
    </section>
  );
}

/**
 * The company page's statements (app IA section 4.9). The document carries
 * the summary of the main lines and the address of the ticker's statements
 * file; once hydrated the page reads the file and shows the whole section
 * (`StatementsSection`) for the newest `STATEMENTS_CONFIG.maxYears`. Until
 * then, without JavaScript, or when the file fails to load (with Try again),
 * the summary stays.
 */
export function CompanyStatementsSection({ source, locale, catalogState }: {
  source: StatementsSource;
  locale: PublicWebLocale;
  /** Development-only Living Catalog: hold the frame in one state instead of reading the file. */
  catalogState?: StatementsFrameState;
}) {
  const headingId = useId();
  const hydrated = useHydrated();
  const { state, retry } = useStatementsFile(source.file, source.ticker, hydrated && !catalogState);
  const frame: StatementsFrameState | "loaded" = catalogState ?? (!hydrated ? "static" : state.kind);
  const live = <StatementsLiveRegion state={frame} source={source} locale={locale} />;
  if (frame === "loaded" && state.kind === "loaded") {
    return (
      <div data-statements-source={source.ticker} className="min-w-0">
        {live}
        <StatementsSection statements={newestYears(state.statements, STATEMENTS_CONFIG.maxYears)} locale={locale} />
      </div>
    );
  }
  return (
    <div data-statements-source={source.ticker} className="min-w-0">
      {live}
      <section aria-labelledby={headingId} data-statements-section="" data-statements-state="summary" className="flex min-w-0 flex-col gap-4">
        <StatementsHeader headingId={headingId} years={source.year_count} first={source.first_period_end} last={source.last_period_end} fixture={source.fixture === true} locale={locale} />
        <StatusLegend locale={locale} />
        <StatementsSummaryTable summary={source.summary} locale={locale} />
        <StatementsFullFrame state={frame === "loaded" ? "loading" : frame} source={source} locale={locale} onRetry={retry} />
      </section>
    </div>
  );
}
