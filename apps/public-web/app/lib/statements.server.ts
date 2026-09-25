/**
 * Build-only source of the financial statements (company pages and xStock
 * evidence pages). Runs in route loaders during prerendering and in the
 * build's file writer (`vite.config.ts`); no statements file enters a client
 * chunk.
 *
 * Each ticker's statements, every fiscal year, go into one static file
 * (`statementsFile`), the same bytes for all five locales. The documents
 * carry only a `StatementsSource`: a summary of the main lines for the
 * newest years (readable without JavaScript) and the file's address, which
 * the page reads after hydration.
 *
 * Reads the registry's statement read model by exact ticker, the allowlisted
 * identity the loader already validated (never by name). In a local review
 * build with the fixture flag (`BENTEN_PUBLIC_WEB_CHART_FIXTURE=1`), the
 * NVIDIA company page and the NVDA evidence page get the labelled fixture
 * instead.
 */
import { getStatementSeries, listPublicAssets } from "@benten/registry";
import { STATEMENTS_CONFIG } from "../features/statements/statement-config";
import {
  lineCount,
  newestYears,
  STATEMENT_KINDS,
  STATEMENTS_FILE_SCHEMA,
  statementsFromSeries,
  statementsSummary,
  type CompanyStatements,
  type StatementsFile,
  type StatementsSource,
} from "../features/statements/statement-data";
import { fixtureStatements } from "../features/statements/statement-fixture";
import type { CompanyView } from "../features/references/company-view";
import { CHART_FIXTURE_ENABLED } from "./chart-fixture-flag.js";
import { dataFile, type DataFileOutput } from "./data-files.server.js";

/** The one xStock the fixture stands in for (the chart fixture's). */
const FIXTURE_TICKER = "NVDA";

const everyYear = new Map<string, CompanyStatements | null>();
const files = new Map<string, DataFileOutput | null>();

/**
 * Every fiscal year of the statements of the company behind one
 * allowlisted xStock ticker, or `null` when Benten has none.
 */
export function tickerStatements(ticker: string): CompanyStatements | null {
  if (!everyYear.has(ticker)) {
    everyYear.set(ticker, CHART_FIXTURE_ENABLED && ticker === FIXTURE_TICKER
      ? fixtureStatements()
      : statementsFromSeries(STATEMENT_KINDS.map((statement) => getStatementSeries(ticker, statement)), Number.POSITIVE_INFINITY));
  }
  return everyYear.get(ticker)!;
}

/** The ticker's statements file: its path (with the digest of its bytes) and its body, or `null` without statements. */
export function statementsFile(ticker: string): DataFileOutput | null {
  if (!files.has(ticker)) {
    const statements = tickerStatements(ticker);
    if (!statements) {
      files.set(ticker, null);
    } else {
      const file: StatementsFile = { schema_version: STATEMENTS_FILE_SCHEMA, ticker, statements };
      files.set(ticker, dataFile("statements", ticker, file));
    }
  }
  return files.get(ticker)!;
}

/**
 * What one document carries: the summary and the file's address. `newest`
 * is the company page's window (`STATEMENTS_CONFIG.maxYears`), `all` the
 * evidence page's every year.
 */
export function statementsSource(ticker: string, { years = "newest" }: { readonly years?: "newest" | "all" } = {}): StatementsSource | null {
  const all = tickerStatements(ticker);
  const file = statementsFile(ticker);
  if (!all || !file) return null;
  const shown = years === "all" ? all : newestYears(all, STATEMENTS_CONFIG.maxYears);
  if (shown.years.length === 0) return null;
  return {
    ticker,
    file: file.path,
    summary: statementsSummary(shown, STATEMENTS_CONFIG.summary.rows, STATEMENTS_CONFIG.summary.years),
    items: lineCount(shown),
    first_period_end: shown.years[0]!.period_end,
    last_period_end: shown.years.at(-1)!.period_end,
    year_count: shown.years.length,
    ...(all.fixture ? { fixture: true as const } : {}),
  };
}

/** A company page's statements: a US-listed company's, through its first xStock. Private companies file none. */
export function companyStatementsSource(view: CompanyView): StatementsSource | null {
  if (view.listingStatus !== "us_listed") return null;
  const xstock = view.products.find((product) => product.provider === "xstocks");
  return xstock ? statementsSource(xstock.routeKey) : null;
}

/**
 * Every statements file the build publishes: one per published xStock with
 * statements (each has an evidence page, and a US-listed company page
 * through its first xStock). Withheld products are not in the public
 * catalog, so they get none.
 */
export function publishedStatementsFiles(): readonly DataFileOutput[] {
  const catalog = listPublicAssets({});
  if (!catalog.found) throw new Error("public catalog is unavailable for the statements files");
  return catalog.items.flatMap(({ identity }) => {
    const file = statementsFile(identity.ticker);
    return file ? [file] : [];
  });
}

/** A company page's statements as its section shows them once the file has loaded: the newest `STATEMENTS_CONFIG.maxYears`. */
export function companyStatements(view: CompanyView): CompanyStatements | null {
  if (view.listingStatus !== "us_listed") return null;
  const xstock = view.products.find((product) => product.provider === "xstocks");
  const all = xstock ? tickerStatements(xstock.routeKey) : null;
  return all ? newestYears(all, STATEMENTS_CONFIG.maxYears) : null;
}
