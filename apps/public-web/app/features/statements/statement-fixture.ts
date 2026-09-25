/**
 * FIXTURE, NOT FILING DATA. A deterministic NVIDIA-shaped set of ten fiscal
 * years of statements (years ending in late January) in the registry's
 * statement read model shape (`StatementSeries`, one per statement, rows
 * from the registry's own `getStatementRows`), for building and reviewing
 * the financial statements section. It goes through the same adapter as the
 * real read model. Revenue and net income follow the chart fixture, so the
 * chart and the table on one review page agree; every other number is
 * derived here from invented shares and none is NVIDIA's. Accession numbers
 * are placeholders and the filing links lead to a generic SEC page. The
 * XBRL concept names are public US GAAP taxonomy names.
 *
 * Exercises every cell state: verified values (one restated, one counted at
 * the annual report's cover date), values not verified against the filing,
 * calculated values (one with an unverified input), absent values (one the
 * source withheld with a reason) and rows without any value.
 *
 * Imported by the build-time statements source (only when the fixture flag
 * is on) and by the development-only Living Catalog; never by a page
 * component.
 */
import {
  getStatementRows,
  type AnnualExclusionReason,
  type AnnualFilingSource,
  type CalculatedStatementCell,
  type ReportedStatementCell,
  type StatementCell,
  type StatementDetailName,
  type StatementRowDefinition,
  type StatementSeries,
  type UnverifiedReason,
} from "@benten/registry";
import { DAY_MS, FIXTURE_FILING_LAG_DAYS, FIXTURE_FIRST_YEAR, FIXTURE_MARGINS, FIXTURE_REVENUE_BILLIONS, FIXTURE_UNVERIFIED, isoDay, lastSundayOfJanuary } from "../charts/chart-fixture";
import { STATEMENTS_CONFIG } from "./statement-config";
import { STATEMENT_KINDS, statementsFromSeries, type CompanyStatements } from "./statement-data";

const BILLION = 1e9;
const MILLION = 1e6;
/** Reported amounts are whole millions, as in the filings of a large issuer. */
const toMillions = (value: number) => Math.round(value / MILLION) * MILLION;
const toCents = (value: number) => Math.round(value * 100) / 100;

/** Invented shares of revenue per fiscal year (index 0 = the first fixture year). */
const SHAPE = {
  grossMargin: [0.59, 0.6, 0.62, 0.61, 0.62, 0.65, 0.57, 0.73, 0.75, 0.72],
  research: [0.23, 0.18, 0.2, 0.25, 0.24, 0.2, 0.27, 0.14, 0.1, 0.09],
  sellingAdmin: [0.1, 0.08, 0.09, 0.1, 0.1, 0.07, 0.08, 0.04, 0.03, 0.03],
  taxRate: [0.12, 0.05, 0.06, 0.08, 0.02, 0.02, 0.09, 0.12, 0.13, 0.15],
  assetsToRevenue: [1.6, 1.4, 1.3, 1.9, 2.0, 1.7, 1.9, 1.5, 1.2, 1.1],
  liabilitiesToAssets: [0.4, 0.3, 0.3, 0.32, 0.38, 0.39, 0.46, 0.35, 0.28, 0.27],
  /** Diluted weighted average shares, in billions. */
  dilutedShares: [25.9, 25.4, 25.0, 24.7, 25.0, 25.4, 25.1, 24.9, 24.8, 24.6],
} as const;

const YEARS = 10;
/** The chart fixture starts one year earlier; the statements show its last ten years. */
const OFFSET = FIXTURE_REVENUE_BILLIONS.length - YEARS;
const yearAt = (index: number) => FIXTURE_FIRST_YEAR + OFFSET + index;

/** Values the fixture reports as not verified against the filing. */
const UNVERIFIED: ReadonlyArray<{ item: string; fiscalYear: number; reason: UnverifiedReason }> = [
  { item: FIXTURE_UNVERIFIED.metric, fiscalYear: FIXTURE_UNVERIFIED.fiscalYear, reason: "reported_under_unlisted_concept" },
  { item: "depreciation_amortization", fiscalYear: yearAt(1), reason: "derived_by_source" },
];
/** Absent values: one the source withheld (with its reason), one simply not in the filings. */
const ABSENT: ReadonlyArray<{ item: string; fiscalYear: number; excluded: AnnualExclusionReason | null }> = [
  { item: "inventories", fiscalYear: yearAt(0), excluded: "unsafe_value" },
  { item: "share_repurchase", fiscalYear: yearAt(5), excluded: null },
];
/** A value a later annual report restated. */
const RESTATED = { item: "total_assets", fiscalYear: yearAt(7), originalShare: 0.996 };

/** US GAAP concepts the fixture cites for reported items; an item without one has no value for this fixture company. */
const CONCEPTS: Readonly<Record<string, string>> = {
  revenue: "us-gaap:Revenues",
  cost_of_revenue: "us-gaap:CostOfRevenue",
  gross_profit: "us-gaap:GrossProfit",
  sga: "us-gaap:SellingGeneralAndAdministrativeExpense",
  research_and_development: "us-gaap:ResearchAndDevelopmentExpense",
  operating_income: "us-gaap:OperatingIncomeLoss",
  interest_expense: "us-gaap:InterestExpense",
  pretax_income: "us-gaap:IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
  income_tax: "us-gaap:IncomeTaxExpenseBenefit",
  net_income: "us-gaap:ProfitLoss",
  net_income_parent: "us-gaap:NetIncomeLoss",
  cash_and_equivalents: "us-gaap:CashAndCashEquivalentsAtCarryingValue",
  receivables: "us-gaap:AccountsReceivableNetCurrent",
  inventories: "us-gaap:InventoryNet",
  current_assets: "us-gaap:AssetsCurrent",
  ppe: "us-gaap:PropertyPlantAndEquipmentNet",
  goodwill: "us-gaap:Goodwill",
  intangible_assets: "us-gaap:IntangibleAssetsNetExcludingGoodwill",
  total_assets: "us-gaap:Assets",
  current_liabilities: "us-gaap:LiabilitiesCurrent",
  long_term_debt: "us-gaap:LongTermDebtNoncurrent",
  total_liabilities: "us-gaap:Liabilities",
  equity_parent: "us-gaap:StockholdersEquity",
  total_equity: "us-gaap:StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
  retained_earnings: "us-gaap:RetainedEarningsAccumulatedDeficit",
  operating_cf: "us-gaap:NetCashProvidedByUsedInOperatingActivities",
  depreciation_amortization: "us-gaap:DepreciationDepletionAndAmortization",
  investing_cf: "us-gaap:NetCashProvidedByUsedInInvestingActivities",
  capex: "us-gaap:PaymentsToAcquirePropertyPlantAndEquipment",
  financing_cf: "us-gaap:NetCashProvidedByUsedInFinancingActivities",
  dividends_paid: "us-gaap:PaymentsOfDividends",
  share_repurchase: "us-gaap:PaymentsForRepurchaseOfCommonStock",
  net_change_in_cash: "us-gaap:CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect",
  income_taxes_paid: "us-gaap:IncomeTaxesPaidNet",
  eps_basic: "us-gaap:EarningsPerShareBasic",
  eps_diluted: "us-gaap:EarningsPerShareDiluted",
  dividends_per_share: "us-gaap:CommonStockDividendsPerShareDeclared",
  shares_outstanding: "dei:EntityCommonStockSharesOutstanding",
};

type FixtureYear = { fiscal_year: number; period_start: string; period_end: string; report: AnnualFilingSource; cover: string };

function fixtureYear(index: number): FixtureYear {
  const fiscalYear = yearAt(index);
  const endMs = lastSundayOfJanuary(fiscalYear);
  const filed = isoDay(endMs + FIXTURE_FILING_LAG_DAYS * DAY_MS);
  return {
    fiscal_year: fiscalYear,
    period_start: isoDay(lastSundayOfJanuary(fiscalYear - 1) + DAY_MS),
    period_end: isoDay(endMs),
    report: {
      source_ref: `fixture-${fiscalYear}`,
      form: "10-K",
      accession_number: `0000000000-${String(fiscalYear).slice(2)}-${String(OFFSET + index + 1).padStart(6, "0")}`,
      filed_at: filed,
      filing_url: "https://www.sec.gov/search-filings",
      source_authority: "SEC EDGAR",
    },
    // The cover page states the share count a few days before filing.
    cover: isoDay(endMs + (FIXTURE_FILING_LAG_DAYS - 7) * DAY_MS),
  };
}

/** The reported amounts of one fixture year, by registry item. */
function reportedValues(index: number): Readonly<Record<string, number>> {
  const revenue = FIXTURE_REVENUE_BILLIONS[OFFSET + index]! * BILLION;
  // As the chart fixture rounds it, so the chart and the table agree.
  const netIncome = Math.round(FIXTURE_REVENUE_BILLIONS[OFFSET + index]! * FIXTURE_MARGINS[OFFSET + index]! * 10) / 10 * BILLION;
  const grossProfit = toMillions(revenue * SHAPE.grossMargin[index]!);
  const research = toMillions(revenue * SHAPE.research[index]!);
  const sellingAdmin = toMillions(revenue * SHAPE.sellingAdmin[index]!);
  const operatingIncome = grossProfit - research - sellingAdmin;
  const pretax = toMillions(netIncome / (1 - SHAPE.taxRate[index]!));
  const totalAssets = toMillions(revenue * SHAPE.assetsToRevenue[index]!);
  const totalLiabilities = toMillions(totalAssets * SHAPE.liabilitiesToAssets[index]!);
  const currentAssets = toMillions(totalAssets * 0.66);
  const currentLiabilities = toMillions(totalLiabilities * 0.45);
  const cash = toMillions(currentAssets * 0.2);
  const depreciation = toMillions(revenue * 0.03);
  const operatingCf = toMillions(netIncome + depreciation + revenue * 0.005);
  const investingCf = -toMillions(revenue * 0.22);
  const repurchases = -toMillions(revenue * 0.12);
  const dilutedShares = SHAPE.dilutedShares[index]! * BILLION;
  const basicShares = dilutedShares * 0.985;
  const dividendsPerShare = 0.01;
  const dividends = -toMillions(dividendsPerShare * basicShares);
  const financingCf = repurchases + dividends + toMillions(revenue * (index % 3 === 0 ? 0.05 : -0.02));
  const equity = totalAssets - totalLiabilities;
  return {
    revenue,
    cost_of_revenue: revenue - grossProfit,
    gross_profit: grossProfit,
    sga: sellingAdmin,
    research_and_development: research,
    operating_income: operatingIncome,
    interest_expense: toMillions(revenue * 0.002),
    pretax_income: pretax,
    income_tax: pretax - netIncome,
    net_income: netIncome,
    net_income_parent: netIncome,
    cash_and_equivalents: cash,
    receivables: toMillions(currentAssets * 0.2),
    inventories: toMillions(currentAssets * 0.15),
    current_assets: currentAssets,
    ppe: toMillions(totalAssets * 0.08),
    goodwill: toMillions((index < 4 ? 0.62 : 4.37) * BILLION),
    intangible_assets: toMillions(totalAssets * 0.01),
    total_assets: totalAssets,
    current_liabilities: currentLiabilities,
    long_term_debt: toMillions(totalLiabilities * 0.35),
    total_liabilities: totalLiabilities,
    equity_parent: equity,
    total_equity: equity,
    retained_earnings: toMillions(equity * 0.8),
    operating_cf: operatingCf,
    depreciation_amortization: depreciation,
    investing_cf: investingCf,
    capex: toMillions(revenue * 0.04),
    financing_cf: financingCf,
    dividends_paid: -dividends,
    share_repurchase: -repurchases,
    net_change_in_cash: operatingCf + investingCf + financingCf,
    income_taxes_paid: toMillions((pretax - netIncome) * 0.9),
    eps_basic: toCents(netIncome / basicShares),
    eps_diluted: toCents(netIncome / dilutedShares),
    dividends_per_share: dividendsPerShare,
    shares_outstanding: Math.round((dilutedShares * 0.98) / MILLION) * MILLION,
  };
}

function reportedCell(row: StatementRowDefinition, year: FixtureYear, index: number, years: readonly FixtureYear[]): ReportedStatementCell | null {
  const value = reportedValues(index)[row.item];
  const concept = CONCEPTS[row.item];
  if (value === undefined || !concept || ABSENT.some((absent) => absent.item === row.item && absent.fiscalYear === year.fiscal_year)) return null;
  const unverified = UNVERIFIED.find((entry) => entry.item === row.item && entry.fiscalYear === year.fiscal_year);
  const restated = row.item === RESTATED.item && year.fiscal_year === RESTATED.fiscalYear ? years[index - 1] : undefined;
  const filing = { accession: year.report.accession_number, form: year.report.form, filed: year.report.filed_at, filing_url: year.report.filing_url };
  return {
    item: row.item,
    kind: "reported",
    status: unverified ? "unverified_or_derived" : "verified_reported",
    value,
    unit: row.unit as ReportedStatementCell["unit"],
    period_start: row.period_type === "duration" ? year.period_start : null,
    period_end: year.period_end,
    as_of: row.period_type === "cover_instant" && !unverified ? year.cover : null,
    source_concept: unverified ? null : concept,
    provenance: unverified ? null : "annual_report",
    reason: unverified ? unverified.reason : null,
    filing,
    restatement: restated
      ? { original_value: toMillions(value * RESTATED.originalShare), original_source_concept: concept, original_accession: restated.report.accession_number, original_filed: restated.report.filed_at, original_filing_url: restated.report.filing_url }
      : null,
  };
}

function calculatedCell(row: StatementRowDefinition, year: FixtureYear, cells: Readonly<Record<string, StatementCell>>): CalculatedStatementCell | null {
  const [a, b] = (row.inputs ?? []).map((input) => cells[input]);
  if (!a || !b || a.kind !== "reported" || b.kind !== "reported" || !row.formula) return null;
  const divide = row.formula.includes(" / ");
  if (divide && !(b.value > 0)) return null;
  const ref = (cell: ReportedStatementCell) => ({ item: cell.item, value: cell.value, status: cell.status, accession: cell.filing.accession, filing_url: cell.filing.filing_url });
  return {
    item: row.item,
    kind: "calculated",
    status: "calculated",
    input_status: a.status === "verified_reported" && b.status === "verified_reported" ? "verified_reported" : "unverified_or_derived",
    value: divide ? Math.round((a.value / b.value) * 1e6) / 1e6 : a.value - b.value,
    unit: row.unit as CalculatedStatementCell["unit"],
    period_start: a.period_start !== null || b.period_start !== null ? year.period_start : null,
    period_end: year.period_end,
    formula: row.formula,
    inputs: [ref(a), ref(b)],
  };
}

/** The fixture as the registry would return it: one series per statement. */
export function fixtureStatementSeries(): StatementSeries[] {
  const years = Array.from({ length: YEARS }, (_, index) => fixtureYear(index));
  // Every reported cell of a year across the statements: a calculated item may read another statement (ROE reads PL and BS).
  const reported = years.map((year, index) => {
    const cells: Record<string, StatementCell> = {};
    for (const statement of STATEMENT_KINDS) {
      for (const row of getStatementRows(statement)) {
        if (row.kind !== "reported") continue;
        const cell = reportedCell(row, year, index, years);
        if (cell) cells[row.item] = cell;
      }
    }
    return cells;
  });
  return STATEMENT_KINDS.map((statement: StatementDetailName): StatementSeries => {
    const rows = getStatementRows(statement);
    return {
      ticker: "NVDA",
      statement,
      first_fiscal_year: yearAt(0),
      fiscal_year_from: null,
      fiscal_year_to: null,
      rows,
      years: years.map((year, index) => {
        const cells: Partial<Record<string, StatementCell>> = {};
        const excluded: Partial<Record<string, AnnualExclusionReason>> = {};
        for (const row of rows) {
          const cell = row.kind === "reported" ? reported[index]![row.item] : calculatedCell(row, year, reported[index]!);
          if (cell) cells[row.item] = cell;
          const withheld = ABSENT.find((absent) => absent.item === row.item && absent.fiscalYear === year.fiscal_year)?.excluded;
          if (!cell && withheld) excluded[row.item] = withheld;
        }
        return { fiscal_year: year.fiscal_year, fiscal_month: 1, period_start: year.period_start, period_end: year.period_end, annual_report: year.report, cells, excluded };
      }),
    };
  });
}

/** The whole fixture of one company, through the adapter the real read model uses. */
export function fixtureStatements(): CompanyStatements {
  const statements = statementsFromSeries(fixtureStatementSeries(), STATEMENTS_CONFIG.maxYears);
  if (!statements) throw new Error("the statements fixture must produce statements");
  return { ...statements, fixture: true };
}
