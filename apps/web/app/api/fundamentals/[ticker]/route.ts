import { NextResponse } from "next/server";
import { getFundamentalsSnapshot, resolveTicker } from "@benten/registry";

import { DISCLAIMER } from "@/lib/disclaimer";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
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

  const record = getFundamentalsSnapshot(entry.ticker);
  if (!record) {
    return NextResponse.json({
      found: false,
      reason: "no_data",
      ticker: entry.ticker,
      disclaimer: DISCLAIMER,
    });
  }

  return NextResponse.json({
    found: true,
    ticker: entry.ticker,
    as_of: record.as_of,
    source: "Benten legacy financial snapshot; filing source, unit, and fact kind unverified",
    disclaimer: DISCLAIMER,
    data: record.data,
  });
}
