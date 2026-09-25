import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CHART_CONFIG } from "../app/features/charts/chart-config.ts";
import { onchainDailySeries, onchainDailyTickers, type OnchainDailySeries } from "@benten/pricing/onchain-daily";
import { financialSeriesFromAnnualFacts, hasChartData, priceSeriesFromReadModel, type ChartData, type PriceFileRef } from "../app/features/charts/chart-data.ts";
import { fixtureChartData, FIXTURE_AS_OF, FIXTURE_LISTED_ON } from "../app/features/charts/chart-fixture.ts";
import { availableRanges, chartContent, chartModel, latestTrade, nearestPriceIndex, niceTicks, xAxisTicks, xTicks } from "../app/features/charts/chart-model.ts";
import { ChartSection } from "../app/features/charts/chart-section.tsx";
import { ChartReadout } from "../app/features/charts/chart-readout.tsx";
import { signedPercentText } from "../app/features/charts/chart-format.ts";
import { parsePriceFile } from "../app/features/charts/price-file.ts";
import { createHash } from "node:crypto";
import { dataFilePath, isDataFilePath } from "../app/lib/data-files.ts";
import { xStockChartData } from "../app/lib/chart.server.ts";
import { priceFiles, publishedPriceFiles, xStockPriceSeries } from "../app/lib/price-files.server.ts";
import { CHARTS_MESSAGES } from "../app/i18n/charts-messages.ts";
import { PUBLIC_WEB_LOCALES } from "../app/i18n/locales.ts";
import { forbiddenWords, markedWords, withoutMarked } from "./app-vocabulary.mjs";
import { DOUBLED_PUNCTUATION } from "./reference-vocabulary.mjs";

const TOKEN = { symbol: "EXAMPLEx", mint: "11111111111111111111111111111111", pool: "11111111111111111111111111111112" };
const FULL = fixtureChartData(TOKEN);

function shape(value: unknown): unknown {
  if (typeof value === "function") return `fn/${value.length}`;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, shape(nested)]));
  return typeof value;
}

function textOf(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ");
}

describe("chart fixture", () => {
  it("is labelled, NVIDIA-shaped and deterministic", () => {
    expect(FULL.price?.fixture).toBe(true);
    expect(FULL.financials?.fixture).toBe(true);
    const days = FULL.price!.points;
    expect(days[0]!.date).toBe(FIXTURE_LISTED_ON);
    expect(days.at(-1)!.date).toBe(FIXTURE_AS_OF);
    expect(days.length).toBeGreaterThan(440);
    expect(new Set(FULL.financials!.points.map((point) => point.fiscal_year)).size).toBeGreaterThanOrEqual(10);
    expect(fixtureChartData(TOKEN)).toEqual(FULL);
  });
});

describe("chart model", () => {
  it("offers 3M, 1Y and All with a price series, All alone without", () => {
    expect(availableRanges(FULL)).toEqual(["3M", "1Y", "all"]);
    expect(availableRanges({ price: null, financials: FULL.financials })).toEqual(["all"]);
    expect(CHART_CONFIG.defaultRange).toBe("all");
  });

  it("spans ten years of figures and the whole price history in All, and marks the listing", () => {
    const all = chartModel(FULL, "all");
    expect(all.years[0]!.fiscalYear).toBe(2016);
    expect(all.drawsPrice && all.drawsFigures).toBe(true);
    expect(all.showsListing).toBe(true);
    expect(all.gapDays).toBe(4);
    expect(all.moneyDomain![0]).toBe(0);
  });

  it("keeps a short range inside the price history, with no listing mark", () => {
    const threeMonths = chartModel(FULL, "3M");
    expect(threeMonths.showsListing).toBe(false);
    expect(threeMonths.prices.length).toBeGreaterThan(85);
    expect(threeMonths.prices.length).toBeLessThan(95);
    // No fiscal year of the fixture ends or runs in the last three months with a figure: the bars are gone.
    expect(threeMonths.drawsFigures).toBe(false);
    expect(chartModel(FULL, "1Y").years.map((year) => year.fiscalYear)).toEqual([2026]);
  });

  it("draws only verified figures and keeps the others as gaps", () => {
    const model = chartModel(FULL, "all");
    const fy2016 = model.years.find((year) => year.fiscalYear === 2016)!;
    // An excluded fact has no point; an unverified one is kept but never drawn.
    expect(fy2016.figures.net_income_parent).toBeNull();
    const fy2020 = model.years.find((year) => year.fiscalYear === 2020)!;
    expect(fy2020.figures.revenue?.status).toBe("unverified_or_derived");
  });

  it("finds the nearest day, round ticks and month ticks", () => {
    const model = chartModel(FULL, "all");
    expect(nearestPriceIndex(model.prices, model.prices[10]!.t + 1000)).toBe(10);
    expect(nearestPriceIndex([], 0)).toBeNull();
    expect(niceTicks(0, 160e9, 4)).toEqual([0, 50e9, 100e9, 150e9]);
    expect(niceTicks(131, 294, 4)).toEqual([150, 200, 250]);
    const ticks = xTicks(Date.UTC(2025, 6, 1), Date.UTC(2026, 8, 23), 6);
    expect(ticks.every((tick) => new Date(tick).getUTCDate() === 1)).toBe(true);
    expect(ticks.length).toBeLessThanOrEqual(6);
  });

  it("finds the last day with a value", () => {
    expect(latestTrade(FULL)?.date).toBe(FIXTURE_AS_OF);
    expect(latestTrade({ price: null, financials: null })).toBeNull();
    expect(hasChartData({ price: null, financials: null })).toBe(false);
  });

  it("formats a signed difference", () => {
    expect(signedPercentText(0.0042, "en")).toBe("+0.42%");
    expect(signedPercentText(-0.011, "en")).toBe("-1.10%");
  });
});

describe("read model adapters", () => {
  it("maps the on-chain read model per token, gaps keeping the source's reason", () => {
    const pool = { address: TOKEN.pool, dex: "example", program: TOKEN.pool, xstock_vault: TOKEN.pool, usdc_vault: TOKEN.pool };
    const base = { sessionCloseUtc: "2025-07-01T20:00:00Z", pool: TOKEN.pool, blockTime: "2025-07-01T20:00:01Z", usdcRaw: "1", xstockRaw: "-1" } as const;
    const gap = { usdcPerUnscaledToken: null, usdcPerUnderlyingShare: null, signature: null, slot: null, blockTime: null, usdcRaw: null, xstockRaw: null } as const;
    const model: OnchainDailySeries = {
      ticker: "NVDA", symbol: "NVDAx", mint: TOKEN.mint, pool, firstDate: "2025-07-01", lastDate: "2025-07-07", multiplierBasis: null,
      points: [
        { ...base, date: "2025-07-01", status: "observed", usdcPerUnscaledToken: "151.000000", usdcPerUnderlyingShare: "150.500000", signature: "5".repeat(88), slot: 1, reason: null },
        { ...base, date: "2025-07-02", status: "observed", usdcPerUnscaledToken: "152.000000", usdcPerUnderlyingShare: null, signature: "6".repeat(88), slot: 2, reason: null },
        { ...base, ...gap, date: "2025-07-03", status: "unavailable", reason: "no_single_swap_in_search_window" },
        { ...base, ...gap, date: "2025-07-07", status: "unavailable", reason: "signature_page_limit" },
      ],
    };
    const series = priceSeriesFromReadModel(model);
    // The line is USDC per token (151, 152) with or without a per-share value; never the per-share value.
    expect(series.points).toEqual([
      { date: "2025-07-01", value: 151, tx_signature: "5".repeat(88), pool: TOKEN.pool, slot: 1 },
      { date: "2025-07-02", value: 152, tx_signature: "6".repeat(88), pool: TOKEN.pool, slot: 2 },
      { date: "2025-07-03", value: null, reason: "no_single_swap_in_search_window" },
      { date: "2025-07-07", value: null, reason: "signature_page_limit" },
    ]);
    expect(series).toMatchObject({ symbol: "NVDAx", mint: TOKEN.mint, listed_on: "2025-07-01", as_of: "2025-07-07", pools: [{ address: TOKEN.pool, dex: "example" }] });
  });

  it("draws every bundled series per token on every session with a verified trade", () => {
    for (const ticker of onchainDailyTickers()) {
      const model = onchainDailySeries(ticker)!;
      const series = xStockPriceSeries({ ticker, symbol: model.symbol, mint: model.mint })!;
      expect(series.points.length).toBe(model.points.length);
      model.points.forEach((point, index) => {
        const drawn = series.points[index]!;
        expect(drawn.date).toBe(point.date);
        if (point.status === "unavailable") expect(drawn).toEqual({ date: point.date, value: null, reason: point.reason });
        else expect(drawn.value).toBe(Number(point.usdcPerUnscaledToken));
      });
    }
    // Exact identity only: another mint or symbol under the ticker gets no series.
    const nvda = onchainDailySeries("NVDA")!;
    expect(xStockPriceSeries({ ticker: "NVDA", symbol: nvda.symbol, mint: TOKEN.mint })).toBeNull();
    expect(xStockPriceSeries({ ticker: "NVDA", symbol: "NVDA", mint: nvda.mint })).toBeNull();
  });

  it("takes the registry annual fact points of the metrics it draws, in USD", () => {
    const point = { fiscal_year: 2026, fiscal_month: 1, period_start: "2025-01-27", period_end: "2026-01-25", value: 1e9, unit: "USD", status: "verified_reported", accession: "0000000000-26-000001", form: "10-K", filed: "2026-02-20", filing_url: "https://www.sec.gov/" };
    const series = financialSeriesFromAnnualFacts([
      { ...point, metric: "revenue" },
      { ...point, metric: "net_income_parent", status: "unverified_or_derived" },
      { ...point, metric: "total_assets" },
    ]);
    expect(series?.points.map((entry) => [entry.metric, entry.status])).toEqual([["revenue", "verified_reported"], ["net_income_parent", "unverified_or_derived"]]);
    expect(financialSeriesFromAnnualFacts([])).toBeNull();
    // Only the chart's own fields reach the loader data; the rest of a registry point stays on the server.
    const extra = financialSeriesFromAnnualFacts([{ ...point, metric: "revenue", statement: "income", source_concept: "us-gaap:Revenues", restatement: null } as never]);
    expect(Object.keys(extra!.points[0]!).sort()).toEqual(["accession", "filed", "filing_url", "fiscal_month", "fiscal_year", "form", "metric", "period_end", "period_start", "status", "unit", "value"]);
  });

  it("gives a company page the registry's annual figures and a reference to the ticker's price file, never the days", () => {
    const series = onchainDailySeries("NVDA")!;
    const nvda = { ticker: "NVDA", symbol: series.symbol, mint: series.mint };
    const company = xStockChartData(nvda, { figures: true })!;
    expect(company.price).toBeNull();
    expect(company.financials?.fixture).toBeUndefined();
    const years = [...new Set(company.financials!.points.map((point) => point.fiscal_year))];
    expect(years.length).toBeGreaterThanOrEqual(10);
    expect(new Set(company.financials!.points.map((point) => point.metric))).toEqual(new Set(["revenue", "net_income_parent"]));
    const ref = company.priceFile!;
    expect(ref.file).toMatch(/^\/data\/prices\/NVDA\.[0-9a-f]{16}\.json$/);
    expect(ref).toMatchObject({ ticker: "NVDA", symbol: series.symbol, mint: series.mint, listed_on: series.firstDate, as_of: series.lastDate, days: series.points.length });
    // The DEX by its display name, resolved at build time.
    expect(ref.pools).toEqual([{ address: series.pool.address, dex: { orca: "Orca", "raydium-clmm": "Raydium CLMM", byreal: "Byreal" }[series.pool.dex] }]);
    // The last verified trade, per token, with its per-share value for the Pyth comparison.
    const last = [...series.points].reverse().find((point) => point.status === "observed")!;
    expect(ref.latest).toEqual({ date: last.date, value: Number(last.usdcPerUnscaledToken), tx_signature: last.signature, pool: series.pool.address, slot: last.slot, per_share: last.usdcPerUnderlyingShare === null ? null : Number(last.usdcPerUnderlyingShare) });
    // The page's loader data stays small: the reference, not the series (five locales share one file).
    expect(JSON.stringify(ref).length).toBeLessThan(1024);
    // A product page draws the price alone, from the same file.
    expect(xStockChartData(nvda, { figures: false })).toEqual({ price: null, priceFile: ref, financials: null });
    // Without a bundled series a product page has no chart.
    expect(xStockChartData({ ticker: "AAPL", symbol: "AAPLx", mint: TOKEN.mint }, { figures: false })).toBeNull();
  });

  it("publishes one price file per bundled series with a page, which reads back as exactly the page's series", () => {
    const files = publishedPriceFiles();
    expect(files.map((file) => file.path.slice("/data/prices/".length, -".0000000000000000.json".length)).sort()).toEqual([...onchainDailyTickers()].sort());
    for (const file of files) {
      expect(isDataFilePath(file.path)).toBe(true);
      const ticker = file.path.slice("/data/prices/".length, -".0000000000000000.json".length);
      // Named by the digest of its bytes, like every data file.
      expect(file.path).toBe(dataFilePath("prices", ticker, createHash("sha256").update(file.body).digest("hex")));
      const model = onchainDailySeries(ticker)!;
      const identity = { ticker, symbol: model.symbol, mint: model.mint };
      const ref = xStockChartData(identity, { figures: false })!.priceFile!;
      expect(parsePriceFile(JSON.parse(file.body), ref)).toEqual(xStockPriceSeries(identity));
    }
    // A series without a page gets no file.
    expect(priceFiles([])).toEqual([]);
  });

  it("reads a price file only when it is exactly the page's series", () => {
    const model = onchainDailySeries("NVDA")!;
    const identity = { ticker: "NVDA", symbol: model.symbol, mint: model.mint };
    const ref = xStockChartData(identity, { figures: false })!.priceFile!;
    const file = JSON.parse(publishedPriceFiles().find((entry) => entry.path === ref.file)!.body);
    const observed = file.series.points.findIndex((point: { value: unknown }) => point.value !== null);
    const variants: Array<[string, (value: typeof file) => void]> = [
      ["schema", (value) => { value.schema_version = "other"; }],
      ["ticker", (value) => { value.ticker = "TSLA"; }],
      ["extra key", (value) => { value.extra = 1; }],
      ["mint", (value) => { value.series.mint = TOKEN.mint; }],
      ["day count", (value) => { value.series.points.pop(); }],
      ["order", (value) => { value.series.points.reverse(); }],
      ["string value", (value) => { value.series.points[observed].value = "225.45"; }],
      ["non-positive value", (value) => { value.series.points[observed].value = 0; }],
      ["other pool", (value) => { value.series.points[observed].pool = TOKEN.pool; }],
      ["unknown reason", (value) => { value.series.points[0] = { date: value.series.points[0].date, value: null, reason: "no_swap" }; }],
      ["pool dex", (value) => { value.series.pools[0].dex = "other"; }],
      ["nested value", (value) => { value.series.points[observed].slot = { slot: 1 }; }],
    ];
    expect(parsePriceFile(file, ref)).not.toBeNull();
    for (const [label, change] of variants) {
      const copy = structuredClone(file);
      change(copy);
      expect(parsePriceFile(copy, ref), label).toBeNull();
    }
    expect(parsePriceFile(null, ref)).toBeNull();
    expect(parsePriceFile(file, { ...ref, days: ref.days + 1 } satisfies PriceFileRef)).toBeNull();
  });

  it("names data files by exact ticker and the digest of their bytes only", () => {
    const digest = "0123456789abcdef".repeat(4);
    expect(dataFilePath("prices", "NVDA", digest)).toBe("/data/prices/NVDA.0123456789abcdef.json");
    expect(dataFilePath("prices", "BRK.B", digest)).toBe("/data/prices/BRK.B.0123456789abcdef.json");
    expect(dataFilePath("statements", "NVDA", digest)).toBe("/data/statements/NVDA.0123456789abcdef.json");
    for (const ticker of ["nvda", "", "../x", "NVDA/..", "A B"]) expect(() => dataFilePath("prices", ticker, digest)).toThrow();
    for (const bad of ["", "0123", "ABCDEF0123456789"]) expect(() => dataFilePath("prices", "NVDA", bad)).toThrow();
    for (const path of ["/data/prices/NVDA.json", "/data/prices/nvda.0123456789abcdef.json", "/data/prices/NVDA.0123456789abcdef.JSON", "/data/prices/../NVDA.0123456789abcdef.json", "/data/prices/NVDA.0123456789abcdef.json/", "/data/NVDA.0123456789abcdef.json", "/data/other/NVDA.0123456789abcdef.json"]) expect(isDataFilePath(path), path).toBe(false);
    for (const path of ["/data/prices/NVDA.0123456789abcdef.json", "/data/statements/NVDA.0123456789abcdef.json"]) expect(isDataFilePath(path), path).toBe(true);
  });

  it("labels the axis of a chart with figures by fiscal year, the newest year always named", () => {
    const figuresOnly = chartModel({ price: null, financials: FULL.financials }, "all");
    const ticks = xAxisTicks(figuresOnly, CHART_CONFIG.xTickCount.compact);
    expect(ticks.length).toBeLessThanOrEqual(CHART_CONFIG.xTickCount.compact);
    expect(ticks.every((tick) => tick.periodEnd !== null)).toBe(true);
    expect(ticks.at(-1)!.periodEnd).toBe(figuresOnly.years.at(-1)!.periodEnd);
    // Each tick sits inside its own fiscal year, between its two bars.
    for (const tick of ticks) {
      const year = figuresOnly.years.find((candidate) => candidate.periodEnd === tick.periodEnd)!;
      expect(tick.t).toBeGreaterThan(year.startMs);
      expect(tick.t).toBeLessThan(year.endMs);
    }
    // A price-only chart keeps calendar ticks.
    const priceOnly = chartModel({ price: FULL.price, financials: null }, "all");
    expect(xAxisTicks(priceOnly, CHART_CONFIG.xTickCount.wide).every((tick) => tick.periodEnd === null)).toBe(true);
  });
});

describe("charts catalog", () => {
  it("has one catalog per locale with an identical key structure", () => {
    expect(Object.keys(CHARTS_MESSAGES)).toEqual([...PUBLIC_WEB_LOCALES]);
    for (const locale of PUBLIC_WEB_LOCALES) expect(shape(CHARTS_MESSAGES[locale])).toEqual(shape(CHARTS_MESSAGES.en));
  });
});

describe("readout hint", () => {
  const kinds = [
    ["both", chartModel(FULL, "all")],
    ["price", chartModel({ price: FULL.price, financials: null }, "all")],
    ["price", chartModel(FULL, "3M")],
    ["figures", chartModel({ price: null, financials: FULL.financials }, "all")],
  ] as const;

  it("names what the drawn chart shows: the price line, the annual figures, or both", () => {
    for (const [kind, model] of kinds) expect(chartContent(model)).toBe(kind);
  });

  for (const locale of PUBLIC_WEB_LOCALES) {
    it(`${locale}: each kind of chart has its own hint, shown when the plot is drawn`, () => {
      const hint = CHARTS_MESSAGES[locale].readout.hint;
      expect(new Set([hint.price, hint.figures, hint.both]).size).toBe(3);
      for (const [kind, model] of kinds) {
        const html = renderToStaticMarkup(<ChartReadout model={model} selection={null} symbol={TOKEN.symbol} pools={[]} locale={locale} interactive />);
        expect(html).toContain(`data-chart-hint="${kind}"`);
        expect(html.replaceAll("&#x27;", "'")).toContain(hint[kind]);
      }
    });
  }
});

describe("ChartSection prerender", () => {
  const cases: ReadonlyArray<[string, ChartData, "company" | "product"]> = [
    ["company", FULL, "company"],
    ["figures only", { price: null, financials: FULL.financials }, "company"],
    ["price only", { price: FULL.price, financials: null }, "product"],
  ];
  const nvda = onchainDailySeries("NVDA")!;
  const REAL = xStockChartData({ ticker: "NVDA", symbol: nvda.symbol, mint: nvda.mint }, { figures: true })!;

  for (const locale of PUBLIC_WEB_LOCALES) {
    for (const [label, data, variant] of cases) {
      it(`${locale} ${label}: static frame, no control before hydration, vocabulary kept inside the chart term`, () => {
        const html = renderToStaticMarkup(<ChartSection data={data} variant={variant} symbol={TOKEN.symbol} company="Example Fixture" provider="xstocks" locale={locale} />);
        expect(html).toMatch(/^<section[^>]*data-term="onchain-trade-price"/);
        expect(html).toContain('data-chart-state="loading"');
        expect(html).toContain("data-chart-table");
        expect(html).toContain("data-chart-fixture");
        // Company pages carry no button, form or input before hydration (static-artifact test); the range control is client-only.
        expect(/<button\b|<form\b|<input\b/.test(html)).toBe(false);
        expect(forbiddenWords(textOf(html), locale)).toEqual([]);
        expect(markedWords(textOf(withoutMarked(html)), locale)).toEqual([]);
        expect(DOUBLED_PUNCTUATION.test(textOf(html))).toBe(false);
        expect(/recharts/i.test(html)).toBe(false);
      });
    }
  }

  for (const locale of PUBLIC_WEB_LOCALES) {
    it(`${locale} price file: the days are not in the page, the table links the file, and the vocabulary stays inside the chart term`, () => {
      for (const variant of ["company", "product"] as const) {
        const data: ChartData = variant === "company" ? REAL : { ...REAL, financials: null };
        const html = renderToStaticMarkup(<ChartSection data={data} variant={variant} symbol={nvda.symbol} company="NVIDIA" provider="xstocks" locale={locale} />);
        expect(html).toContain('data-chart-state="loading"');
        expect(html).toContain(`href="${REAL.priceFile!.file}"`);
        expect(html).not.toContain("data-chart-table-prices");
        expect(html).not.toContain("explorer.solana.com/tx/");
        expect(html).not.toContain("data-chart-fixture");
        expect(html).toContain(`explorer.solana.com/address/${nvda.pool.address}`);
        expect(/<button\b|<form\b|<input\b/.test(html)).toBe(false);
        expect(forbiddenWords(textOf(html), locale)).toEqual([]);
        expect(markedWords(textOf(withoutMarked(html)), locale)).toEqual([]);
        expect(DOUBLED_PUNCTUATION.test(textOf(html))).toBe(false);
      }
    });
  }

  it("renders nothing without data, and links every day's swap and every year's filing", () => {
    expect(renderToStaticMarkup(<ChartSection data={{ price: null, financials: null }} variant="company" symbol="X" company={null} provider="xstocks" locale="en" />)).toBe("");
    const html = renderToStaticMarkup(<ChartSection data={FULL} variant="company" symbol={TOKEN.symbol} company="Example Fixture" provider="xstocks" locale="en" />);
    const swaps = FULL.price!.points.filter((point) => point.value !== null).length;
    expect([...html.matchAll(/href="https:\/\/explorer\.solana\.com\/tx\//g)].length).toBe(swaps);
    expect(textOf(html)).toContain("Price: executed swaps on Solana ( fixture pool");
    expect(html).toContain("Financials: SEC filings.");
    expect(/\bquote|\bNAV\b/i.test(textOf(html))).toBe(false);
  });
});
