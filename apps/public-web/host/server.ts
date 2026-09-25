import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { classifyWebIngress, type WebIngressContext } from "../ingress/classify.js";
import {
  createFixedFactsProxy,
  proxyFixedFactsRequest,
  proxyFixedMcpRequest,
  proxyFixedPricesRequest,
  proxyFixedSolanaRpcRequest,
  type FixedFactsProxy,
} from "../ingress/local-proxy.js";
import { apiUnavailable, send, sendHostError, sendNotFound, type NotFoundLookup } from "./responses.js";
import { staticInventory, type ClientInventory, type StaticEntry } from "./static-inventory.js";

type CapsuleHostOptions = {
  readonly clientDirectory: string;
  /**
   * Launcher-injected standalone facts API origin; never a browser input.
   * The facts routes, the Solana RPC relay route and the prices route all go only here.
   */
  readonly factsOrigin?: string;
  readonly host?: string;
  readonly port?: number;
};

export type CapsuleHost = Server & { readonly capsuleAddress: string };

function notFoundLookup(notFound: ReadonlyMap<string, StaticEntry>): NotFoundLookup {
  return (documentPath) => {
    const entry = notFound.get(documentPath);
    return entry && { contentType: entry.contentType, body: () => readFile(entry.file) };
  };
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  inventory: ClientInventory,
  factsProxy: FixedFactsProxy | undefined,
) {
  const method = request.method?.toUpperCase() ?? "GET";
  const target = request.url ?? "/";
  const decision = classifyWebIngress(target, { staticPaths: new Set(inventory.pages.keys()) } satisfies WebIngressContext);

  if (decision.kind === "proxy_acquisition") return apiUnavailable(response, method, "acquisition");
  if (decision.kind === "proxy_solana_rpc") return proxyFixedSolanaRpcRequest(request, response, factsProxy, decision.pathname, decision.search);
  if (decision.kind === "proxy_prices") return proxyFixedPricesRequest(request, response, factsProxy, decision.pathname, decision.search);
  if (decision.kind === "proxy_mcp") return proxyFixedMcpRequest(request, response, factsProxy, decision.pathname, decision.search);
  if (decision.kind === "proxy_facts") return proxyFixedFactsRequest(request, response, factsProxy, decision.pathname, decision.search);
  if (decision.kind === "canonical_redirect") return send(response, decision.status, { location: decision.location });
  if (decision.kind === "html_not_found") return sendNotFound(response, method, target, notFoundLookup(inventory.notFound));
  if (method !== "GET" && method !== "HEAD") return send(response, 405, { allow: "GET, HEAD" });

  const entry = inventory.pages.get(decision.pathname);
  if (!entry) return sendNotFound(response, method, target, notFoundLookup(inventory.notFound));
  const body = method === "HEAD" ? undefined : await readFile(entry.file);
  return send(response, 200, { "content-type": entry.contentType, ...(entry.cacheControl ? { "cache-control": entry.cacheControl } : {}) }, body);
}

/** Start a test-only loopback host for the already-built static capsule. */
export async function startCapsuleHost(options: CapsuleHostOptions): Promise<CapsuleHost> {
  const inventory = await staticInventory(options.clientDirectory);
  const factsProxy = options.factsOrigin === undefined ? undefined : createFixedFactsProxy(options.factsOrigin);
  const server = createServer((request, response) => {
    void handleRequest(request, response, inventory, factsProxy).catch(() => sendHostError(response));
  }) as CapsuleHost;
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 0;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("capsule host did not bind a loopback TCP address");
  Object.defineProperty(server, "capsuleAddress", { value: `http://${host}:${address.port}` });
  return server;
}
