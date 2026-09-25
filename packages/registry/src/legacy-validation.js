const FUNDAMENTALS_FIELDS = [
  "company_name", "metrics_fiscal_year", "revenue", "op_income", "gross_profit",
  "net_income_parent", "total_assets", "total_equity", "total_liabilities",
  "long_term_debt", "operating_cf", "investing_cf", "fcf",
];
const STATEMENT_NAMES = ["pl", "bs", "cf"];
const PERIOD_FIELDS = ["ticker", "region", "fiscal_year", "fiscal_month", "period_kind"];
const STATEMENT_FIELDS = {
  pl: [...PERIOD_FIELDS, "revenue", "op_income", "ordinary_income", "pretax_income", "net_income",
    "net_income_attributable_to_owners_of_parent", "gross_profit", "cost_of_sales", "sga", "income_taxes",
    "non_controlling_interests_income", "interest_income", "interest_expenses"],
  bs: [...PERIOD_FIELDS, "total_assets", "total_equity", "total_liabilities",
    "equity_attributable_to_owners_of_parent", "current_assets", "non_current_assets", "current_liabilities",
    "non_current_liabilities", "short_term_debt", "long_term_debt", "capital_stock", "retained_earnings",
    "cash_and_deposits", "inventories"],
  cf: [...PERIOD_FIELDS, "operating_cf", "investing_cf", "financing_cf", "cash_eop", "capex",
    "depreciation_and_amortization", "cash_dividends_paid", "interest_paid"],
};
const STRING_FIELDS = new Set(["company_name", "ticker", "region", "period_kind"]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertExactKeys(record, expected, message) {
  if (!isRecord(record)) throw new TypeError(message);
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new TypeError(message);
  }
}

export function isValidLegacySnapshotAsOf(value) {
  return typeof value === "string"
    && (/^FY\d{4}$/.test(value) || /^FY\d{4} M(?:[1-9]|1[0-2]) FY$/.test(value));
}

function validateFieldValue(field, value) {
  if (value === null) return;
  if (STRING_FIELDS.has(field)) {
    if (typeof value !== "string" || value.length === 0 || value.length > 512) {
      throw new TypeError("A public string field has an invalid value");
    }
    if (field === "ticker" && !/^[A-Z0-9.-]{1,16}$/.test(value)) throw new TypeError("A public ticker has an invalid value");
    if (field === "region" && value !== "US") throw new TypeError("A public region has an invalid value");
    if (field === "period_kind" && value !== "FY") throw new TypeError("A public period kind has an invalid value");
    return;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError("A public numeric field has an invalid value");
  if ((field === "fiscal_year" || field === "metrics_fiscal_year")
      && (!Number.isInteger(value) || value < 1900 || value > 3000)) {
    throw new TypeError("A public fiscal year has an invalid value");
  }
  if (field === "fiscal_month" && (!Number.isInteger(value) || value < 1 || value > 12)) {
    throw new TypeError("A public fiscal month has an invalid value");
  }
}

function validateRow(row, fields) {
  assertExactKeys(row, fields, "Unknown legacy field");
  for (const field of fields) validateFieldValue(field, row[field]);
  return Object.fromEntries(fields.map((field) => [field, row[field]]));
}

export function validateLegacyFinancialsSnapshot(input, eligibleTickers) {
  if (!isRecord(input) || input.schema_version !== 1) throw new TypeError("Unsupported financial snapshot schema");
  assertExactKeys(input, ["schema_version", "fundamentals", "financials"], "Unknown snapshot property");
  if (!isRecord(input.fundamentals) || !isRecord(input.financials)) throw new TypeError("Invalid financial snapshot collections");

  const fundamentals = {};
  for (const [ticker, value] of Object.entries(input.fundamentals)) {
    if (!eligibleTickers.has(ticker) || !isRecord(value)) throw new TypeError("Invalid fundamentals snapshot entry");
    assertExactKeys(value, ["as_of", "data"], "Unknown fundamentals record property");
    if (!isValidLegacySnapshotAsOf(value.as_of)) throw new TypeError("Invalid snapshot date");
    const data = validateRow(value.data, FUNDAMENTALS_FIELDS);
    if (data.metrics_fiscal_year !== Number(value.as_of.slice(2, 6))) throw new TypeError("Fundamentals date does not match its fiscal year");
    fundamentals[ticker] = { as_of: value.as_of, data };
  }

  const financials = {};
  for (const [ticker, value] of Object.entries(input.financials)) {
    if (!eligibleTickers.has(ticker) || !isRecord(value)) throw new TypeError("Invalid financial statements snapshot entry");
    assertExactKeys(value, ["as_of", "statements"], "Unknown financials record property");
    if (!isValidLegacySnapshotAsOf(value.as_of)) throw new TypeError("Invalid snapshot date");
    assertExactKeys(value.statements, STATEMENT_NAMES, "Unknown statement name");
    const statements = {};
    for (const statement of STATEMENT_NAMES) {
      const row = value.statements[statement];
      if (row === null) {
        statements[statement] = null;
      } else {
        const projected = validateRow(row, STATEMENT_FIELDS[statement]);
        if (projected.ticker !== ticker) throw new TypeError("Statement ticker does not match its snapshot key");
        statements[statement] = projected;
      }
    }
    financials[ticker] = { as_of: value.as_of, statements };
  }
  return { schema_version: 1, fundamentals, financials };
}
