import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLink } from "@/components/external-link";
import { FactList } from "@/components/fact-list";
import { StackingTable } from "@/components/stacking-table";
import { ConceptName, interpolate } from "@/components/text-breaks";
import { EMPTY_VALUE, formatExactCurrency } from "@/i18n/format";
import { fiscalYearLabel } from "@/i18n/fiscal-year";
import type { PublicWebLocale } from "@/i18n/locales";
import { messagesFor, type Messages } from "@/i18n/messages";
import type { StatementsSource } from "@/features/statements/statement-data";
import { EvidenceStatementsHistory } from "@/features/statements/statement-year-tables";
import type { AnnualCellView, AnnualFilingView, AnnualPointView, AnnualYearView, DossierView } from "./dossier-view";
import { SourceDate, SourceLink } from "./verified-facts-section";

type DossierCopy = Messages["dossier"];

function Accession({ value, copy }: { value: string; copy: DossierCopy }) {
  return (
    <span className="font-mono text-xs break-all text-muted-foreground">
      <span className="sr-only">{copy.verified.accession}: </span>{value}
    </span>
  );
}

function periodRange(year: AnnualYearView, copy: DossierCopy, locale: PublicWebLocale): ReactNode {
  const end = <SourceDate key="end" value={year.label.periodEnd} locale={locale} />;
  return year.periodStart
    ? interpolate(copy.verified.fromTo, [<SourceDate key="start" value={year.periodStart} locale={locale} />, end])
    : interpolate(copy.verified.asOf, [end]);
}

function ValueCell({ cell, locale }: { cell: AnnualCellView; locale: PublicWebLocale }) {
  const point = cell.point;
  if (!point) return <span className="text-muted-foreground">{EMPTY_VALUE}</span>;
  return (
    <data value={String(point.value)} className={point.status === "verified_reported" ? "font-mono tabular-nums" : "font-mono text-muted-foreground tabular-nums"}>
      {formatExactCurrency(point.value, point.currency, locale)}
    </data>
  );
}

/** The value's standing: how the filings report it, or that no filing does. Only a different filing from the year's report is cited again. */
function VerifiedStatus({ point, report, copy, locale }: { point: AnnualPointView; report: AnnualFilingView | null; copy: DossierCopy; locale: PublicWebLocale }) {
  const annual = copy.annual;
  return (
    <div className="flex flex-col gap-1">
      <span>{point.provenance ? annual.provenance[point.provenance] : null}</span>
      {point.concept ? (
        <span className="font-mono text-xs text-muted-foreground"><span className="sr-only">{copy.verified.concept}: </span><ConceptName concept={point.concept} /></span>
      ) : null}
      {point.filing.accessionNumber !== report?.accessionNumber ? (
        <span className="flex flex-col text-xs" data-annual-cited-filing="">
          <span><span className="text-muted-foreground">{annual.citedFiling}: </span><SourceLink source={point.filing} copy={copy.verified} locale={locale} /></span>
          <Accession value={point.filing.accessionNumber} copy={copy} />
        </span>
      ) : null}
      {point.restatement ? (
        <span className="flex flex-col text-xs" data-annual-restatement="">
          <ExternalLink href={point.restatement.originalFiling.filingUrl} newTabLabel={copy.verified.opensNewTab}>
            {interpolate(annual.originally, [formatExactCurrency(point.restatement.originalValue, point.currency, locale), <SourceDate key="filed" value={point.restatement.originalFiling.filedAt} locale={locale} />])}
          </ExternalLink>
          <Accession value={point.restatement.originalFiling.accessionNumber} copy={copy} />
        </span>
      ) : null}
    </div>
  );
}

function StatusCell({ cell, report, copy, locale }: { cell: AnnualCellView; report: AnnualFilingView | null; copy: DossierCopy; locale: PublicWebLocale }): ReactNode {
  const point = cell.point;
  if (point?.status === "verified_reported") return <VerifiedStatus point={point} report={report} copy={copy} locale={locale} />;
  if (point) {
    return (
      <div className="flex flex-col gap-1">
        <span className="font-medium" data-annual-not-verified="">{copy.annual.notVerified}</span>
        {point.reason ? <span className="text-xs text-muted-foreground">{copy.annual.reasons[point.reason]}</span> : null}
      </div>
    );
  }
  return cell.excluded ? <span className="text-muted-foreground">{copy.annual.excluded[cell.excluded]}</span> : null;
}

function AnnualYear({ year, copy, locale }: { year: AnnualYearView; copy: DossierCopy; locale: PublicWebLocale }) {
  const id = `annual-year-${year.label.periodEnd}`;
  const label = fiscalYearLabel(year.label.periodEnd, locale);
  const report = year.annualReport;
  return (
    <section aria-labelledby={id} data-annual-year={String(year.label.fiscalYear)} className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h3 id={id} className="font-semibold">{label}</h3>
        <p className="text-sm text-muted-foreground">{periodRange(year, copy, locale)}</p>
      </div>
      {report ? (
        <FactList
          items={[
            { label: copy.annual.annualReport, value: <SourceLink source={report} copy={copy.verified} locale={locale} /> },
            { label: copy.verified.accession, value: report.accessionNumber, identifier: true },
          ]}
        />
      ) : (
        <p className="text-sm text-muted-foreground">{copy.annual.noAnnualReport}</p>
      )}
      <StackingTable
        caption={label}
        columns={[
          { key: "fact", label: copy.verified.factColumn, role: "rowheader" },
          { key: "value", label: copy.verified.valueColumn, role: "aside" },
          { key: "status", label: copy.annual.statusColumn, role: "field" },
        ]}
        rows={year.cells.map((cell) => ({
          key: cell.name,
          attributes: { "data-annual-fact": cell.name, "data-annual-status": cell.point?.status ?? (cell.excluded ? "excluded" : "absent") },
          cells: [copy.verified.labels[cell.name], <ValueCell cell={cell} locale={locale} />, <StatusCell cell={cell} report={report} copy={copy} locale={locale} />],
        }))}
      />
    </section>
  );
}

/**
 * The annual history of one xStock's company, newest year first. Each year
 * cites its annual report; each value says whether a filing reports it, and a
 * value that no filing reports is marked as not verified against the filing.
 * When Benten has the company's financial statements, every line of them
 * replaces the five facts (`EvidenceStatementsHistory`, which reads them
 * from the ticker's statements file).
 */
export function AnnualHistorySection({ view, statements = null, locale }: { view: DossierView; statements?: StatementsSource | null; locale: PublicWebLocale }) {
  if (statements) return <EvidenceStatementsHistory source={statements} locale={locale} />;
  const annual = view.annual;
  if (!annual) return null;
  const copy = messagesFor(locale).dossier;
  return (
    <Card aria-labelledby="annual-history-heading" role="region" data-annual-history="">
      <CardHeader>
        <CardTitle><h2 id="annual-history-heading">{copy.annual.heading}</h2></CardTitle>
        <CardDescription>{copy.annual.description(fiscalYearLabel(annual.years.at(-1)!.label.periodEnd, locale))}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-8">
        {annual.years.map((year) => <AnnualYear key={year.label.periodEnd} year={year} copy={copy} locale={locale} />)}
      </CardContent>
    </Card>
  );
}
