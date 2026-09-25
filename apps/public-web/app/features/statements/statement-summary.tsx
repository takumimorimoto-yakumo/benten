/**
 * What a company or evidence document prerenders of the financial
 * statements before the ticker's statements file loads (app IA section
 * 4.9): the main lines of the newest years as one table with each year's
 * annual report, and the frame where every line loads after hydration.
 * Without JavaScript the table stays and the frame says what it would hold.
 *
 * Shared by the company page section and the evidence page's annual history;
 * it never imports the section, so an evidence page never reaches the chart
 * island.
 */
import { AccountingTerm } from "./accounting-term";
import { LoaderCircleIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "@/components/external-link";
import { EMPTY_VALUE, formatNumber } from "@/i18n/format";
import { fiscalYearLabel } from "@/i18n/fiscal-year";
import type { PublicWebLocale } from "@/i18n/locales";
import { statementsMessagesFor } from "@/i18n/statements-messages";
import { STATEMENTS_CONFIG } from "./statement-config";
import type { StatementCell, StatementsSource, StatementsSummary } from "./statement-data";
import { exactValueText, lineLabel, shortValueText } from "./statement-format";

function StatusSuffix({ cell, locale }: { cell: StatementCell | null; locale: PublicWebLocale }) {
  const legend = statementsMessagesFor(locale).legend;
  if (cell?.status === "verified") return null;
  const text = !cell ? legend.empty : cell.status === "unverified" ? legend.unverified : legend.calculated;
  return <span className="sr-only">{`, ${text}`}</span>;
}

/**
 * The summary table: items down the side, the newest years across (oldest
 * to newest, as the full table), each value styled by how it is known, and a
 * last row linking each year's annual report. `exact` writes whole amounts
 * (the evidence page); otherwise they are shortened (the company page).
 */
export function StatementsSummaryTable({ summary, locale, exact = false }: { summary: StatementsSummary; locale: PublicWebLocale; exact?: boolean }) {
  const copy = statementsMessagesFor(locale);
  if (summary.lines.length === 0 || summary.years.length === 0) return null;
  const caption = copy.summary.caption(formatNumber(summary.years.length, locale));
  return (
    <div role="region" aria-label={copy.table.scroll(caption)} tabIndex={0} data-statement-scroll="" className="relative w-full overflow-x-auto overscroll-x-contain rounded-lg border">
      <table data-statement-table="summary" data-statements-summary="" className="w-full border-separate border-spacing-0 text-sm">
        <caption className="px-(--statements-cell-padding) py-2 text-start font-medium">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" data-statement-item="">{copy.table.item}</th>
            {summary.years.map((year) => (
              <th key={year.fiscal_year} scope="col" data-statement-year={year.fiscal_year}>
                <abbr title={fiscalYearLabel(year.period_end, locale)}>{fiscalYearLabel(year.period_end, locale, "axis")}</abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {summary.lines.map((line) => (
            <tr key={line.item} data-statement-line={line.item} data-statement-total={STATEMENTS_CONFIG.totals.has(line.item) ? "" : undefined}>
              <th scope="row" data-statement-item=""><AccountingTerm>{lineLabel(line.item, line.fallback_label, locale)}</AccountingTerm></th>
              {line.cells.map((cell, index) => (
                <td key={summary.years[index]!.fiscal_year} data-statement-status={cell?.status ?? "empty"}>
                  {cell ? <data value={cell.value}>{exact ? exactValueText(cell.value, line.unit, locale) : shortValueText(cell.value, line.unit, locale)}</data> : <span aria-hidden="true">{EMPTY_VALUE}</span>}
                  <StatusSuffix cell={cell} locale={locale} />
                </td>
              ))}
            </tr>
          ))}
          <tr data-statements-summary-sources="">
            <th scope="row" data-statement-item="">{copy.summary.annualReport}</th>
            {summary.years.map((year) => {
              const filing = year.annual_report === null ? null : summary.filings[year.annual_report] ?? null;
              return (
                <td key={year.fiscal_year}>
                  {filing ? <ExternalLink href={filing.filing_url} newTabLabel={copy.opensNewTab} className="font-normal">{filing.form}</ExternalLink> : <span aria-hidden="true">{EMPTY_VALUE}</span>}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export type StatementsFrameState = "static" | "loading" | "error";

/**
 * Where every line appears once the statements file has loaded. `static`
 * (prerendered, before hydration) reserves the place and, without
 * JavaScript, says what it would hold; `loading` and `error` exist only on a
 * hydrated page. The page's polite live region (`StatementsLiveRegion`)
 * announces the changes; this frame shows them.
 */
export function StatementsFullFrame({ state, source, locale, onRetry }: { state: StatementsFrameState; source: StatementsSource; locale: PublicWebLocale; onRetry: () => void }) {
  const copy = statementsMessagesFor(locale).full;
  const items = formatNumber(source.items, locale);
  const years = formatNumber(source.year_count, locale);
  return (
    <div data-statements-full={state} className="flex min-h-(--touch-target-min) flex-wrap items-center gap-3 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
      {state === "static" ? <noscript><p>{copy.needsJavaScript(items, years)}</p></noscript> : null}
      {state === "loading" ? (
        <p className="flex items-center gap-2"><LoaderCircleIcon aria-hidden="true" className="size-4 motion-safe:animate-spin" />{copy.loading(items, years)}</p>
      ) : null}
      {state === "error" ? (
        <>
          <p className="text-foreground">{copy.error}</p>
          <Button type="button" variant="outline" className="min-h-(--touch-target-min) md:min-h-0" onClick={onRetry}>
            <RefreshCwIcon aria-hidden="true" />
            {copy.retry}
          </Button>
        </>
      ) : null}
    </div>
  );
}

/** The polite announcement of the file's state: loading, every line loaded, or the failure. Empty before hydration. */
export function StatementsLiveRegion({ state, source, locale }: { state: StatementsFrameState | "loaded"; source: StatementsSource; locale: PublicWebLocale }) {
  const copy = statementsMessagesFor(locale).full;
  const text = state === "loading"
    ? copy.loading(formatNumber(source.items, locale), formatNumber(source.year_count, locale))
    : state === "loaded" ? copy.loaded : state === "error" ? copy.error : "";
  return <p className="sr-only" role="status" aria-live="polite" aria-atomic="true" data-statements-live="">{text}</p>;
}
