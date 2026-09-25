import { describe, expect, it, vi } from "vitest";

import {
  ALLOWED_ORIGINS_ENV,
  DEFAULT_UPSTREAM_URL,
  SOLANA_RPC_RELAY_PATH,
  UPSTREAM_URL_ENV,
  createRateLimiter,
  createSolanaRpcRelayHandler,
} from "./index.js";

const SECRET_UPSTREAM = "https://paid-rpc.example.invalid/v1/secret-key-123";
const SAME_ORIGIN = { host: "benten.test", origin: "https://benten.test", "sec-fetch-site": "same-origin" };
const LATEST_BLOCKHASH = { jsonrpc: "2.0", id: 1, method: "getLatestBlockhash", params: [] };

function post(headers: Record<string, string> = SAME_ORIGIN): Request {
  return new Request(`https://benten.test${SOLANA_RPC_RELAY_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(LATEST_BLOCKHASH),
  });
}

function okUpstream() {
  return vi.fn(async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { value: null } }), { status: 200 }));
}

describe("solana-rpc relay handler", () => {
  it("serves the relay on one fixed same-origin path", () => {
    expect(SOLANA_RPC_RELAY_PATH).toBe("/api/solana-rpc");
  });

  it("reads the upstream only from the server environment, on every request", async () => {
    const env: Record<string, string | undefined> = { [UPSTREAM_URL_ENV]: SECRET_UPSTREAM };
    const fetchImpl = okUpstream();
    const handler = createSolanaRpcRelayHandler({ env, fetchImpl });

    const first = await handler(post());
    env[UPSTREAM_URL_ENV] = "";
    await handler(post());

    expect(first.status).toBe(200);
    expect(await first.text()).not.toContain("secret-key-123");
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe(SECRET_UPSTREAM);
    expect((fetchImpl.mock.calls[1] as unknown as [string])[0]).toBe(new URL(DEFAULT_UPSTREAM_URL).href);
  });

  it("applies the configured origin list from the environment", async () => {
    const fetchImpl = okUpstream();
    const handler = createSolanaRpcRelayHandler({ env: { [ALLOWED_ORIGINS_ENV]: "https://benten.example" }, fetchImpl });

    expect((await handler(post())).status).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a request without Origin or Sec-Fetch-Site before the upstream", async () => {
    const fetchImpl = okUpstream();
    const handler = createSolanaRpcRelayHandler({ env: {}, fetchImpl });

    expect((await handler(post({ host: "benten.test" }))).status).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("keeps one rate limiter across requests of the same handler", async () => {
    const fetchImpl = okUpstream();
    const handler = createSolanaRpcRelayHandler({
      env: {},
      fetchImpl,
      rateLimiter: createRateLimiter({ windowMs: 60_000, maxCalls: 1, maxClients: 10 }),
    });

    expect((await handler(post())).status).toBe(200);
    expect((await handler(post())).status).toBe(429);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each(["GET", "PUT", "PATCH", "DELETE", "OPTIONS"])("answers %s with 405 and Allow: POST", async (method) => {
    const fetchImpl = okUpstream();
    const handler = createSolanaRpcRelayHandler({ env: {}, fetchImpl });

    const response = await handler(new Request(`https://benten.test${SOLANA_RPC_RELAY_PATH}`, { method, headers: SAME_ORIGIN }));

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).error.message).toBe("method not allowed");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("answers HEAD with the same 405 headers and no body", async () => {
    const handler = createSolanaRpcRelayHandler({ env: {}, fetchImpl: okUpstream() });

    const response = await handler(new Request(`https://benten.test${SOLANA_RPC_RELAY_PATH}`, { method: "HEAD" }));

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(await response.text()).toBe("");
  });
});
