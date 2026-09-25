import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExternalLink } from "@/components/external-link";
import { FactList } from "@/components/fact-list";
import { ConceptName, interpolate, NoWrap } from "@/components/text-breaks";
import { formatExactCurrency, formatNumber, formatSourceDate } from "@/i18n/format";
import { messagesFor, type Messages } from "@/i18n/messages";
import type { PublicWebLocale } from "@/i18n/locales";
import type { ReactNode } from "react";
import type { DossierView, FilingSourceView, FiscalYearLabelView, VerifiedFactRow } from "./dossier-view";
import { fiscalYearLabel } from "@/i18n/fiscal-year";

type VerifiedCopy = Messages["dossier"]["verified"];

/** A source date as one unbreakable unit, so a date such as `Jan 27, 2025` (or its CJK form) never splits across lines. */
export function SourceDate({ value, locale }: { value: string; locale: PublicWebLocale }) {
  return <NoWrap>{formatSourceDate(value, locale)}</NoWrap>;
}

function periodText(row: VerifiedFactRow, copy: VerifiedCopy, locale: PublicWebLocale): ReactNode {
  const fiscalYear = fiscalYearLabel(row.label.periodEnd, locale);
  const range = row.period.type === "duration" && row.period.start
    ? interpolate(copy.fromTo, [<SourceDate key="start" value={row.period.start} locale={locale} />, <SourceDate key="end" value={row.period.end} locale={locale} />])
    : interpolate(copy.asOf, [<SourceDate key="end" value={row.period.end} locale={locale} />]);
  return <>{fiscalYear}, {range}</>;
}

function valueText(row: VerifiedFactRow, locale: PublicWebLocale): string {
  return formatExactCurrency(row.value, row.currency, locale);
}

/** "10-K, filed Mar 18, 2026" as a link to the filing. */
export function SourceLink({ source, copy, locale }: { source: Pick<FilingSourceView, "form" | "filedAt" | "filingUrl">; copy: VerifiedCopy; locale: PublicWebLocale }) {
  return (
    <ExternalLink href={source.filingUrl} newTabLabel={copy.opensNewTab}>
      {interpolate(copy.filedLink, [source.form, <SourceDate key="filed" value={source.filedAt} locale={locale} />])}
    </ExternalLink>
  );
}

/** The fiscal year of the facts a filing supports, for the filing link label. */
function fiscalYearFor(source: FilingSourceView, rows: readonly VerifiedFactRow[]): FiscalYearLabelView | null {
  return rows.find((row) => row.source.sourceRef === source.sourceRef)?.label ?? null;
}

function FilingSources({ sources, rows, copy, locale, company }: { sources: readonly FilingSourceView[]; rows: readonly VerifiedFactRow[]; copy: VerifiedCopy; locale: PublicWebLocale; company: string | null }) {
  return (
    <div className="flex flex-col gap-4">
      {sources.map((source) => {
        const fiscalYear = fiscalYearFor(source, rows);
        return (
        <FactList
          key={source.sourceRef}
          items={[
            { label: copy.authority, value: source.authority },
            { label: copy.form, value: source.form },
            { label: copy.filed, value: formatSourceDate(source.filedAt, locale) },
            { label: copy.accession, value: source.accessionNumber, identifier: true },
            {
              label: copy.sourceColumn,
              value: (
                <ExternalLink href={source.filingUrl} newTabLabel={copy.opensNewTab}>
                  {company && fiscalYear !== null
                    ? copy.openFiling(company, fiscalYearLabel(fiscalYear.periodEnd, locale), source.form)
                    : interpolate(copy.filedLink, [source.form, <SourceDate key="filed" value={source.filedAt} locale={locale} />])}
                </ExternalLink>
              ),
            },
          ]}
        />
        );
      })}
    </div>
  );
}

function ScaleNote({ row, copy, locale }: { row: VerifiedFactRow; copy: VerifiedCopy; locale: PublicWebLocale }) {
  return <span className="text-xs text-muted-foreground">{copy.scale(formatNumber(row.scale, locale, "identifier"))}</span>;
}

export function VerifiedFactsSection({ view, locale }: { view: DossierView; locale: PublicWebLocale }) {
  const copy = messagesFor(locale).dossier.verified;
  const verified = view.verified;
  return (
    <Card aria-labelledby="verified-facts-heading" role="region">
      <CardHeader>
        <CardTitle><h2 id="verified-facts-heading">{copy.heading}</h2></CardTitle>
        <CardDescription>{verified ? copy.description : copy.none}</CardDescription>
      </CardHeader>
      {verified ? (
        <CardContent className="flex flex-col gap-6">
          <FilingSources sources={verified.sources} rows={verified.rows} copy={copy} locale={locale} company={view.identity.companyDisplayName ?? view.identity.underlyingCompany} />
          {/* Desktop: one semantic table. */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{copy.factColumn}</TableHead>
                  <TableHead scope="col" className="text-right">{copy.valueColumn}</TableHead>
                  {/* The period column keeps room for a whole date on each line; the fact column gives way instead. */}
                  <TableHead scope="col"><span className="block min-w-(--verified-period-min-width)">{copy.periodColumn}</span></TableHead>
                  <TableHead scope="col">{copy.sourceColumn}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {verified.rows.map((row) => (
                  <TableRow key={row.name}>
                    <TableCell className="align-top whitespace-normal">
                      <div className="font-medium">{copy.labels[row.name]}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        <span className="sr-only">{copy.concept}: </span><ConceptName concept={row.concept} />
                      </div>
                    </TableCell>
                    <TableCell className="text-right align-top">
                      <div className="font-mono tabular-nums">{valueText(row, locale)}</div>
                      <ScaleNote row={row} copy={copy} locale={locale} />
                    </TableCell>
                    <TableCell className="align-top whitespace-normal">{periodText(row, copy, locale)}</TableCell>
                    <TableCell className="align-top whitespace-normal">
                      <SourceLink source={row.source} copy={copy} locale={locale} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {/* Mobile: vertically labelled rows instead of a compressed table. */}
          <ul className="flex flex-col divide-y md:hidden">
            {verified.rows.map((row) => (
              <li key={row.name} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                <h3 className="font-medium">{copy.labels[row.name]}</h3>
                <FactList
                  items={[
                    { label: copy.valueColumn, value: <><span className="font-mono tabular-nums">{valueText(row, locale)}</span> <ScaleNote row={row} copy={copy} locale={locale} /></> },
                    { label: copy.periodColumn, value: periodText(row, copy, locale) },
                    { label: copy.concept, value: <span className="font-mono"><ConceptName concept={row.concept} /></span> },
                    { label: copy.sourceColumn, value: <SourceLink source={row.source} copy={copy} locale={locale} /> },
                  ]}
                />
              </li>
            ))}
          </ul>
        </CardContent>
      ) : null}
    </Card>
  );
}
