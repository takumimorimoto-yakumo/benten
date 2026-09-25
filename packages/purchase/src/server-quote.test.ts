import { describe, expect, it, vi } from "vitest";

// The pool SDK does not load under the test runner's ESM resolver; the pool read and the local quote are stubbed.
const readPoolState = vi.hoisted(() => vi.fn());
const quoteOnPoolState = vi.hoisted(() => vi.fn());
const readLegPoolState = vi.hoisted(() => vi.fn());
const quoteLegOnPoolState = vi.hoisted(() => vi.fn());
vi.mock("./quote", () => ({ readPoolState, quoteOnPoolState, readLegPoolState, quoteLegOnPoolState }));

const POOL_STATE = { pool: { id: "pool" }, binArrays: [] };

/** A local quote that scales with the amount, so each amount gets its own answer. */
function localQuote(_state: unknown, amountRaw: bigint) {
  return { quote: {
    consumedInputRaw: amountRaw.toString(), outputRaw: (amountRaw * 4n / 9n).toString(), minimumOutputRaw: (amountRaw * 4n / 9n * 99n / 100n).toString(),
    feeRaw: "11254", protocolFeeRaw: "1249", feeOnInput: true, priceImpactPct: "0.0111",
  } };
}


/** A first-leg quote: SOL at 200 USDC, SKR at 0.05 USDC, 1% minimum below the estimate. */
function legQuote(state: { pool: { id: string } }, amountRaw: bigint) {
  const usdcOut = state.pool.id === "SOL-leg" ? amountRaw * 200n / 1_000n : amountRaw / 20n;
  return {
    consumedInputRaw: amountRaw.toString(), outputRaw: usdcOut.toString(), minimumOutputRaw: (usdcOut * 99n / 100n).toString(),
    feeRaw: "40", protocolFeeRaw: "5", feeOnInput: true, priceImpactPct: "0.002",
  };
}

function resetPool() {
  readPoolState.mockReset();
  readPoolState.mockResolvedValue(POOL_STATE);
  quoteOnPoolState.mockReset();
  quoteOnPoolState.mockImplementation(localQuote);
  readLegPoolState.mockReset();
  readLegPoolState.mockImplementation(async (_connection: unknown, leg: { pool: { toBase58(): string } }) => ({
    pool: { id: leg.pool.toBase58() === SOL_USDC_POOL.toBase58() ? "SOL-leg" : "SKR-leg" }, binArrays: [],
  }));
  quoteLegOnPoolState.mockReset();
  quoteLegOnPoolState.mockImplementation(legQuote);
}

const { createServerQuoteReader } = await import("./server-quote");
const { NVDAX_MINT, SKR_MINT, SKR_USDC_POOL, SOL_USDC_POOL, USDC_MINT, WSOL_MINT } = await import("./route");
const { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } = await import("@benten/solana");

/** A mint account (82 bytes): supply at 36, decimals at 44, initialized at 45. */
function mintAccount(decimals: number, owner: string) {
  const data = new Uint8Array(82);
  data[44] = decimals;
  data[45] = 1;
  return { data: [Buffer.from(data).toString("base64"), "base64"], executable: false, lamports: 1, owner, rentEpoch: 0, space: 82 };
}

/** The upstream RPC: the two route mints (`getMultipleAccounts`) and a pay mint (`getAccountInfo`). */
function mintsUpstream(payMintDecimals: Record<string, number> = { [WSOL_MINT.toBase58()]: 9, [SKR_MINT.toBase58()]: 6 }) {
  return vi.fn(async (_url: unknown, init?: RequestInit) => {
    const call = JSON.parse(String(init?.body));
    const value = call.method === "getAccountInfo"
      ? (payMintDecimals[call.params[0]] === undefined ? null : mintAccount(payMintDecimals[call.params[0]]!, TOKEN_PROGRAM_ID.toBase58()))
      : [mintAccount(6, TOKEN_PROGRAM_ID.toBase58()), mintAccount(8, TOKEN_2022_PROGRAM_ID.toBase58())];
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: call.id, result: { context: { slot: 1 }, value } }));
  });
}

const methodsOf = (upstream: ReturnType<typeof mintsUpstream>) => upstream.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).method as string);

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

  it("keeps the USDC call without a pay token exactly as before, and names the pay token", async () => {
    resetPool();
    const read = createServerQuoteReader({ env: {}, fetchImpl: mintsUpstream() as unknown as typeof fetch, now: () => 1_000_000 });
    const legacy = await read("5");
    const explicit = await read("5", "USDC");
    expect(legacy).toEqual(explicit);
    expect(legacy).toMatchObject({ ok: true, pay_token: "USDC", amount_in: "5.00", amount_in_raw: "5000000", amount_usdc: "5.00", first_leg: null, buy_query: "?amount=5.00" });
    expect(readLegPoolState).not.toHaveBeenCalled();
  });

  it.each([["sol"], ["Sol"], [" SOL"], ["BTC"], [""], ["usdc"]])("refuses the pay token %j before any upstream read", async (payToken) => {
    const fetchImpl = vi.fn(async () => new Response("{}"));
    const read = createServerQuoteReader({ env: {}, fetchImpl });
    await expect(read("1", payToken)).resolves.toEqual({ ok: false, reason: "invalid_pay_token", max_amount_usdc: "10.00", retryable: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("checks a SOL or SKR amount in that token's units before any upstream read", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}"));
    const read = createServerQuoteReader({ env: {}, fetchImpl });
    for (const [text, payToken] of [["0.0000000001", "SOL"], ["1.0000001", "SKR"], ["0", "SOL"], ["-1", "SKR"], ["1e1", "SOL"], ["", "SKR"]] as const) {
      await expect(read(text, payToken), `${text} ${payToken}`).resolves.toMatchObject({ ok: false, reason: "invalid_amount", retryable: false });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ["SOL", "0.02", { amount_in: "0.02", amount_in_raw: "20000000", usdcOut: "4000000", usdcMin: "3960000", pool: () => SOL_USDC_POOL, mint: () => WSOL_MINT, decimals: 9, query: "?amount=0.02&pay=sol" }],
    ["SKR", "100", { amount_in: "100.00", amount_in_raw: "100000000", usdcOut: "5000000", usdcMin: "4950000", pool: () => SKR_USDC_POOL, mint: () => SKR_MINT, decimals: 6, query: "?amount=100.00&pay=skr" }],
  ] as const)("quotes the fixed two-leg route for %s: first leg, then exactly its USDC minimum into the fixed pool", async (payToken, text, expected) => {
    resetPool();
    let now = 2_000_000;
    const read = createServerQuoteReader({ env: {}, fetchImpl: mintsUpstream() as unknown as typeof fetch, now: () => now++ });
    const result = await read(text, payToken);
    expect(result).toMatchObject({
      ok: true,
      pay_token: payToken,
      amount_in: expected.amount_in,
      amount_in_raw: expected.amount_in_raw,
      amount_raw: expected.usdcMin,
      max_amount_usdc: "10.00",
      slippage_bps: 100,
      first_leg: {
        route: { pool: expected.pool().toBase58(), input_mint: expected.mint().toBase58(), input_symbol: payToken, input_decimals: expected.decimals, output_mint: USDC_MINT.toBase58(), output_decimals: 6 },
        quote: { consumedInputRaw: expected.amount_in_raw, outputRaw: expected.usdcOut, minimumOutputRaw: expected.usdcMin },
      },
      route: { input_mint: USDC_MINT.toBase58(), output_mint: NVDAX_MINT.toBase58() },
      quote: { consumedInputRaw: expected.usdcMin },
      buy_query: expected.query,
    });
    expect(result.ok && result.expires_at_ms - result.quoted_at_ms).toBe(30_000);
    expect(quoteOnPoolState).toHaveBeenCalledWith(expect.objectContaining(POOL_STATE), BigInt(expected.usdcMin), 100);
  });

  it.each([
    ["SOL", "0.05", "0.050000005"],
    ["SKR", "200", "200.00002"],
  ] as const)("refuses a %s amount whose first leg is quoted above 10 USDC", async (payToken, atLimit, overLimit) => {
    resetPool();
    const read = createServerQuoteReader({ env: {}, fetchImpl: mintsUpstream() as unknown as typeof fetch });
    await expect(read(atLimit, payToken)).resolves.toMatchObject({ ok: true, first_leg: { quote: { outputRaw: "10000000" } } });
    await expect(read(overLimit, payToken)).resolves.toEqual({ ok: false, reason: "over_limit", max_amount_usdc: "10.00", retryable: false });
    // A large amount is refused from the quote, never by building anything.
    await expect(read("1000000", payToken)).resolves.toMatchObject({ ok: false, reason: "over_limit" });
    expect(quoteOnPoolState).toHaveBeenCalledTimes(1);
  });

  it("refuses an amount the first pool cannot take whole", async () => {
    resetPool();
    quoteLegOnPoolState.mockImplementation((state: { pool: { id: string } }, amountRaw: bigint) => ({ ...legQuote(state, amountRaw), consumedInputRaw: (amountRaw / 2n).toString(), outputRaw: "1" }));
    const read = createServerQuoteReader({ env: {}, fetchImpl: mintsUpstream() as unknown as typeof fetch });
    await expect(read("0.01", "SOL")).resolves.toMatchObject({ ok: false, reason: "over_limit" });
  });

  it("reports a pay mint with other decimals, or a first-leg pool identity mismatch, as a route check failure", async () => {
    resetPool();
    const wrongDecimals = createServerQuoteReader({ env: {}, fetchImpl: mintsUpstream({ [WSOL_MINT.toBase58()]: 6 }) as unknown as typeof fetch });
    await expect(wrongDecimals("0.02", "SOL")).resolves.toMatchObject({ ok: false, reason: "route_check", retryable: false });
    readLegPoolState.mockRejectedValue(Object.assign(new Error("mismatch"), { name: "RoutePoolMismatchError" }));
    const mismatch = createServerQuoteReader({ env: {}, fetchImpl: mintsUpstream() as unknown as typeof fetch });
    await expect(mismatch("100", "SKR")).resolves.toMatchObject({ ok: false, reason: "route_check", retryable: false });
  });

  it("reads each pay token's state once per cache window, whatever the number of callers", async () => {
    resetPool();
    let now = 1_000_000;
    const upstream = mintsUpstream();
    const read = createServerQuoteReader({ env: {}, fetchImpl: upstream as unknown as typeof fetch, now: () => now });
    // 60 concurrent callers across the three pay tokens.
    const calls = Array.from({ length: 60 }, (_, index) => {
      const payToken = (["USDC", "SOL", "SKR"] as const)[index % 3]!;
      return read(payToken === "SOL" ? "0.01" : payToken === "SKR" ? "50" : "1", payToken);
    });
    const results = await Promise.all(calls);
    expect(results.every((result) => result.ok)).toBe(true);
    // One route read (route mints + fixed pool), one read per pay token (pay mint + first-leg pool).
    expect(readPoolState).toHaveBeenCalledTimes(1);
    expect(readLegPoolState).toHaveBeenCalledTimes(2);
    expect(methodsOf(upstream).sort()).toEqual(["getAccountInfo", "getAccountInfo", "getMultipleAccounts"]);
    // Sequential calls inside the window add no upstream read.
    for (let call = 0; call < 30; call += 1) {
      await read("0.01", "SOL");
      await read("50", "SKR");
      now += 100;
    }
    expect(upstream).toHaveBeenCalledTimes(3);
    expect(readLegPoolState).toHaveBeenCalledTimes(2);
    // After the window, one refresh per state.
    now = 1_000_000 + 5_000;
    await Promise.all([read("0.01", "SOL"), read("0.01", "SOL"), read("50", "SKR")]);
    expect(readPoolState).toHaveBeenCalledTimes(2);
    expect(readLegPoolState).toHaveBeenCalledTimes(4);
    expect(upstream).toHaveBeenCalledTimes(6);
  });

  it("keeps two-leg upstream reads within one refresh per state per cache window under a flood of calls", async () => {
    resetPool();
    let now = 0;
    const upstream = mintsUpstream();
    const read = createServerQuoteReader({ env: {}, fetchImpl: upstream as unknown as typeof fetch, now: () => now });
    for (let call = 0; call < 6_000; call += 1) {
      await read(call % 2 === 0 ? "0.01" : "50", call % 2 === 0 ? "SOL" : "SKR");
      now += 10;
    }
    // One minute of calls every 10 ms: 12 windows, each refreshing the route state and both pay-token states once.
    expect(readPoolState).toHaveBeenCalledTimes(12);
    expect(readLegPoolState).toHaveBeenCalledTimes(24);
    expect(upstream).toHaveBeenCalledTimes(36);
  });
});
