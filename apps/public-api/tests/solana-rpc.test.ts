import { request as httpRequest } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SOLANA_RPC_RELAY_PATH, UPSTREAM_URL_ENV } from "@benten/solana-rpc-relay";
import { handleRequest } from "../src/app.js";
import { startPublicApi, type PublicApiServer } from "../src/node.js";

const SECRET_UPSTREAM = "https://paid-rpc.example.invalid/v1/secret-key-123";
const LATEST_BLOCKHASH = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getLatestBlockhash", params: [] });

let active: PublicApiServer | undefined;
afterEach(async () => {
  await active?.close();
  active = undefined;
});

function okUpstream() {
  return vi.fn(async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { value: { blockhash: "fixture" } } }), { status: 200 }));
}

async function start(fetchImpl = okUpstream()) {
  active = await startPublicApi({ env: { [UPSTREAM_URL_ENV]: SECRET_UPSTREAM }, relayFetch: fetchImpl });
  return { api: active, fetchImpl };
}

/** A raw HTTP request, so the test controls Origin and Host exactly as a browser or script would send them. */
function rawPost(origin: string, headers: Record<string, string>, body = LATEST_BLOCKHASH): Promise<{ status: number; headers: Record<string, unknown>; body: string }> {
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest(`${origin}${SOLANA_RPC_RELAY_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body), ...headers },
    }, (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
      incoming.on("end", () => resolve({ status: incoming.statusCode ?? 0, headers: incoming.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    outgoing.on("error", reject);
    outgoing.end(body);
  });
}

describe("facts API Solana RPC relay route", () => {
  it("relays a same-origin getLatestBlockhash POST to the environment-configured upstream only", async () => {
    const { api, fetchImpl } = await start();
    const response = await rawPost(api.origin, { origin: api.origin, "sec-fetch-site": "same-origin" });

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(JSON.parse(response.body)).toMatchObject({ result: { value: { blockhash: "fixture" } } });
    expect(response.body).not.toContain("paid-rpc");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe(SECRET_UPSTREAM);
  });

  it.each([
    ["no Origin and no Sec-Fetch-Site", {}],
    ["a foreign Origin", { origin: "https://evil.example" }],
    ["a cross-site fetch", { origin: "https://evil.example", "sec-fetch-site": "cross-site" }],
  ])("answers %s with 403 before the upstream", async (_name, headers) => {
    const { api, fetchImpl } = await start();
    const response = await rawPost(api.origin, headers);

    expect(response.status).toBe(403);
    expect(JSON.parse(response.body).error.code).toBe(-32001);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a transaction-submitting method without contacting the upstream", async () => {
    const { api, fetchImpl } = await start();
    const submit = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "send" + "Transaction", params: ["AA=="] });
    const response = await rawPost(api.origin, { origin: api.origin }, submit);

    expect(response.status).toBe(400);
    expect(JSON.parse(response.body).error.code).toBe(-32601);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("answers a body above the relay limit with 413 without contacting the upstream", async () => {
    const { api, fetchImpl } = await start();
    const response = await rawPost(api.origin, { origin: api.origin }, " ".repeat(65 * 1024));

    expect(response.status).toBe(413);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each(["GET", "HEAD", "OPTIONS", "PUT", "DELETE"])("answers %s with 405 and Allow: POST", async (method) => {
    const { api, fetchImpl } = await start();
    const response = await fetch(`${api.origin}${SOLANA_RPC_RELAY_PATH}`, { method });

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    if (method === "HEAD") expect(await response.text()).toBe("");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("keeps the facts routes and the unknown-path contract unchanged beside the relay", async () => {
    const { api, fetchImpl } = await start();
    const facts = await fetch(`${api.origin}/api/v2/fundamentals?ticker=NVDA`, { method: "POST", body: LATEST_BLOCKHASH });
    const unknown = await fetch(`${api.origin}${SOLANA_RPC_RELAY_PATH}/extra`, { method: "POST", body: LATEST_BLOCKHASH });

    expect(facts.status).toBe(405);
    expect(facts.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
    expect(unknown.status).toBe(404);
    await expect(unknown.json()).resolves.toMatchObject({ error: { code: "unknown_endpoint" } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("keeps the snapshot-only facts dispatcher unaware of the relay path", async () => {
    const response = handleRequest(new Request(`http://benten.test${SOLANA_RPC_RELAY_PATH}`, { method: "POST" }));
    expect(response.status).toBe(404);
  });
});
