/**
 * Where the selected value comes from. A reported value shows its exact
 * amount, period (or the cover date of a share count), the annual report
 * that states it (a link) and its XBRL concept; a value not verified against
 * the filing says so and why; a calculated value shows its formula and both
 * values it reads, each with a link to its own filing; an absent value says
 * so, with the source's reason when it gives one. Announced politely, so
 * moving through the table with the keyboard reads each value's source.
 */
import { AccountingTerm } from "./accounting-term";
import { ExternalLink } from "@/components/external-link";
import { ConceptName } from "@/components/text-breaks";
import { formatSourceDate } from "@/i18n/format";
import { fiscalYearLabel } from "@/i18n/fiscal-year";
import type { PublicWebLocale } from "@/i18n/locales";
import { messagesFor } from "@/i18n/messages";
import { statementsMessagesFor } from "@/i18n/statements-messages";
import { filingAt, lineOf, type CalculatedCell, type CompanyStatements, type StatementFiling, type StatementLine, type StatementYear, type UnverifiedCell, type VerifiedCell } from "./statement-data";
import { exactValueText, lineLabel, shortValueText } from "./statement-format";
import { CELL_STATUS_CLASSES, type StatementSelection } from "./statement-table";

function FilingLink({ filing, locale }: { filing: StatementFiling; locale: PublicWebLocale }) {
  const copy = statementsMessagesFor(locale);
  return <ExternalLink href={filing.filing_url} newTabLabel={copy.opensNewTab}>{copy.readout.filed(filing.form, formatSourceDate(filing.filed, locale))}</ExternalLink>;
}

/** The period a reported value covers: the fiscal year, its end, or the cover date of a share count. */
export function periodText(line: StatementLine, cell: VerifiedCell | UnverifiedCell, year: StatementYear, locale: PublicWebLocale): string {
  const copy = statementsMessagesFor(locale).readout;
  if (line.period_type === "cover_instant" && cell.status === "verified" && cell.as_of) return copy.coverDate(formatSourceDate(cell.as_of, locale));
  if (line.period_type === "duration" && year.period_start) return copy.period(formatSourceDate(year.period_start, locale), formatSourceDate(year.period_end, locale));
  return copy.asOf(formatSourceDate(year.period_end, locale));
}

function VerifiedDetail({ cell, line, year, statements, locale }: { cell: VerifiedCell; line: StatementLine; year: StatementYear; statements: CompanyStatements; locale: PublicWebLocale }) {
  const copy = statementsMessagesFor(locale).readout;
  const annual = messagesFor(locale).dossier.annual;
  const filing = filingAt(statements, cell.filing);
  const original = cell.restatement ? filingAt(statements, cell.restatement.original_filing) : null;
  return (
    <>
      <p className="flex flex-wrap gap-x-3 text-sm">
        <span className="text-muted-foreground">{periodText(line, cell, year, locale)}</span>
        {filing ? <FilingLink filing={filing} locale={locale} /> : null}
      </p>
      {cell.provenance ? <p className="text-xs text-muted-foreground">{annual.provenance[cell.provenance]}</p> : null}
      <p className="text-xs text-muted-foreground">
        <span>{copy.concept}: </span><span className="font-mono break-all"><ConceptName concept={cell.concept} /></span>
      </p>
      {cell.restatement && original ? (
        <p className="text-xs" data-statement-restatement="">
          <ExternalLink href={original.filing_url} newTabLabel={statementsMessagesFor(locale).opensNewTab} className="font-normal text-muted-foreground">
            {annual.originally(exactValueText(cell.restatement.original_value, line.unit, locale), formatSourceDate(original.filed, locale))}
          </ExternalLink>
        </p>
      ) : null}
    </>
  );
}

function UnverifiedDetail({ cell, statements, locale }: { cell: UnverifiedCell; statements: CompanyStatements; locale: PublicWebLocale }) {
  const copy = statementsMessagesFor(locale).readout;
  const reasons = messagesFor(locale).dossier.annual.reasons;
  const filing = filingAt(statements, cell.filing);
  return (
    <>
      <p className="text-sm font-medium">{copy.notVerified}</p>
      <p className="text-sm text-muted-foreground">{reasons[cell.reason]}</p>
      {filing ? <p className="text-sm"><FilingLink filing={filing} locale={locale} /></p> : null}
    </>
  );
}

/** The formula in words: "Operating income ÷ Revenue". */
export function formulaText(cell: CalculatedCell, statements: CompanyStatements, locale: PublicWebLocale): string {
  const copy = statementsMessagesFor(locale);
  return cell.inputs.map((input) => lineLabel(input.item, lineOf(statements, input.item)?.fallback_label, locale)).join(copy.readout.op[cell.op]);
}

function CalculatedDetail({ cell, year, statements, locale }: { cell: CalculatedCell; year: StatementYear; statements: CompanyStatements; locale: PublicWebLocale }) {
  const copy = statementsMessagesFor(locale);
  return (
    <>
      <p className="text-sm font-medium">{copy.readout.calculated}</p>
      <p className="text-sm"><span className="text-muted-foreground">{copy.readout.formula}: </span><AccountingTerm>{formulaText(cell, statements, locale)}</AccountingTerm></p>
      <div className="text-sm">
        <p className="text-muted-foreground">{copy.readout.inputs}</p>
        <ul className="flex flex-col gap-0.5" data-statement-inputs="">
          {cell.inputs.map((input) => {
            const unit = lineOf(statements, input.item)?.unit ?? "usd";
            const filing = filingAt(statements, input.filing);
            return (
              <li key={input.item} className="flex flex-wrap gap-x-2">
                <span><AccountingTerm>{lineLabel(input.item, lineOf(statements, input.item)?.fallback_label, locale)}</AccountingTerm> ({fiscalYearLabel(year.period_end, locale)}):</span>
                <span className={`tabular-nums ${CELL_STATUS_CLASSES[input.status]}`}>{exactValueText(input.value, unit, locale)}</span>
                {input.status === "unverified" ? <span className="text-muted-foreground">{copy.readout.inputNotVerified}</span> : null}
                {filing ? <FilingLink filing={filing} locale={locale} /> : input.filing_url ? <ExternalLink href={input.filing_url} newTabLabel={copy.opensNewTab}>{copy.readout.citedFiling}</ExternalLink> : null}
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}

export function StatementReadout({ statements, selection, locale }: { statements: CompanyStatements; selection: StatementSelection | null; locale: PublicWebLocale }) {
  const copy = statementsMessagesFor(locale);
  const excludedCopy = messagesFor(locale).dossier.annual.excluded;
  const year = selection ? statements.years[selection.index] : undefined;
  const line = selection ? lineOf(statements, selection.line) : null;
  const cell = line && selection ? line.cells[selection.index] ?? null : null;
  const excluded = line && selection ? line.excluded[selection.index] ?? null : null;
  return (
    <div
      data-statement-readout={cell ? cell.status : selection ? "empty" : "hint"}
      aria-live="polite"
      className="sticky bottom-(--statements-readout-bottom) z-20 max-h-(--statements-readout-max-height) overflow-y-auto rounded-lg border bg-background px-3 py-2 shadow-sm"
    >
      {selection && year && line ? (
        <div className="flex flex-col gap-1">
          <p className="flex flex-wrap gap-x-2 text-sm font-medium text-muted-foreground">
            <span><AccountingTerm>{lineLabel(line.item, line.fallback_label, locale)}</AccountingTerm></span>
            <span>{fiscalYearLabel(year.period_end, locale)}</span>
          </p>
          {cell ? (
            <>
              <p className="flex flex-wrap items-baseline gap-x-3">
                <span className={`text-2xl font-semibold tracking-tight tabular-nums ${CELL_STATUS_CLASSES[cell.status]}`}><data value={cell.value}>{shortValueText(cell.value, line.unit, locale)}</data></span>
                <span className="text-sm text-muted-foreground"><span className="sr-only">{copy.readout.exact}: </span><span className="tabular-nums">{exactValueText(cell.value, line.unit, locale)}</span></span>
              </p>
              {cell.status === "verified" ? <VerifiedDetail cell={cell} line={line} year={year} statements={statements} locale={locale} /> : null}
              {cell.status === "unverified" ? <UnverifiedDetail cell={cell} statements={statements} locale={locale} /> : null}
              {cell.status === "calculated" ? <CalculatedDetail cell={cell} year={year} statements={statements} locale={locale} /> : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              <AccountingTerm>{copy.readout.empty(lineLabel(line.item, line.fallback_label, locale), fiscalYearLabel(year.period_end, locale))}</AccountingTerm>
              {excluded ? ` ${excludedCopy[excluded]}` : null}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{copy.readout.hint}</p>
      )}
    </div>
  );
}
