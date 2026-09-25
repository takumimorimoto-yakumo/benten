/**
 * Display schema for the fundamentals payload.
 *
 * The field allowlist comes from the public registry package so the web API,
 * page, and MCP server expose exactly the same snapshot contract. Labels are neutral restatements
 * of the field name — no derived metric, score, rating, or judgement is
 * introduced here.
 */
export { FUNDAMENTALS_FIELDS } from "@benten/registry";
export type { FundamentalsField } from "@benten/registry";
import type { FundamentalsField } from "@benten/registry";
import type { Fact } from "@/components/FactTable";
import type { ValueKind } from "@/lib/format";

export const FUNDAMENTALS_LABELS = {
  company_name: "Company name",
  metrics_fiscal_year: "Fiscal year",
  revenue: "Revenue",
  op_income: "Operating income",
  gross_profit: "Gross profit",
  net_income_parent: "Net income (parent)",
  total_assets: "Total assets",
  total_equity: "Total equity",
  total_liabilities: "Total liabilities",
  long_term_debt: "Long-term debt",
  operating_cf: "Operating cash flow",
  investing_cf: "Investing cash flow",
  fcf: "Free cash flow",
} satisfies Record<FundamentalsField, string>;

/**
 * How each field's value is read. Exhaustive over the field contract so a new
 * field cannot be added without deciding whether it is an amount or a label.
 * Fiscal years are identifiers and are shown without digit grouping.
 */
export const FUNDAMENTALS_VALUE_KINDS = {
  company_name: "identifier",
  metrics_fiscal_year: "identifier",
  revenue: "quantity",
  op_income: "quantity",
  gross_profit: "quantity",
  net_income_parent: "quantity",
  total_assets: "quantity",
  total_equity: "quantity",
  total_liabilities: "quantity",
  long_term_debt: "quantity",
  operating_cf: "quantity",
  investing_cf: "quantity",
  fcf: "quantity",
} as const satisfies Record<FundamentalsField, ValueKind>;

/** Build the fact rows for one group of fields from a snapshot payload. */
export function fundamentalsFacts(
  data: Record<string, unknown>,
  fields: ReadonlyArray<FundamentalsField>,
  labels: Record<FundamentalsField, string>,
): Fact[] {
  return fields.map((field) => ({ label: labels[field], value: data[field], kind: FUNDAMENTALS_VALUE_KINDS[field] }));
}

/** Grouping used to lay the fields out. Every field appears in exactly one group. */
export const FUNDAMENTALS_GROUPS: ReadonlyArray<{
  title: string;
  fields: ReadonlyArray<FundamentalsField>;
}> = [
  { title: "Entity", fields: ["company_name", "metrics_fiscal_year"] },
  {
    title: "Income statement",
    fields: ["revenue", "gross_profit", "op_income", "net_income_parent"],
  },
  {
    title: "Balance sheet",
    fields: ["total_assets", "total_liabilities", "total_equity", "long_term_debt"],
  },
  { title: "Cash flow", fields: ["operating_cf", "investing_cf", "fcf"] },
];
