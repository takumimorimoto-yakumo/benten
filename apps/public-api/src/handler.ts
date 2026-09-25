import { SOLANA_RPC_RELAY_PATH, type RelayHandler } from "@benten/solana-rpc-relay";
import { PRICES_PATH } from "@benten/pricing/config";
import { MCP_PATH } from "@benten/mcp/config";
import { handleRequest } from "./app.js";
import type { PricesHandler } from "./prices.js";
import type { McpHandler } from "./mcp.js";

export type PublicApiHandler = (request: Request) => Promise<Response>;

/**
 * Compose the facts API. `handleRequest` stays the snapshot-only, network-free
 * facts dispatcher for the four LR-HTTP-1 routes and the unknown-path 404.
 * The only other route is the read-only Solana RPC relay at
 * `SOLANA_RPC_RELAY_PATH` and the read-only Pyth reference prices at
 * `PRICES_PATH`, the two exceptions to snapshot-only runtime (2026-09-24 user
 * decisions); they are dispatched here before the facts routes, so no facts
 * route can reach the network. The remote MCP endpoint at `MCP_PATH` serves
 * the same read-only tools as the stdio MCP server to chat connectors.
 */
export function createPublicApiHandler(options: { relay: RelayHandler; prices: PricesHandler; mcp: McpHandler }): PublicApiHandler {
  return async (request) => {
    const { pathname } = new URL(request.url);
    if (pathname === SOLANA_RPC_RELAY_PATH) return options.relay(request);
    if (pathname === PRICES_PATH) return options.prices(request);
    if (pathname === MCP_PATH) return options.mcp(request);
    return handleRequest(request);
  };
}
