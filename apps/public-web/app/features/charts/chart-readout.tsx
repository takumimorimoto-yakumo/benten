/**
 * The chart's readout: what the selected day or figure is, where it comes
 * from, and the link to its source (the swap and its pool on Solana
 * Explorer, the annual report on SEC EDGAR). It sits under the plot at a fixed minimum height, so
 * selecting never moves the page, and its links stay reachable on a phone,
 * where a floating tooltip would cover the chart and vanish on the next tap.
 */
import { PURCHASE_CONFIG } from "@benten/purchase/config";
import { ExternalLink } from "@/components/external-link";
import { chartsMessagesFor } from "@/i18n/charts-messages";
import { formatNumber, formatSourceDate, shortenAddress } from "@/i18n/format";
import { fiscalYearLabel } from "@/i18n/fiscal-year";
import type { PublicWebLocale } from "@/i18n/locales";
import { cn } from "@/lib/utils";
import { isDrawableFigure, type FinancialPoint, type PricePool } from "./chart-data";
import { figureText, usdText } from "./chart-format";
import { chartContent, type ChartModel, type ChartSelection } from "./chart-model";

export function selectedFigure(model: ChartModel, selection: ChartSelection | null): FinancialPoint | null {
  if (selection?.kind !== "figure") return null;
  return model.years.find((year) => year.fiscalYear === selection.fiscalYear)?.figures[selection.metric] ?? null;
}

function FigureReadout({ figure, locale }: { figure: FinancialPoint; locale: PublicWebLocale }) {
  const copy = chartsMessagesFor(locale);
  const form = figure.form;
  return (
    <div data-chart-readout="figure" className="flex flex-col gap-0.5">
      <p className="flex flex-wrap gap-x-2 text-sm font-medium text-muted-foreground"><span>{copy.readout.metric[figure.metric]}</span><span>{fiscalYearLabel(figure.period_end, locale)}</span></p>
      {isDrawableFigure(figure) ? (
        <p className="text-2xl font-semibold tracking-tight tabular-nums"><data value={figure.value}>{figureText(figure.value, locale)}</data></p>
      ) : (
        <p className="text-sm font-medium">{copy.readout.notVerified}</p>
      )}
      <p className="flex flex-wrap gap-x-3 text-sm text-muted-foreground">
        <span>{copy.readout.yearEnded(formatSourceDate(figure.period_end, locale))}</span>
        {figure.filed ? <span>{copy.readout.filed(form, formatSourceDate(figure.filed, locale))}</span> : null}
      </p>
      {figure.filing_url ? (
        <p className="text-sm"><ExternalLink href={figure.filing_url} newTabLabel={copy.opensNewTab}>{copy.readout.openFiling(form)}</ExternalLink></p>
      ) : null}
    </div>
  );
}

function PriceReadout({ model, index, symbol, pools, locale }: { model: ChartModel; index: number; symbol: string; pools: readonly PricePool[]; locale: PublicWebLocale }) {
  const copy = chartsMessagesFor(locale).readout;
  const opensNewTab = chartsMessagesFor(locale).opensNewTab;
  const row = model.prices[index];
  if (!row) return null;
  const { point } = row;
  const pool = point.value === null ? null : pools.find((candidate) => candidate.address === point.pool) ?? { address: point.pool, dex: "" };
  return (
    <div data-chart-readout="price" className="flex flex-col gap-0.5">
      <p className="flex flex-wrap gap-x-2 text-sm font-medium text-muted-foreground"><span>{copy.price}</span><span>{copy.day(formatSourceDate(point.date, locale))}</span></p>
      {point.value === null ? (
        <p className="text-sm">{copy.gap[point.reason]}</p>
      ) : (
        <>
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-2xl font-semibold tracking-tight tabular-nums">{usdText(point.value, locale)}</span>
            <span className="text-sm text-muted-foreground">{copy.perToken(symbol)}</span>
          </p>
          <p className="text-sm text-muted-foreground">{copy.tradeNote}</p>
          <p className="flex flex-wrap gap-x-3 text-sm">
            <ExternalLink href={PURCHASE_CONFIG.explorerTxUrl(point.tx_signature)} newTabLabel={opensNewTab}>{copy.swap}</ExternalLink>
            <span className="text-muted-foreground" title={point.tx_signature}>{shortenAddress(point.tx_signature)}</span>
            <span className="text-muted-foreground">{copy.slot(formatNumber(point.slot, locale, "identifier"))}</span>
          </p>
          {pool ? (
            <p className="text-sm">
              <ExternalLink href={PURCHASE_CONFIG.explorerAddressUrl(pool.address)} newTabLabel={opensNewTab} className="font-normal">{copy.pool(pool.dex || shortenAddress(pool.address))}</ExternalLink>{" "}
              <span className="text-muted-foreground" title={pool.address}>{shortenAddress(pool.address)}</span>
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

export function ChartReadout({ model, selection, symbol, pools, locale, interactive }: {
  model: ChartModel;
  selection: ChartSelection | null;
  /** The token's display symbol, for "USDC per {symbol} token". */
  symbol: string;
  /** The series' pools, to name the selected trade's DEX. */
  pools: readonly PricePool[];
  locale: PublicWebLocale;
  /** The plot is drawn, so the hint to point or tap applies. */
  interactive: boolean;
}) {
  const copy = chartsMessagesFor(locale).readout;
  const figure = selectedFigure(model, selection);
  const filled = figure !== null || selection?.kind === "price" || interactive;
  return (
    <div data-chart-readout-slot="" aria-live="polite" className={cn("min-h-(--chart-readout-min-height) rounded-lg px-3 py-2", filled && "bg-muted")}>
      {figure ? (
        <FigureReadout figure={figure} locale={locale} />
      ) : selection?.kind === "price" ? (
        <PriceReadout model={model} index={selection.index} symbol={symbol} pools={pools} locale={locale} />
      ) : interactive ? (
        <p data-chart-hint={chartContent(model)} className="text-sm text-muted-foreground">{copy.hint[chartContent(model)]}</p>
      ) : null}
    </div>
  );
}
