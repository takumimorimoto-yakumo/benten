/**
 * Pure Web-ingress routing policy. A future host adapter supplies only the
 * generated static path set and performs the chosen fixed-origin rewrites.
 * Callers must supply the raw origin-form request target (for example,
 * `/stock/NVDA?source=home`) before a URL parser can normalize it. This
 * module validates raw path and query bytes once, then forwards the accepted
 * raw query unchanged in its decision. No API target, credential, or browser
 * application code lives here.
 */

import { PRICES_PATH } from "@benten/pricing/config";
import { SOLANA_RPC_RELAY_PATH } from "@benten/solana-rpc-relay/config";
import { MCP_PATH } from "@benten/mcp/config";

export type WebIngressDecision =
  | { kind: "proxy_acquisition"; pathname: string; search: string }
  | { kind: "proxy_solana_rpc"; pathname: string; search: string }
  | { kind: "proxy_prices"; pathname: string; search: string }
  | { kind: "proxy_mcp"; pathname: string; search: string }
  | { kind: "proxy_facts"; pathname: string; search: string }
  | { kind: "static"; pathname: string; search: string }
  | { kind: "canonical_redirect"; status: 308; location: string }
  | { kind: "html_not_found"; status: 404 };

export type WebIngressContext = {
  staticPaths: ReadonlySet<string>;
};

const supportedLocalePrefixes = new Set(["ja", "ko", "zh-Hans", "zh-Hant"]);
const CONTROL_OR_DEL = /[\u0000-\u001f\u007f]/;

function hasDecodedControlOrDel(value: string): boolean {
  try {
    return CONTROL_OR_DEL.test(decodeURIComponent(value));
  } catch {
    return true;
  }
}

function oneDecodePathname(pathname: string): string[] | null {
  if (!pathname.startsWith("/") || pathname.includes("\\") || pathname.includes("//")) return null;
  const encodedSegments = pathname.slice(1).split("/");
  if (encodedSegments.length === 1 && encodedSegments[0] === "") return [];
  if (encodedSegments.some((segment) => segment === "")) return null;

  const decoded: string[] = [];
  for (const segment of encodedSegments) {
    let value: string;
    try {
      value = decodeURIComponent(segment);
    } catch {
      return null;
    }
    if (
      !value
      || value === "."
      || value === ".."
      || value !== value.trim()
      || value.includes("/")
      || value.includes("\\")
      || value.includes("%")
      || CONTROL_OR_DEL.test(value)
    ) return null;
    decoded.push(value);
  }
  return decoded;
}

function parseOriginForm(input: string): { url: URL; rawSearch: string } | null {
  if (
    typeof input !== "string"
    || !input.startsWith("/")
    || input.startsWith("//")
    || /\s/.test(input)
    || input.includes("\\")
    || CONTROL_OR_DEL.test(input)
    || input.includes("#")
  ) return null;

  const queryOffset = input.indexOf("?");
  const rawPathname = queryOffset === -1 ? input : input.slice(0, queryOffset);
  const rawSearch = queryOffset === -1 ? "" : input.slice(queryOffset);
  if (!oneDecodePathname(rawPathname) || hasDecodedControlOrDel(rawSearch.slice(1))) return null;

  try {
    return { url: new URL(input, "https://public-web.invalid"), rawSearch };
  } catch {
    return null;
  }
}

function canonicalDossierPath(segments: readonly string[], staticPaths: ReadonlySet<string>): string | null {
  let localePrefix = "";
  let ticker: string | undefined;

  if (segments.length === 2 && segments[0] === "stock") {
    ticker = segments[1];
  } else if (segments.length === 3 && supportedLocalePrefixes.has(segments[0]) && segments[1] === "stock") {
    localePrefix = `/${segments[0]}`;
    ticker = segments[2];
  } else {
    return null;
  }

  const canonical = `${localePrefix}/stock/${ticker.toUpperCase()}`;
  return staticPaths.has(canonical) ? canonical : null;
}

/**
 * Classify one URL in the required ingress order. Unknown/malformed requests
 * intentionally never become a static document or a mock financial success.
 */
export function classifyWebIngress(input: string, context: WebIngressContext): WebIngressDecision {
  const parsed = parseOriginForm(input);
  if (!parsed) return { kind: "html_not_found", status: 404 };
  const { pathname } = parsed.url;
  const { rawSearch: search } = parsed;

  if (pathname === "/api/acquisition" || pathname.startsWith("/api/acquisition/")) {
    return { kind: "proxy_acquisition", pathname, search };
  }
  // The read-only Solana RPC relay is the one exact API path that is not a
  // snapshot facts route; only this decision may carry a request body.
  if (pathname === SOLANA_RPC_RELAY_PATH) {
    return { kind: "proxy_solana_rpc", pathname, search };
  }
  // Pyth reference prices: the other exact API path that reads the network.
  // Like the relay it needs the caller-check headers; unlike it, no body.
  if (pathname === PRICES_PATH) {
    return { kind: "proxy_prices", pathname, search };
  }
  // The remote MCP endpoint: a body-carrying exact path with its own
  // forwarded-header allowlist (the connector's Accept and protocol version).
  if (pathname === MCP_PATH) {
    return { kind: "proxy_mcp", pathname, search };
  }
  if (pathname === "/api" || pathname.startsWith("/api/")) {
    return { kind: "proxy_facts", pathname, search };
  }
  if (context.staticPaths.has(pathname)) return { kind: "static", pathname, search };

  const segments = oneDecodePathname(pathname);
  const canonical = segments ? canonicalDossierPath(segments, context.staticPaths) : null;
  if (canonical && canonical !== pathname) {
    return { kind: "canonical_redirect", status: 308, location: `${canonical}${search}` };
  }
  return { kind: "html_not_found", status: 404 };
}
