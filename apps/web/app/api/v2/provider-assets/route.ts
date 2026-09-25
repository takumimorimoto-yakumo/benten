import { NextResponse } from "next/server";

import {
  getProviderAssetsV2,
  parseProviderQuery,
  providerInvalidResult,
  providerResultStatus,
  providerServiceUnavailableResult,
} from "@/lib/public-v2";

export const runtime = "nodejs";

/**
 * Read-only projection of the bundled provider-assets artifact. Every value is
 * provider-reported: an identity, a rights claim or a reference number. It is
 * never a quote, an executable price, a NAV, an audited valuation or an xStock.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const parsed = parseProviderQuery(new URL(request.url).searchParams);
    const result = parsed.ok ? getProviderAssetsV2(parsed.selector) : providerInvalidResult();
    return NextResponse.json(result, { status: providerResultStatus(result) });
  } catch {
    const result = providerServiceUnavailableResult();
    return NextResponse.json(result, { status: providerResultStatus(result) });
  }
}
