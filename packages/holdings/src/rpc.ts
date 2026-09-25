/**
 * The one transport of the holdings read: single JSON-RPC calls POSTed to the
 * same-origin read-only relay. No SDK, no WebSocket, no retry and no
 * failover; every failure becomes a closed reason the caller shows.
 *
 * Calls are sent one per POST, not as a batch: the default public upstream
 * answers a batch of two `getTokenAccountsByOwner` calls with 429 while it
 * serves the same two calls sent one after another (measured 2026-09-24).
 */

import { HOLDINGS_CONFIG } from "./config";

export type RpcFailure = "rate_limited" | "upstream_unavailable" | "timeout" | "malformed_rpc" | "response_too_large";

export class HoldingsRpcError extends Error {
  constructor(readonly reason: RpcFailure) {
    super(reason);
    this.name = "HoldingsRpcError";
  }
}

/** One read-only JSON-RPC call; resolves to the call's `result`, or rejects with `HoldingsRpcError`. */
export type HoldingsRpc = (method: string, params: unknown[]) => Promise<unknown>;

/** JSON-RPC error codes that mean "busy": HTTP-style 429 from the upstream, -32005 from the relay. */
const RATE_LIMIT_CODES: ReadonlySet<number> = new Set([429, -32005]);

export interface RelayRpcOptions {
  /** Absolute same-origin relay URL, e.g. `${location.origin}/api/solana-rpc`. */
  url: string;
  /** Aborts every call of one refresh; the caller owns the overall deadline. */
  signal: AbortSignal;
  fetchImpl?: typeof fetch;
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

/** Build the relay transport for one refresh. */
export function createRelayRpc(options: RelayRpcOptions): HoldingsRpc {
  const fetchImpl = options.fetchImpl ?? fetch;
  let nextId = 1;
  return async (method, params) => {
    const id = nextId++;
    let response: Response;
    try {
      response = await fetchImpl(options.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        signal: options.signal,
      });
    } catch (error) {
      throw new HoldingsRpcError(isAbort(error) || options.signal.aborted ? "timeout" : "upstream_unavailable");
    }
    if (response.status === 429) throw new HoldingsRpcError("rate_limited");
    if (!response.ok) throw new HoldingsRpcError("upstream_unavailable");
    let text: string;
    try {
      text = await response.text();
    } catch (error) {
      throw new HoldingsRpcError(isAbort(error) || options.signal.aborted ? "timeout" : "upstream_unavailable");
    }
    if (text.length > HOLDINGS_CONFIG.maxResponseLength) throw new HoldingsRpcError("response_too_large");
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new HoldingsRpcError("malformed_rpc");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new HoldingsRpcError("malformed_rpc");
    const record = body as Record<string, unknown>;
    if (record.jsonrpc !== "2.0" || record.id !== id) throw new HoldingsRpcError("malformed_rpc");
    if (record.error !== undefined) {
      const code = (record.error as { code?: unknown } | null)?.code;
      throw new HoldingsRpcError(typeof code === "number" && RATE_LIMIT_CODES.has(code) ? "rate_limited" : "upstream_unavailable");
    }
    if (!("result" in record)) throw new HoldingsRpcError("malformed_rpc");
    return record.result;
  };
}
