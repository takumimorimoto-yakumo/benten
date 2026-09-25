import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getStatementRows, getStatementSeries, listedCompanyMap, STATEMENT_DETAIL_NAMES, type StatementSeries } from "@benten/registry";
import { CompanyPage } from "../app/features/references/company-page.tsx";
import { STATEMENTS_CONFIG } from "../app/features/statements/statement-config.ts";
import {
  CELL_STATUSES,
  lineCount,
  lineOf,
  newestYears,
  parseStatementsFile,
  presentTabs,
  STATEMENT_ITEMS,
  STATEMENT_KINDS,
  STATEMENT_TABS,
  statementsFromSeries,
  type CompanyStatements,
} from "../app/features/statements/statement-data.ts";
import { fixtureStatements, fixtureStatementSeries } from "../app/features/statements/statement-fixture.ts";
import { exactValueText, shortValueText } from "../app/features/statements/statement-format.ts";
import { moveSelection } from "../app/features/statements/statement-table.tsx";
import { EvidenceStatementsHistory, StatementsAnnualHistory } from "../app/features/statements/statement-year-tables.tsx";
import { CompanyStatementsSection, StatementsSection } from "../app/features/statements/statements-section.tsx";
import { companyMessagesFor } from "../app/i18n/company-messages.ts";
import { createCompanyView } from "../app/lib/company.server.ts";
import { createHash } from "node:crypto";
import { companyStatements, statementsFile, statementsSource, tickerStatements } from "../app/lib/statements.server.ts";
import { dataFilePath, isDataFilePath } from "../app/lib/data-files.ts";
import { PUBLIC_WEB_LOCALES, type PublicWebLocale } from "../app/i18n/locales.ts";
import { STATEMENTS_MESSAGES } from "../app/i18n/statements-messages.ts";
import { forbiddenWords, markedWords, withoutAccountingTerms, withoutMarked } from "./app-vocabulary.mjs";
import { DOUBLED_PUNCTUATION, forbiddenMatches } from "./reference-vocabulary.mjs";

const FIXTURE = fixtureStatements();

function shape(value: unknown): unknown {
  if (typeof value === "function") return `fn/${value.length}`;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, shape(nested)]));
  return typeof value;
}

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "function") return [String(value("A", "B", "C"))];
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

function textOf(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ");
}

function count(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length;
}

function allCells(statements: CompanyStatements) {
  return STATEMENT_TABS.flatMap((tab) => (statements.tabs[tab] ?? []).flatMap((line) => line.cells));
}

describe("the adapter over the registry's statement read model", () => {
  it("names every registry row in the catalog", () => {
    const rows = STATEMENT_DETAIL_NAMES.flatMap((statement) => getStatementRows(statement).map((row) => row.item));
    expect([...rows].sort()).toEqual([...STATEMENT_ITEMS].sort());
    expect([...STATEMENT_KINDS]).toEqual([...STATEMENT_DETAIL_NAMES]);
    // Every chart series and total is a line the registry defines.
    for (const tab of STATEMENT_TABS) for (const series of STATEMENTS_CONFIG.charts[tab].series) expect(rows).toContain(series.line);
    for (const item of STATEMENTS_CONFIG.totals) expect(rows).toContain(item);
  });

  it("shows NVIDIA's reported statements: ten fiscal years at most, oldest first, every value with how it is known", () => {
    const statements = companyStatements(createCompanyView("nvidia"))!;
    expect(statements).not.toBeNull();
    expect(statements.fixture).toBeUndefined();
    expect(statements.years.length).toBeGreaterThan(0);
    expect(statements.years.length).toBeLessThanOrEqual(STATEMENTS_CONFIG.maxYears);
    const fiscalYears = statements.years.map((year) => year.fiscal_year);
    expect([...fiscalYears].sort((a, b) => a - b)).toEqual(fiscalYears);
    // The newest year of the read model is the last column.
    const series = getStatementSeries("NVDA", "pl")!;
    expect(fiscalYears.at(-1)).toBe(series.years.at(-1)!.fiscal_year);
    // Every value in the page equals the read model's value for the same item and year.
    const revenue = lineOf(statements, "revenue")!;
    statements.years.forEach((year, index) => {
      const source = series.years.find((column) => column.fiscal_year === year.fiscal_year)?.cells.revenue;
      expect(revenue.cells[index]?.value ?? null).toBe(source?.value ?? null);
    });
    // Calculated lines are gathered under ratios; a statement tab holds reported lines only.
    const calculated = STATEMENT_DETAIL_NAMES.flatMap((statement) => getStatementRows(statement).filter((row) => row.kind === "calculated").map((row) => row.item));
    for (const tab of STATEMENT_KINDS) for (const line of statements.tabs[tab] ?? []) expect(calculated).not.toContain(line.item);
    for (const line of statements.tabs.ratios ?? []) expect(calculated).toContain(line.item);
    // A line without a value in any shown year is hidden.
    for (const tab of presentTabs(statements)) for (const line of statements.tabs[tab]!) expect(line.cells.some((cell) => cell !== null)).toBe(true);
    // Filings are listed once and every cell points at one.
    expect(new Set(statements.filings.map((filing) => filing.accession)).size).toBe(statements.filings.length);
    for (const cell of allCells(statements)) if (cell && cell.status !== "calculated") expect(statements.filings[cell.filing]).toBeDefined();
  });

  it("covers the US-listed companies that have statements, and keeps documents small: one file per ticker, a summary in the loader data", () => {
    let withStatements = 0;
    let largestSource = 0;
    let largestFile = 0;
    for (const company of listedCompanyMap.companies) {
      const ticker = company.instruments[0].ticker;
      const source = statementsSource(ticker, { years: "all" });
      const file = statementsFile(ticker);
      if (!source || !file) continue;
      withStatements += 1;
      // The loader data of every prerendered document (five locales) carries only the summary.
      largestSource = Math.max(largestSource, JSON.stringify(source).length, JSON.stringify(statementsSource(ticker)).length);
      largestFile = Math.max(largestFile, file.body.length);
      expect(source.file).toBe(file.path);
      expect(isDataFilePath(file.path)).toBe(true);
      expect(file.path).toBe(dataFilePath("statements", ticker, createHash("sha256").update(file.body).digest("hex")));
      // The file is exactly every year of the ticker's statements, and parses back to them.
      expect(parseStatementsFile(JSON.parse(file.body), ticker)).toEqual(tickerStatements(ticker));
      expect(parseStatementsFile(JSON.parse(file.body), "OTHER")).toBeNull();
    }
    expect(withStatements).toBeGreaterThan(100);
    expect(largestSource).toBeLessThan(8_000);
    expect(largestFile).toBeLessThan(200_000);
  });

  it("summarizes the main lines of the newest years with only the filings they cite", () => {
    const all = tickerStatements("NVDA")!;
    const source = statementsSource("NVDA", { years: "all" })!;
    const summary = source.summary;
    expect(summary.years).toHaveLength(STATEMENTS_CONFIG.summary.years);
    expect(summary.years.map((year) => year.fiscal_year)).toEqual(all.years.slice(-STATEMENTS_CONFIG.summary.years).map((year) => year.fiscal_year));
    expect(summary.lines.map((line) => line.item)).toEqual(["revenue", "operating_income", "net_income_parent", "total_assets", "operating_cf", "eps_diluted"]);
    const offset = all.years.length - summary.years.length;
    summary.lines.forEach((line) => line.cells.forEach((cell, index) => {
      const full = lineOf(all, line.item)!.cells[offset + index];
      expect(cell?.value ?? null).toBe(full?.value ?? null);
      // Re-indexed filings still name the same filing.
      if (cell && cell.status !== "calculated" && full && full.status !== "calculated") expect(summary.filings[cell.filing]).toEqual(all.filings[full.filing]);
    }));
    summary.years.forEach((year, index) => {
      const full = all.years[offset + index]!;
      expect(year.annual_report === null ? null : summary.filings[year.annual_report]).toEqual(full.annual_report === null ? null : all.filings[full.annual_report]);
    });
    expect(summary.filings.length).toBeLessThan(all.filings.length);
    expect(source.items).toBe(lineCount(all));
    expect(source.year_count).toBe(all.years.length);
    expect(statementsSource("NVDA")!.year_count).toBe(STATEMENTS_CONFIG.maxYears);
  });

  it("cuts a window of the newest years exactly as the adapter does", () => {
    const series = STATEMENT_KINDS.map((statement) => getStatementSeries("NVDA", statement));
    // Filing indices differ between the two (each lists its own filings); compare what each cell cites.
    const resolved = (statements: CompanyStatements) => JSON.parse(JSON.stringify(statements, (key, value) => ((key === "filing" || key === "annual_report" || key === "original_filing") && typeof value === "number" ? statements.filings[value]!.accession : value)));
    const { filings: _window, ...window } = resolved(newestYears(statementsFromSeries(series, Number.POSITIVE_INFINITY)!, 4));
    const { filings: _adapter, ...adapter } = resolved(statementsFromSeries(series, 4)!);
    expect(window).toEqual(adapter);
  });

  it("refuses a statements file that does not fit", () => {
    const file = JSON.parse(statementsFile("NVDA")!.body);
    expect(parseStatementsFile(file, "NVDA")).not.toBeNull();
    expect(parseStatementsFile({ ...file, schema_version: "v0" }, "NVDA")).toBeNull();
    const wrongLength = structuredClone(file);
    wrongLength.statements.tabs.pl[0].cells.pop();
    expect(parseStatementsFile(wrongLength, "NVDA")).toBeNull();
    const badFiling = structuredClone(file);
    const cell = badFiling.statements.tabs.pl[0].cells.find((entry: { filing?: number } | null) => entry && typeof entry.filing === "number");
    cell.filing = 10_000;
    expect(parseStatementsFile(badFiling, "NVDA")).toBeNull();
    const badUrl = structuredClone(file);
    badUrl.statements.filings[0].filing_url = "javascript:alert(1)";
    expect(parseStatementsFile(badUrl, "NVDA")).toBeNull();
    expect(parseStatementsFile(null, "NVDA")).toBeNull();
  });

  it("drops what does not fit the contract and keeps the newest years", () => {
    const pl = fixtureStatementSeries().find((entry) => entry.statement === "pl")!;
    const broken: StatementSeries = {
      ...pl,
      years: pl.years.map((column) => {
        const { operating_income: operating, ...rest } = column.cells;
        return { ...column, cells: operating ? { ...rest, operating_income: { ...operating, value: Number.NaN } } : rest };
      }),
    };
    const statements = statementsFromSeries([broken, null], 3)!;
    expect(statements.years.map((year) => year.fiscal_year)).toEqual(pl.years.slice(-3).map((column) => column.fiscal_year));
    expect(lineOf(statements, "operating_income")).toBeNull();
    expect(Object.keys(statements.tabs).sort()).toEqual(["pl", "ratios"]);
    expect(statementsFromSeries([null, null], 10)).toBeNull();
  });
});

describe("statements fixture", () => {
  it("has ten NVIDIA-shaped fiscal years, deterministic and labelled", () => {
    expect(FIXTURE.fixture).toBe(true);
    expect(FIXTURE.years).toHaveLength(STATEMENTS_CONFIG.maxYears);
    expect(FIXTURE.years.map((year) => year.period_end.slice(5, 7))).toEqual(Array(10).fill("01"));
    expect(fixtureStatements()).toEqual(FIXTURE);
  });

  it("exercises every cell state", () => {
    const cells = allCells(FIXTURE);
    for (const status of CELL_STATUSES) expect(cells.some((cell) => cell?.status === status), status).toBe(true);
    expect(cells.some((cell) => cell === null)).toBe(true);
    expect(cells.some((cell) => cell?.status === "verified" && cell.restatement)).toBe(true);
    expect(cells.some((cell) => cell?.status === "calculated" && cell.unverified_input)).toBe(true);
    expect(lineOf(FIXTURE, "shares_outstanding")!.cells.every((cell) => cell?.status === "verified" && Boolean(cell.as_of))).toBe(true);
    expect(lineOf(FIXTURE, "inventories")!.excluded.some((reason) => reason !== null)).toBe(true);
    const fcf = lineOf(FIXTURE, "free_cash_flow")!.cells.at(-1)!;
    expect(fcf.status === "calculated" && fcf.inputs.map((input) => input.item)).toEqual(["operating_cf", "capex"]);
  });

  it("agrees with the chart fixture's revenue and net income", async () => {
    const { fixtureFinancialPoints } = await import("../app/features/charts/chart-fixture.ts");
    const points = fixtureFinancialPoints();
    FIXTURE.years.forEach((year, index) => {
      for (const metric of ["revenue", "net_income_parent"] as const) {
        const point = points.find((candidate) => candidate.fiscal_year === year.fiscal_year && candidate.metric === metric);
        if (point) expect(lineOf(FIXTURE, metric)!.cells[index]?.value, `${metric} ${year.fiscal_year}`).toBe(point.value);
      }
    });
  });

  it("reaches pages only through the build flag, and never private companies", () => {
    // The flag is off in tests, as in every hosted or CI build: NVIDIA gets its real statements.
    expect(tickerStatements("NVDA")?.fixture).toBeUndefined();
    expect(companyStatements(createCompanyView("nvidia"))?.fixture).toBeUndefined();
    expect(companyStatements(createCompanyView("openai"))).toBeNull();
  });
});

describe("keyboard and values", () => {
  it("moves the selection with the arrow keys, Home and End, within the table", () => {
    const lines = ["revenue", "cost_of_revenue", "gross_profit"];
    const at = { line: "cost_of_revenue", index: 1 };
    expect(moveSelection("ArrowUp", at, lines, 3)).toEqual({ line: "revenue", index: 1 });
    expect(moveSelection("ArrowDown", at, lines, 3)).toEqual({ line: "gross_profit", index: 1 });
    expect(moveSelection("ArrowLeft", { line: "revenue", index: 0 }, lines, 3)).toEqual({ line: "revenue", index: 0 });
    expect(moveSelection("ArrowRight", at, lines, 3)).toEqual({ line: "cost_of_revenue", index: 2 });
    expect(moveSelection("Home", at, lines, 3)).toEqual({ line: "cost_of_revenue", index: 0 });
    expect(moveSelection("End", at, lines, 3)).toEqual({ line: "cost_of_revenue", index: 2 });
    expect(moveSelection("Enter", at, lines, 3)).toBeNull();
  });

  it("shortens amounts with their unit and scale, and keeps absent values apart from zero", () => {
    expect(shortValueText(215_938_000_000, "usd", "en")).toBe("$215.9B");
    expect(shortValueText(151e9, "usd", "en")).toBe("$151.0B");
    expect(shortValueText(-3_200_000_000, "usd", "en")).toBe("-$3.2B");
    expect(shortValueText(2.94, "usd_per_share", "en")).toBe("$2.94");
    expect(shortValueText(24_530_000_000, "shares", "en")).toBe("24.53B");
    expect(shortValueText(0.5584, "ratio", "en")).toBe("55.8%");
    expect(shortValueText(0, "usd", "en")).toBe("$0.0");
    expect(shortValueText(null, "usd", "en")).toBe("—");
    expect(exactValueText(215_938_000_000, "usd", "en").replace(/\s/g, " ")).toBe("USD 215,938,000,000");
    expect(exactValueText(0.5584, "ratio", "en")).toBe("55.84%");
  });
});

describe("statements catalog", () => {
  it("has one catalog per locale with an identical key structure", () => {
    expect(Object.keys(STATEMENTS_MESSAGES)).toEqual([...PUBLIC_WEB_LOCALES]);
    for (const locale of PUBLIC_WEB_LOCALES) expect(shape(STATEMENTS_MESSAGES[locale])).toEqual(shape(STATEMENTS_MESSAGES.en));
    expect(Object.keys(STATEMENTS_MESSAGES.en.lines).sort()).toEqual([...STATEMENT_ITEMS].sort());
  });

  it("names no forbidden word, no price and no buying, in every locale; standard accounting names only in the marked names", () => {
    for (const locale of PUBLIC_WEB_LOCALES) {
      const { lines, tabs, ...rest } = STATEMENTS_MESSAGES[locale];
      for (const text of strings(rest)) {
        expect(forbiddenWords(text, locale), `${locale}: ${text}`).toEqual([]);
        expect(markedWords(text, locale), `${locale}: ${text}`).toEqual([]);
        expect(forbiddenMatches(text, locale), `${locale}: ${text}`).toEqual([]);
        expect(DOUBLED_PUNCTUATION.test(text), `${locale}: ${text}`).toBe(false);
      }
      // Line and statement names are rendered only inside `data-term="accounting-line-item"`: they may carry a 7.1 word, never price or buying.
      for (const text of strings({ lines, tabs })) {
        expect(markedWords(text, locale), `${locale}: ${text}`).toEqual([]);
        expect(forbiddenMatches(text, locale), `${locale}: ${text}`).toEqual([]);
      }
    }
    expect(STATEMENTS_MESSAGES.en.legend.calculated).toBe("Calculated from reported figures");
    expect(STATEMENTS_MESSAGES.en.legend.unverified).toBe("Not verified against the filing");
    // The two notes the read model asks for: the cover date of a share count, and year-end ROE and ROA.
    expect(STATEMENTS_MESSAGES.en.units.per_share).toContain("cover date");
    expect(STATEMENTS_MESSAGES.en.units.ratios).toContain("year-end");
  });

  it("uses the standard accounting names investors read", () => {
    const names = (locale: PublicWebLocale) => [STATEMENTS_MESSAGES[locale].lines.gross_profit, STATEMENTS_MESSAGES[locale].lines.return_on_equity, STATEMENTS_MESSAGES[locale].lines.return_on_assets];
    expect(names("en")).toEqual(["Gross profit", "Return on equity (ROE)", "Return on assets (ROA)"]);
    expect(names("ja")).toEqual(["\u58f2\u4e0a\u7dcf\u5229\u76ca", "\u81ea\u5df1\u8cc7\u672c\u5229\u76ca\u7387\uff08ROE\uff09", "\u7dcf\u8cc7\u7523\u5229\u76ca\u7387\uff08ROA\uff09"]);
    expect(names("ko")).toEqual(["\ub9e4\ucd9c\ucd1d\uc774\uc775", "\uc790\uae30\uc790\ubcf8\uc774\uc775\ub960(ROE)", "\ucd1d\uc790\uc0b0\uc774\uc775\ub960(ROA)"]);
    expect(names("zh-Hans")).toEqual(["\u6bdb\u5229", "\u51c0\u8d44\u4ea7\u6536\u76ca\u7387\uff08ROE\uff09", "\u603b\u8d44\u4ea7\u6536\u76ca\u7387\uff08ROA\uff09"]);
    expect(names("zh-Hant")).toEqual(["\u71df\u696d\u6bdb\u5229", "\u80a1\u6771\u6b0a\u76ca\u5831\u916c\u7387\uff08ROE\uff09", "\u8cc7\u7522\u5831\u916c\u7387\uff08ROA\uff09"]);
  });

  it("allows a 7.1 word only inside the accounting-name mark", () => {
    const marked = `<p>Margin: <span data-term="accounting-line-item">Gross profit</span></p>`;
    expect(forbiddenWords(textOf(withoutAccountingTerms(marked)), "en")).toEqual([]);
    expect(forbiddenWords(textOf(marked), "en")).toEqual(["profit"]);
    expect(forbiddenWords(textOf(withoutAccountingTerms("<p>Gross profit grew</p>")), "en")).toEqual(["profit"]);
    const ko = STATEMENTS_MESSAGES.ko.tabs.pl;
    expect(forbiddenWords(ko, "ko").length).toBeGreaterThan(0);
    expect(forbiddenWords(textOf(withoutAccountingTerms(`<h3><span data-term="accounting-line-item">${ko}</span></h3>`)), "ko")).toEqual([]);
  });
});

describe("StatementsSection prerender", () => {
  const nvidia = companyStatements(createCompanyView("nvidia"))!;
  for (const locale of PUBLIC_WEB_LOCALES) {
    for (const [label, statements] of [["fixture", FIXTURE], ["NVIDIA", nvidia]] as const) {
      it(`${locale} ${label}: every statement as a plain table, no control before hydration, vocabulary kept`, () => {
        const html = renderToStaticMarkup(<StatementsSection statements={statements} locale={locale} />);
        expect(html).toContain('data-statements-state="static"');
        expect(html.includes("data-statements-fixture")).toBe(label === "fixture");
        expect(count(html, /data-statement-table="/g)).toBe(presentTabs(statements).length);
        // Company pages carry no button, form or input before hydration (static-artifact test).
        expect(/<button\b|<form\b|<input\b/.test(html)).toBe(false);
        expect(/role="grid"|role="tab"/.test(html)).toBe(false);
        expect(/recharts/i.test(html)).toBe(false);
        expect(count(html, /data-statement-year="/g)).toBe(presentTabs(statements).length * statements.years.length);
        expect(/\bFY\s?\d{4}\b/.test(html)).toBe(false);
        const text = textOf(html);
        expect(forbiddenWords(textOf(withoutAccountingTerms(html)), locale)).toEqual([]);
        expect(markedWords(textOf(withoutMarked(html)), locale)).toEqual([]);
        expect(DOUBLED_PUNCTUATION.test(text)).toBe(false);
      });
    }
  }

  it("marks each value by how it is known, in the table and in the legend", () => {
    const html = renderToStaticMarkup(<StatementsSection statements={FIXTURE} locale="en" />);
    for (const status of CELL_STATUSES) expect(html).toContain(`data-statement-status="${status}"`);
    expect(html).toContain('data-statement-status="empty"');
    expect(html).toContain("Calculated from reported figures");
    expect(html).toContain("Not verified against the filing");
    expect(html).toContain("$151.0B");
    expect(renderToStaticMarkup(<StatementsSection statements={{ years: [], filings: [], tabs: {} }} locale="en" />)).toBe("");
  });
});

/** The Share action's wrapper, the one control a company page prerenders (invisible until hydration). */
function withoutShare(html: string): string {
  return html.replace(/<span class="[^"]*" data-share=""[\s\S]*?<\/button><span class="sr-only" role="status"[^>]*><\/span><\/span>/, "");
}

function copyStatus(locale: PublicWebLocale): string {
  return companyMessagesFor(locale).company.status.us_listed;
}

describe("prerendered statements summary, before the file loads", () => {
  const company = statementsSource("NVDA")!;
  const evidence = statementsSource("NVDA", { years: "all" })!;
  for (const locale of PUBLIC_WEB_LOCALES) {
    it(`${locale}: the company page shows the main lines of the newest years with their annual reports and the frame, no control`, () => {
      const html = renderToStaticMarkup(<CompanyStatementsSection source={company} locale={locale} />);
      expect(html).toContain('data-statements-state="summary"');
      expect(html).toContain('data-statements-full="static"');
      expect(html).toContain("<noscript>");
      expect(count(html, /data-statement-line="/g)).toBe(company.summary.lines.length);
      expect(count(html, /data-statement-year="/g)).toBe(STATEMENTS_CONFIG.summary.years);
      for (const year of company.summary.years) if (year.annual_report !== null) expect(html).toContain(`href="${company.summary.filings[year.annual_report]!.filing_url}"`);
      expect(html).toMatch(/<caption\b[^>]*>[^<]+<\/caption>/);
      expect(html).toContain('role="status"');
      expect(/<button\b|<form\b|<input\b|role="grid"|role="tab"/.test(html)).toBe(false);
      // The whole statements are not in the document.
      expect(html.includes('data-statement-table="pl"')).toBe(false);
      expect(forbiddenWords(textOf(withoutAccountingTerms(html)), locale)).toEqual([]);
      expect(markedWords(textOf(withoutMarked(html)), locale)).toEqual([]);
      expect(DOUBLED_PUNCTUATION.test(textOf(html))).toBe(false);
    });

    it(`${locale}: the evidence page shows the exact main values and each year's annual report`, () => {
      const html = renderToStaticMarkup(<EvidenceStatementsHistory source={evidence} locale={locale} />);
      expect(html).toContain('data-annual-history-source="statements"');
      expect(html).toContain('data-statements-full="static"');
      expect(html.includes("data-annual-year=")).toBe(false);
      for (const year of evidence.summary.years) if (year.annual_report !== null) expect(html).toContain(evidence.summary.filings[year.annual_report]!.filing_url);
      expect(forbiddenMatches(textOf(html), locale)).toEqual([]);
    });
  }

  it("shows loading and a Try again button when the file fails, only once hydrated (Living Catalog states)", () => {
    const loading = renderToStaticMarkup(<CompanyStatementsSection source={company} locale="en" catalogState="loading" />);
    expect(loading).toContain('data-statements-full="loading"');
    expect(loading).toContain("Loading all ");
    const failed = renderToStaticMarkup(<EvidenceStatementsHistory source={evidence} locale="en" catalogState="error" />);
    expect(failed).toContain('data-statements-full="error"');
    expect(failed).toMatch(/<button[^>]*>[\s\S]*Try again<\/button>/);
  });
});

describe("company page with statements", () => {
  const nvidia = createCompanyView("nvidia");

  for (const locale of ["en", "ja"] as const satisfies readonly PublicWebLocale[]) {
    it(`${locale}: ways to hold first, then the chart and the statements, then facts and the method`, () => {
      const chart = { price: null, financials: { points: [{ fiscal_year: 2026, fiscal_month: 1, period_start: "2025-01-27", period_end: "2026-01-25", metric: "revenue" as const, value: 1e9, unit: "USD" as const, status: "verified_reported" as const, accession: "0000000000-26-000001", form: "10-K", filed: "2026-02-20", filing_url: "https://www.sec.gov/search-filings" }] } };
      const html = renderToStaticMarkup(<CompanyPage view={nvidia} chart={chart} statements={statementsSource("NVDA")} locale={locale} />);
      const order = ["data-company-title", "company-products-heading", "data-chart-section", "data-statements-section", "company-facts-heading", 'data-slot="consider-with-my-conditions"', "company-method-heading"].map((marker) => html.indexOf(marker));
      expect(order.every((index) => index >= 0), order.join()).toBe(true);
      expect([...order].sort((a, b) => a - b)).toEqual(order);
      // Share sits right after the name and the status line; before hydration it is invisible and unfocusable, the one button.
      expect(html.indexOf("data-share=")).toBeGreaterThan(html.indexOf(">" + copyStatus(locale) + "<"));
      expect(html.indexOf("data-share=")).toBeLessThan(html.indexOf("company-products-heading"));
      expect(count(html, /data-share="/g)).toBe(1);
      expect(/<button\b|<form\b|<input\b/.test(withoutShare(html))).toBe(false);
    });
  }

  it("shows no statements on a private company page", () => {
    const html = renderToStaticMarkup(<CompanyPage view={createCompanyView("openai")} statements={statementsSource("NVDA")} locale="en" />);
    expect(html).not.toContain("data-statements-section");
  });
});

describe("evidence page annual history from the statements", () => {
  for (const locale of PUBLIC_WEB_LOCALES) {
    it(`${locale}: every line for every year, newest first, with how each value is known`, () => {
      const html = renderToStaticMarkup(<StatementsAnnualHistory statements={FIXTURE} locale={locale} />);
      const shown = [...html.matchAll(/data-annual-year="(\d+)"/g)].map((match) => Number(match[1]));
      expect(shown).toEqual([...FIXTURE.years].reverse().map((year) => year.fiscal_year));
      const lines = presentTabs(FIXTURE).reduce((sum, tab) => sum + FIXTURE.tabs[tab]!.length, 0);
      expect(count(html, /data-annual-fact="/g)).toBe(lines * FIXTURE.years.length);
      const unverified = allCells(FIXTURE).filter((cell) => cell?.status === "unverified").length;
      expect(count(html, /data-annual-not-verified=""/g)).toBe(unverified);
      expect(count(html, /data-annual-restatement=""/g)).toBe(allCells(FIXTURE).filter((cell) => cell?.status === "verified" && cell.restatement).length);
      for (const year of FIXTURE.years) expect(html).toContain(FIXTURE.filings[year.annual_report!]!.accession);
      const text = textOf(html);
      expect(forbiddenMatches(text, locale)).toEqual([]);
      expect(DOUBLED_PUNCTUATION.test(text)).toBe(false);
    });
  }
});
