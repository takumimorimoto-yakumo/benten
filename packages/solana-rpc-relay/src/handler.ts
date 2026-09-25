/**
 * The one HTTP binding of the relay, shared by every host that serves
 * `SOLANA_RPC_RELAY_PATH` (the standalone facts API and the legacy Next
 * route). A host passes its server environment; the handler reads the
 * upstream URL and the allowed-origin list from it on every request, so the
 * upstream never becomes a module constant, a response value or a client
 * input.
 */

import { ALLOWED_ORIGINS_ENV, UPSTREAM_URL_ENV } from "./config.js";
import { createRateLimiter, methodNotAllowedResponse, relaySolanaRpc, type RelayRateLimiter } from "./relay.js";

/** Server environment, for example `process.env`. Read on every request. */
export type RelayEnvironment = { readonly [name: string]: string | undefined };

export interface RelayHandlerOptions {
  env: RelayEnvironment;
  /** Defaults to one limiter per handler, that is, per server instance. */
  rateLimiter?: RelayRateLimiter;
  /** Test seam; defaults to the global `fetch` at call time. */
  fetchImpl?: typeof fetch;
}

export type RelayHandler = (request: Request) => Promise<Response>;

/** Build the relay endpoint: `POST` is relayed, every other method is answered 405 with `Allow: POST`. */
export function createSolanaRpcRelayHandler(options: RelayHandlerOptions): RelayHandler {
  const rateLimiter = options.rateLimiter ?? createRateLimiter();
  return async (request) => {
    const method = request.method.toUpperCase();
    if (method !== "POST") {
      await request.body?.cancel().catch(() => undefined);
      const response = methodNotAllowedResponse();
      return method === "HEAD" ? new Response(null, { status: response.status, headers: response.headers }) : response;
    }
    return relaySolanaRpc(request, {
      upstreamUrl: options.env[UPSTREAM_URL_ENV],
      allowedOrigins: options.env[ALLOWED_ORIGINS_ENV],
      rateLimiter,
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    });
  };
}
