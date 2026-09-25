import { request as httpRequest } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UPSTREAM_URL_ENV } from "@benten/solana-rpc-relay";
import { FEED_MAP, PRICES_PATH, PRICING_CONFIG, feedEntry, parsePricesResponse } from "@benten/pricing";
import { handleRequest } from "../src/app.js";
import { startPublicApi, type PublicApiServer } from "../src/node.js";
import { createPricesHandler, parsePricesQuery } from "../src/prices.js";

const SECRET_UPSTREAM = "https://paid-rpc.example.invalid/v1/secret-key-123";
const NVDA_FEED = "b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593";
const TSLA_FEED = FEED_MAP.entries.find((entry) => entry.pyth_symbol === "Equity.US.TSLA/USD")!.feed_id;
const NOW_S = 1_790_237_160;
const SAME_ORIGIN = { host: "benten.test", origin: "https://benten.test", "sec-fetch-site": "same-origin" };

function priceUpdateBase64(feedId: string, price: bigint, exponent: number, publishTime: number): string {
  const data = Buffer.alloc(134);
  Buffer.from([0x22, 0xf1, 0x23, 0x63, 0x9d, 0x7e, 0xf4, 0xcd]).copy(data, 0);
  data[40] = 1;
  Buffer.from(feedId, "hex").copy(data, 41);
  data.writeBigInt64LE(price, 73);
  data.writeBigUInt64LE(3n, 81);
  data.writeInt32LE(exponent, 89);
  data.writeBigInt64LE(BigInt(publishTime), 93);
  data.writeBigUInt64LE(449_969_455n, 125);
  return data.toString("base64");
}

/** Upstream double: answers getMultipleAccounts with an update for shard 1 of NVDA only. */
function upstream() {
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(init!.body as string);
    const addresses: string[] = body.params[0];
    const nvdaShard1 = feedEntry(NVDA_FEED)!.price_accounts[1]!.address;
    const value = addresses.map((address) => (address === nvdaShard1
      ? { owner: FEED_MAP.source.receiver_program, lamports: 1, executable: false, rentEpoch: 0, data: [priceUpdateBase64(NVDA_FEED, 22_383_505n, -5, NOW_S - 3), "base64"] }
      : null));
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { context: { slot: 1 }, value } }));
  });
}

function get(query: string, headers: Record<string, string> = SAME_ORIGIN, method = "GET"): Request {
  return new Request(`https://benten.test${PRICES_PATH}${query}`, { method, headers });
}

describe("parsePricesQuery", () => {
  it("accepts one or more exact feed-map ids", () => {
    expect(parsePricesQuery(new URLSearchParams(`feed=${NVDA_FEED}&feed=${TSLA_FEED}`))).toEqual({ ok: true, feedIds: [NVDA_FEED, TSLA_FEED] });
  });

  it.each([
    ["no feed", "", "invalid_query"],
    ["an unknown key", `feed=${NVDA_FEED}&x=1`, "invalid_query"],
    ["a repeated feed", `feed=${NVDA_FEED}&feed=${NVDA_FEED}`, "invalid_query"],
    ["an uppercase id", `feed=${NVDA_FEED.toUpperCase()}`, "invalid_query"],
    ["a 0x prefix", `feed=0x${NVDA_FEED}`, "invalid_query"],
    ["a symbol", "feed=Equity.US.NVDA%2FUSD", "invalid_query"],
    ["a well-formed id outside the feed map", `feed=${"a".repeat(64)}`, "feed_not_allowed"],
    ["too many feeds", FEED_MAP.entries.slice(0, PRICING_CONFIG.maxFeedsPerRequest + 1).map((entry) => `feed=${entry.feed_id}`).join("&"), "invalid_query"],
  ])("rejects %s", (_name, query, code) => {
    expect(parsePricesQuery(new URLSearchParams(query))).toEqual({ ok: false, code });
  });
});

describe("prices handler", () => {
  it("reads only the feed map's price accounts, once per cache lifetime, and never echoes the upstream", async () => {
    const fetchImpl = upstream();
    let now = NOW_S * 1000;
    const handler = createPricesHandler({ env: { [UPSTREAM_URL_ENV]: SECRET_UPSTREAM }, fetchImpl: fetchImpl as unknown as typeof fetch, now: () => now });

    const response = await handler(get(`?feed=${NVDA_FEED}&feed=${TSLA_FEED}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    const text = await response.text();
    expect(text).not.toContain("paid-rpc");
    const parsed = parsePricesResponse(JSON.parse(text), [NVDA_FEED, TSLA_FEED]);
    expect(parsed?.prices[0]).toMatchObject({ status: "fresh", price: "223.83505", exponent: -5, publish_time_unix: NOW_S - 3, source: { shard: 1 } });
    expect(parsed?.prices[1]).toMatchObject({ status: "unavailable", reason: "no_price_account" });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(SECRET_UPSTREAM);
    expect(init?.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(init!.body as string)).toEqual({
      jsonrpc: "2.0",
      id: 1,
      method: "getMultipleAccounts",
      params: [[...feedEntry(NVDA_FEED)!.price_accounts, ...feedEntry(TSLA_FEED)!.price_accounts].map((ref) => ref.address), { encoding: "base64", commitment: "confirmed" }],
    });

    await handler(get(`?feed=${NVDA_FEED}`));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    now += PRICING_CONFIG.cacheTtlMs;
    await handler(get(`?feed=${NVDA_FEED}`));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("judges staleness at response time", async () => {
    let now = NOW_S * 1000;
    const handler = createPricesHandler({ env: {}, fetchImpl: upstream() as unknown as typeof fetch, now: () => now });
    await handler(get(`?feed=${NVDA_FEED}`));
    now += (PRICING_CONFIG.staleAfterSeconds + 1) * 1000;
    const body = await (await handler(get(`?feed=${NVDA_FEED}`))).json();
    expect(body.prices[0]).toMatchObject({ status: "stale", publish_time_unix: NOW_S - 3 });
  });

  it("coalesces concurrent reads of the same feed into one upstream call", async () => {
    const fetchImpl = upstream();
    const handler = createPricesHandler({ env: {}, fetchImpl: fetchImpl as unknown as typeof fetch, now: () => NOW_S * 1000 });
    const [first, second] = await Promise.all([handler(get(`?feed=${NVDA_FEED}`)), handler(get(`?feed=${NVDA_FEED}`))]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect((await first.json()).prices[0].status).toBe("fresh");
    expect((await second.json()).prices[0].status).toBe("fresh");
  });

  it.each([
    ["a timeout", async () => { throw new DOMException("t", "TimeoutError"); }, "upstream_timeout"],
    ["an HTTP error", async () => new Response("no", { status: 503 }), "upstream_unavailable"],
    ["a body that is not JSON", async () => new Response("<html>"), "upstream_unavailable"],
    ["a short account list", async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { value: [] } })), "upstream_unavailable"],
  ])("reports %s as a reason with no value", async (_name, fetchImpl, reason) => {
    const handler = createPricesHandler({ env: { [UPSTREAM_URL_ENV]: SECRET_UPSTREAM }, fetchImpl: fetchImpl as unknown as typeof fetch, now: () => NOW_S * 1000 });
    const response = await handler(get(`?feed=${NVDA_FEED}`));
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain("paid-rpc");
    expect(JSON.parse(text).prices[0]).toEqual(expect.objectContaining({ status: "unavailable", reason }));
    expect(JSON.parse(text).prices[0].price).toBeUndefined();
  });

  it("fails closed for a malformed upstream value without contacting it", async () => {
    const fetchImpl = upstream();
    const handler = createPricesHandler({ env: { [UPSTREAM_URL_ENV]: "http://plain.example" }, fetchImpl: fetchImpl as unknown as typeof fetch, now: () => NOW_S * 1000 });
    const body = await (await handler(get(`?feed=${NVDA_FEED}`))).json();
    expect(body.prices[0]).toMatchObject({ status: "unavailable", reason: "upstream_unavailable" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ["no Origin and no Sec-Fetch-Site", {}],
    ["a foreign Origin", { host: "benten.test", origin: "https://evil.example" }],
    ["a cross-site fetch", { host: "benten.test", "sec-fetch-site": "cross-site" }],
  ])("answers %s with 403 before any read", async (_name, headers) => {
    const fetchImpl = upstream();
    const handler = createPricesHandler({ env: {}, fetchImpl: fetchImpl as unknown as typeof fetch });
    const response = await handler(get(`?feed=${NVDA_FEED}`, headers as Record<string, string>));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "caller_not_allowed" } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("answers 400 for a feed outside the map and never reads it", async () => {
    const fetchImpl = upstream();
    const handler = createPricesHandler({ env: {}, fetchImpl: fetchImpl as unknown as typeof fetch });
    const response = await handler(get(`?feed=${"a".repeat(64)}`));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "feed_not_allowed" } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("answers 405 with Allow for every method but GET and HEAD, and HEAD without a body", async () => {
    const handler = createPricesHandler({ env: {}, fetchImpl: upstream() as unknown as typeof fetch, now: () => NOW_S * 1000 });
    for (const method of ["POST", "PUT", "DELETE", "OPTIONS", "PATCH"]) {
      const response = await handler(get(`?feed=${NVDA_FEED}`, SAME_ORIGIN, method));
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET, HEAD");
    }
    const head = await handler(get(`?feed=${NVDA_FEED}`, SAME_ORIGIN, "HEAD"));
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
  });

  it("holds each client to a call budget", async () => {
    const handler = createPricesHandler({
      env: {},
      fetchImpl: upstream() as unknown as typeof fetch,
      now: () => NOW_S * 1000,
      rateLimiter: { take: () => ({ allowed: false, retryAfterSeconds: 7 }) },
    });
    const response = await handler(get(`?feed=${NVDA_FEED}`));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("7");
  });
});

describe("facts API prices route", () => {
  let active: PublicApiServer | undefined;
  afterEach(async () => {
    await active?.close();
    active = undefined;
  });

  function rawGet(origin: string, path: string, headers: Record<string, string>): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const outgoing = httpRequest(`${origin}${path}`, { method: "GET", headers }, (incoming) => {
        const chunks: Buffer[] = [];
        incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
        incoming.on("end", () => resolve({ status: incoming.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
      });
      outgoing.on("error", reject);
      outgoing.end();
    });
  }

  it("serves the prices route through the Node adapter, same-origin only", async () => {
    const fetchImpl = upstream();
    active = await startPublicApi({ env: { [UPSTREAM_URL_ENV]: SECRET_UPSTREAM }, pricesFetch: fetchImpl as unknown as typeof fetch });
    const ok = await rawGet(active.origin, `${PRICES_PATH}?feed=${NVDA_FEED}`, { "sec-fetch-site": "same-origin" });
    expect(ok.status).toBe(200);
    expect(JSON.parse(ok.body).prices[0].feed_id).toBe(NVDA_FEED);
    const foreign = await rawGet(active.origin, `${PRICES_PATH}?feed=${NVDA_FEED}`, { origin: "https://evil.example" });
    expect(foreign.status).toBe(403);
  });

  it("keeps the facts dispatcher network-free: near misses stay the unknown-path 404", async () => {
    for (const path of [`${PRICES_PATH}/extra`, "/api/Prices", "/api/pricesx"]) {
      const response = handleRequest(new Request(`https://benten.test${path}`));
      expect(response.status).toBe(404);
    }
  });
});
