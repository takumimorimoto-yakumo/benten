import { describe, expect, it, vi } from "vitest";

import { HOLDINGS_CONFIG } from "./config";
import { HoldingsRpcError, createRelayRpc } from "./rpc";

const URL_ = "https://benten.test/api/solana-rpc";

function rpcWith(respond: (body: { id: number }) => Response | Promise<Response>) {
  const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => respond(JSON.parse(init!.body as string)));
  return { rpc: createRelayRpc({ url: URL_, signal: new AbortController().signal, fetchImpl: fetchImpl as unknown as typeof fetch }), fetchImpl };
}

async function reasonOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "resolved";
  } catch (error) {
    return error instanceof HoldingsRpcError ? error.reason : "other";
  }
}

describe("createRelayRpc", () => {
  it("returns the result of a matching JSON-RPC response", async () => {
    const { rpc, fetchImpl } = rpcWith((body) => new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { value: 1 } })));
    expect(await rpc("getAccountInfo", ["x"])).toEqual({ value: 1 });
    const init = fetchImpl.mock.calls[0]![1]!;
    expect(init).toMatchObject({ method: "POST", cache: "no-store", credentials: "omit", redirect: "error" });
    expect(JSON.parse(init.body as string)).toEqual({ jsonrpc: "2.0", id: 1, method: "getAccountInfo", params: ["x"] });
  });

  it.each([
    ["HTTP 429", () => new Response("", { status: 429 }), "rate_limited"],
    ["HTTP 503", () => new Response("", { status: 503 }), "upstream_unavailable"],
    ["relay rate-limit error", (body: { id: number }) => new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, error: { code: -32005, message: "x" } })), "rate_limited"],
    ["upstream 429 error", (body: { id: number }) => new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, error: { code: 429, message: "x" } })), "rate_limited"],
    ["other JSON-RPC error", (body: { id: number }) => new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, error: { code: -32602, message: "x" } })), "upstream_unavailable"],
    ["wrong id", () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 99, result: {} })), "malformed_rpc"],
    ["a batch body", (body: { id: number }) => new Response(JSON.stringify([{ jsonrpc: "2.0", id: body.id, result: {} }])), "malformed_rpc"],
    ["no result", (body: { id: number }) => new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id })), "malformed_rpc"],
    ["not JSON", () => new Response("{"), "malformed_rpc"],
    ["an oversized body", () => new Response(" ".repeat(HOLDINGS_CONFIG.maxResponseLength + 1)), "response_too_large"],
  ])("maps %s to a closed reason", async (_name, respond, reason) => {
    const { rpc } = rpcWith(respond as (body: { id: number }) => Response);
    expect(await reasonOf(rpc("getAccountInfo", []))).toBe(reason);
  });

  it("maps an abort to timeout and a network error to unavailable", async () => {
    const controller = new AbortController();
    controller.abort();
    const aborted = createRelayRpc({ url: URL_, signal: controller.signal, fetchImpl: (async () => { throw new DOMException("x", "AbortError"); }) as unknown as typeof fetch });
    expect(await reasonOf(aborted("getAccountInfo", []))).toBe("timeout");
    const offline = createRelayRpc({ url: URL_, signal: new AbortController().signal, fetchImpl: (async () => { throw new TypeError("offline"); }) as unknown as typeof fetch });
    expect(await reasonOf(offline("getAccountInfo", []))).toBe("upstream_unavailable");
  });
});
