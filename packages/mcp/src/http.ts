/**
 * Streamable HTTP binding of the Benten MCP server for a remote connector:
 * stateless (no session id), JSON responses (no SSE stream), one fresh server
 * and transport per request so nothing is shared between callers.
 *
 * The caller (the HTTP host) owns the transport-level defenses before this
 * runs: method, Origin check, rate limit and the request byte bound; it hands
 * over the already-parsed JSON body. Tool inputs are still gated by the
 * registry allowlist inside each tool.
 */
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createServer, type ServerOptions } from "./server.js";

export type { ServerOptions } from "./server.js";
export type { PurchaseQuoteReader, PurchaseQuoteResult } from "./tools/prepare-purchase.js";

export async function handleMcpHttpRequest(request: Request, parsedBody: unknown, options: ServerOptions = {}): Promise<Response> {
  const server = createServer(options);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request, { parsedBody });
    // The JSON body is complete once handleRequest resolves in JSON-response mode.
    const body = await response.arrayBuffer();
    const headers = new Headers(response.headers);
    headers.set("cache-control", "no-store");
    return new Response(body.byteLength === 0 ? null : body, { status: response.status, headers });
  } finally {
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}
