import { request as httpRequest, type IncomingHttpHeaders, type IncomingMessage, type ServerResponse } from "node:http";
import { MCP_FORWARDED_REQUEST_HEADERS, MCP_FORWARDED_RESPONSE_HEADERS } from "@benten/mcp/config";

export type FixedFactsProxy = {
  readonly origin: string;
};

export const FORWARDED_RESPONSE_HEADERS: ReadonlySet<string> = new Set([
  "allow",
  "cache-control",
  "content-type",
  "etag",
  "last-modified",
  "x-benten-artifact-revision",
]);

/**
 * The Solana RPC relay is the only proxied route that carries a request body.
 * Its caller check, and the same check on the Pyth prices route, needs the
 * browser's own `Origin`, `Sec-Fetch-Site` and the edge `Host`; nothing else
 * from the client (cookies, authorization, forwarding headers) is forwarded.
 */
export const FORWARDED_RELAY_REQUEST_HEADERS = ["content-length", "content-type", "host", "origin", "sec-fetch-site"] as const;
export const FORWARDED_RELAY_RESPONSE_HEADERS: ReadonlySet<string> = new Set(["allow", "cache-control", "content-type", "retry-after"]);

function sendUnavailable(response: ServerResponse, method: string, service: "facts" | CallerCheckedService = "facts") {
  const body = JSON.stringify({ status: "unavailable", service });
  response.writeHead(503, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(method === "HEAD" ? undefined : body);
}

/**
 * Validate the launcher-provided API origin once. This is a process boundary,
 * not a request option: no browser field, forwarded header, URL parameter, or
 * storage key can alter it.
 */
export function createFixedFactsProxy(origin: string): FixedFactsProxy {
  const parsed = new URL(origin);
  if (
    parsed.protocol !== "http:"
    || parsed.hostname !== "127.0.0.1"
    || !parsed.port
    || parsed.username
    || parsed.password
    || parsed.pathname !== "/"
    || parsed.search
    || parsed.hash
  ) throw new TypeError("facts proxy origin must be a bare 127.0.0.1 HTTP origin with an explicit port");
  return { origin: parsed.origin };
}

/** Only the named headers of an API response; every other header is dropped. */
export function pickResponseHeaders(source: Headers, names: ReadonlySet<string>): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const name of names) {
    const value = source.get(name);
    if (value !== null) headers[name] = value;
  }
  return headers;
}

function responseHeaders(source: Headers): Record<string, string> {
  return pickResponseHeaders(source, FORWARDED_RESPONSE_HEADERS);
}

/**
 * Forward one already-classified facts request to the launcher-fixed loopback
 * API. It deliberately forwards no request headers, cookies, body, or origin.
 */
export async function proxyFixedFactsRequest(
  request: IncomingMessage,
  response: ServerResponse,
  proxy: FixedFactsProxy | undefined,
  pathname: string,
  search: string,
) {
  const method = request.method?.toUpperCase() ?? "GET";
  if (!proxy) return sendUnavailable(response, method);
  try {
    const upstream = await fetch(`${proxy.origin}${pathname}${search}`, {
      method,
      redirect: "manual",
    });
    const body = method === "HEAD" ? undefined : Buffer.from(await upstream.arrayBuffer());
    response.writeHead(upstream.status, responseHeaders(upstream.headers));
    response.end(body);
  } catch {
    sendUnavailable(response, method);
  }
}

/**
 * The request headers a caller-checked route may see: the caller-check
 * headers and `X-Real-IP`, which the relay and prices routes key their
 * per-client rate limit on. `clientAddress` is the host's own trusted client
 * address and replaces anything the client sent; with none, no `X-Real-IP`.
 */
export function callerCheckRequestHeaders(
  source: IncomingHttpHeaders,
  clientAddress: string | undefined,
  names: readonly string[] = FORWARDED_RELAY_REQUEST_HEADERS,
): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const name of names) {
    const value = source[name];
    if (typeof value === "string") headers[name] = value;
  }
  if (clientAddress) headers["x-real-ip"] = clientAddress;
  return headers;
}

type CallerCheckedService = "solana-rpc" | "prices" | "mcp";

/** Request and response header allowlists of each caller-checked route. */
const CALLER_CHECKED_HEADERS: Record<CallerCheckedService, { request: readonly string[]; response: ReadonlySet<string> }> = {
  "solana-rpc": { request: FORWARDED_RELAY_REQUEST_HEADERS, response: FORWARDED_RELAY_RESPONSE_HEADERS },
  prices: { request: FORWARDED_RELAY_REQUEST_HEADERS, response: FORWARDED_RELAY_RESPONSE_HEADERS },
  mcp: { request: MCP_FORWARDED_REQUEST_HEADERS, response: MCP_FORWARDED_RESPONSE_HEADERS },
};

/** The request headers of one caller-checked route; the loopback host's client address is the connecting socket. */
export function callerCheckedRequestHeaders(request: IncomingMessage, service: CallerCheckedService, clientAddress: string | undefined): Record<string, string> {
  return callerCheckRequestHeaders(request.headers, clientAddress, CALLER_CHECKED_HEADERS[service].request);
}

/** The response header allowlist of one caller-checked route. */
export function callerCheckedResponseHeaderNames(service: CallerCheckedService): ReadonlySet<string> {
  return CALLER_CHECKED_HEADERS[service].response;
}

function relayResponseHeaders(source: IncomingHttpHeaders, names: ReadonlySet<string>): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const name of names) {
    const value = source[name];
    if (typeof value === "string") headers[name] = value;
  }
  return headers;
}

/**
 * Forward one already-classified request of a network-reading route (the
 * Solana RPC relay or Pyth reference prices) to the same launcher-fixed
 * loopback API with only the caller-check headers. The body, when there is
 * one, is streamed, not parsed: the API route owns the byte bound, method
 * allowlist, signed-byte rejection, caller check and rate limit. `node:http`
 * is used because `fetch` cannot carry the edge `Host` the caller check
 * compares against.
 */
function proxyCallerCheckedRequest(
  request: IncomingMessage,
  response: ServerResponse,
  proxy: FixedFactsProxy | undefined,
  pathname: string,
  search: string,
  service: CallerCheckedService,
): Promise<void> {
  const method = request.method?.toUpperCase() ?? "GET";
  if (!proxy) {
    sendUnavailable(response, method, service);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const headers = callerCheckedRequestHeaders(request, service, request.socket.remoteAddress);
    const upstream = httpRequest(`${proxy.origin}${pathname}${search}`, { method, headers }, (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, relayResponseHeaders(upstreamResponse.headers, callerCheckedResponseHeaderNames(service)));
      upstreamResponse.pipe(response);
      upstreamResponse.once("end", () => resolve());
      upstreamResponse.once("error", () => {
        response.destroy();
        resolve();
      });
    });
    upstream.once("error", () => {
      if (!response.headersSent) sendUnavailable(response, method, service);
      else response.destroy();
      resolve();
    });
    if (method === "GET" || method === "HEAD") upstream.end();
    else request.pipe(upstream);
  });
}

/** Forward one already-classified Solana RPC relay request (see `proxyCallerCheckedRequest`). */
export function proxyFixedSolanaRpcRequest(
  request: IncomingMessage,
  response: ServerResponse,
  proxy: FixedFactsProxy | undefined,
  pathname: string,
  search: string,
): Promise<void> {
  return proxyCallerCheckedRequest(request, response, proxy, pathname, search, "solana-rpc");
}

/**
 * Forward one already-classified Pyth reference prices request. The raw
 * query is passed unchanged; the API route accepts only feed-map feed ids.
 */
export function proxyFixedPricesRequest(
  request: IncomingMessage,
  response: ServerResponse,
  proxy: FixedFactsProxy | undefined,
  pathname: string,
  search: string,
): Promise<void> {
  return proxyCallerCheckedRequest(request, response, proxy, pathname, search, "prices");
}

/**
 * Forward one already-classified remote MCP request with the MCP header
 * allowlist; the API route owns the byte bound, Origin check and rate limit.
 */
export function proxyFixedMcpRequest(
  request: IncomingMessage,
  response: ServerResponse,
  proxy: FixedFactsProxy | undefined,
  pathname: string,
  search: string,
): Promise<void> {
  return proxyCallerCheckedRequest(request, response, proxy, pathname, search, "mcp");
}
