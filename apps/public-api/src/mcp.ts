/**
 * `POST /api/mcp`: the remote MCP endpoint (Streamable HTTP, stateless, JSON
 * responses) for chat connectors. It exposes the same tools as the stdio
 * server from `@benten/mcp`, read-only, with no authentication.
 *
 * Transport-level defenses, applied before the MCP layer sees the request:
 *  - `POST` only; GET (SSE) and DELETE (session end) need a session, which a
 *    stateless endpoint does not have, so they get 405 with `Allow: POST`;
 *  - Origin: a request without `Origin` is a server-side caller (a connector)
 *    and is accepted; a request with `Origin` is a browser and is accepted
 *    only from the site's own origin or the configured allowlist, which
 *    blocks DNS-rebinding and cross-site browser calls;
 *  - a per-client request budget and a request byte bound, and a separate
 *    per-client budget of `prepare_purchase` tool calls;
 *  - a single JSON-RPC message per request: a batch (a JSON array) gets 400,
 *    as protocol revision 2025-06-18 removed batching;
 *  - a response byte bound: a larger answer becomes a JSON-RPC error.
 * Tool inputs are resolved through the registry allowlist inside each tool.
 */

import {
  ALLOWED_ORIGINS_ENV,
  RATE_LIMIT_MAX_TRACKED_CLIENTS,
  allowedOrigins,
  clientKeyOf,
  createRateLimiter,
  readBoundedText,
  type RelayEnvironment,
  type RelayRateLimiter,
} from "@benten/solana-rpc-relay";
import {
  MCP_ALLOW,
  MCP_ALLOWED_ORIGINS_ENV,
  MCP_MAX_BODY_BYTES,
  MCP_MAX_RESPONSE_BYTES,
  MCP_PURCHASE_RATE_LIMIT_MAX_CALLS,
  MCP_RATE_LIMIT_MAX_REQUESTS,
  MCP_RATE_LIMIT_WINDOW_MS,
  SITE_ORIGIN_ENV,
} from "@benten/mcp/config";
import { handleMcpHttpRequest, type PurchaseQuoteReader } from "@benten/mcp/http";

export type McpHandler = (request: Request) => Promise<Response>;

export interface McpHandlerOptions {
  /** Server environment, for example `process.env`. Read on every request. */
  env: RelayEnvironment;
  now?: () => number;
  rateLimiter?: RelayRateLimiter;
  /** Per-client `prepare_purchase` budget, counted per tool call. */
  purchaseRateLimiter?: RelayRateLimiter;
  /**
   * Host-provided quote reader of the fixed purchase route. When present,
   * `prepare_purchase` is offered; it reads the server-configured upstream
   * RPC and builds, signs and sends nothing.
   */
  purchaseQuote?: PurchaseQuoteReader;
  /** Response byte bound; defaults to `MCP_MAX_RESPONSE_BYTES`. A test seam. */
  maxResponseBytes?: number;
}

/** JSON-RPC error codes used before a request reaches the MCP layer. */
const JSON_RPC = { parseError: -32700, invalidRequest: -32600, internalError: -32603, callerNotAllowed: -32001, rateLimited: -32005 } as const;
const HEADERS = { "cache-control": "no-store", "content-type": "application/json" } as const;

type RpcId = string | number | null;

function rpcError(status: number, code: number, message: string, extra: Record<string, string> = {}, id: RpcId = null): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }), { status, headers: { ...HEADERS, ...extra } });
}

/** The id of a single JSON-RPC request, or `null` when it has none (a notification or a malformed message). */
function requestIdOf(message: unknown): RpcId {
  if (typeof message !== "object" || message === null) return null;
  const id = (message as { id?: unknown }).id;
  return typeof id === "string" || (typeof id === "number" && Number.isFinite(id)) ? id : null;
}

/** Pass a response through only when its body fits `maxBytes`. */
async function boundedResponse(response: Response, id: RpcId, maxBytes: number): Promise<Response> {
  const body = await response.arrayBuffer();
  if (body.byteLength > maxBytes) return rpcError(500, JSON_RPC.internalError, "response too large", {}, id);
  return new Response(body.byteLength === 0 ? null : body, { status: response.status, headers: response.headers });
}

function splitList(value: string | undefined): string[] {
  return (value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);
}

/** The configured canonical site origin, when it is exactly an http(s) origin (no path, query or trailing slash). */
function configuredSiteOrigin(value: string | undefined): string | null {
  const text = value?.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    return (url.protocol === "https:" || url.protocol === "http:") && url.origin === text ? text : null;
  } catch {
    return null;
  }
}

/**
 * The site origin a `prepare_purchase` link points at: the configured
 * canonical origin (`BENTEN_SITE_ORIGIN`), else the origin the request
 * addressed, from `Host` (the edge sets it), by the relay's own-origin rule:
 * `http` for a loopback host, `https` otherwise. `null` for neither.
 */
export function siteOriginOf(headers: Headers, env: RelayEnvironment = {}): string | null {
  const configured = configuredSiteOrigin(env[SITE_ORIGIN_ENV]);
  if (configured) return configured;
  const origins = [...allowedOrigins(headers, undefined)];
  return origins.find((origin) => origin.startsWith("http://")) ?? origins[0] ?? null;
}

/** `null` when the caller may proceed. A missing Origin is a server-side connector, not a browser. */
export function mcpOriginRejection(headers: Headers, env: RelayEnvironment): string | null {
  const origin = headers.get("origin");
  if (origin === null) return null;
  const allowed = allowedOrigins(headers, env[ALLOWED_ORIGINS_ENV]);
  for (const extra of splitList(env[MCP_ALLOWED_ORIGINS_ENV])) allowed.add(extra);
  return allowed.has(origin) ? null : "caller origin not allowed";
}

export function createMcpHandler(options: McpHandlerOptions): McpHandler {
  const now = options.now ?? Date.now;
  const maxResponseBytes = options.maxResponseBytes ?? MCP_MAX_RESPONSE_BYTES;
  const purchaseRateLimiter = options.purchaseRateLimiter ?? createRateLimiter({
    windowMs: MCP_RATE_LIMIT_WINDOW_MS,
    maxCalls: MCP_PURCHASE_RATE_LIMIT_MAX_CALLS,
    maxClients: RATE_LIMIT_MAX_TRACKED_CLIENTS,
  });
  const rateLimiter = options.rateLimiter ?? createRateLimiter({
    windowMs: MCP_RATE_LIMIT_WINDOW_MS,
    maxCalls: MCP_RATE_LIMIT_MAX_REQUESTS,
    maxClients: RATE_LIMIT_MAX_TRACKED_CLIENTS,
  });
  return async (request) => {
    const method = request.method.toUpperCase();
    if (method !== "POST") {
      await request.body?.cancel().catch(() => undefined);
      return new Response(null, { status: 405, headers: { allow: MCP_ALLOW, "cache-control": "no-store" } });
    }
    const rejection = mcpOriginRejection(request.headers, options.env);
    if (rejection) {
      await request.body?.cancel().catch(() => undefined);
      return rpcError(403, JSON_RPC.callerNotAllowed, rejection);
    }
    const clientKey = clientKeyOf(request.headers);
    const decision = rateLimiter.take(clientKey, 1, now());
    if (!decision.allowed) {
      await request.body?.cancel().catch(() => undefined);
      return rpcError(429, JSON_RPC.rateLimited, "rate limit reached", { "retry-after": String(decision.retryAfterSeconds) });
    }
    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > MCP_MAX_BODY_BYTES) {
      await request.body?.cancel().catch(() => undefined);
      return rpcError(413, JSON_RPC.invalidRequest, "request body too large");
    }
    const text = await readBoundedText(request.body, MCP_MAX_BODY_BYTES).catch(() => null);
    if (text === null) return rpcError(413, JSON_RPC.invalidRequest, "request body too large");
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(text);
    } catch {
      return rpcError(400, JSON_RPC.parseError, "request body is not JSON");
    }
    if (Array.isArray(parsedBody)) return rpcError(400, JSON_RPC.invalidRequest, "batch requests are not supported");
    try {
      // The body is already consumed; the transport reads only headers and the parsed body.
      const forwarded = new Request(request.url, { method, headers: request.headers });
      const purchase = options.purchaseQuote ? {
        quote: options.purchaseQuote,
        siteOrigin: siteOriginOf(request.headers, options.env),
        admit: () => purchaseRateLimiter.take(clientKey, 1, now()).allowed,
      } : undefined;
      return await boundedResponse(await handleMcpHttpRequest(forwarded, parsedBody, purchase ? { purchase } : {}), requestIdOf(parsedBody), maxResponseBytes);
    } catch {
      return rpcError(500, JSON_RPC.internalError, "internal error");
    }
  };
}
