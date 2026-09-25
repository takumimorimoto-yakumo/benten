import { afterEach, describe, expect, it } from "vitest";
import { MCP_MAX_BODY_BYTES, MCP_MAX_RESPONSE_BYTES, MCP_PATH, MCP_PURCHASE_RATE_LIMIT_MAX_CALLS, MCP_RATE_LIMIT_MAX_REQUESTS } from "@benten/mcp/config";
import { PREPARE_PURCHASE_PAY_TOKENS, PREPARE_PURCHASE_TICKERS, type PurchaseQuoteReader } from "@benten/mcp/http";
import { startPublicApi, type PublicApiServer } from "../src/node.js";
import { createMcpHandler, mcpOriginRejection, siteOriginOf } from "../src/mcp.js";
import { PAY_TOKEN_IDS } from "../../../packages/purchase/src/token-units.ts";
import { PRODUCT_TICKERS } from "../../../packages/purchase/src/routes-table.ts";

const PROTOCOL = "2025-06-18";
const CONNECTOR_HEADERS = { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": PROTOCOL };
const DISCLAIMER = "Factual data only. Not investment advice, a recommendation, or a valuation.";

let active: PublicApiServer | undefined;
afterEach(async () => {
  await active?.close();
  active = undefined;
});

async function start(purchaseQuote?: PurchaseQuoteReader) {
  active = await startPublicApi({ env: {}, ...(purchaseQuote ? { purchaseQuote } : {}) });
  return active;
}

const QUOTE = {
  ok: true as const,
  amount_usdc: "5.00",
  amount_raw: "5000000",
  max_amount_usdc: "10.00",
  slippage_bps: 100,
  route: {
    pool: "F4inHs4RQARpASmvLpj45QjGLdkukeGQrtQ22pimVy2a", dex: "Meteora DLMM" as const,
    input_mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", input_symbol: "USDC", input_decimals: 6,
    output_mint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh", output_symbol: "NVDAx", output_decimals: 8,
  },
  quote: { consumedInputRaw: "5000000", outputRaw: "2220704", minimumOutputRaw: "2198496", feeRaw: "11254", protocolFeeRaw: "1249", feeOnInput: true, priceImpactPct: "0.0111" },
  quoted_at_ms: 1_790_000_000_000,
  expires_at_ms: 1_790_000_030_000,
  buy_query: "?amount=5.00",
};

async function rpc(api: PublicApiServer, body: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(`${api.origin}${MCP_PATH}`, { method: "POST", headers: { ...CONNECTOR_HEADERS, ...headers }, body: JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, headers: response.headers, body: text === "" ? null : JSON.parse(text) };
}

function call(name: string, args: Record<string, unknown>, id = 3) {
  return { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } };
}

describe("remote MCP endpoint", () => {
  it("answers initialize, tools/list and tools/call for a connector without Origin", async () => {
    const api = await start();
    const init = await rpc(api, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: "test", version: "0" } } });
    expect(init.status).toBe(200);
    expect(init.headers.get("cache-control")).toBe("no-store");
    expect(init.headers.get("mcp-session-id")).toBeNull();
    expect(init.body.result.serverInfo.name).toBe("benten");

    const list = await rpc(api, { jsonrpc: "2.0", id: 2, method: "tools/list" });
    expect(list.status).toBe(200);
    const names = list.body.result.tools.map((tool: { name: string }) => tool.name).sort();
    expect(names).toEqual(expect.arrayContaining([
      "get_financials", "get_fundamentals", "get_onchain_price_history", "get_wallet_holdings", "list_provider_assets", "list_xstocks",
    ]));

    const fundamentals = await rpc(api, call("get_fundamentals", { ticker: "NVDA" }));
    expect(fundamentals.status).toBe(200);
    expect(fundamentals.body.result.isError).toBeUndefined();
    expect(fundamentals.body.result.structuredContent.data.found).toBe(true);
    expect(fundamentals.body.result.structuredContent.disclaimer).toBe(DISCLAIMER);
  });

  it("fails closed on a ticker outside the registry allowlist", async () => {
    const api = await start();
    for (const ticker of ["NOTREAL", "NVD", "../NVDA", "NVDA%00"]) {
      const result = await rpc(api, call("get_fundamentals", { ticker }));
      expect(result.status, ticker).toBe(200);
      expect(result.body.result.structuredContent.data.found, ticker).toBe(false);
      expect(result.body.result.structuredContent.disclaimer).toBe(DISCLAIMER);
    }
  });

  it("rejects a tool argument outside the input schema", async () => {
    const api = await start();
    const result = await rpc(api, call("get_fundamentals", { ticker: "NVDA", extra: 1 }));
    expect(result.status).toBe(200);
    expect(result.body.result?.isError ?? Boolean(result.body.error)).toBe(true);
  });

  it("refuses a browser Origin that is not the site's own, and accepts the site's own", async () => {
    const api = await start();
    const foreign = await rpc(api, { jsonrpc: "2.0", id: 2, method: "tools/list" }, { origin: "https://evil.example" });
    expect(foreign.status).toBe(403);
    expect(foreign.body.error.message).toBe("caller origin not allowed");
    const own = await rpc(api, { jsonrpc: "2.0", id: 2, method: "tools/list" }, { origin: api.origin });
    expect(own.status).toBe(200);
  });

  it("applies the configured extra origins exactly", () => {
    const headers = (origin: string) => new Headers({ origin, host: "benten.example" });
    const env = { BENTEN_MCP_ALLOWED_ORIGINS: "https://inspector.example" };
    expect(mcpOriginRejection(headers("https://inspector.example"), env)).toBeNull();
    expect(mcpOriginRejection(headers("https://benten.example"), env)).toBeNull();
    expect(mcpOriginRejection(headers("https://inspector.example.evil"), env)).not.toBeNull();
    expect(mcpOriginRejection(new Headers({ host: "benten.example" }), {})).toBeNull();
  });

  it("answers 405 with Allow: POST for GET and DELETE", async () => {
    const api = await start();
    for (const method of ["GET", "DELETE", "PUT"]) {
      const response = await fetch(`${api.origin}${MCP_PATH}`, { method });
      expect(response.status, method).toBe(405);
      expect(response.headers.get("allow")).toBe("POST");
    }
  });

  it("refuses an oversized body and a non-JSON body", async () => {
    const api = await start();
    const big = await fetch(`${api.origin}${MCP_PATH}`, { method: "POST", headers: CONNECTOR_HEADERS, body: "x".repeat(MCP_MAX_BODY_BYTES + 1) });
    expect(big.status).toBe(413);
    const bad = await fetch(`${api.origin}${MCP_PATH}`, { method: "POST", headers: CONNECTOR_HEADERS, body: "{" });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe(-32700);
  });

  it("refuses a JSON-RPC batch, which protocol 2025-06-18 removed", async () => {
    const api = await start();
    const batch = await rpc(api, [{ jsonrpc: "2.0", id: 1, method: "tools/list" }, { jsonrpc: "2.0", id: 2, method: "tools/list" }]);
    expect(batch.status).toBe(400);
    expect(batch.body.error.code).toBe(-32600);
    expect(batch.body.id).toBeNull();
    const empty = await rpc(api, []);
    expect(empty.status).toBe(400);
    expect(empty.body.error.code).toBe(-32600);
  });

  it("replaces an answer larger than the response bound with a JSON-RPC error", async () => {
    expect(MCP_MAX_RESPONSE_BYTES).toBe(1024 * 1024);
    const request = (id: number) => new Request(`http://api.invalid${MCP_PATH}`, {
      method: "POST",
      headers: CONNECTOR_HEADERS,
      body: JSON.stringify(call("list_xstocks", {}, id)),
    });
    const bounded = createMcpHandler({ env: {}, maxResponseBytes: 4096 });
    const cut = await bounded(request(7));
    expect(cut.status).toBe(500);
    expect(await cut.json()).toEqual({ jsonrpc: "2.0", id: 7, error: { code: -32603, message: "response too large" } });
    const full = await createMcpHandler({ env: {} })(request(8));
    expect(full.status).toBe(200);
    const body = await full.arrayBuffer();
    expect(body.byteLength).toBeGreaterThan(4096);
    expect(body.byteLength).toBeLessThanOrEqual(MCP_MAX_RESPONSE_BYTES);
  });

  it("cuts a client off after its request budget", async () => {
    let now = 0;
    const handler = createMcpHandler({ env: {}, now: () => now });
    const request = () => new Request(`http://api.invalid${MCP_PATH}`, {
      method: "POST",
      headers: { ...CONNECTOR_HEADERS, "x-real-ip": "203.0.113.1" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    for (let index = 0; index < MCP_RATE_LIMIT_MAX_REQUESTS; index += 1) expect((await handler(request())).status).toBe(200);
    const limited = await handler(request());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toMatch(/^\d+$/);
    now += 60_000;
    expect((await handler(request())).status).toBe(200);
  });

  it("limits prepare_purchase per client and per tool call, apart from the other tools", async () => {
    let now = 0;
    let quotes = 0;
    const handler = createMcpHandler({ env: {}, now: () => now, purchaseQuote: async () => { quotes += 1; return QUOTE; } });
    const request = (ip: string, body: unknown) => new Request(`http://api.invalid${MCP_PATH}`, {
      method: "POST",
      headers: { ...CONNECTOR_HEADERS, "x-real-ip": ip },
      body: JSON.stringify(body),
    });
    const prepare = async (ip: string) => (await (await handler(request(ip, call("prepare_purchase", { amount_usdc: "5" })))).json()).result;
    for (let index = 0; index < MCP_PURCHASE_RATE_LIMIT_MAX_CALLS; index += 1) {
      expect((await prepare("203.0.113.9")).structuredContent.data.prepared).toBe(true);
    }
    const limited = await prepare("203.0.113.9");
    expect(limited.isError).toBe(true);
    expect(limited.structuredContent.data).toEqual({ prepared: false, reason: "rate_limited", max_amount_usdc: null, retryable: true });
    expect(limited.structuredContent.disclaimer).toBe(DISCLAIMER);
    expect(quotes).toBe(MCP_PURCHASE_RATE_LIMIT_MAX_CALLS);
    // Other tools and other clients keep their own budgets.
    const other = await handler(request("203.0.113.9", call("get_fundamentals", { ticker: "NVDA" })));
    expect((await other.json()).result.structuredContent.data.found).toBe(true);
    expect((await prepare("203.0.113.10")).structuredContent.data.prepared).toBe(true);
    now += 60_000;
    expect((await prepare("203.0.113.9")).structuredContent.data.prepared).toBe(true);
  });

  it("links prepare_purchase to the configured site origin, else to the addressed host", async () => {
    const request = () => new Request(`http://api.invalid${MCP_PATH}`, {
      method: "POST",
      headers: { ...CONNECTOR_HEADERS, host: "preview-123.benten.example" },
      body: JSON.stringify(call("prepare_purchase", { amount_usdc: "5" })),
    });
    const urlWith = async (env: Record<string, string>) => {
      const handler = createMcpHandler({ env, purchaseQuote: async () => QUOTE });
      return (await (await handler(request())).json()).result.structuredContent.data.purchase_url;
    };
    expect(await urlWith({ BENTEN_SITE_ORIGIN: "https://benten.example" })).toBe("https://benten.example/stock/NVDA/buy?amount=5.00");
    expect(await urlWith({})).toBe("https://preview-123.benten.example/stock/NVDA/buy?amount=5.00");
    for (const invalid of ["https://benten.example/", "https://benten.example/path", "javascript:alert(1)", "benten.example", "ftp://benten.example"]) {
      expect(await urlWith({ BENTEN_SITE_ORIGIN: invalid }), invalid).toBe("https://preview-123.benten.example/stock/NVDA/buy?amount=5.00");
    }
    expect(siteOriginOf(new Headers(), { BENTEN_SITE_ORIGIN: "https://benten.example" })).toBe("https://benten.example");
  });

  it("offers prepare_purchase only with a host quote reader and links to the addressed site", async () => {
    const plain = await start();
    const plainList = await rpc(plain, { jsonrpc: "2.0", id: 2, method: "tools/list" });
    expect(plainList.body.result.tools.map((tool: { name: string }) => tool.name)).not.toContain("prepare_purchase");
    await plain.close();
    active = undefined;

    const quote = async (amount: string) => (amount === "5" ? QUOTE : { ok: false as const, reason: "over_limit" as const, max_amount_usdc: "10.00", retryable: false });
    const api = await start(quote);
    const prepared = await rpc(api, call("prepare_purchase", { amount_usdc: "5" }));
    expect(prepared.body.result.structuredContent.data).toMatchObject({
      prepared: true,
      purchase_url: `${api.origin}/stock/NVDA/buy?amount=5.00`,
    });
    expect(prepared.body.result.structuredContent.disclaimer).toBe(DISCLAIMER);
    const over = await rpc(api, call("prepare_purchase", { amount_usdc: "11" }));
    expect(over.body.result.isError).toBe(true);
    expect(over.body.result.structuredContent.data).toMatchObject({ prepared: false, reason: "over_limit" });
  });

  it("advertises exactly the routes table's tickers and passes the canonical ticker through to the host reader", async () => {
    // SSOT check: the MCP package lists the tickers without depending on the purchase package.
    expect([...PREPARE_PURCHASE_TICKERS]).toEqual([...PRODUCT_TICKERS]);
    const calls: unknown[][] = [];
    const quote: PurchaseQuoteReader = async (...args) => {
      calls.push(args);
      return { ok: false as const, reason: "not_purchasable" as const, max_amount_usdc: "10.00", retryable: false };
    };
    const api = await start(quote);
    const result = await rpc(api, call("prepare_purchase", { ticker: "tsla", amount_usdc: "2" }));
    expect(calls).toEqual([["2", undefined, "TSLA"]]);
    expect(result.body.result.structuredContent.data).toMatchObject({ prepared: false, reason: "not_purchasable" });
  });

  it("advertises exactly the purchase package's pay tokens and passes pay_token through to the host reader", async () => {
    // SSOT check: the MCP package lists the pay tokens without depending on the purchase package.
    expect([...PREPARE_PURCHASE_PAY_TOKENS]).toEqual([...PAY_TOKEN_IDS]);
    const calls: unknown[][] = [];
    const quote: PurchaseQuoteReader = async (...args) => {
      calls.push(args);
      return { ok: false as const, reason: "over_limit" as const, max_amount_usdc: "10.00", retryable: false };
    };
    const api = await start(quote);
    const list = await rpc(api, { jsonrpc: "2.0", id: 2, method: "tools/list" });
    const tool = list.body.result.tools.find((entry: { name: string }) => entry.name === "prepare_purchase");
    expect(tool.inputSchema.properties.pay_token.enum).toEqual([...PAY_TOKEN_IDS]);
    const over = await rpc(api, call("prepare_purchase", { pay_token: "SKR", amount: "1000000" }));
    expect(over.body.result.structuredContent.data).toMatchObject({ prepared: false, reason: "over_limit" });
    expect(calls).toEqual([["1000000", "SKR"]]);
  });
});
