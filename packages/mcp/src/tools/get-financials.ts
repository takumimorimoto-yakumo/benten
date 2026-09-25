import {
  getFinancialsSnapshot,
  isStatementName,
  resolveTicker,
  STATEMENT_NAMES,
  type StatementName,
} from "@benten/registry";
import { buildEnvelope, type Envelope } from "../lib/envelope.js";
import { REGISTRY_AS_OF } from "../lib/constants.js";

export type { StatementName };

export interface GetFinancialsInput {
  ticker: string;
  statement?: StatementName;
}

export interface FinancialsNotFound {
  found: false;
  ticker: string;
  reason: "unknown_ticker" | "not_covered" | "no_data" | "invalid_statement";
  exclusion_reason: string | null;
}

type StatementRow = Record<string, unknown> | null;

export interface FinancialsData {
  found: true;
  ticker: string;
  statements: Partial<Record<StatementName, StatementRow>>;
}

export async function getFinancials(
  input: GetFinancialsInput,
): Promise<Envelope<FinancialsNotFound | FinancialsData>> {
  const entry = resolveTicker(input.ticker);

  if (!entry) {
    return buildEnvelope(
      { found: false, ticker: input.ticker, reason: "unknown_ticker", exclusion_reason: null },
      REGISTRY_AS_OF,
      "static registry",
    );
  }

  if (!entry.fundamentals_available) {
    return buildEnvelope(
      { found: false, ticker: entry.ticker, reason: "not_covered", exclusion_reason: entry.exclusion_reason },
      REGISTRY_AS_OF,
      "static registry",
    );
  }

  if (input.statement !== undefined && !isStatementName(input.statement)) {
    return buildEnvelope(
      { found: false, ticker: entry.ticker, reason: "invalid_statement", exclusion_reason: null },
      REGISTRY_AS_OF,
      "static registry",
    );
  }

  const record = getFinancialsSnapshot(entry.ticker);
  if (!record) {
    return buildEnvelope(
      { found: false, ticker: entry.ticker, reason: "no_data", exclusion_reason: null },
      REGISTRY_AS_OF,
      "Benten financial snapshot",
    );
  }

  const requested = input.statement ? [input.statement] : STATEMENT_NAMES;
  const statements = Object.fromEntries(
    requested.map((statement) => [statement, record.statements[statement] ?? null]),
  ) as FinancialsData["statements"];

  return buildEnvelope(
    { found: true, ticker: entry.ticker, statements },
    record.as_of,
    "Benten legacy financial snapshot; filing source, unit, and fact kind unverified",
  );
}
