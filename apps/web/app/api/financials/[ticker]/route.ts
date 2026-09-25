import { NextResponse } from "next/server";
import {
  getFinancialsSnapshot,
  isStatementName,
  resolveTicker,
  STATEMENT_NAMES,
} from "@benten/registry";

import { DISCLAIMER } from "@/lib/disclaimer";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: { ticker: string } },
): Promise<NextResponse> {
  const entry = resolveTicker(params.ticker);
  if (!entry) {
    return NextResponse.json(
      { found: false, reason: "unknown_ticker", ticker: params.ticker, disclaimer: DISCLAIMER },
      { status: 404 },
    );
  }
  if (!entry.fundamentals_available) {
    return NextResponse.json({
      found: false,
      reason: "not_covered",
      ticker: entry.ticker,
      exclusion_reason: entry.exclusion_reason,
      disclaimer: DISCLAIMER,
    });
  }

  const requestedStatement = new URL(request.url).searchParams.get("statement");
  if (requestedStatement !== null && !isStatementName(requestedStatement)) {
    return NextResponse.json(
      { found: false, reason: "invalid_statement", ticker: entry.ticker, disclaimer: DISCLAIMER },
      { status: 400 },
    );
  }

  const record = getFinancialsSnapshot(entry.ticker);
  if (!record) {
    return NextResponse.json({
      found: false,
      reason: "no_data",
      ticker: entry.ticker,
      disclaimer: DISCLAIMER,
    });
  }

  const requested = requestedStatement ? [requestedStatement] : STATEMENT_NAMES;
  const statements = Object.fromEntries(
    requested.map((statement) => [statement, record.statements[statement] ?? null]),
  );

  return NextResponse.json({
    found: true,
    ticker: entry.ticker,
    as_of: record.as_of,
    source: "Benten legacy financial snapshot; filing source, unit, and fact kind unverified",
    disclaimer: DISCLAIMER,
    statements,
  });
}
