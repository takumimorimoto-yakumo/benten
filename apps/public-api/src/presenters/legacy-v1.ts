import {
  STATEMENT_NAMES,
  getFinancialsSnapshot,
  getFundamentalsSnapshot,
  isStatementName,
  resolveTicker,
} from "@benten/registry";
import { DISCLAIMER } from "../constants.js";

type Presented = { status: number; body: object };

export function legacyFundamentals(ticker: string): Presented {
  const entry = resolveTicker(ticker);
  if (!entry) return { status: 404, body: { found: false, reason: "unknown_ticker", ticker, disclaimer: DISCLAIMER } };
  if (!entry.fundamentals_available) return { status: 200, body: {
    found: false, reason: "not_covered", ticker: entry.ticker,
    exclusion_reason: entry.exclusion_reason, disclaimer: DISCLAIMER,
  } };
  const record = getFundamentalsSnapshot(entry.ticker);
  if (!record) return { status: 200, body: { found: false, reason: "no_data", ticker: entry.ticker, disclaimer: DISCLAIMER } };
  return { status: 200, body: {
    found: true, ticker: entry.ticker, as_of: record.as_of,
    source: "Benten legacy financial snapshot; filing source, unit, and fact kind unverified",
    disclaimer: DISCLAIMER, data: record.data,
  } };
}

export function legacyFinancials(ticker: string, searchParams: URLSearchParams): Presented {
  const entry = resolveTicker(ticker);
  if (!entry) return { status: 404, body: { found: false, reason: "unknown_ticker", ticker, disclaimer: DISCLAIMER } };
  if (!entry.fundamentals_available) return { status: 200, body: {
    found: false, reason: "not_covered", ticker: entry.ticker,
    exclusion_reason: entry.exclusion_reason, disclaimer: DISCLAIMER,
  } };
  const requestedStatement = searchParams.get("statement");
  if (requestedStatement !== null && !isStatementName(requestedStatement)) {
    return { status: 400, body: { found: false, reason: "invalid_statement", ticker: entry.ticker, disclaimer: DISCLAIMER } };
  }
  const record = getFinancialsSnapshot(entry.ticker);
  if (!record) return { status: 200, body: { found: false, reason: "no_data", ticker: entry.ticker, disclaimer: DISCLAIMER } };
  const requested = requestedStatement ? [requestedStatement] : STATEMENT_NAMES;
  const statements = Object.fromEntries(requested.map((statement) => [statement, record.statements[statement] ?? null]));
  return { status: 200, body: {
    found: true, ticker: entry.ticker, as_of: record.as_of,
    source: "Benten legacy financial snapshot; filing source, unit, and fact kind unverified",
    disclaimer: DISCLAIMER, statements,
  } };
}
