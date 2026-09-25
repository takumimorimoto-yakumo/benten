import { NextResponse, type NextRequest } from "next/server";
import { findCompany, findProviderAsset, resolveTicker } from "@benten/registry";
import { isLocale, localeFromPathname } from "@/lib/i18n/config";

function isUnknownPublicPage(pathname: string): boolean {
  const parts = pathname.split("/").filter(Boolean);
  if (!parts.length) return false;
  if (parts[0] === "api" || parts[0] === "_next" || parts[0] === "dev" || parts[0] === "benten-not-found" || parts[0] === "favicon.ico") return false;
  const explicitlyLocalized = isLocale(parts[0]);
  const locale = explicitlyLocalized ? parts.shift() : "en";
  if (explicitlyLocalized && locale === "en") return true;
  if (parts[0] && isLocale(parts[0])) return true;
  if (!parts.length) return false;
  if (parts[0] === "company") {
    // The slug is Benten's own lowercase identifier: exact raw match only, so
    // other casings, percent-encodings and trailing segments are 404, not redirects.
    return parts.length !== 2 || !findCompany(parts[1]);
  }
  if (parts[0] === "provider") {
    if (parts.length !== 3) return true;
    let provider: string; let providerAssetId: string;
    try { provider = decodeURIComponent(parts[1]); providerAssetId = decodeURIComponent(parts[2]); } catch { return true; }
    if (provider !== provider.trim() || providerAssetId !== providerAssetId.trim()) return true;
    return !findProviderAsset(provider, providerAssetId);
  }
  let ticker: string;
  try { ticker = decodeURIComponent(parts[1] ?? ""); } catch { return true; }
  return parts.length !== 2 || parts[0] !== "stock" || ticker !== ticker.trim() || !resolveTicker(ticker);
}

export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  // Never trust a caller-provided locale header: derive both values from the URL.
  requestHeaders.delete("x-benten-locale");
  requestHeaders.delete("x-benten-pathname");
  requestHeaders.delete("x-benten-not-found-internal");
  requestHeaders.set("x-benten-locale", localeFromPathname(request.nextUrl.pathname));
  requestHeaders.set("x-benten-pathname", request.nextUrl.pathname);
  if (request.nextUrl.pathname === "/benten-not-found") {
    requestHeaders.set("x-benten-not-found-internal", "1");
    return NextResponse.rewrite(request.nextUrl, { request: { headers: requestHeaders }, status: 404 });
  }
  if (isUnknownPublicPage(request.nextUrl.pathname)) {
    const destination = request.nextUrl.clone();
    destination.pathname = "/benten-not-found";
    return NextResponse.rewrite(destination, { request: { headers: requestHeaders }, status: 404 });
  }
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  // This must include API and internal 404 routes: the root layout reads only
  // the request headers produced here, never caller-provided values.
  matcher: ["/:path*"],
};
