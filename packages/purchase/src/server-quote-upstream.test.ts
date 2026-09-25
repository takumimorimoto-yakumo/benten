/**
 * The server quote reader's shared upstream protection, against a stub
 * upstream: one token bucket over every state's requests (`busy` when spent),
 * a doubling wait after a state's consecutive failures (capped), and one
 * pause for every state after an upstream 429 or `Retry-After`.
 */
import { describe, expect, it, vi } from "vitest";

// The pool SDK does not load under the test runner's ESM resolver; the pool reads are stubbed and
// issue their upstream requests through the reader's own connection, like the SDK does.
const readPoolState = vi.hoisted(() => vi.fn());
const quoteOnPoolState = vi.hoisted(() => vi.fn());
const readLegPoolState = vi.hoisted(() => vi.fn());
const quoteLegOnPoolState = vi.hoisted(() => vi.fn());
vi.mock("./quote", () => ({ readPoolState, quoteOnPoolState, readLegPoolState, quoteLegOnPoolState }));

const { backoffMs, createServerQuoteReader, retryAfterMs } = await import("./server-quote");
const { PURCHASE_CONFIG } = await import("./config");
const { PRODUCT_TICKERS } = await import("./routes-table");
const { WSOL_MINT } = await import("./route");
const { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } = await import("@benten/solana");

type Connection = { getSlot(): Promise<number> };

/** Pool reads measured at 4 upstream requests besides the mint read (5 per refresh). */
const POOL_READS = 4;
const POOL_STATE = { pool: { id: "pool" }, binArrays: [] };
const QUOTE = { consumedInputRaw: "1", outputRaw: "1", minimumOutputRaw: "1", feeRaw: "0", protocolFeeRaw: "0", feeOnInput: true, priceImpactPct: "0" };

async function poolReads(connection: Connection) {
  for (let read = 0; read < POOL_READS; read += 1) await connection.getSlot();
  return POOL_STATE;
}

function resetPool() {
  readPoolState.mockReset();
  readPoolState.mockImplementation(poolReads);
  quoteOnPoolState.mockReset();
  quoteOnPoolState.mockImplementation((_state: unknown, amountRaw: bigint) => ({ quote: { ...QUOTE, consumedInputRaw: amountRaw.toString() } }));
  readLegPoolState.mockReset();
  readLegPoolState.mockImplementation(poolReads);
  quoteLegOnPoolState.mockReset();
  quoteLegOnPoolState.mockImplementation((_state: unknown, amountRaw: bigint) => ({ ...QUOTE, consumedInputRaw: amountRaw.toString(), outputRaw: "1000000", minimumOutputRaw: "990000" }));
}

function mintAccount(decimals: number, owner: string) {
  const data = new Uint8Array(82);
  data[44] = decimals;
  data[45] = 1;
  return { data: [Buffer.from(data).toString("base64"), "base64"], executable: false, lamports: 1, owner, rentEpoch: 0, space: 82 };
}

/** A stub upstream that records each request with the reader's clock; `override` answers a request instead (for 429s). */
function stubUpstream(clock: () => number, override?: (method: string) => Response | null) {
  const requests: { method: string; at: number }[] = [];
  const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const call = JSON.parse(String(init?.body));
    requests.push({ method: call.method, at: clock() });
    const answer = override?.(call.method);
    if (answer) return answer;
    const result = call.method === "getSlot"
      ? 1
      : {
        context: { slot: 1 },
        value: call.method === "getAccountInfo"
          ? mintAccount(call.params[0] === WSOL_MINT.toBase58() ? 9 : 6, TOKEN_PROGRAM_ID.toBase58())
          : [mintAccount(6, TOKEN_PROGRAM_ID.toBase58()), mintAccount(8, TOKEN_2022_PROGRAM_ID.toBase58())],
      };
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: call.id, result }));
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, requests };
}

const BUSY = { ok: false, reason: "busy", max_amount_usdc: "10.00", retryable: true };

/** Every state of the reader, one read each: eight product routes (USDC), then the SOL and SKR first legs. */
const EVERY_STATE: readonly [string, string, string][] = [...PRODUCT_TICKERS.map((ticker): [string, string, string] => ["2", "USDC", ticker]), ["0.01", "SOL", "NVDA"], ["100", "SKR", "NVDA"]];

describe("shared upstream budget", () => {
  it("keeps every minute within the burst plus the per-minute rate, and answers busy beyond it", async () => {
    resetPool();
    let now = 0;
    const upstream = stubUpstream(() => now);
    const read = createServerQuoteReader({ env: {}, fetchImpl: upstream.fetchImpl, now: () => now });
    const minutes = 10;
    let busy = 0;
    // Every state is read twice a second for ten minutes: unbounded, the 5-second cache alone would allow 600 requests a minute.
    for (now = 0; now < minutes * 60_000; now += 500) {
      for (const [amount, payToken, ticker] of EVERY_STATE) {
        const result = await read(amount, payToken, ticker);
        if (!result.ok && result.reason === "busy") busy += 1;
      }
    }
    const { serverQuoteUpstreamPerMinute: perMinute, serverQuoteUpstreamBurst: burst } = PURCHASE_CONFIG;
    expect(perMinute).toBe(300);
    expect(upstream.requests.length).toBeLessThanOrEqual(burst + perMinute * minutes);
    for (let start = 0; start + 60_000 <= minutes * 60_000; start += 5_000) {
      const inWindow = upstream.requests.filter(({ at }) => at >= start && at < start + 60_000).length;
      expect(inWindow).toBeLessThanOrEqual(burst + perMinute);
    }
    // The budget, not the cache, is what bounds this load: calls beyond it were answered busy.
    expect(busy).toBeGreaterThan(0);
  });

  it("answers busy without reaching the upstream once the budget is spent", async () => {
    resetPool();
    const now = 0;
    const upstream = stubUpstream(() => now);
    const read = createServerQuoteReader({ env: {}, fetchImpl: upstream.fetchImpl, now: () => now });
    // The burst covers one cold refresh of every state (10 x 5 requests) and no more.
    for (const [amount, payToken, ticker] of EVERY_STATE) await expect(read(amount, payToken, ticker)).resolves.toMatchObject({ ok: true });
    expect(upstream.requests).toHaveLength(PURCHASE_CONFIG.serverQuoteUpstreamBurst);
    // Cached states are still served without any request.
    await expect(read("3", "USDC", "META")).resolves.toMatchObject({ ok: true });
    expect(upstream.requests).toHaveLength(PURCHASE_CONFIG.serverQuoteUpstreamBurst);
  });

  it("answers busy for a refresh that runs out of tokens part way, and does not count it as a failure", async () => {
    resetPool();
    let now = 0;
    const upstream = stubUpstream(() => now);
    const read = createServerQuoteReader({ env: {}, fetchImpl: upstream.fetchImpl, now: () => now });
    for (const [amount, payToken, ticker] of EVERY_STATE) await read(amount, payToken, ticker);
    // 5.6 s later every cached state has expired and the bucket holds 28 tokens: five refreshes, then 3 tokens for a sixth.
    now = 5_600;
    const results = [];
    for (const ticker of PRODUCT_TICKERS) results.push(await read("2", "USDC", ticker));
    expect(results.slice(0, 5).every((result) => result.ok)).toBe(true);
    expect(results.slice(5)).toEqual([BUSY, BUSY, BUSY]);
    // A busy answer leaves no failure wait behind: the state refreshes as soon as tokens are back.
    now = 5_600 + 2_000;
    await expect(read("2", "USDC", PRODUCT_TICKERS[5])).resolves.toMatchObject({ ok: true });
  });
});

describe("failure backoff per state", () => {
  it("doubles the wait from 1 s up to 30 s", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 50].map(backoffMs)).toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000]);
    expect(PURCHASE_CONFIG.serverQuoteMaxBackoffMs).toBe(30_000);
  });

  it("retries a failing state after 1, 2, 4, 8, 16, 30, 30 s, and starts again at 1 s after a success", async () => {
    resetPool();
    let now = 0;
    let down = true;
    readPoolState.mockImplementation(async (connection: Connection) => {
      await connection.getSlot();
      if (down) throw new Error("pool unreachable");
      return POOL_STATE;
    });
    const upstream = stubUpstream(() => now);
    const read = createServerQuoteReader({ env: {}, fetchImpl: upstream.fetchImpl, now: () => now });
    const attempts: number[] = [];
    for (now = 0; now <= 120_000; now += 100) {
      const before = readPoolState.mock.calls.length;
      const result = await read("2", "USDC", "HOOD");
      if (readPoolState.mock.calls.length > before) attempts.push(now);
      expect(result).toMatchObject({ ok: false, reason: "upstream_unavailable", retryable: true });
    }
    const gaps = attempts.slice(1).map((at, index) => at - attempts[index]!);
    expect(gaps).toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000]);

    // Up again: the next attempt (at the end of the current wait) succeeds and clears the count.
    down = false;
    now = attempts.at(-1)! + 30_000;
    await expect(read("2", "USDC", "HOOD")).resolves.toMatchObject({ ok: true });
    down = true;
    now += PURCHASE_CONFIG.serverQuoteCacheMs;
    await read("2", "USDC", "HOOD");
    const failedAt = now;
    const calls = readPoolState.mock.calls.length;
    now = failedAt + 999;
    await read("2", "USDC", "HOOD");
    expect(readPoolState.mock.calls.length).toBe(calls);
    now = failedAt + 1_000;
    await read("2", "USDC", "HOOD");
    expect(readPoolState.mock.calls.length).toBe(calls + 1);
  });
});

describe("upstream 429 and Retry-After pause every state", () => {
  it("reads Retry-After as delta seconds or an HTTP date", () => {
    expect(retryAfterMs("7", 0)).toBe(7_000);
    expect(retryAfterMs(" 0 ", 0)).toBe(0);
    expect(retryAfterMs(new Date(12_000).toUTCString(), 2_000)).toBe(10_000);
    expect(retryAfterMs(new Date(0).toUTCString(), 5_000)).toBe(0);
    expect(retryAfterMs("soon", 0)).toBeNull();
    expect(retryAfterMs("-3", 0)).toBeNull();
    expect(retryAfterMs("1.5", 0)).toBeNull();
    expect(retryAfterMs("2026-09-25", 0)).toBeNull();
    expect(retryAfterMs(null, 0)).toBeNull();
  });

  it("stops every state for Retry-After after a 429, answering busy with no upstream request, then resumes", async () => {
    resetPool();
    let now = 0;
    let limited = true;
    const upstream = stubUpstream(() => now, () => (limited ? new Response("rate limited", { status: 429, headers: { "Retry-After": "7" } }) : null));
    const read = createServerQuoteReader({ env: {}, fetchImpl: upstream.fetchImpl, now: () => now });
    await expect(read("2", "USDC", "META")).resolves.toEqual(BUSY);
    expect(upstream.requests).toHaveLength(1);
    limited = false;
    for (now = 100; now < 7_000; now += 100) {
      for (const [amount, payToken, ticker] of EVERY_STATE) await expect(read(amount, payToken, ticker)).resolves.toEqual(BUSY);
    }
    expect(upstream.requests).toHaveLength(1);
    now = 7_000;
    await expect(read("2", "USDC", "TSLA")).resolves.toMatchObject({ ok: true });
    await expect(read("2", "USDC", "META")).resolves.toMatchObject({ ok: true });
  });

  it("doubles the pause over consecutive 429s without Retry-After, capped at 30 s, and caps a longer Retry-After", async () => {
    resetPool();
    let now = 0;
    let answer: Response | null = null;
    const upstream = stubUpstream(() => now, () => answer?.clone() ?? null);
    const read = createServerQuoteReader({ env: {}, fetchImpl: upstream.fetchImpl, now: () => now });
    answer = new Response("rate limited", { status: 429 });
    const resumedAfter: number[] = [];
    let pausedFrom = 0;
    for (now = 0; now <= 200_000 && resumedAfter.length < 7; now += 100) {
      const before = upstream.requests.length;
      await read("2", "USDC", "META");
      if (upstream.requests.length > before) {
        if (now > 0) resumedAfter.push(now - pausedFrom);
        pausedFrom = now;
      }
    }
    expect(resumedAfter).toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000]);

    // A Retry-After beyond the cap pauses for the cap.
    const capped = stubUpstream(() => now, () => new Response("slow down", { status: 429, headers: { "Retry-After": "3600" } }));
    const cappedRead = createServerQuoteReader({ env: {}, fetchImpl: capped.fetchImpl, now: () => now });
    const start = now;
    await cappedRead("2", "USDC", "META");
    now = start + 29_900;
    await expect(cappedRead("2", "USDC", "SPY")).resolves.toEqual(BUSY);
    expect(capped.requests).toHaveLength(1);
    now = start + 30_000;
    await cappedRead("2", "USDC", "SPY");
    expect(capped.requests).toHaveLength(2);
  });

  it("pauses on Retry-After carried by another status, too", async () => {
    resetPool();
    let now = 0;
    let first = true;
    const upstream = stubUpstream(() => now, () => {
      if (!first) return null;
      first = false;
      return new Response("maintenance", { status: 503, headers: { "Retry-After": "3" } });
    });
    const read = createServerQuoteReader({ env: {}, fetchImpl: upstream.fetchImpl, now: () => now });
    await expect(read("2", "USDC", "GOOGL")).resolves.toEqual(BUSY);
    now = 2_900;
    await expect(read("2", "USDC", "CRCL")).resolves.toEqual(BUSY);
    expect(upstream.requests).toHaveLength(1);
    now = 3_000;
    await expect(read("2", "USDC", "CRCL")).resolves.toMatchObject({ ok: true });
  });
});
