/**
 * The single place for the financial statements' display rules (company
 * page section and evidence page). Layout sizes are CSS tokens in
 * `static.css`; these are the values the code needs as numbers or names.
 */
import type { StatementItem, StatementSummaryRow, StatementTab, StatementUnit } from "./statement-data";

/**
 * The statements' chart role tokens (`static.css`, with a dark value each,
 * built from the generated shadcn chart tokens) and the foreground; no custom
 * colour (app IA section 11). A quiet fill carries its edge; middle and
 * strong are solid.
 */
export type StatementChartColor = "chart-statement-quiet" | "chart-statement-quiet-edge" | "chart-statement-middle" | "chart-statement-strong" | "foreground";

export type StatementChartSeries = {
  readonly line: StatementItem;
  /** Bars for amounts, a line for a ratio or a derived total drawn over them. */
  readonly mark: "bar" | "line";
  /** `left`: the tab's amounts; `right`: a ratio in percent. */
  readonly axis: "left" | "right";
  /** Bars with the same stack id are stacked into one bar per year. */
  readonly stack?: string;
  readonly fill: StatementChartColor;
  /** A darker edge keeps a light bar at 3:1 against the background. */
  readonly edge?: StatementChartColor;
  /** A dashed line, so lines of similar grey stay apart without colour. */
  readonly dashed?: boolean;
};

export type StatementChartSpec = {
  readonly left: StatementUnit;
  readonly right: StatementUnit | null;
  readonly series: readonly StatementChartSeries[];
};

export const STATEMENTS_CONFIG = {
  /** Fiscal years the section shows, newest last. */
  maxYears: 10,
  /**
   * What the company and evidence documents prerender before the statements
   * file loads (and without JavaScript): these lines for the newest years.
   * Each row is its first item the company has.
   */
  summary: {
    years: 5,
    rows: [
      ["revenue"],
      ["operating_income"],
      ["net_income_parent", "net_income"],
      ["total_assets"],
      ["operating_cf"],
      ["eps_diluted"],
    ],
  } as const satisfies { years: number; rows: readonly StatementSummaryRow[] },
  /** Totals and subtotals, set in medium weight in the tables. */
  totals: new Set<string>([
    "revenue", "gross_profit", "operating_income", "pretax_income", "net_income", "net_income_parent",
    "current_assets", "total_assets", "current_liabilities", "total_liabilities", "total_equity",
    "operating_cf", "investing_cf", "financing_cf", "free_cash_flow", "eps_diluted",
  ]) as ReadonlySet<string>,
  /** The tab the section opens with. */
  defaultTab: "pl" as StatementTab,
  /** Display rounding (presentation only; the exact value is in the cell's readout). */
  digits: {
    /** A USD amount in the table and the readout headline: one decimal of its compact unit ("$215.9B", "$151.0B"), so a column lines up. */
    amountFraction: 1,
    /** A USD amount per share: cents ("$2.94"); the readout keeps up to `perShareExact`. */
    perShare: 2,
    perShareExact: 4,
    /** A share count, shortened ("24.53B"). */
    sharesSignificant: 4,
    /** A ratio in percent: "55.8%" in the table, "55.84%" in the readout. */
    ratio: 1,
    ratioExact: 2,
  },
  /** One small chart above each tab's table (app IA section 4.9). */
  charts: {
    pl: {
      left: "usd",
      right: "ratio",
      series: [
        { line: "revenue", mark: "bar", axis: "left", fill: "chart-statement-quiet", edge: "chart-statement-quiet-edge" },
        { line: "operating_income", mark: "bar", axis: "left", fill: "chart-statement-middle" },
        { line: "net_income_parent", mark: "bar", axis: "left", fill: "chart-statement-strong" },
        { line: "operating_margin", mark: "line", axis: "right", fill: "foreground" },
      ],
    },
    bs: {
      left: "usd",
      right: null,
      series: [
        { line: "total_assets", mark: "bar", axis: "left", fill: "chart-statement-quiet", edge: "chart-statement-quiet-edge" },
        { line: "total_liabilities", mark: "bar", axis: "left", stack: "claims", fill: "chart-statement-middle" },
        { line: "total_equity", mark: "bar", axis: "left", stack: "claims", fill: "chart-statement-strong" },
      ],
    },
    cf: {
      left: "usd",
      right: null,
      series: [
        { line: "operating_cf", mark: "bar", axis: "left", fill: "chart-statement-quiet", edge: "chart-statement-quiet-edge" },
        { line: "investing_cf", mark: "bar", axis: "left", fill: "chart-statement-middle" },
        { line: "financing_cf", mark: "bar", axis: "left", fill: "chart-statement-strong" },
        { line: "free_cash_flow", mark: "line", axis: "left", fill: "foreground", dashed: true },
      ],
    },
    per_share: {
      left: "usd_per_share",
      right: null,
      series: [
        { line: "eps_diluted", mark: "bar", axis: "left", fill: "chart-statement-middle" },
        { line: "dividends_per_share", mark: "bar", axis: "left", fill: "chart-statement-quiet", edge: "chart-statement-quiet-edge" },
      ],
    },
    ratios: {
      left: "ratio",
      right: null,
      series: [
        { line: "gross_margin", mark: "line", axis: "left", fill: "chart-statement-middle", dashed: true },
        { line: "operating_margin", mark: "line", axis: "left", fill: "foreground" },
        { line: "net_margin", mark: "line", axis: "left", fill: "chart-statement-strong" },
      ],
    },
  } as const satisfies Record<StatementTab, StatementChartSpec>,
  /** Dash of a `dashed` series (SVG `stroke-dasharray`). */
  dash: "4 3",
  /** Line, bar edge and dot sizes of the small charts (px); the selected year's bars get `lineWidth`. */
  lineWidth: 2,
  edgeWidth: 1,
  dotRadius: 3,
  /** Room above the plot (px). */
  plotMarginTop: 4,
  /** Y ticks of a small chart. */
  yTickCount: 4,
  /** Chart drawing animation when motion is allowed (ms); none under reduced motion. */
  animationMs: 300,
} as const;
