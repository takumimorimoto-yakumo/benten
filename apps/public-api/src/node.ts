import { createServer, type IncomingMessage, type Server } from "node:http";
import { Readable } from "node:stream";
import { createSolanaRpcRelayHandler, SOLANA_RPC_RELAY_PATH, type RelayEnvironment } from "@benten/solana-rpc-relay";
import { createPublicApiHandler, type PublicApiHandler } from "./handler.js";
import { createPricesHandler } from "./prices.js";
import { createMcpHandler } from "./mcp.js";
import { MCP_PATH } from "@benten/mcp/config";
import type { PurchaseQuoteReader } from "@benten/mcp/http";

export interface PublicApiServer {
  origin: string;
  close(): Promise<void>;
}

export interface PublicApiOptions {
  host?: string;
  port?: number;
  /**
   * Server environment for the Solana RPC relay (upstream URL and allowed
   * origins). Defaults to `process.env`; it is never a request input.
   */
  env?: RelayEnvironment;
  /** Test seam for the relay's upstream call; defaults to the global `fetch`. */
  relayFetch?: typeof fetch;
  /** Test seam for the prices route's upstream call; defaults to the global `fetch`. */
  pricesFetch?: typeof fetch;
  /**
   * Quote reader of the fixed purchase route for the MCP `prepare_purchase`
   * tool, provided by the host (it bundles `@benten/purchase/server-quote`).
   * Without it the tool is not offered.
   */
  purchaseQuote?: PurchaseQuoteReader;
}

/**
 * Only the relay and MCP routes receive the request body; each reads it with
 * its own byte bound. Facts routes never see a body, as before.
 */
function toRequest(incoming: IncomingMessage, requestUrl: URL): Request {
  const method = incoming.method ?? "GET";
  const headers = incoming.headers as HeadersInit;
  const carriesBody = requestUrl.pathname === SOLANA_RPC_RELAY_PATH || requestUrl.pathname === MCP_PATH;
  if (!carriesBody || method === "GET" || method === "HEAD") {
    return new Request(requestUrl, { method, headers });
  }
  return new Request(requestUrl, {
    method,
    headers,
    body: Readable.toWeb(incoming) as ReadableStream<Uint8Array>,
    duplex: "half",
  } as RequestInit);
}

export type PublicApiEnvironmentOptions = Pick<PublicApiOptions, "env" | "relayFetch" | "pricesFetch" | "purchaseQuote">;

/**
 * The composed facts API (facts routes, relay, prices, MCP) over one server
 * environment. Every host uses this one composition: the loopback server
 * below and the hosted function adapter. One handler is one instance, so the
 * relay and prices rate limits and the prices cache are per handler.
 */
export function createEnvironmentPublicApiHandler(options: PublicApiEnvironmentOptions = {}): PublicApiHandler {
  const env = options.env ?? process.env;
  return createPublicApiHandler({
    relay: createSolanaRpcRelayHandler({
      env,
      ...(options.relayFetch ? { fetchImpl: options.relayFetch } : {}),
    }),
    prices: createPricesHandler({
      env,
      ...(options.pricesFetch ? { fetchImpl: options.pricesFetch } : {}),
    }),
    mcp: createMcpHandler({
      env,
      ...(options.purchaseQuote ? { purchaseQuote: options.purchaseQuote } : {}),
    }),
  });
}

export async function startPublicApi(options: PublicApiOptions = {}): Promise<PublicApiServer> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 0;
  const handle = createEnvironmentPublicApiHandler(options);
  const server: Server = createServer(async (incoming, outgoing) => {
    try {
      const requestUrl = new URL(incoming.url ?? "/", `http://${host}`);
      const response = await handle(toRequest(incoming, requestUrl));
      outgoing.statusCode = response.status;
      response.headers.forEach((value, key) => outgoing.setHeader(key, value));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      outgoing.statusCode = 500;
      outgoing.setHeader("cache-control", "no-store");
      outgoing.end();
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("public API did not bind a TCP address");
  return {
    origin: `http://${host}:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}
