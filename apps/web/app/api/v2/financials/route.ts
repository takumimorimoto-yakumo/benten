import { NextResponse } from "next/server";

import {
  getFinancialsV2,
  invalidResult,
  parseV2Query,
  publicResultStatus,
  serviceUnavailableResult,
} from "@/lib/public-v2";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const parsed = parseV2Query(new URL(request.url).searchParams, true);
    const result = parsed.ok
      ? getFinancialsV2({ ...parsed.identifier, ...(parsed.statement !== undefined ? { statement: parsed.statement } : {}) })
      : invalidResult(parsed.reason);
    return NextResponse.json(result, { status: publicResultStatus(result) });
  } catch {
    const result = serviceUnavailableResult();
    return NextResponse.json(result, { status: publicResultStatus(result) });
  }
}
