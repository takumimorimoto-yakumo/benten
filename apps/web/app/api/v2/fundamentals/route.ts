import { NextResponse } from "next/server";

import {
  getFundamentalsV2,
  invalidResult,
  parseV2Query,
  publicResultStatus,
  serviceUnavailableResult,
} from "@/lib/public-v2";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const parsed = parseV2Query(new URL(request.url).searchParams);
    const result = parsed.ok ? getFundamentalsV2(parsed.identifier) : invalidResult(parsed.reason);
    return NextResponse.json(result, { status: publicResultStatus(result) });
  } catch {
    const result = serviceUnavailableResult();
    return NextResponse.json(result, { status: publicResultStatus(result) });
  }
}
