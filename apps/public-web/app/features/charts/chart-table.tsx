/**
 * The chart's data as tables, for reading without the plot (screen readers,
 * keyboard, no JavaScript): the fiscal years and the days of the selected
 * range, with the same values, gaps and source links as the plot and its
 * readout. Closed by default; prerendered, so it works before hydration.
 * A real price series is read after hydration: until then (and without
 * JavaScript) the table links its data file instead of listing the days.
 */
import { PURCHASE_CONFIG } from "@benten/purchase/config";
import { ExternalLink } from "@/components/external-link";
import { NoteLink } from "@/components/note-link";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { chartsMessagesFor } from "@/i18n/charts-messages";
import { formatSourceDate, shortenAddress } from "@/i18n/format";
import { fiscalYearLabel } from "@/i18n/fiscal-year";
import type { PublicWebLocale } from "@/i18n/locales";
import { FINANCIAL_METRICS, isDrawableFigure, type FinancialPoint, type PriceFileRef } from "./chart-data";
import { figureText, usdText } from "./chart-format";
import type { ChartModel } from "./chart-model";

function FigureCell({ figure, locale }: { figure: FinancialPoint | null; locale: PublicWebLocale }) {
  const copy = chartsMessagesFor(locale);
  if (figure && isDrawableFigure(figure)) return <TableCell className="text-right tabular-nums"><data value={figure.value}>{figureText(figure.value, locale)}</data></TableCell>;
  // Not verified: listed as such, without its value. No point: the registry excludes the fact for this year.
  return <TableCell className="text-right text-muted-foreground">{figure ? copy.readout.notVerified : copy.table.notShown}</TableCell>;
}

export function ChartTables({ model, symbol, priceFile, locale }: {
  model: ChartModel;
  symbol: string | null;
  /** The series' data file, when the page does not carry its days. */
  priceFile: PriceFileRef | null;
  locale: PublicWebLocale;
}) {
  const copy = chartsMessagesFor(locale);
  const years = model.years.filter((year) => FINANCIAL_METRICS.some((metric) => year.figures[metric]));
  return (
    <details data-chart-table="" className="group rounded-lg border px-3 py-2">
      <summary className="cursor-pointer text-sm font-medium max-md:flex max-md:min-h-(--touch-target-min) max-md:items-center">{copy.table.show}</summary>
      <div className="mt-3 flex flex-col gap-6">
        {years.length ? (
          <Table data-chart-table-figures="">
            <TableCaption className="mt-0 mb-2 caption-top text-start">{copy.table.figuresCaption}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{copy.table.fiscalYear}</TableHead>
                <TableHead scope="col">{copy.table.yearEnded}</TableHead>
                <TableHead scope="col" className="text-right">{copy.readout.metric.revenue}</TableHead>
                <TableHead scope="col" className="text-right">{copy.readout.metric.net_income_parent}</TableHead>
                <TableHead scope="col">{copy.table.filing}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {years.map((year) => {
                const cited = year.figures.revenue ?? year.figures.net_income_parent;
                return (
                  <TableRow key={year.fiscalYear}>
                    <TableHead scope="row" className="font-normal">{fiscalYearLabel(year.periodEnd, locale)}</TableHead>
                    <TableCell>{formatSourceDate(year.periodEnd, locale)}</TableCell>
                    <FigureCell figure={year.figures.revenue} locale={locale} />
                    <FigureCell figure={year.figures.net_income_parent} locale={locale} />
                    <TableCell>
                      {cited ? (
                        <ExternalLink href={cited.filing_url} newTabLabel={copy.opensNewTab}>{copy.readout.filed(cited.form, formatSourceDate(cited.filed, locale))}</ExternalLink>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : null}
        {model.prices.length && symbol ? (
          <div className="max-h-(--chart-table-max-height) overflow-y-auto" tabIndex={0} role="region" aria-label={copy.table.priceCaption(symbol)}>
            <Table data-chart-table-prices="">
              <TableCaption className="mt-0 mb-2 caption-top text-start">{copy.table.priceCaption(symbol)}</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{copy.table.date}</TableHead>
                  <TableHead scope="col" className="text-right">{copy.table.value}</TableHead>
                  <TableHead scope="col">{copy.table.swap}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {model.prices.map(({ point }) => (
                  <TableRow key={point.date}>
                    <TableHead scope="row" className="font-normal">{formatSourceDate(point.date, locale)}</TableHead>
                    {point.value === null ? (
                      <TableCell colSpan={2} className="text-muted-foreground">{copy.readout.gap[point.reason]}</TableCell>
                    ) : (
                      <>
                        <TableCell className="text-right tabular-nums">{usdText(point.value, locale)}</TableCell>
                        <TableCell><ExternalLink href={PURCHASE_CONFIG.explorerTxUrl(point.tx_signature)} newTabLabel={copy.opensNewTab}>{shortenAddress(point.tx_signature)}</ExternalLink></TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
        {priceFile ? (
          <NoteLink href={priceFile.file} data-chart-price-file="">{copy.table.priceFile}</NoteLink>
        ) : null}
      </div>
    </details>
  );
}
