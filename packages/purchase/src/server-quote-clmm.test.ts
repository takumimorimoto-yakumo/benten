/**
 * The server-side quote reader on a Raydium CLMM route: the same cache,
 * refresh and shared upstream budget as the DLMM routes, reading the pinned
 * pool through `getMultipleAccounts` only, from a recorded mainnet snapshot
 * served by a stub upstream.
 */
import { describe, expect, it, vi } from "vitest";
import { PublicKey } from "@solana/web3.js";

// The DLMM SDK does not load under the test runner's ESM resolver; the CLMM route never calls it.
vi.mock("./quote", () => ({ readPoolState: vi.fn(), quoteOnPoolState: vi.fn(), readLegPoolState: vi.fn(), quoteLegOnPoolState: vi.fn() }));

import fixture from "./clmm-pools.fixture.json";

const { createServerQuoteReader } = await import("./server-quote");
const { bitmapExtensionAddress, CLMM_PROGRAM_ID, tickArrayAddress } = await import("./clmm-program");
const { CLMM_PRODUCT_ROUTES } = await import("./routes-table-clmm");
const { USDC_MINT } = await import("./route");
const { CLMM_CONFIG } = await import("./clmm-config");
const { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } = await import("@benten/solana");

function account(data: Uint8Array | Buffer, owner: string) {
  return { data: [Buffer.from(data).toString("base64"), "base64"], executable: false, lamports: 1, owner, rentEpoch: 0, space: data.length };
}

function mint(decimals: number): Uint8Array {
  const data = new Uint8Array(82);
  data[44] = decimals;
  data[45] = 1;
  return data;
}

/** Upstream answering the recorded COIN pool, its config and tick arrays, and both route mints. */
function snapshotUpstream(poolOwner: string = CLMM_PROGRAM_ID.toBase58(), tradeFeeRate?: number, productMint: Uint8Array = mint(8)) {
  const route = CLMM_PRODUCT_ROUTES.COIN;
  const snapshot = fixture.COIN;
  const accounts = new Map<string, ReturnType<typeof account>>([
    [USDC_MINT.toBase58(), account(mint(6), TOKEN_PROGRAM_ID.toBase58())],
    [route.productMint.toBase58(), account(productMint, TOKEN_2022_PROGRAM_ID.toBase58())],
    [route.pool.toBase58(), account(Buffer.from(snapshot.accounts.pool, "base64"), poolOwner)],
    [bitmapExtensionAddress(route.pool).toBase58(), account(new Uint8Array(8), CLMM_PROGRAM_ID.toBase58())],
    [route.clmm.ammConfig.toBase58(), account(withTradeFee(Buffer.from(snapshot.accounts.config, "base64"), tradeFeeRate), CLMM_PROGRAM_ID.toBase58())],
    ...snapshot.tickArrayStarts.map((start, index) => [tickArrayAddress(route.pool, start).toBase58(), account(Buffer.from(snapshot.accounts.tickArrays[index], "base64"), CLMM_PROGRAM_ID.toBase58())] as const),
  ]);
  return vi.fn(async (_url: unknown, init?: RequestInit) => {
    const call = JSON.parse(String(init?.body));
    const value = call.method === "getMultipleAccounts" ? call.params[0].map((key: string) => accounts.get(key) ?? null) : accounts.get(call.params[0]) ?? null;
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: call.id, result: { context: { slot: 1 }, value } }));
  });
}

/** A Token-2022 mint (8 decimals) carrying the Scaled UI Amount extension with `multiplier` in effect (the scheduled one far in the future). */
function scaledMint(multiplier: number): Uint8Array {
  const data = new Uint8Array(166 + 4 + 56);
  data.set(mint(8), 0);
  const view = new DataView(data.buffer);
  view.setUint8(165, 1);
  view.setUint16(166, 25, true);
  view.setUint16(168, 56, true);
  view.setFloat64(170 + 32, multiplier, true);
  view.setBigInt64(170 + 40, 4_000_000_000n, true);
  view.setFloat64(170 + 48, multiplier * 2, true);
  return data;
}

/** The config account with its trade fee rate (u32 at byte 47) replaced, when given. */
function withTradeFee(config: Buffer, tradeFeeRate?: number): Buffer {
  if (tradeFeeRate === undefined) return config;
  const copy = Buffer.from(config);
  copy.writeUInt32LE(tradeFeeRate, 47);
  return copy;
}

const methodsOf = (upstream: ReturnType<typeof snapshotUpstream>) => upstream.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).method as string);

describe("server-side quote reader on a CLMM route", () => {
  it("quotes COIN from its pinned CLMM pool, names the DEX, and reads with getMultipleAccounts only", async () => {
    const upstream = snapshotUpstream();
    const read = createServerQuoteReader({ env: {}, fetchImpl: upstream as unknown as typeof fetch, now: () => 1_000 });
    const result = await read("10", "USDC", "COIN");
    expect(result).toMatchObject({
      ok: true,
      route: { pool: CLMM_PRODUCT_ROUTES.COIN.pool.toBase58(), dex: "Raydium CLMM", output_mint: CLMM_PRODUCT_ROUTES.COIN.productMint.toBase58(), output_symbol: "COINx" },
      quote: { consumedInputRaw: "10000000", outputRaw: fixture.COIN.sdk.expected[2].amountOut, feeRaw: fixture.COIN.sdk.expected[2].fee },
    });
    expect(new Set(methodsOf(upstream))).toEqual(new Set(["getMultipleAccounts"]));
    expect(upstream).toHaveBeenCalledTimes(3);
  });

  it("reuses the state within the cache window: another amount makes no upstream request", async () => {
    const upstream = snapshotUpstream();
    let now = 1_000;
    const read = createServerQuoteReader({ env: {}, fetchImpl: upstream as unknown as typeof fetch, now: () => now });
    await read("2", "USDC", "COIN");
    now += 1_000;
    await expect(read("5", "USDC", "COIN")).resolves.toMatchObject({ ok: true, quote: { consumedInputRaw: "5000000" } });
    expect(upstream).toHaveBeenCalledTimes(3);
  });

  it("answers route_check, not retryable, when the pool is not owned by the CLMM program", async () => {
    const read = createServerQuoteReader({ env: {}, fetchImpl: snapshotUpstream(new PublicKey(new Uint8Array(32).fill(5)).toBase58()) as unknown as typeof fetch });
    await expect(read("2", "USDC", "COIN")).resolves.toEqual({ ok: false, reason: "route_check", max_amount_usdc: "10.00", retryable: false });
  });

  it("answers route_check once the pinned pool's config charges more than the route's fee ceiling", async () => {
    const at = createServerQuoteReader({ env: {}, fetchImpl: snapshotUpstream(undefined, CLMM_CONFIG.maxTradeFeeRate) as unknown as typeof fetch });
    await expect(at("2", "USDC", "COIN")).resolves.toMatchObject({ ok: true });
    const above = createServerQuoteReader({ env: {}, fetchImpl: snapshotUpstream(undefined, CLMM_CONFIG.maxTradeFeeRate + 1) as unknown as typeof fetch });
    await expect(above("2", "USDC", "COIN")).resolves.toEqual({ ok: false, reason: "route_check", max_amount_usdc: "10.00", retryable: false });
  });

  it("answers route_check when the pool's pins no longer match (another product's pool bytes)", async () => {
    const upstream = snapshotUpstream();
    const read = createServerQuoteReader({ env: {}, fetchImpl: upstream as unknown as typeof fetch });
    // A listed CLMM product whose accounts the snapshot (the COIN pool) does not hold: never a quote.
    await expect(read("2", "USDC", "AMZN")).resolves.toMatchObject({ ok: false, reason: "route_check" });
    // A product that is not in the table (NFLX was dropped) is refused before any read.
    await expect(read("2", "USDC", "NFLX")).resolves.toMatchObject({ ok: false, reason: "not_purchasable" });
  });
});

describe("server quote display amounts on a CLMM route", () => {
  it("reports the product output at the mint's Scaled UI multiplier, read in the same refresh", async () => {
    const read = createServerQuoteReader({ env: {}, fetchImpl: snapshotUpstream(undefined, undefined, scaledMint(10)) as unknown as typeof fetch });
    const result = await read("2", "USDC", "COIN");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.product_display).not.toBeNull();
    expect(result.product_display!.multiplier).toBe("10");
    // Raw 8-decimal units times 10, truncated to 8 decimals (trailing zeros dropped, as the buy page writes it).
    const scaled = (raw: string) => { const v = BigInt(raw) * 10n; return `${v / 100_000_000n}.${(v % 100_000_000n).toString().padStart(8, "0")}`.replace(/\.?0+$/, ""); };
    expect(result.product_display!.output).toBe(scaled(result.quote.outputRaw));
    expect(result.product_display!.minimum_output).toBe(scaled(result.quote.minimumOutputRaw));
  });

  it("reports no display amounts when the mint has no Scaled UI multiplier", async () => {
    const read = createServerQuoteReader({ env: {}, fetchImpl: snapshotUpstream() as unknown as typeof fetch });
    const result = await read("2", "USDC", "COIN");
    expect(result).toMatchObject({ ok: true, product_display: null });
  });
});
