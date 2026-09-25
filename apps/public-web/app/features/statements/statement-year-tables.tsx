/**
 * The evidence page's annual history when Benten has the company's
 * financial statements (app IA sections 4.6 and 4.9): every line of every
 * statement for each fiscal year, newest first, with the exact value and
 * how it is known. Each year cites its annual report; under each item, a
 * reported value names its XBRL concept (and another filing or a
 * restatement when it has one), a value not verified against the filing
 * says why, a calculated value shows its formula, and an absent value the
 * source withheld gives the reason. The newest year is open; earlier years
 * open on demand.
 *
 * About fifty items over ten years in five locales: the rows carry no
 * utility classes, `static.css` styles them by their data attributes.
 */
import { AccountingTerm } from "./accounting-term";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLink } from "@/components/external-link";
import { FactList } from "@/components/fact-list";
import { ConceptName } from "@/components/text-breaks";
import { SourceLink } from "@/features/dossier/verified-facts-section";
import { EMPTY_VALUE, formatNumber, formatSourceDate } from "@/i18n/format";
import { fiscalYearLabel } from "@/i18n/fiscal-year";
import type { PublicWebLocale } from "@/i18n/locales";
import { messagesFor } from "@/i18n/messages";
import { statementsMessagesFor } from "@/i18n/statements-messages";
import { useHydrated } from "@/lib/use-hydrated";
import { filingAt, presentTabs, type CompanyStatements, type StatementFiling, type StatementLine, type StatementsSource, type StatementYear } from "./statement-data";
import { exactValueText, lineLabel } from "./statement-format";
import { formulaText, periodText } from "./statement-readout";
import { StatusLegend } from "./statement-legend";
import { StatementsFullFrame, StatementsLiveRegion, StatementsSummaryTable, type StatementsFrameState } from "./statement-summary";
import { useStatementsFile } from "./use-statements-file";

/** The row status in the registry's words, as the five-fact history marks it. */
const ANNUAL_STATUS = { verified: "verified_reported", unverified: "unverified_or_derived", calculated: "calculated" } as const;

function filingSource(filing: StatementFiling) {
  return { form: filing.form, filedAt: filing.filed, filingUrl: filing.filing_url };
}

/** What stands under an item's name: how its value for the year is known. */
function ItemNote({ line, index, year, report, statements, locale }: { line: StatementLine; index: number; year: StatementYear; report: StatementFiling | null; statements: CompanyStatements; locale: PublicWebLocale }) {
  const copy = statementsMessagesFor(locale);
  const dossier = messagesFor(locale).dossier;
  const cell = line.cells[index] ?? null;
  if (!cell) {
    const excluded = line.excluded[index];
    return excluded ? <small>{dossier.annual.excluded[excluded]}</small> : null;
  }
  if (cell.status === "calculated") return <small>{copy.readout.calculated}: <AccountingTerm>{formulaText(cell, statements, locale)}</AccountingTerm></small>;
  const filing = filingAt(statements, cell.filing);
  if (cell.status === "unverified") {
    return (
      <small>
        <span data-annual-not-verified="">{copy.readout.notVerified}</span>
        <span>{dossier.annual.reasons[cell.reason]}</span>
      </small>
    );
  }
  const original = cell.restatement ? filingAt(statements, cell.restatement.original_filing) : null;
  return (
    <small>
      <span className="font-mono break-all"><span className="sr-only">{dossier.verified.concept}: </span><ConceptName concept={cell.concept} /></span>
      {line.period_type === "cover_instant" ? <> {periodText(line, cell, year, locale)}</> : null}
      {filing && filing.accession !== report?.accession ? (
        <span data-annual-cited-filing=""> {dossier.annual.citedFiling}: <SourceLink source={filingSource(filing)} copy={dossier.verified} locale={locale} /></span>
      ) : null}
      {cell.restatement && original ? (
        <span data-annual-restatement="">
          {" "}
          <ExternalLink href={original.filing_url} newTabLabel={dossier.verified.opensNewTab} className="font-normal">
            {dossier.annual.originally(exactValueText(cell.restatement.original_value, line.unit, locale), formatSourceDate(original.filed, locale))}
          </ExternalLink>
        </span>
      ) : null}
    </small>
  );
}

function YearTables({ statements, year, index, locale }: { statements: CompanyStatements; year: StatementYear; index: number; locale: PublicWebLocale }) {
  const copy = statementsMessagesFor(locale);
  const dossier = messagesFor(locale).dossier;
  const label = fiscalYearLabel(year.period_end, locale);
  const report = filingAt(statements, year.annual_report);
  return (
    <div className="flex flex-col gap-4 pt-3">
      <p className="text-sm text-muted-foreground">
        {year.period_start ? dossier.verified.fromTo(formatSourceDate(year.period_start, locale), formatSourceDate(year.period_end, locale)) : dossier.verified.asOf(formatSourceDate(year.period_end, locale))}
      </p>
      {report ? (
        <FactList
          items={[
            { label: dossier.annual.annualReport, value: <SourceLink source={filingSource(report)} copy={dossier.verified} locale={locale} /> },
            { label: dossier.verified.accession, value: report.accession, identifier: true },
          ]}
        />
      ) : (
        <p className="text-sm text-muted-foreground">{dossier.annual.noAnnualReport}</p>
      )}
      {presentTabs(statements).map((tab) => (
        <table key={tab} data-annual-statement={tab} className="w-full text-sm">
          <caption><AccountingTerm>{copy.tabs[tab]}</AccountingTerm><span className="sr-only">, {label}</span></caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">{dossier.verified.factColumn}</th>
              <th scope="col">{dossier.verified.valueColumn}</th>
            </tr>
          </thead>
          <tbody>
            {(statements.tabs[tab] ?? []).map((line) => {
              const cell = line.cells[index] ?? null;
              return (
                <tr key={line.item} data-annual-fact={line.item} data-annual-status={cell ? ANNUAL_STATUS[cell.status] : line.excluded[index] ? "excluded" : "absent"}>
                  <th scope="row">
                    <AccountingTerm>{lineLabel(line.item, line.fallback_label, locale)}</AccountingTerm>
                    <ItemNote line={line} index={index} year={year} report={report} statements={statements} locale={locale} />
                  </th>
                  <td data-statement-status={cell?.status ?? "empty"}>
                    {cell ? <data value={String(cell.value)}>{exactValueText(cell.value, line.unit, locale)}</data> : <span aria-hidden="true">{EMPTY_VALUE}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ))}
    </div>
  );
}

export function StatementsAnnualHistory({ statements, locale }: { statements: CompanyStatements; locale: PublicWebLocale }) {
  const copy = statementsMessagesFor(locale);
  const dossier = messagesFor(locale).dossier;
  const items = presentTabs(statements).reduce((sum, tab) => sum + (statements.tabs[tab]?.length ?? 0), 0);
  const newestFirst = statements.years.map((year, index) => ({ year, index })).reverse();
  return (
    <Card aria-labelledby="annual-history-heading" role="region" data-annual-history="" data-annual-history-source="statements">
      <CardHeader>
        <CardTitle><h2 id="annual-history-heading">{dossier.annual.heading}</h2></CardTitle>
        <CardDescription>{copy.evidence.description(formatNumber(items, locale), fiscalYearLabel(statements.years[0]!.period_end, locale))}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {statements.fixture ? <p data-statements-fixture="" className="rounded-lg border border-dashed px-3 py-2 text-sm font-medium">{copy.fixture}</p> : null}
        <StatusLegend locale={locale} />
        {newestFirst.map(({ year, index }, position) => (
          <details key={year.period_end} open={position === 0} data-annual-year={String(year.fiscal_year)} className="border-t pt-3">
            <summary className="flex min-h-(--touch-target-min) cursor-pointer items-center">
              <h3 className="font-semibold">{fiscalYearLabel(year.period_end, locale)}</h3>
            </summary>
            <YearTables statements={statements} year={year} index={index} locale={locale} />
          </details>
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * The evidence page's annual history from the statements. The document
 * carries the summary of the main lines (exact values, each year's annual
 * report) and the address of the ticker's statements file; once hydrated the
 * page reads the file and lists every line of every year
 * (`StatementsAnnualHistory`). Until then, without JavaScript, or when the
 * file fails to load (with Try again), the summary stays.
 */
export function EvidenceStatementsHistory({ source, locale, catalogState }: {
  source: StatementsSource;
  locale: PublicWebLocale;
  /** Development-only Living Catalog: hold the frame in one state instead of reading the file. */
  catalogState?: StatementsFrameState;
}) {
  const copy = statementsMessagesFor(locale);
  const dossier = messagesFor(locale).dossier;
  const hydrated = useHydrated();
  const { state, retry } = useStatementsFile(source.file, source.ticker, hydrated && !catalogState);
  const frame: StatementsFrameState | "loaded" = catalogState ?? (!hydrated ? "static" : state.kind);
  const live = <StatementsLiveRegion state={frame} source={source} locale={locale} />;
  if (frame === "loaded" && state.kind === "loaded") {
    return (
      <div data-statements-source={source.ticker}>
        {live}
        <StatementsAnnualHistory statements={state.statements} locale={locale} />
      </div>
    );
  }
  return (
    <div data-statements-source={source.ticker}>
      {live}
      <Card aria-labelledby="annual-history-heading" role="region" data-annual-history="" data-annual-history-source="statements" data-annual-history-state="summary">
        <CardHeader>
          <CardTitle><h2 id="annual-history-heading">{dossier.annual.heading}</h2></CardTitle>
          <CardDescription>{copy.evidence.description(formatNumber(source.items, locale), fiscalYearLabel(source.first_period_end, locale))}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {source.fixture ? <p data-statements-fixture="" className="rounded-lg border border-dashed px-3 py-2 text-sm font-medium">{copy.fixture}</p> : null}
          <StatusLegend locale={locale} />
          <StatementsSummaryTable summary={source.summary} locale={locale} exact />
          <StatementsFullFrame state={frame === "loaded" ? "loading" : frame} source={source} locale={locale} onRetry={retry} />
        </CardContent>
      </Card>
    </div>
  );
}
