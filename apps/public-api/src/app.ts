import { ALLOW, DISCLAIMER, JSON_HEADERS } from "./constants.js";
import { legacyFinancials, legacyFundamentals } from "./presenters/legacy-v1.js";
import { financialsResult, fundamentalsResult, statusForPublicResult } from "./presenters/public-v2.js";

function json(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function isKnownPath(pathname: string): boolean {
  return /^\/api\/(?:fundamentals|financials)\/[^/]+$/.test(pathname)
    || pathname === "/api/v2/fundamentals"
    || pathname === "/api/v2/financials";
}

function withoutBody(response: Response): Response {
  return new Response(null, { status: response.status, headers: response.headers });
}

function methodResponse(method: string): Response | null {
  if (method === "GET" || method === "HEAD") return null;
  if (method === "OPTIONS") return new Response(null, {
    status: 204,
    headers: { "allow": ALLOW, "cache-control": "no-store" },
  });
  return new Response(null, {
    status: 405,
    headers: { "allow": ALLOW, "cache-control": "no-store" },
  });
}

function dispatchGet(url: URL): Response {
  const fundamentalsV1 = /^\/api\/fundamentals\/([^/]+)$/.exec(url.pathname);
  if (fundamentalsV1) {
    const result = legacyFundamentals(decodeURIComponent(fundamentalsV1[1]!));
    return json(result.body, result.status);
  }
  const financialsV1 = /^\/api\/financials\/([^/]+)$/.exec(url.pathname);
  if (financialsV1) {
    const result = legacyFinancials(decodeURIComponent(financialsV1[1]!), url.searchParams);
    return json(result.body, result.status);
  }
  if (url.pathname === "/api/v2/fundamentals") {
    const result = fundamentalsResult(url.searchParams);
    return json(result, statusForPublicResult(result));
  }
  if (url.pathname === "/api/v2/financials") {
    const result = financialsResult(url.searchParams);
    return json(result, statusForPublicResult(result));
  }
  return json({ error: { code: "unknown_endpoint" }, disclaimer: DISCLAIMER }, 404);
}

export function handleRequest(request: Request): Response {
  const method = request.method.toUpperCase();
  const url = new URL(request.url);
  if (!isKnownPath(url.pathname)) {
    const response = json({ error: { code: "unknown_endpoint" }, disclaimer: DISCLAIMER }, 404);
    return method === "HEAD" ? withoutBody(response) : response;
  }
  const methodResult = methodResponse(method);
  if (methodResult) return methodResult;
  const response = dispatchGet(url);
  return method === "HEAD" ? withoutBody(response) : response;
}
