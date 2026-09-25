/**
 * The data contract of the financial statements (company page section and
 * the evidence page's annual history). Browser-safe: plain types and pure
 * functions, no I/O; registry types are imported as types only.
 *
 * Built from the registry's statement read model (`getStatementSeries`, one
 * call per statement) by `statementsFromSeries` below, in a compact shape
 * for loader data: filings are listed once and cells point at them.
 *
 * Every cell says how Benten knows its value:
 *
 *  - `verified`: the value a filing reports for exactly this period, with
 *    the filing and its XBRL concept;
 *  - `unverified`: a value Benten has but has not matched to a filing, with
 *    the reason (the registry's `UnverifiedReason`) and the annual report
 *    that covers the year;
 *  - `calculated`: a value Benten computed from two reported values of the
 *    same fiscal year (a margin, a ratio, free cash flow), with the formula
 *    and both inputs.
 *
 * An absent value is `null` (with the reason when the source withheld it)
 * and shows as an em dash, never as 0. Nothing here is estimated, forecast
 * or rated.
 */
import type {
  AnnualExclusionReason,
  AnnualFilingSource,
  AnnualProvenance,
  StatementCell as ReadModelCell,
  StatementCellUnit,
  StatementDetailName,
  StatementFilingRef,
  StatementSeries,
  UnverifiedReason,
} from "@benten/registry";

/** One UTC calendar day, `YYYY-MM-DD`. */
export type IsoDate = string;

/** The four statements the filings report, in their tab order (the registry's names). */
export const STATEMENT_KINDS = ["pl", "bs", "cf", "per_share"] as const satisfies readonly StatementDetailName[];
export type StatementKind = (typeof STATEMENT_KINDS)[number];
type MissingStatement = Exclude<StatementDetailName, StatementKind>;
const statementKindsAreExhaustive: MissingStatement extends never ? true : never = true;
void statementKindsAreExhaustive;

/** The tabs of the section: the four statements, then every value Benten calculates from them. */
export const STATEMENT_TABS = [...STATEMENT_KINDS, "ratios"] as const;
export type StatementTab = (typeof STATEMENT_TABS)[number];

export const CELL_STATUSES = ["verified", "unverified", "calculated"] as const;
export type CellStatus = (typeof CELL_STATUSES)[number];

/** How a line's values are read: an amount in USD, USD for one share, a count of shares, or a ratio (0.25 = 25%). */
export type StatementUnit = "usd" | "usd_per_share" | "shares" | "ratio";

const UNITS: Record<StatementCellUnit, StatementUnit> = { USD: "usd", USD_per_share: "usd_per_share", shares: "shares", ratio: "ratio" };

/**
 * `duration`: over the fiscal year; `instant`: at the fiscal year end;
 * `cover_instant`: a count as of the annual report's cover date, which is
 * not the fiscal year end; `null`: a calculated line.
 */
export type StatementPeriodType = "duration" | "instant" | "cover_instant" | null;

/**
 * Every line the registry defines (reported, then calculated), for the
 * catalog's labels. A line the registry adds later still shows, under the
 * registry's own English label, until the catalog names it (the tests list
 * the registry's rows against this list).
 */
export const STATEMENT_ITEMS = [
  // Income statement
  "revenue", "cost_of_revenue", "gross_profit", "sga", "research_and_development", "operating_income", "interest_expense",
  "pretax_income", "income_tax", "net_income", "net_income_noncontrolling", "net_income_parent", "comprehensive_income_parent",
  // Balance sheet
  "cash_and_equivalents", "receivables", "inventories", "current_assets", "ppe", "goodwill", "intangible_assets", "total_assets",
  "current_liabilities", "long_term_debt", "total_liabilities", "equity_parent", "noncontrolling_interest", "total_equity", "retained_earnings",
  // Cash flow statement
  "operating_cf", "depreciation_amortization", "investing_cf", "capex", "financing_cf", "dividends_paid", "share_repurchase",
  "debt_issued", "debt_repaid", "net_change_in_cash", "cash_end_of_period", "interest_paid", "income_taxes_paid",
  // Per share
  "eps_basic", "eps_diluted", "dividends_per_share", "shares_outstanding",
  // Calculated
  "gross_margin", "operating_margin", "net_margin", "return_on_equity", "return_on_assets", "equity_ratio", "current_ratio", "free_cash_flow",
] as const;
export type StatementItem = (typeof STATEMENT_ITEMS)[number];

export function isStatementItem(value: unknown): value is StatementItem {
  return typeof value === "string" && (STATEMENT_ITEMS as readonly string[]).includes(value);
}

/** An annual report that states a value (SEC accession number, form, filing date and document URL). */
export type StatementFiling = {
  readonly form: string;
  readonly accession: string;
  readonly filed: IsoDate;
  readonly filing_url: string;
};

/** Index into `CompanyStatements.filings`. */
export type FilingIndex = number;

export type VerifiedCell = {
  readonly status: "verified";
  readonly value: number;
  /** The XBRL concept the filing reports the value under. */
  readonly concept: string;
  readonly filing: FilingIndex;
  /** How the filing reports it; absent means in the year's own annual report (the usual case, left out to keep loader data small). */
  readonly provenance?: Exclude<AnnualProvenance, "annual_report">;
  /** `cover_instant` lines: the cover date the count is stated as of. */
  readonly as_of?: IsoDate;
  /** A later annual report changed the value: what the earlier report said, and where. */
  readonly restatement?: { readonly original_value: number; readonly original_filing: FilingIndex };
};

export type UnverifiedCell = {
  readonly status: "unverified";
  readonly value: number;
  readonly reason: UnverifiedReason;
  /** The annual report that covers the year (it does not state this value). */
  readonly filing: FilingIndex;
};

/** One input of a calculated value: a reported value of the same fiscal year. */
export type CalculatedInput = {
  readonly item: string;
  readonly value: number;
  readonly status: "verified" | "unverified";
  /** The filing the input cites, in `filings`; otherwise its address alone. */
  readonly filing: FilingIndex | null;
  readonly filing_url?: string;
};

export type CalculatedCell = {
  readonly status: "calculated";
  readonly value: number;
  /** `divide`: the first input over the second; `subtract`: the first less the second. */
  readonly op: "divide" | "subtract";
  readonly inputs: readonly [CalculatedInput, CalculatedInput];
  /** Either input is not verified against the filing. */
  readonly unverified_input: boolean;
};

export type StatementCell = VerifiedCell | UnverifiedCell | CalculatedCell;

/** One fiscal year: `fiscal_year` is the internal key; the page names it by `period_end` (`fiscalYearLabel`). */
export type StatementYear = {
  readonly fiscal_year: number;
  readonly period_start: IsoDate | null;
  readonly period_end: IsoDate;
  /** The year's own annual report, when it has one. */
  readonly annual_report: FilingIndex | null;
};

/** One line across the years: `cells[i]` and `excluded[i]` belong to `years[i]`. */
export type StatementLine = {
  readonly item: string;
  /** The registry's English label, kept only for a line the catalog does not name. */
  readonly fallback_label?: string;
  readonly unit: StatementUnit;
  readonly period_type: StatementPeriodType;
  readonly cells: readonly (StatementCell | null)[];
  /** Why the source withheld an absent value, when it says. */
  readonly excluded: readonly (AnnualExclusionReason | null)[];
};

/**
 * Everything the section shows for one company: up to ten fiscal years,
 * oldest first; each statement's reported lines in the registry's order,
 * and every calculated line under `ratios`. Lines without a value in any
 * shown year are left out, and so is a tab without lines.
 */
export type CompanyStatements = {
  readonly years: readonly StatementYear[];
  readonly filings: readonly StatementFiling[];
  readonly tabs: Readonly<Partial<Record<StatementTab, readonly StatementLine[]>>>;
  /** Set only on fixture data: the page then says so. */
  readonly fixture?: true;
};

/** The tabs that have at least one line, in tab order. */
export function presentTabs(statements: CompanyStatements): readonly StatementTab[] {
  return STATEMENT_TABS.filter((tab) => (statements.tabs[tab]?.length ?? 0) > 0);
}

/** A line by its item, in whichever tab holds it. */
export function lineOf(statements: CompanyStatements, item: string): StatementLine | null {
  for (const tab of STATEMENT_TABS) {
    const line = statements.tabs[tab]?.find((candidate) => candidate.item === item);
    if (line) return line;
  }
  return null;
}

/** The value of a line in one year, when it has one. */
export function valueAt(statements: CompanyStatements, item: string, yearIndex: number): number | null {
  return lineOf(statements, item)?.cells[yearIndex]?.value ?? null;
}

/** A filing by its index, or `null`. */
export function filingAt(statements: CompanyStatements, index: FilingIndex | null): StatementFiling | null {
  return index === null ? null : statements.filings[index] ?? null;
}

/* -------------------------------------------------------------------------- */
/* Adapter from the registry's statement read model.                          */
/* -------------------------------------------------------------------------- */

class FilingTable {
  readonly list: StatementFiling[] = [];
  private readonly byAccession = new Map<string, FilingIndex>();

  add(filing: StatementFiling): FilingIndex {
    const known = this.byAccession.get(filing.accession);
    if (known !== undefined) return known;
    this.list.push(filing);
    this.byAccession.set(filing.accession, this.list.length - 1);
    return this.list.length - 1;
  }

  find(accession: string): FilingIndex | null {
    return this.byAccession.get(accession) ?? null;
  }
}

function fromAnnualSource(source: AnnualFilingSource): StatementFiling {
  return { form: source.form, accession: source.accession_number, filed: source.filed_at, filing_url: source.filing_url };
}

function fromFilingRef(ref: StatementFilingRef): StatementFiling {
  return { form: ref.form, accession: ref.accession, filed: ref.filed, filing_url: ref.filing_url };
}

/** One read-model cell as the page shows it; anything that does not fit the contract is left out (an em dash), never guessed. */
function cellFromReadModel(cell: ReadModelCell | undefined, filings: FilingTable): StatementCell | null {
  if (!cell || typeof cell.value !== "number" || !Number.isFinite(cell.value)) return null;
  if (cell.kind === "reported") {
    const filing = filings.add(fromFilingRef(cell.filing));
    if (cell.status === "verified_reported" && cell.source_concept) {
      const restatement = cell.restatement
        ? { original_value: cell.restatement.original_value, original_filing: filings.add({ form: cell.filing.form, accession: cell.restatement.original_accession, filed: cell.restatement.original_filed, filing_url: cell.restatement.original_filing_url }) }
        : null;
      return {
        status: "verified",
        value: cell.value,
        concept: cell.source_concept,
        filing,
        ...(cell.provenance && cell.provenance !== "annual_report" ? { provenance: cell.provenance } : {}),
        ...(cell.as_of ? { as_of: cell.as_of } : {}),
        ...(restatement ? { restatement } : {}),
      };
    }
    if (cell.status === "unverified_or_derived" && cell.reason) return { status: "unverified", value: cell.value, reason: cell.reason, filing };
    return null;
  }
  if (cell.kind === "calculated" && cell.status === "calculated" && cell.inputs.length === 2) {
    const op = cell.formula.includes(" / ") ? "divide" : cell.formula.includes(" - ") ? "subtract" : null;
    if (!op) return null;
    const input = (ref: (typeof cell.inputs)[number]): CalculatedInput => {
      const filing = filings.find(ref.accession);
      return { item: ref.item, value: ref.value, status: ref.status === "verified_reported" ? "verified" : "unverified", filing, ...(filing === null ? { filing_url: ref.filing_url } : {}) };
    };
    return { status: "calculated", value: cell.value, op, inputs: [input(cell.inputs[0]), input(cell.inputs[1])], unverified_input: cell.input_status !== "verified_reported" };
  }
  return null;
}

/**
 * The section's data from the registry's statement series of one company
 * (`getStatementSeries(ticker, statement)` for each of `STATEMENT_KINDS`).
 * The years are the union of the statements' fiscal years, oldest first,
 * cut to the newest `maxYears`. Reported rows stay in their statement's
 * tab; calculated rows of every statement are gathered under `ratios`.
 * Rows without a value in any shown year are dropped (the registry lists
 * every row it defines, with or without values for this company).
 */
export function statementsFromSeries(series: readonly (StatementSeries | null)[], maxYears: number): CompanyStatements | null {
  const present = series.filter((entry): entry is StatementSeries => entry !== null && (STATEMENT_KINDS as readonly string[]).includes(entry.statement));
  const filings = new FilingTable();
  const byYear = new Map<number, { fiscal_year: number; period_start: IsoDate | null; period_end: IsoDate; report: AnnualFilingSource | null }>();
  for (const entry of present) {
    for (const column of entry.years) {
      const known = byYear.get(column.fiscal_year);
      if (!known) byYear.set(column.fiscal_year, { fiscal_year: column.fiscal_year, period_start: column.period_start, period_end: column.period_end, report: column.annual_report });
      else if (!known.report && column.annual_report) known.report = column.annual_report;
    }
  }
  const chosen = [...byYear.values()].sort((a, b) => a.fiscal_year - b.fiscal_year).slice(-maxYears);
  if (chosen.length === 0) return null;
  const years: StatementYear[] = chosen.map((year) => ({
    fiscal_year: year.fiscal_year,
    period_start: year.period_start,
    period_end: year.period_end,
    annual_report: year.report ? filings.add(fromAnnualSource(year.report)) : null,
  }));

  const tabs: Partial<Record<StatementTab, StatementLine[]>> = {};
  for (const entry of present) {
    const columns = chosen.map((year) => entry.years.find((column) => column.fiscal_year === year.fiscal_year) ?? null);
    for (const row of entry.rows) {
      const cells = columns.map((column) => cellFromReadModel(column?.cells[row.item], filings));
      if (cells.every((cell) => cell === null)) continue;
      const line: StatementLine = {
        item: row.item,
        ...(isStatementItem(row.item) ? {} : { fallback_label: row.label }),
        unit: UNITS[row.unit],
        period_type: row.period_type,
        cells,
        excluded: columns.map((column, index) => (cells[index] === null ? column?.excluded[row.item] ?? null : null)),
      };
      const tab: StatementTab = row.kind === "calculated" ? "ratios" : (entry.statement as StatementKind);
      (tabs[tab] ??= []).push(line);
    }
  }
  return Object.keys(tabs).length ? { years, filings: filings.list, tabs } : null;
}

/* -------------------------------------------------------------------------- */
/* One statements file per ticker, and the summary the documents prerender.  */
/* -------------------------------------------------------------------------- */

/**
 * The newest `maxYears` fiscal years of a company's statements (the company
 * page's window over the evidence page's every year). Lines without a value
 * in the window are left out, and so is a tab without lines, exactly as
 * `statementsFromSeries` cuts; filings stay as they are, so every index
 * still points at the same filing.
 */
export function newestYears(statements: CompanyStatements, maxYears: number): CompanyStatements {
  const from = Math.max(0, statements.years.length - maxYears);
  if (from === 0) return statements;
  const tabs: Partial<Record<StatementTab, StatementLine[]>> = {};
  for (const tab of STATEMENT_TABS) {
    const lines = (statements.tabs[tab] ?? [])
      .map((line) => ({ ...line, cells: line.cells.slice(from), excluded: line.excluded.slice(from) }))
      .filter((line) => line.cells.some((cell) => cell !== null));
    if (lines.length) tabs[tab] = lines;
  }
  return { ...statements, years: statements.years.slice(from), tabs };
}

/** The number of lines across the tabs. */
export function lineCount(statements: CompanyStatements): number {
  return STATEMENT_TABS.reduce((sum, tab) => sum + (statements.tabs[tab]?.length ?? 0), 0);
}

/**
 * The few lines a document prerenders for its newest years, so the main
 * figures and their filings read without JavaScript. Each entry is one row:
 * the first item the company has, in order (net income attributable to the
 * parent where the filings split it, otherwise net income).
 */
export type StatementSummaryRow = readonly StatementItem[];

/**
 * A prerendered summary: some lines of the newest years, with only the
 * filings those years and cells cite (re-indexed), so the loader data stays
 * small. The whole statements load from the ticker's statements file.
 */
export type StatementsSummary = {
  readonly years: readonly StatementYear[];
  readonly filings: readonly StatementFiling[];
  readonly lines: readonly StatementLine[];
};

/**
 * What a company or evidence document carries about the statements: the
 * summary, the address of the ticker's statements file, and the size of
 * what the file holds for this page (every year on the evidence page, the
 * newest `STATEMENTS_CONFIG.maxYears` on the company page).
 */
export type StatementsSource = {
  readonly ticker: string;
  /** Same-origin path of the ticker's statements file; its name carries a digest of its bytes. */
  readonly file: string;
  readonly summary: StatementsSummary;
  readonly items: number;
  readonly first_period_end: IsoDate;
  readonly last_period_end: IsoDate;
  readonly year_count: number;
  readonly fixture?: true;
};

function remapCell(cell: StatementCell | null, map: (index: FilingIndex) => FilingIndex): StatementCell | null {
  if (!cell) return null;
  if (cell.status === "calculated") {
    const input = (entry: CalculatedInput): CalculatedInput => (entry.filing === null ? entry : { ...entry, filing: map(entry.filing) });
    return { ...cell, inputs: [input(cell.inputs[0]), input(cell.inputs[1])] };
  }
  if (cell.status === "unverified") return { ...cell, filing: map(cell.filing) };
  return { ...cell, filing: map(cell.filing), ...(cell.restatement ? { restatement: { ...cell.restatement, original_filing: map(cell.restatement.original_filing) } } : {}) };
}

/** The summary of `statements`: the rows' first present item each, over the newest `years` fiscal years. */
export function statementsSummary(statements: CompanyStatements, rows: readonly StatementSummaryRow[], years: number): StatementsSummary {
  const window = newestYears(statements, years);
  const chosen = rows.flatMap((row) => {
    const line = row.map((item) => lineOf(window, item)).find((candidate) => candidate !== null);
    return line ? [line] : [];
  });
  const used: FilingIndex[] = [];
  const indexOf = new Map<FilingIndex, FilingIndex>();
  const map = (index: FilingIndex): FilingIndex => {
    const known = indexOf.get(index);
    if (known !== undefined) return known;
    used.push(index);
    indexOf.set(index, used.length - 1);
    return used.length - 1;
  };
  const summaryYears = window.years.map((year) => ({ ...year, annual_report: year.annual_report === null ? null : map(year.annual_report) }));
  const lines = chosen.map((line) => ({ ...line, cells: line.cells.map((cell) => remapCell(cell, map)) }));
  return { years: summaryYears, filings: used.map((index) => statements.filings[index]!), lines };
}

/** The version of the statements file's shape. */
export const STATEMENTS_FILE_SCHEMA = "benten.public-web.statements.v1";

/** One ticker's statements file: every fiscal year, locale-free (the page names the lines and formats the values). */
export type StatementsFile = {
  readonly schema_version: typeof STATEMENTS_FILE_SCHEMA;
  readonly ticker: string;
  readonly statements: CompanyStatements;
};

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isIndex = (value: unknown, length: number): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) < length;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function isCell(value: unknown, filings: number): boolean {
  if (value === null) return true;
  if (!isObject(value) || !isFiniteNumber(value.value)) return false;
  if (value.status === "verified") return typeof value.concept === "string" && isIndex(value.filing, filings) && (value.restatement === undefined || (isObject(value.restatement) && isFiniteNumber(value.restatement.original_value) && isIndex(value.restatement.original_filing, filings)));
  if (value.status === "unverified") return typeof value.reason === "string" && isIndex(value.filing, filings);
  if (value.status === "calculated") {
    return (value.op === "divide" || value.op === "subtract") && Array.isArray(value.inputs) && value.inputs.length === 2
      && value.inputs.every((input) => isObject(input) && typeof input.item === "string" && isFiniteNumber(input.value) && (input.filing === null || isIndex(input.filing, filings)));
  }
  return false;
}

/**
 * The statements in a fetched file, or `null` when it is not exactly the
 * file this page expects (another ticker, another shape, a cell that points
 * at no filing). Nothing partial is shown from a file that does not fit.
 */
export function parseStatementsFile(value: unknown, ticker: string): CompanyStatements | null {
  if (!isObject(value) || value.schema_version !== STATEMENTS_FILE_SCHEMA || value.ticker !== ticker || !isObject(value.statements)) return null;
  const { years, filings, tabs, fixture } = value.statements;
  if (!Array.isArray(years) || years.length === 0 || !Array.isArray(filings) || !isObject(tabs)) return null;
  if (!filings.every((filing) => isObject(filing) && typeof filing.form === "string" && typeof filing.accession === "string" && typeof filing.filed === "string" && typeof filing.filing_url === "string" && filing.filing_url.startsWith("https://"))) return null;
  if (!years.every((year) => isObject(year) && Number.isInteger(year.fiscal_year) && typeof year.period_end === "string" && DAY.test(year.period_end) && (year.annual_report === null || isIndex(year.annual_report, filings.length)))) return null;
  for (const [tab, lines] of Object.entries(tabs)) {
    if (!(STATEMENT_TABS as readonly string[]).includes(tab) || !Array.isArray(lines)) return null;
    for (const line of lines) {
      if (!isObject(line) || typeof line.item !== "string" || typeof line.unit !== "string" || !Array.isArray(line.cells) || !Array.isArray(line.excluded)) return null;
      if (line.cells.length !== years.length || line.excluded.length !== years.length) return null;
      if (!line.cells.every((cell) => isCell(cell, filings.length))) return null;
    }
  }
  return { years, filings, tabs, ...(fixture === true ? { fixture: true } : {}) } as CompanyStatements;
}
