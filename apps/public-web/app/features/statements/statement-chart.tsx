/**
 * The small chart above a statement's table (app IA section 4.9): the tab's
 * main amounts as bars and a ratio or total as a line, one group per fiscal
 * year. The frame, its accessible summary and its legend are static; the
 * drawing loads with the chart island after hydration. The table below
 * carries the same values, so the chart is a picture of it, not a second
 * source.
 */
import { AccountingTerm } from "./accounting-term";
import { RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CHART_CONFIG } from "@/features/charts/chart-config";
import { useChartIsland, type ChartIsland } from "@/features/charts/load-chart-island";
import { fiscalYearLabel } from "@/i18n/fiscal-year";
import type { PublicWebLocale } from "@/i18n/locales";
import { statementsMessagesFor } from "@/i18n/statements-messages";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { STATEMENTS_CONFIG, type StatementChartColor, type StatementChartSeries } from "./statement-config";
import { valueAt, type CompanyStatements, type StatementTab } from "./statement-data";
import { axisTickText, lineLabel } from "./statement-format";

const pickPlot = (island: ChartIsland) => island.StatementPlot;

/** Legend swatches in the statements' chart role tokens (static class names, so Tailwind keeps them). */
const SWATCH_FILL: Record<StatementChartColor, string> = {
  "chart-statement-quiet": "bg-(--chart-statement-quiet)",
  "chart-statement-quiet-edge": "bg-(--chart-statement-quiet-edge)",
  "chart-statement-middle": "bg-(--chart-statement-middle)",
  "chart-statement-strong": "bg-(--chart-statement-strong)",
  foreground: "bg-foreground",
};
const SWATCH_EDGE: Record<StatementChartColor, string> = {
  "chart-statement-quiet": "border border-(--chart-statement-quiet)",
  "chart-statement-quiet-edge": "border border-(--chart-statement-quiet-edge)",
  "chart-statement-middle": "border border-(--chart-statement-middle)",
  "chart-statement-strong": "border border-(--chart-statement-strong)",
  foreground: "border border-foreground",
};
const SWATCH_DASH: Record<StatementChartColor, string> = {
  "chart-statement-quiet": "border-(--chart-statement-quiet)",
  "chart-statement-quiet-edge": "border-(--chart-statement-quiet-edge)",
  "chart-statement-middle": "border-(--chart-statement-middle)",
  "chart-statement-strong": "border-(--chart-statement-strong)",
  foreground: "border-foreground",
};

function Swatch({ series }: { series: StatementChartSeries }) {
  if (series.mark === "line") {
    return series.dashed
      ? <span aria-hidden="true" className={cn("w-4 border-t-2 border-dashed", SWATCH_DASH[series.fill])} />
      : <span aria-hidden="true" className={cn("h-0.5 w-4", SWATCH_FILL[series.fill])} />;
  }
  return <span aria-hidden="true" className={cn("size-3", SWATCH_FILL[series.fill], series.edge && SWATCH_EDGE[series.edge])} />;
}

export function StatementChart({ statements, tab, locale, selectedIndex, onSelect, catalogState }: {
  statements: CompanyStatements;
  tab: StatementTab;
  locale: PublicWebLocale;
  selectedIndex: number | null;
  onSelect: (line: string, index: number) => void;
  /** Development-only Living Catalog: force a plot state instead of loading the island. */
  catalogState?: "loading" | "error";
}) {
  const copy = statementsMessagesFor(locale);
  const spec = STATEMENTS_CONFIG.charts[tab];
  const compact = useMediaQuery(CHART_CONFIG.media.compact);
  const reducedMotion = useMediaQuery(CHART_CONFIG.media.reducedMotion);
  const { state: loaded, retry } = useChartIsland(pickPlot);
  const state = catalogState ? { kind: catalogState } as const : loaded;
  const series = spec.series.filter((entry) => statements.years.some((_, index) => valueAt(statements, entry.line, index) !== null));
  if (series.length === 0) return null;
  const rows = statements.years.map((year, index) => ({
    label: fiscalYearLabel(year.period_end, locale, "axis"),
    ...Object.fromEntries(series.map((entry) => [entry.line, valueAt(statements, entry.line, index)])),
  }));
  const labels = Object.fromEntries(series.map((entry) => [entry.line, lineLabel(entry.line, undefined, locale)]));
  return (
    <figure data-statement-chart={tab} data-statement-chart-state={state.kind} className="m-0 flex min-w-0 flex-col gap-2">
      <div role="img" aria-label={copy.chart.summary[tab]} className="relative h-(--statements-chart-height) min-w-0">
        {state.kind === "ready" ? (
          <state.value
            rows={rows}
            spec={{ ...spec, series }}
            labels={labels}
            selectedIndex={selectedIndex}
            onSelect={onSelect}
            animate={!reducedMotion}
            compact={compact}
            format={{ left: (value) => axisTickText(value, spec.left, locale), right: spec.right ? (value) => axisTickText(value, spec.right!, locale) : null }}
          />
        ) : state.kind === "error" ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 rounded-md bg-muted px-4 text-center">
            <p className="text-sm">{copy.chart.error}</p>
            <Button type="button" variant="outline" className="min-h-(--touch-target-min) md:min-h-0" onClick={retry}>
              <RefreshCwIcon aria-hidden="true" />
              {copy.chart.retry}
            </Button>
          </div>
        ) : (
          <div data-statement-chart-reserve="" className="flex h-full items-center justify-center rounded-md bg-muted px-4 text-center">
            <noscript><p className="text-sm text-muted-foreground">{copy.chart.needsJavaScript}</p></noscript>
          </div>
        )}
      </div>
      <figcaption>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {series.map((entry) => (
            <li key={entry.line} className="flex items-center gap-2"><Swatch series={entry} /><AccountingTerm>{lineLabel(entry.line, undefined, locale)}</AccountingTerm></li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
