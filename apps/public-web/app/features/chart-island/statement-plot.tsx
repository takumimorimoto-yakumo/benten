/**
 * The small chart above each financial statements table (company page):
 * bars for amounts, a line for a ratio or a total drawn over them, one
 * category per fiscal year. Part of the chart drawing island, so Recharts
 * loads only after hydration and only on pages with a chart.
 *
 * It draws what the table already lists. Tapping or clicking a bar selects
 * that value in the table (the section shows it in its readout); the
 * selected fiscal year is marked with a vertical rule.
 */
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { STATEMENTS_CONFIG, type StatementChartSpec } from "@/features/statements/statement-config";
import { axisWidth } from "./axis";

export type StatementPlotRow = { readonly label: string } & Readonly<Record<string, number | string | null>>;

export type StatementPlotProps = {
  /** One row per fiscal year, oldest first, with each series' value (`null` when absent). */
  readonly rows: readonly StatementPlotRow[];
  readonly spec: StatementChartSpec;
  /** Series names for the chart config (the legend is drawn by the section). */
  readonly labels: Readonly<Record<string, string>>;
  readonly selectedIndex: number | null;
  readonly onSelect: (line: string, index: number) => void;
  readonly animate: boolean;
  readonly compact: boolean;
  readonly format: { readonly left: (value: number) => string; readonly right: ((value: number) => string) | null };
};

const LEFT_AXIS = "left";
const RIGHT_AXIS = "right";

function color(token: string): string {
  return `var(--${token})`;
}

export function StatementPlot({ rows, spec, labels, selectedIndex, onSelect, animate, compact, format }: StatementPlotProps) {
  const config: ChartConfig = Object.fromEntries(spec.series.map((series) => [series.line, { label: labels[series.line] ?? series.line, color: color(series.fill) }]));
  const leftValues = rows.flatMap((row) => spec.series.filter((series) => series.axis === "left").map((series) => row[series.line] ?? null)).filter((value): value is number => typeof value === "number");
  const rightValues = rows.flatMap((row) => spec.series.filter((series) => series.axis === "right").map((series) => row[series.line] ?? null)).filter((value): value is number => typeof value === "number");
  const hasNegative = leftValues.some((value) => value < 0);
  const selected = selectedIndex === null ? null : rows[selectedIndex]?.label ?? null;
  const leftWidth = axisWidth(leftValues.length ? [format.left(Math.max(...leftValues)), format.left(Math.min(...leftValues))] : []);
  const rightWidth = spec.right && format.right ? axisWidth(rightValues.length ? [format.right(Math.max(...rightValues)), format.right(Math.min(...rightValues))] : []) : 0;
  return (
    <ChartContainer config={config} className="aspect-auto h-(--statements-chart-height) w-full select-none">
      <ComposedChart data={[...rows]} margin={{ top: STATEMENTS_CONFIG.plotMarginTop, right: 0, bottom: 0, left: 0 }} accessibilityLayer={false}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" type="category" tickLine={false} axisLine={false} interval={compact ? "preserveStartEnd" : 0} minTickGap={4} />
        <YAxis yAxisId={LEFT_AXIS} orientation="left" tickCount={STATEMENTS_CONFIG.yTickCount} tickFormatter={format.left} tickLine={false} axisLine={false} width={leftWidth} />
        {spec.right && format.right ? (
          <YAxis yAxisId={RIGHT_AXIS} orientation="right" tickCount={STATEMENTS_CONFIG.yTickCount} tickFormatter={format.right} tickLine={false} axisLine={false} width={rightWidth} />
        ) : null}
        {hasNegative ? <ReferenceLine yAxisId={LEFT_AXIS} y={0} stroke="var(--muted-foreground)" /> : null}
        {selected !== null ? <ReferenceLine yAxisId={LEFT_AXIS} x={selected} stroke="var(--muted-foreground)" strokeDasharray={STATEMENTS_CONFIG.dash} /> : null}
        {spec.series.map((series) =>
          series.mark === "bar" ? (
            <Bar
              key={series.line}
              yAxisId={series.axis === "right" ? RIGHT_AXIS : LEFT_AXIS}
              dataKey={series.line}
              stackId={series.stack}
              fill={`var(--color-${series.line})`}
              stroke={series.edge ? color(series.edge) : undefined}
              strokeWidth={series.edge ? STATEMENTS_CONFIG.edgeWidth : 0}
              isAnimationActive={animate}
              animationDuration={STATEMENTS_CONFIG.animationMs}
              onClick={(_, index) => onSelect(series.line, index)}
              style={{ cursor: "pointer" }}
            >
              {rows.map((row, index) => (
                <Cell key={row.label} stroke={index === selectedIndex ? "var(--foreground)" : series.edge ? color(series.edge) : "none"} strokeWidth={index === selectedIndex ? STATEMENTS_CONFIG.lineWidth : STATEMENTS_CONFIG.edgeWidth} />
              ))}
            </Bar>
          ) : (
            <Line
              key={series.line}
              yAxisId={series.axis === "right" ? RIGHT_AXIS : LEFT_AXIS}
              dataKey={series.line}
              type="linear"
              stroke={`var(--color-${series.line})`}
              strokeWidth={STATEMENTS_CONFIG.lineWidth}
              strokeDasharray={series.dashed ? STATEMENTS_CONFIG.dash : undefined}
              dot={{ r: STATEMENTS_CONFIG.dotRadius, fill: `var(--color-${series.line})`, strokeWidth: 0 }}
              activeDot={false}
              connectNulls={false}
              isAnimationActive={animate}
              animationDuration={STATEMENTS_CONFIG.animationMs}
            />
          ),
        )}
      </ComposedChart>
    </ChartContainer>
  );
}
