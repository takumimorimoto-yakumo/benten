import { describe, expect, it, vi } from "vitest";

// The pool SDK does not load under the test runner's ESM resolver; the pool read and the local quote are stubbed.
const readPoolState = vi.hoisted(() => vi.fn());
const quoteOnPoolState = vi.hoisted(() => vi.fn());
vi.mock("./quote", () => ({ readPoolState, quoteOnPoolState }));

const POOL_STATE = { pool: { id: "pool" }, binArrays: [] };

/** A local quote that scales with the amount, so each amount gets its own answer. */
function localQuote(_state: unknown, amountRaw: bigint) {
  return { quote: {
    consumedInputRaw: amountRaw.toString(), outputRaw: (amountRaw * 4n / 9n).toString(), minimumOutputRaw: (amountRaw * 4n / 9n * 99n / 100n).toString(),
    feeRaw: "11254", protocolFeeRaw: "1249", feeOnInput: true, priceImpactPct: "0.0111",
  } };
}

function resetPool() {
  readPoolState.mockReset();
  readPoolState.mockResolvedValue(POOL_STATE);
  quoteOnPoolState.mockReset();
  quoteOnPoolState.mockImplementation(localQuote);
}

const { createServerQuoteReader } = await import("./server-quote");
const { NVDAX_MINT, USDC_MINT } = await import("./route");
const { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } = await import("@benten/solana");

/** A mint account (82 bytes): supply at 36, decimals at 44, initialized at 45. */
function mintAccount(decimals: number, owner: string) {
  const data = new Uint8Array(82);
  data[44] = decimals;
  data[45] = 1;
  return { data: [Buffer.from(data).toString("base64"), "base64"], executable: false, lamports: 1, owner, rentEpoch: 0, space: 82 };
}

function mintsUpstream() {
  return vi.fn(async (_url: unknown, init?: RequestInit) => {
    const call = JSON.parse(String(init?.body));
    const value = [mintAccount(6, TOKEN_PROGRAM_ID.toBase58()), mintAccount(8, TOKEN_2022_PROGRAM_ID.toBase58())];
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: call.id, result: { context: { slot: 1 }, value } }));
  });
}

describe("server-side quote reader", () => {
  it("applies the amount field's checks before any upstream read", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}"));
    const read = createServerQuoteReader({ env: {}, fetchImpl });
    await expect(read("10.01")).resolves.toEqual({ ok: false, reason: "over_limit", max_amount_usdc: "10.00", retryable: false });
    for (const text of ["0", "-1", "1e1", "abc", ""]) {
      await expect(read(text)).resolves.toMatchObject({ ok: false, reason: "invalid_amount" });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails closed without a usable upstream", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}"));
    const read = createServerQuoteReader({ env: { SOLANA_RPC_UPSTREAM_URL: "http://insecure.example" }, fetchImpl });
    await expect(read("5")).resolves.toMatchObject({ ok: false, reason: "upstream_unavailable" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports an upstream that does not answer as unavailable and retryable", async () => {
    const fetchImpl = vi.fn(async () => new Response("upstream down", { status: 502 }));
    const read = createServerQuoteReader({ env: { SOLANA_RPC_UPSTREAM_URL: "https://rpc.example.invalid" }, fetchImpl });
    await expect(read("5")).resolves.toMatchObject({ ok: false, reason: "upstream_unavailable", retryable: true });
  });

  it("reports missing route mints as a route check failure", async () => {
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const call = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: call.id, result: { context: { slot: 1 }, value: [null, null] } }));
    });
    const read = createServerQuoteReader({ env: {}, fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(read("5")).resolves.toMatchObject({ ok: false, reason: "route_check", retryable: false });
  });

  it("returns the pool quote, its expiry and the link query", async () => {
    resetPool();
    const now = 1_000_000;
    const read = createServerQuoteReader({ env: {}, fetchImpl: mintsUpstream() as unknown as typeof fetch, now: () => now });
    const result = await read("5");
    expect(result).toMatchObject({
      ok: true, amount_usdc: "5.00", amount_raw: "5000000", max_amount_usdc: "10.00", slippage_bps: 100,
      route: { input_mint: USDC_MINT.toBase58(), output_mint: NVDAX_MINT.toBase58() },
      quote: { consumedInputRaw: "5000000", outputRaw: "2222222" },
      quoted_at_ms: 1_000_000, expires_at_ms: 1_030_000, buy_query: "?amount=5.00",
    });
    expect(quoteOnPoolState).toHaveBeenCalledWith(expect.objectContaining(POOL_STATE), 5_000_000n, 100);
  });

  it("reads the route state once per cache window and quotes every amount locally", async () => {
    resetPool();
    let now = 1_000_000;
    const upstream = mintsUpstream();
    const read = createServerQuoteReader({ env: {}, fetchImpl: upstream as unknown as typeof fetch, now: () => now });
    const amounts = ["5", "1", "2.5", "7.25", "10", "0.01"];
    const results = [];
    for (const amount of amounts) {
      results.push(await read(amount));
      now += 500;
    }
    // Every amount got its own quote, from one mint read and one pool read.
    expect(results.map((result) => result.ok && result.quote.consumedInputRaw)).toEqual(["5000000", "1000000", "2500000", "7250000", "10000000", "10000"]);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(readPoolState).toHaveBeenCalledTimes(1);
    expect(quoteOnPoolState).toHaveBeenCalledTimes(amounts.length);
    // After the window, the next call refreshes once.
    now = 1_000_000 + 5_000;
    await read("3");
    await read("4");
    expect(upstream).toHaveBeenCalledTimes(2);
    expect(readPoolState).toHaveBeenCalledTimes(2);
  });

  it("shares one refresh among concurrent callers", async () => {
    resetPool();
    const upstream = mintsUpstream();
    const read = createServerQuoteReader({ env: {}, fetchImpl: upstream as unknown as typeof fetch });
    const results = await Promise.all(Array.from({ length: 20 }, (_, index) => read(String(index % 10 + 1))));
    expect(results.every((result) => result.ok)).toBe(true);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(readPoolState).toHaveBeenCalledTimes(1);
  });

  it("answers a failed refresh for the minimum refresh interval, then tries again", async () => {
    resetPool();
    let now = 1_000_000;
    const upstream = vi.fn(async () => new Response("upstream down", { status: 502 }));
    const read = createServerQuoteReader({ env: {}, fetchImpl: upstream as unknown as typeof fetch, now: () => now });
    for (const amount of ["5", "6", "7"]) {
      await expect(read(amount)).resolves.toMatchObject({ ok: false, reason: "upstream_unavailable", retryable: true });
    }
    const failedReads = upstream.mock.calls.length;
    expect(failedReads).toBeGreaterThan(0);
    now += 1_000;
    await read("5");
    expect(upstream.mock.calls.length).toBe(failedReads * 2);
  });

  it("keeps upstream reads within 60 refreshes a minute under a flood of calls", async () => {
    resetPool();
    let now = 0;
    const upstream = mintsUpstream();
    const read = createServerQuoteReader({ env: {}, fetchImpl: upstream as unknown as typeof fetch, now: () => now });
    for (let call = 0; call < 6_000; call += 1) {
      await read(String(call % 10 + 1));
      now += 10;
    }
    // One minute of calls every 10 ms: one refresh per 5-second window.
    expect(readPoolState).toHaveBeenCalledTimes(12);
    expect(upstream).toHaveBeenCalledTimes(12);
  });

  it("reports a pool identity mismatch as a route check failure", async () => {
    resetPool();
    readPoolState.mockRejectedValue(Object.assign(new Error("mismatch"), { name: "RoutePoolMismatchError" }));
    const read = createServerQuoteReader({ env: {}, fetchImpl: mintsUpstream() as unknown as typeof fetch });
    await expect(read("5")).resolves.toMatchObject({ ok: false, reason: "route_check", retryable: false });
  });
});
