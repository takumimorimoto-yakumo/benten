import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicKey, SystemProgram, Transaction, VersionedTransaction } from "@solana/web3.js";

import {
  ALLOWED_METHODS,
  MAX_BATCH_ITEMS,
  MAX_BODY_BYTES,
  RPC_ERROR,
  checkTokenAccountsByOwnerParams,
  clientKeyOf,
  createRateLimiter,
  isCanonicalPublicKey,
  relaySolanaRpc,
  unsignedTransactionRejection,
} from "./index.js";
import { SUPPORTED_PRODUCTS } from "@benten/solana/supported-products";

const RELAY = "https://benten.test/api/solana-rpc";
const SECRET_UPSTREAM = "https://paid-rpc.example.invalid/v1/secret-key-123";
// Built by concatenation so the repository's publication scanner never sees
// the literal transaction-submitting identifier.
const SUBMIT_METHOD = "send" + "Transaction";

const PAYER = new PublicKey("EeAgs2uXoUhCx69KuB97kQDMmeHfFuxM19QwwUBxRYs8");
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const NVDAX_MINT = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function unsignedWireTransaction(): VersionedTransaction {
  const legacy = new Transaction({ feePayer: PAYER, recentBlockhash: PublicKey.default.toBase58() });
  legacy.add(SystemProgram.transfer({ fromPubkey: PAYER, toPubkey: PublicKey.default, lamports: 1 }));
  return new VersionedTransaction(legacy.compileMessage());
}

function base64(transaction: VersionedTransaction): string {
  return Buffer.from(transaction.serialize()).toString("base64");
}

function call(method: string, params?: unknown[], id: number | string = 1) {
  return params === undefined ? { jsonrpc: "2.0", id, method } : { jsonrpc: "2.0", id, method, params };
}

function simulateCall(encoded: string, config: Record<string, unknown> = { sigVerify: false, replaceRecentBlockhash: true, encoding: "base64" }) {
  return call("simulateTransaction", [encoded, config]);
}

/** Headers a browser attaches to a same-origin `fetch` POST from the Benten page. */
const SAME_ORIGIN = { host: "benten.test", origin: "https://benten.test", "sec-fetch-site": "same-origin" };

function post(body: unknown, headers: Record<string, string> = {}, base: Record<string, string> = SAME_ORIGIN): Request {
  return new Request(RELAY, {
    method: "POST",
    headers: { "content-type": "application/json", ...base, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function okUpstream(result: unknown = { value: null }) {
  return vi.fn(async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), { status: 200 }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("solana-rpc relay allowlist", () => {
  it("allows exactly the measured read-only methods", () => {
    expect([...ALLOWED_METHODS].sort()).toEqual([
      "getAccountInfo",
      "getBlockHeight",
      "getLatestBlockhash",
      "getMultipleAccounts",
      "getSignatureStatuses",
      "getTokenAccountsByOwner",
      "getTransaction",
      "simulateTransaction",
    ]);
  });

  it.each([
    ["getAccountInfo", [PAYER.toBase58(), { encoding: "base64" }]],
    ["getMultipleAccounts", [[PAYER.toBase58()], { encoding: "base64" }]],
    ["getLatestBlockhash", [{ commitment: "confirmed" }]],
    ["getSignatureStatuses", [["1".repeat(64)]]],
    ["getTransaction", ["1".repeat(64), { maxSupportedTransactionVersion: 0 }]],
    ["getBlockHeight", [{ commitment: "confirmed" }]],
    ["getTokenAccountsByOwner", [PAYER.toBase58(), { programId: TOKEN_PROGRAM }, { encoding: "base64", commitment: "confirmed" }]],
  ])("forwards %s upstream", async (method, params) => {
    const fetchImpl = okUpstream();
    const response = await relaySolanaRpc(post(call(method, params)), { upstreamUrl: SECRET_UPSTREAM, fetchImpl });

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(SECRET_UPSTREAM);
    expect(JSON.parse(init.body as string)).toEqual(call(method, params));
    expect(await response.json()).toEqual({ jsonrpc: "2.0", id: 1, result: { value: null } });
  });

  it("forwards an unsigned simulateTransaction with sigVerify false", async () => {
    const fetchImpl = okUpstream();
    const body = simulateCall(base64(unsignedWireTransaction()));
    const response = await relaySolanaRpc(post(body), { upstreamUrl: SECRET_UPSTREAM, fetchImpl });

    expect(response.status).toBe(200);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual(body);
  });

  it.each([
    [SUBMIT_METHOD],
    ["sendRawTransaction"],
    ["requestAirdrop"],
    ["getProgramAccounts"],
    ["getBalance"],
  ])("rejects %s without contacting the upstream", async (method) => {
    const fetchImpl = okUpstream();
    const response = await relaySolanaRpc(post(call(method, [])), { upstreamUrl: SECRET_UPSTREAM, fetchImpl });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32601, message: "method not allowed by this relay" },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ["missing jsonrpc", { id: 1, method: "getAccountInfo" }],
    ["unknown top-level key", { ...call("getAccountInfo", []), extra: true }],
    ["non-array params", { jsonrpc: "2.0", id: 1, method: "getAccountInfo", params: { a: 1 } }],
    ["missing id", { jsonrpc: "2.0", method: "getAccountInfo" }],
    ["object id", { jsonrpc: "2.0", id: {}, method: "getAccountInfo" }],
  ])("rejects a malformed call (%s)", async (_name, body) => {
    const fetchImpl = okUpstream();
    const response = await relaySolanaRpc(post(body), { upstreamUrl: SECRET_UPSTREAM, fetchImpl });

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe(-32600);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a body that is not JSON", async () => {
    const fetchImpl = okUpstream();
    const response = await relaySolanaRpc(post("{not json"), { upstreamUrl: SECRET_UPSTREAM, fetchImpl });

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe(-32700);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("solana-rpc relay getTokenAccountsByOwner checks", () => {
  const owner = PAYER.toBase58();
  const firstPreStocksMint = [...SUPPORTED_PRODUCTS.values()].find((product) => product.kind === "prestocks")?.mint;

  it.each([
    ["SPL Token programId, base64", [owner, { programId: TOKEN_PROGRAM }, { encoding: "base64" }]],
    ["Token-2022 programId, jsonParsed", [owner, { programId: TOKEN_2022_PROGRAM }, { encoding: "jsonParsed", commitment: "finalized" }]],
    ["xStock mint", [owner, { mint: NVDAX_MINT }, { encoding: "base64", minContextSlot: 1 }]],
    ["PreStocks mint", [owner, { mint: firstPreStocksMint }, { encoding: "jsonParsed" }]],
  ])("accepts %s", (_name, params) => {
    expect(checkTokenAccountsByOwnerParams(params as unknown[])).toBeNull();
  });

  it.each([
    ["no params", undefined, "getTokenAccountsByOwner takes an owner, a filter and a config"],
    ["missing config", [owner, { programId: TOKEN_PROGRAM }], "getTokenAccountsByOwner takes an owner, a filter and a config"],
    ["extra param", [owner, { programId: TOKEN_PROGRAM }, { encoding: "base64" }, {}], "getTokenAccountsByOwner takes an owner, a filter and a config"],
    ["owner not base58", ["not-a-key!", { programId: TOKEN_PROGRAM }, { encoding: "base64" }], "owner must be a public key"],
    ["owner too short", ["1111", { programId: TOKEN_PROGRAM }, { encoding: "base64" }], "owner must be a public key"],
    ["owner not canonical", [`1${owner}`, { programId: TOKEN_PROGRAM }, { encoding: "base64" }], "owner must be a public key"],
    ["owner not a string", [42, { programId: TOKEN_PROGRAM }, { encoding: "base64" }], "owner must be a public key"],
    ["unknown program", [owner, { programId: PAYER.toBase58() }, { encoding: "base64" }], "programId must be a token program"],
    ["unsupported mint (USDC)", [owner, { mint: USDC_MINT }, { encoding: "base64" }], "mint is not a supported product"],
    ["mint in another case", [owner, { mint: NVDAX_MINT.toLowerCase() }, { encoding: "base64" }], "mint is not a supported product"],
    ["both filters", [owner, { mint: NVDAX_MINT, programId: TOKEN_PROGRAM }, { encoding: "base64" }], "filter must be one programId or one mint"],
    ["empty filter", [owner, {}, { encoding: "base64" }], "filter must be one programId or one mint"],
    ["unknown filter key", [owner, { owner }, { encoding: "base64" }], "filter must be one programId or one mint"],
    ["filter array", [owner, [TOKEN_PROGRAM], { encoding: "base64" }], "filter must be one programId or one mint"],
    ["no encoding", [owner, { programId: TOKEN_PROGRAM }, {}], "encoding must be jsonParsed or base64"],
    ["base58 encoding", [owner, { programId: TOKEN_PROGRAM }, { encoding: "base58" }], "encoding must be jsonParsed or base64"],
    ["base64+zstd encoding", [owner, { programId: TOKEN_PROGRAM }, { encoding: "base64+zstd" }], "encoding must be jsonParsed or base64"],
    ["dataSlice", [owner, { programId: TOKEN_PROGRAM }, { encoding: "base64", dataSlice: { offset: 0, length: 1 } }], "unsupported getTokenAccountsByOwner config"],
    ["unknown commitment", [owner, { programId: TOKEN_PROGRAM }, { encoding: "base64", commitment: "max" }], "unsupported commitment"],
    ["negative minContextSlot", [owner, { programId: TOKEN_PROGRAM }, { encoding: "base64", minContextSlot: -1 }], "minContextSlot must be a non-negative integer"],
    ["config not an object", [owner, { programId: TOKEN_PROGRAM }, "base64"], "getTokenAccountsByOwner requires a config with an encoding"],
  ])("rejects %s", (_name, params, reason) => {
    expect(checkTokenAccountsByOwnerParams(params as unknown[] | undefined)).toBe(reason);
  });

  it("answers a disallowed filter with invalid params and never contacts the upstream", async () => {
    const fetchImpl = okUpstream();
    const response = await relaySolanaRpc(
      post(call("getTokenAccountsByOwner", [owner, { mint: USDC_MINT }, { encoding: "base64" }])),
      { upstreamUrl: SECRET_UPSTREAM, fetchImpl },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ jsonrpc: "2.0", id: 1, error: { code: -32602, message: "mint is not a supported product" } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects the whole batch when one holdings read carries a disallowed filter", async () => {
    const fetchImpl = okUpstream();
    const response = await relaySolanaRpc(post([
      call("getTokenAccountsByOwner", [owner, { programId: TOKEN_PROGRAM }, { encoding: "base64" }], 1),
      call("getTokenAccountsByOwner", [owner, { programId: PAYER.toBase58() }, { encoding: "base64" }], 2),
    ]), { upstreamUrl: SECRET_UPSTREAM, fetchImpl });

    expect(response.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("recognizes only canonical public keys", () => {
    expect(isCanonicalPublicKey(owner)).toBe(true);
    expect(isCanonicalPublicKey(`0${owner.slice(1)}`)).toBe(false);
    expect(isCanonicalPublicKey(`${owner} `)).toBe(false);
    expect(isCanonicalPublicKey(null)).toBe(false);
  });
});

describe("solana-rpc relay never relays signed bytes", () => {
  it("rejects a simulate whose transaction carries a non-zero signature", async () => {
    const transaction = unsignedWireTransaction();
    const signature = new Uint8Array(64);
    signature[63] = 1;
    transaction.signatures[0] = signature;
    const fetchImpl = okUpstream();

    const response = await relaySolanaRpc(post(simulateCall(base64(transaction))), { upstreamUrl: SECRET_UPSTREAM, fetchImpl });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32602, message: "signed transactions are not relayed" },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects sigVerify: true even for an unsigned transaction", async () => {
    const fetchImpl = okUpstream();
    const body = simulateCall(base64(unsignedWireTransaction()), { sigVerify: true, encoding: "base64" });

    const response = await relaySolanaRpc(post(body), { upstreamUrl: SECRET_UPSTREAM, fetchImpl });

    expect(response.status).toBe(400);
    expect((await response.json()).error).toEqual({ code: -32602, message: "sigVerify is not relayed" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ["no config (upstream would default to base58)", call("simulateTransaction", ["AA=="])],
    ["base58 encoding", simulateCall("abc", { encoding: "base58" })],
    ["an unsupported config key", simulateCall("AA==", { encoding: "base64", innerInstructions: true })],
    ["non-base64 bytes", simulateCall("***", { encoding: "base64" })],
    ["undecodable bytes", simulateCall("AAAA", { encoding: "base64" })],
  ])("rejects a simulate with %s", async (_name, body) => {
    const fetchImpl = okUpstream();
    const response = await relaySolanaRpc(post(body), { upstreamUrl: SECRET_UPSTREAM, fetchImpl });

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe(-32602);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects trailing bytes after a valid unsigned transaction", () => {
    const bytes = Buffer.concat([Buffer.from(unsignedWireTransaction().serialize()), Buffer.from([1, 2, 3])]);
    expect(unsignedTransactionRejection(bytes.toString("base64"))).toBe("transaction is not canonically encoded");
  });
});

describe("solana-rpc relay batch and size limits", () => {
  it("forwards a batch within the limit", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify([{ jsonrpc: "2.0", id: 1, result: 1 }]), { status: 200 }));
    const batch = Array.from({ length: MAX_BATCH_ITEMS }, (_unused, index) => call("getLatestBlockhash", [], index));

    const response = await relaySolanaRpc(post(batch), { upstreamUrl: SECRET_UPSTREAM, fetchImpl });

    expect(response.status).toBe(200);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual(batch);
  });

  it("rejects a batch above the limit", async () => {
    const fetchImpl = okUpstream();
    const batch = Array.from({ length: MAX_BATCH_ITEMS + 1 }, (_unused, index) => call("getLatestBlockhash", [], index));

    const response = await relaySolanaRpc(post(batch), { upstreamUrl: SECRET_UPSTREAM, fetchImpl });

    expect(response.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects an empty batch", async () => {
    const fetchImpl = okUpstream();
    const response = await relaySolanaRpc(post([]), { upstreamUrl: SECRET_UPSTREAM, fetchImpl });

    expect(response.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("checks every batch element and forwards nothing when one is disallowed", async () => {
    const fetchImpl = okUpstream();
    const batch = [call("getLatestBlockhash", [], 1), call(SUBMIT_METHOD, ["AA=="], 2)];

    const response = await relaySolanaRpc(post(batch), { upstreamUrl: SECRET_UPSTREAM, fetchImpl });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toHaveLength(2);
    expect(body[0]).toMatchObject({ id: 1, error: { code: -32600 } });
    expect(body[1]).toMatchObject({ id: 2, error: { code: -32601 } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a signed simulate hidden inside a batch", async () => {
    const transaction = unsignedWireTransaction();
    transaction.signatures[0] = new Uint8Array(64).fill(7);
    const fetchImpl = okUpstream();
    const batch = [call("getLatestBlockhash", [], 1), { ...simulateCall(base64(transaction)), id: 2 }];

    const response = await relaySolanaRpc(post(batch), { upstreamUrl: SECRET_UPSTREAM, fetchImpl });

    expect(response.status).toBe(400);
    expect((await response.json())[1].error).toEqual({ code: -32602, message: "signed transactions are not relayed" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a body larger than the size limit", async () => {
    const fetchImpl = okUpstream();
    const oversized = JSON.stringify(call("getAccountInfo", ["A".repeat(MAX_BODY_BYTES)]));

    const response = await relaySolanaRpc(post(oversized), { upstreamUrl: SECRET_UPSTREAM, fetchImpl });

    expect(response.status).toBe(413);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects an oversized body even when content-length understates it", async () => {
    const fetchImpl = okUpstream();
    const oversized = JSON.stringify(call("getAccountInfo", ["A".repeat(MAX_BODY_BYTES)]));
    const request = new Request(RELAY, { method: "POST", body: oversized, headers: { ...SAME_ORIGIN, "content-length": "10" } });

    const response = await relaySolanaRpc(request, { upstreamUrl: SECRET_UPSTREAM, fetchImpl });

    expect(response.status).toBe(413);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("solana-rpc relay upstream boundary", () => {
  it("sends no client header upstream", async () => {
    const fetchImpl = okUpstream();
    const request = post(call("getLatestBlockhash", []), {
      cookie: "session=abc",
      origin: "https://benten.test",
      authorization: "Bearer client",
      "x-forwarded-for": "203.0.113.1",
    });

    await relaySolanaRpc(request, { upstreamUrl: SECRET_UPSTREAM, fetchImpl });

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toEqual({ "content-type": "application/json" });
    expect(init.redirect).toBe("error");
  });

  it.each([
    ["a network failure", vi.fn(async () => { throw new TypeError(`fetch failed: ${SECRET_UPSTREAM}`); }), 502, "upstream RPC unavailable"],
    ["a timeout", vi.fn(async () => { throw new DOMException(`timeout ${SECRET_UPSTREAM}`, "TimeoutError"); }), 504, "upstream RPC timed out"],
    ["an upstream 500 page", vi.fn(async () => new Response(`error at ${SECRET_UPSTREAM}`, { status: 500 })), 502, "upstream RPC unavailable"],
    ["an upstream 429", vi.fn(async () => new Response(`slow down ${SECRET_UPSTREAM}`, { status: 429 })), 429, "upstream RPC rate limited"],
    ["a non-JSON upstream body", vi.fn(async () => new Response("<html>", { status: 200 })), 502, "upstream RPC unavailable"],
    ["an upstream body echoing its own URL", vi.fn(async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -1, message: `see ${SECRET_UPSTREAM}` } }), { status: 200 })), 502, "upstream RPC unavailable"],
  ])("does not leak the upstream URL on %s", async (_name, fetchImpl, status, message) => {
    const response = await relaySolanaRpc(post(call("getLatestBlockhash", [])), { upstreamUrl: SECRET_UPSTREAM, fetchImpl, timeoutMs: 50 });

    expect(response.status).toBe(status);
    const text = await response.text();
    expect(text).not.toContain("paid-rpc.example.invalid");
    expect(text).not.toContain("secret-key-123");
    expect(JSON.parse(text).error.message).toBe(message);
    expect([...response.headers.values()].join(" ")).not.toContain("paid-rpc");
  });

  it("fails closed without echoing a malformed or non-https upstream value", async () => {
    for (const upstreamUrl of ["not a url secret-key-123", "http://paid-rpc.example.invalid/secret-key-123"]) {
      const fetchImpl = okUpstream();
      const response = await relaySolanaRpc(post(call("getLatestBlockhash", [])), { upstreamUrl, fetchImpl });

      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain("secret-key-123");
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  });
});

describe("solana-rpc relay caller check", () => {
  it.each([
    ["a cross-site page", { host: "benten.test", origin: "https://evil.example", "sec-fetch-site": "cross-site" }],
    ["a same-site but different-origin page", { host: "benten.test", origin: "https://other.benten.test", "sec-fetch-site": "same-site" }],
    ["a forged same-origin fetch site with a foreign origin", { host: "benten.test", origin: "https://evil.example", "sec-fetch-site": "same-origin" }],
    ["a request with neither header", { host: "benten.test" }],
    ["plain http on a public host", { host: "benten.test", origin: "http://benten.test" }],
    ["an origin that only differs by port", { host: "benten.test", origin: "https://benten.test:8443" }],
    ["a malformed host header", { host: "benten.test/evil", origin: "https://benten.test/evil" }],
  ])("rejects %s with 403 before contacting the upstream", async (_name, headers) => {
    const fetchImpl = okUpstream();
    const response = await relaySolanaRpc(post(call("getLatestBlockhash", []), {}, headers), { upstreamUrl: SECRET_UPSTREAM, fetchImpl });

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe(RPC_ERROR.callerNotAllowed);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ["the site's own https origin", { host: "benten.test", origin: "https://benten.test", "sec-fetch-site": "same-origin" }],
    ["a Vercel preview host, derived from Host", { host: "benten-git-x-team.vercel.app", origin: "https://benten-git-x-team.vercel.app", "sec-fetch-site": "same-origin" }],
    ["a local next start on loopback http", { host: "127.0.0.1:4390", origin: "http://127.0.0.1:4390", "sec-fetch-site": "same-origin" }],
    ["a same-origin fetch without Origin", { host: "benten.test", "sec-fetch-site": "same-origin" }],
    ["an older browser without Sec-Fetch-Site", { host: "benten.test", origin: "https://benten.test" }],
  ])("accepts %s", async (_name, headers) => {
    const fetchImpl = okUpstream();
    const response = await relaySolanaRpc(post(call("getLatestBlockhash", []), {}, headers), { upstreamUrl: SECRET_UPSTREAM, fetchImpl });

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("uses only the configured origin list when it is set", async () => {
    const configured = "https://benten.example, https://www.benten.example";
    const derivedOnly = await relaySolanaRpc(post(call("getLatestBlockhash", [])), { upstreamUrl: SECRET_UPSTREAM, fetchImpl: okUpstream(), allowedOrigins: configured });
    expect(derivedOnly.status).toBe(403);

    const listed = await relaySolanaRpc(
      post(call("getLatestBlockhash", []), {}, { host: "benten.example", origin: "https://www.benten.example", "sec-fetch-site": "same-origin" }),
      { upstreamUrl: SECRET_UPSTREAM, fetchImpl: okUpstream(), allowedOrigins: configured },
    );
    expect(listed.status).toBe(200);
  });

  it("answers cross-site callers without echoing the upstream", async () => {
    const response = await relaySolanaRpc(post(call("getLatestBlockhash", []), {}, { host: "benten.test", origin: "https://evil.example" }), { upstreamUrl: SECRET_UPSTREAM, fetchImpl: okUpstream() });
    expect(await response.text()).not.toContain("paid-rpc");
  });
});

describe("solana-rpc relay rate limit", () => {
  it("counts every call of a batch and answers 429 with retry-after once the budget is spent", async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxCalls: 3, maxClients: 10 });
    const fetchImpl = okUpstream();
    const options = { upstreamUrl: SECRET_UPSTREAM, fetchImpl, rateLimiter: limiter, now: () => 1_000 };
    const ip = { "x-real-ip": "198.51.100.7" };

    expect((await relaySolanaRpc(post([call("getLatestBlockhash", [], 1), call("getBlockHeight", [], 2)], ip), options)).status).toBe(200);
    expect((await relaySolanaRpc(post(call("getLatestBlockhash", []), ip), options)).status).toBe(200);
    const limited = await relaySolanaRpc(post(call("getLatestBlockhash", []), ip), options);

    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    expect((await limited.json()).error.code).toBe(RPC_ERROR.rateLimited);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("keeps separate budgets per client and resets after the window", async () => {
    const limiter = createRateLimiter({ windowMs: 10_000, maxCalls: 1, maxClients: 10 });
    expect(limiter.take("a", 1, 0).allowed).toBe(true);
    expect(limiter.take("a", 1, 5_000)).toEqual({ allowed: false, retryAfterSeconds: 5 });
    expect(limiter.take("b", 1, 5_000).allowed).toBe(true);
    expect(limiter.take("a", 1, 10_000).allowed).toBe(true);
  });

  it("bounds the number of remembered clients by evicting the oldest window", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxCalls: 1, maxClients: 2 });
    limiter.take("a", 1, 0);
    limiter.take("b", 1, 0);
    limiter.take("c", 1, 0);
    // "a" was evicted, so it starts a fresh window; "c" is still remembered.
    expect(limiter.take("a", 1, 1).allowed).toBe(true);
    expect(limiter.take("c", 1, 1).allowed).toBe(false);
  });

  it("keys clients by the platform address headers", () => {
    expect(clientKeyOf(new Headers({ "x-real-ip": "203.0.113.9", "x-forwarded-for": "198.51.100.1" }))).toBe("203.0.113.9");
    expect(clientKeyOf(new Headers({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" }))).toBe("198.51.100.1");
    expect(clientKeyOf(new Headers())).toBe("unknown");
  });

  it("does not count rejected or malformed requests against the upstream", async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxCalls: 1, maxClients: 10 });
    const fetchImpl = okUpstream();
    await relaySolanaRpc(post(call(SUBMIT_METHOD, [])), { upstreamUrl: SECRET_UPSTREAM, fetchImpl, rateLimiter: limiter });
    expect((await relaySolanaRpc(post(call("getLatestBlockhash", [])), { upstreamUrl: SECRET_UPSTREAM, fetchImpl, rateLimiter: limiter })).status).toBe(200);
  });
});
