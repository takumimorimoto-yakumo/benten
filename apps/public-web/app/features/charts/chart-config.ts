/**
 * The single place for the charts' display rules (company and product
 * pages). Layout sizes are CSS tokens in `static.css`; these are the values
 * the drawing code needs as numbers.
 */
export const CHART_RANGES = ["3M", "1Y", "all"] as const;
export type ChartRange = (typeof CHART_RANGES)[number];

/** Price line width (px). */
const PRICE_STROKE_WIDTH = 2;
/** Background-coloured edge on each side of the price line (px), so the line stays readable where it crosses a bar in either theme. */
const PRICE_HALO_EDGE = 3;

export const CHART_CONFIG = {
  /** Media queries the charts follow: reduced motion stops the drawing animation; below md the axes are compact. */
  media: { reducedMotion: "(prefers-reduced-motion: reduce)", compact: "(width < 48rem)" },
  /** Months each range reaches back from the last day of data; `all` has no limit. */
  rangeMonths: { "3M": 3, "1Y": 12, all: null } as const satisfies Record<ChartRange, number | null>,
  /** The range a chart opens with: all ten years of figures with the whole price history. */
  defaultRange: "all" as ChartRange,
  /** Space added above and below the price line, as a share of its visible span. */
  priceDomainPadding: 0.08,
  /** Space added above the tallest bar, as a share of the money axis span. */
  moneyDomainPadding: 0.06,
  /** A range longer than this many years labels its time axis by year alone. */
  yearLabelMinYears: 3,
  /** Ticks per y axis: few, so labels stay short on a phone. */
  yTickCount: 4,
  /** The two bars of a fiscal year share its width: this share of the year is left empty at each side and between them. */
  fiscalYearBarGap: 0.08,
  /** Below this plot width (px), the x axis labels only every other tick. */
  compactPlotWidth: 480,
  /** Price line and its halo (px): the halo is the line plus the edge on both sides, drawn under it in `--chart-price-halo`. */
  priceStrokeWidth: PRICE_STROKE_WIDTH,
  priceHaloWidth: PRICE_STROKE_WIDTH + PRICE_HALO_EDGE * 2,
  /** Joins and ends of the line and its halo (SVG), so the halo has no spikes at sharp turns. */
  priceLineJoin: "round",
  priceLineCap: "round",
  /** Active point marker radius (px), and its ring in the background colour. */
  activeDotRadius: 4,
  activeDotRing: 2,
  /** Edge of a revenue bar, and the outline of the selected bar (px). */
  barEdgeWidth: 1,
  selectedBarWidth: 2,
  /** X axis labels: at most this many on a phone and on a wider screen. */
  xTickCount: { compact: 3, wide: 6 },
  /**
   * Y axis label columns fit their longest tick label: this many px per
   * character at the axis text size (a CJK character counts as `wideCharEm`),
   * plus the gap to the plot. A Japanese compact amount (digits and the
   * hundred-million unit) needs more room than "$150B".
   */
  axisLabel: { charPx: 7, wideCharEm: 1.8, gapPx: 10, minPx: 32 },
  /** Room above the plot for the listing label (px). */
  plotMarginTop: 8,
  /** Dash pattern of the listing seam (SVG `stroke-dasharray`). */
  listingSeamDash: "3 3",
  /** The listing label sits this far left of the seam and below the plot top (px). */
  listingLabelOffset: { x: 6, y: 14 },
  /** Where the line crosses a bar, a pointer this close to the bar top (share of its height, capped in px) selects the day. */
  barTopPriceZone: { share: 0.15, maxPx: 12 },
  /** Chart drawing animation when motion is allowed (ms); none under reduced motion. */
  animationMs: 400,
} as const;
