/** Public response contract for filed fundamentals. Additional source columns are never exposed. */
export const FUNDAMENTALS_FIELDS = [
  "company_name", "metrics_fiscal_year", "revenue", "op_income",
  "gross_profit", "net_income_parent", "total_assets", "total_equity",
  "total_liabilities", "long_term_debt", "operating_cf", "investing_cf", "fcf",
] as const;

export type FundamentalsField = (typeof FUNDAMENTALS_FIELDS)[number];

export const STATEMENT_NAMES = ["pl", "bs", "cf"] as const;
export type StatementName = (typeof STATEMENT_NAMES)[number];

const PERIOD_FIELDS = ["ticker", "region", "fiscal_year", "fiscal_month", "period_kind"] as const;

/** Public response contract for each statement. Source-only provenance columns are intentionally absent. */
export const FINANCIAL_STATEMENT_FIELDS = {
  pl: [
    ...PERIOD_FIELDS,
    "revenue", "op_income", "ordinary_income", "pretax_income", "net_income",
    "net_income_attributable_to_owners_of_parent", "gross_profit", "cost_of_sales",
    "sga", "income_taxes", "non_controlling_interests_income", "interest_income",
    "interest_expenses",
  ],
  bs: [
    ...PERIOD_FIELDS,
    "total_assets", "total_equity", "total_liabilities",
    "equity_attributable_to_owners_of_parent", "current_assets", "non_current_assets",
    "current_liabilities", "non_current_liabilities", "short_term_debt", "long_term_debt",
    "capital_stock", "retained_earnings", "cash_and_deposits", "inventories",
  ],
  cf: [
    ...PERIOD_FIELDS,
    "operating_cf", "investing_cf", "financing_cf", "cash_eop", "capex",
    "depreciation_and_amortization", "cash_dividends_paid", "interest_paid",
  ],
} as const satisfies Record<StatementName, readonly string[]>;

const STRING_FIELDS = new Set(["company_name", "ticker", "region", "period_kind"]);

function validateFieldValue(field: string, value: unknown): void {
  if (value === null) return;
  if (STRING_FIELDS.has(field)) {
    if (typeof value !== "string" || value.length === 0 || value.length > 512) {
      throw new TypeError("A public string field has an invalid value");
    }
    if (field === "ticker" && !/^[A-Z0-9.-]{1,16}$/.test(value)) {
      throw new TypeError("A public ticker has an invalid value");
    }
    if (field === "region" && value !== "US") {
      throw new TypeError("A public region has an invalid value");
    }
    if (field === "period_kind" && value !== "FY") {
      throw new TypeError("A public period kind has an invalid value");
    }
    return;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError("A public numeric field has an invalid value");
  }
  if (
    (field === "fiscal_year" || field === "metrics_fiscal_year")
    && (!Number.isInteger(value) || value < 1900 || value > 3000)
  ) {
    throw new TypeError("A public fiscal year has an invalid value");
  }
  if (field === "fiscal_month" && (!Number.isInteger(value) || value < 1 || value > 12)) {
    throw new TypeError("A public fiscal month has an invalid value");
  }
}

export function isStatementName(input: unknown): input is StatementName {
  return typeof input === "string" && (STATEMENT_NAMES as readonly string[]).includes(input);
}

export function projectFields(
  row: Record<string, unknown>,
  fields: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(fields.map((field) => {
    const value = row[field] ?? null;
    validateFieldValue(field, value);
    return [field, value];
  }));
}
