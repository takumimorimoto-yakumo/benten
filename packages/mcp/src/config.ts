/**
 * Contract and limits of the remote MCP endpoint (Streamable HTTP,
 * stateless, JSON responses). One place for every constant the endpoint, its
 * hosts and the public-Web ingress share. This module has no runtime
 * dependency, so the ingress can import it without loading the MCP SDK.
 */

/** The one path the remote MCP endpoint is served on. */
export const MCP_PATH = "/api/mcp";

/** Maximum accepted request body, in bytes. A tools/call with every optional argument is well below 4 KB. */
export const MCP_MAX_BODY_BYTES = 64 * 1024;

/**
 * Maximum response body, in bytes. A larger answer is replaced by a JSON-RPC
 * internal error instead of being sent. The largest tool answer over the
 * bundled data (get_financials with the full fiscal-year range, measured
 * over every ticker on 2026-09-25) is about 740 KiB.
 */
export const MCP_MAX_RESPONSE_BYTES = 1024 * 1024;

/**
 * Per-client request budget: at most `MCP_RATE_LIMIT_MAX_REQUESTS` HTTP
 * requests per `MCP_RATE_LIMIT_WINDOW_MS`. A connector conversation issues
 * initialize, tools/list and a handful of tools/call per turn, so an honest
 * client stays well below it. Per server instance, like the relay's limit.
 */
export const MCP_RATE_LIMIT_WINDOW_MS = 60_000;
export const MCP_RATE_LIMIT_MAX_REQUESTS = 60;

/**
 * Per-client budget of the `prepare_purchase` tool, counted per tool call and
 * on top of the request budget: at most `MCP_PURCHASE_RATE_LIMIT_MAX_CALLS`
 * calls per `MCP_RATE_LIMIT_WINDOW_MS`, per server instance. A spent budget
 * answers the tool's own `rate_limited` result.
 */
export const MCP_PURCHASE_RATE_LIMIT_MAX_CALLS = 10;

/**
 * Server-only environment variable holding a comma-separated list of exact
 * browser origins allowed to call the endpoint in addition to the site's own
 * origin. Requests without an Origin header (connectors calling from their
 * servers) do not need it.
 */
export const MCP_ALLOWED_ORIGINS_ENV = "BENTEN_MCP_ALLOWED_ORIGINS";

/**
 * Server-only environment variable holding the canonical site origin (for
 * example `https://benten.example`) that `prepare_purchase` links point at.
 * Unset or not an exact http(s) origin, the link uses the request `Host`.
 */
export const SITE_ORIGIN_ENV = "BENTEN_SITE_ORIGIN";

/** Methods the stateless endpoint accepts; GET (SSE stream) and DELETE (session end) need a session. */
export const MCP_ALLOW = "POST";

/** Request headers a host forwards to the endpoint; nothing else from the client (cookies, authorization) crosses. */
export const MCP_FORWARDED_REQUEST_HEADERS = [
  "accept", "content-length", "content-type", "host", "mcp-protocol-version", "origin", "sec-fetch-site",
] as const;
/** Response headers a host forwards back to the client. */
export const MCP_FORWARDED_RESPONSE_HEADERS: ReadonlySet<string> = new Set([
  "allow", "cache-control", "content-type", "retry-after",
]);
