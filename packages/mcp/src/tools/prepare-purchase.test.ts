import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
import { createServer, PREPARE_PURCHASE_DESCRIPTION } from "../server.js";
import { DISCLAIMER } from "../lib/envelope.js";
import { preparePurchase, type PurchaseQuoteResult } from "./prepare-purchase.js";

const NVDAX_MINT = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
const WALLET = "11111111111111111111111111111111";

function quoted(overrides: Partial<Extract<PurchaseQuoteResult, { ok: true }>> = {}): PurchaseQuoteResult {
  return {
    ok: true,
    amount_usdc: "5.00",
    amount_raw: "5000000",
    max_amount_usdc: "10.00",
    slippage_bps: 100,
    route: {
      pool: "F4inHs4RQARpASmvLpj45QjGLdkukeGQrtQ22pimVy2a",
      dex: "Meteora DLMM",
      input_mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      input_symbol: "USDC",
      input_decimals: 6,
      output_mint: NVDAX_MINT,
      output_symbol: "NVDAx",
      output_decimals: 8,
    },
    quote: {
      consumedInputRaw: "5000000", outputRaw: "2220704", minimumOutputRaw: "2198496",
      feeRaw: "11254", protocolFeeRaw: "1249", feeOnInput: true, priceImpactPct: "0.0111",
    },
    quoted_at_ms: Date.UTC(2026, 8, 25, 1, 0, 0),
    expires_at_ms: Date.UTC(2026, 8, 25, 1, 0, 30),
    buy_query: "?amount=5.00",
    ...overrides,
  };
}

async function protocolClient(quote = vi.fn(async (_amount: string) => quoted())) {
  const server = createServer({ purchase: { quote, siteOrigin: "https://benten.example" } });
  const client = new Client({ name: "benten-test", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server, quote };
}

describe("prepare_purchase", () => {
  it("is offered only when the host provides a quote reader", async () => {
    const { client, server } = await protocolClient();
    const tools = await client.listTools();
    const tool = tools.tools.find((entry) => entry.name === "prepare_purchase");
    expect(tool?.inputSchema.additionalProperties).toBe(false);
    expect(tool?.description).toBe(PREPARE_PURCHASE_DESCRIPTION);
    expect(PREPARE_PURCHASE_DESCRIPTION).toMatch(/explicitly asks to buy/);
    expect(PREPARE_PURCHASE_DESCRIPTION).toMatch(/does not recommend, evaluate or predict/);
    expect(PREPARE_PURCHASE_DESCRIPTION).toMatch(/US persons/);
    await Promise.all([client.close(), server.close()]);

    const plain = createServer();
    const plainClient = new Client({ name: "benten-test", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([plain.connect(b), plainClient.connect(a)]);
    expect((await plainClient.listTools()).tools.map((entry) => entry.name)).not.toContain("prepare_purchase");
    await Promise.all([plainClient.close(), plain.close()]);
  });

  it("returns the quote facts, its expiry and a buy-flow link resolved through the registry", async () => {
    const { client, server, quote } = await protocolClient();
    const result = await client.callTool({ name: "prepare_purchase", arguments: { amount_usdc: 5 } });
    expect(quote).toHaveBeenCalledWith("5");
    expect(result.isError).toBeUndefined();
    const body = result.structuredContent as any;
    expect(body.disclaimer).toBe(DISCLAIMER);
    expect(body.eligibility).toMatch(/US persons/);
    expect(body.data).toMatchObject({
      prepared: true,
      product: { ticker: "NVDA", symbol: "NVDAx", mint: NVDAX_MINT },
      amount_usdc: "5.00",
      purchase_url: "https://benten.example/stock/NVDA/buy?amount=5.00",
      quote: { output_raw: "2220704", minimum_output_raw: "2198496", slippage_bps: 100, quoted_at: "2026-09-25T01:00:00.000Z", expires_at: "2026-09-25T01:00:30.000Z" },
      wallet_address: null,
    });
    expect(JSON.parse((result.content as Array<{ text: string }>)[0]!.text)).toEqual(body);
    await Promise.all([client.close(), server.close()]);
  });

  it("fails closed on the reader's amount checks and on a wallet address that is not a Solana address", async () => {
    const overLimit = vi.fn(async () => ({ ok: false as const, reason: "over_limit" as const, max_amount_usdc: "10.00", retryable: false }));
    const { client, server } = await protocolClient(overLimit);
    const over = await client.callTool({ name: "prepare_purchase", arguments: { amount_usdc: "10.01" } });
    expect(over.isError).toBe(true);
    expect((over.structuredContent as any).data).toEqual({ prepared: false, reason: "over_limit", max_amount_usdc: "10.00", retryable: false });
    const wallet = await client.callTool({ name: "prepare_purchase", arguments: { amount_usdc: "5", wallet_address: "not-an-address" } });
    expect((wallet.structuredContent as any).data.reason).toBe("invalid_wallet_address");
    expect(overLimit).toHaveBeenCalledTimes(1);
    await Promise.all([client.close(), server.close()]);
  });

  it("answers arguments outside the schema with its own failure, the eligibility statement and the disclaimer", async () => {
    const { client, server, quote } = await protocolClient();
    // A call without any `arguments` object is refused by the SDK before the tool; every object reaches it.
    const cases: Array<[Record<string, unknown>, string]> = [
      [{}, "invalid_amount"],
      [{ amount_usdc: null }, "invalid_amount"],
      [{ amount_usdc: true }, "invalid_amount"],
      [{ amount_usdc: -5 }, "invalid_amount"],
      [{ amount_usdc: { value: 5 } }, "invalid_amount"],
      [{ amount_usdc: "5".repeat(33) }, "invalid_amount"],
      [{ amount_usdc: "5", extra: 1 }, "invalid_amount"],
      [{ amount_usdc: "5", amount: "5" }, "invalid_amount"],
      [{ amount_usdc: "0.02", pay_token: "SOL" }, "invalid_amount"],
      [{ amount: "0.02", pay_token: 5 }, "invalid_pay_token"],
      [{ amount: "0.02", pay_token: "x".repeat(17) }, "invalid_pay_token"],
      [{ amount_usdc: "5", pay_token: "BTC" }, "invalid_pay_token"],
      [{ amount_usdc: "5", wallet_address: 42 }, "invalid_wallet_address"],
      [{ amount_usdc: "5", wallet_address: "x".repeat(65) }, "invalid_wallet_address"],
      [{ amount_usdc: null, wallet_address: 42 }, "invalid_wallet_address"],
    ];
    for (const [args, reason] of cases) {
      const result = await client.callTool({ name: "prepare_purchase", arguments: args });
      const label = JSON.stringify(args);
      expect(result.isError, label).toBe(true);
      const body = result.structuredContent as any;
      expect(body?.data, label).toEqual({ prepared: false, reason, max_amount_usdc: null, retryable: false });
      expect(body.disclaimer, label).toBe(DISCLAIMER);
      expect(body.eligibility, label).toMatch(/US persons/);
      expect(JSON.parse((result.content as Array<{ text: string }>)[0]!.text), label).toEqual(body);
    }
    expect(quote).not.toHaveBeenCalled();
    await Promise.all([client.close(), server.close()]);
  });

  it("still advertises the exact argument schema", async () => {
    const { client, server } = await protocolClient();
    const tool = (await client.listTools()).tools.find((entry) => entry.name === "prepare_purchase");
    expect(tool?.inputSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
      properties: {
        amount_usdc: { anyOf: [{ type: "string", maxLength: 32 }, { type: "number", exclusiveMinimum: 0 }] },
        amount: { anyOf: [{ type: "string", maxLength: 32 }, { type: "number", exclusiveMinimum: 0 }] },
        pay_token: { type: "string", maxLength: 16, enum: ["USDC", "SOL", "SKR"] },
        ticker: { type: "string", maxLength: 16, enum: ["NVDA", "META", "MSTR", "GOOGL", "CRCL", "TSLA", "SPY", "HOOD"] },
        wallet_address: { type: "string", maxLength: 64 },
      },
    });
    // Both amounts are optional in the schema; the tool requires exactly one of them.
    expect(tool?.inputSchema.required ?? []).toEqual([]);
    await Promise.all([client.close(), server.close()]);
  });

  it("answers service_unavailable for a reader that throws or answers outside the schema", async () => {
    const capability = (quote: () => Promise<unknown>) => ({ quote: quote as never, siteOrigin: null });
    for (const quote of [
      async () => { throw new Error("boom"); },
      async () => ({ ...quoted(), extra: true }),
      async () => ({ ...quoted(), buy_query: "?amount=5&next=https://evil.example" }),
      async () => ({ ...quoted(), quote: { ...(quoted() as any).quote, outputRaw: "-1" } }),
    ]) {
      const result = await preparePurchase({ amount_usdc: "5" }, capability(quote));
      expect(result.data).toMatchObject({ prepared: false, reason: "service_unavailable" });
      expect(result.disclaimer).toBe(DISCLAIMER);
    }
  });

  it("refuses a quote whose output mint is not in the registry allowlist", async () => {
    const quote = async () => quoted({ route: { ...(quoted() as any).route, output_mint: WALLET } });
    const result = await preparePurchase({ amount_usdc: "5" }, { quote, siteOrigin: null });
    expect(result.data).toMatchObject({ prepared: false, reason: "not_purchasable" });
  });

  it("gives a site-relative link when the site origin is unknown and echoes a valid wallet address", async () => {
    const result = await preparePurchase({ amount_usdc: "5", wallet_address: WALLET }, { quote: async () => quoted(), siteOrigin: null });
    expect(result.data).toMatchObject({ prepared: true, purchase_url: "/stock/NVDA/buy?amount=5.00", wallet_address: WALLET });
  });

  it("keeps the USDC call exactly as before: amount_usdc without a pay token reaches the reader alone", async () => {
    const quote = vi.fn(async (..._args: unknown[]) => quoted());
    const result = await preparePurchase({ amount_usdc: "5" }, { quote: quote as never, siteOrigin: null });
    expect(quote).toHaveBeenCalledWith("5");
    expect(quote.mock.calls[0]).toHaveLength(1);
    expect(result.data).toMatchObject({
      prepared: true, pay_token: "USDC", amount_in: "5.00", amount_in_raw: "5000000", amount_usdc: "5.00", first_leg: null,
      purchase_url: "/stock/NVDA/buy?amount=5.00",
    });
    // An explicit USDC pay token is passed through for the reader to match.
    await preparePurchase({ amount_usdc: "5", pay_token: "USDC" }, { quote: quote as never, siteOrigin: null });
    expect(quote).toHaveBeenLastCalledWith("5", "USDC");
  });

  it("passes an unknown pay token to the reader and answers its invalid_pay_token", async () => {
    const quote = vi.fn(async () => ({ ok: false as const, reason: "invalid_pay_token" as const, max_amount_usdc: "10.00", retryable: false }));
    for (const payToken of ["sol", "Sol", " SOL", "BTC", ""]) {
      const result = await preparePurchase({ amount: "1", pay_token: payToken }, { quote: quote as never, siteOrigin: null });
      expect(result.data, payToken).toEqual({ prepared: false, reason: "invalid_pay_token", max_amount_usdc: "10.00", retryable: false });
      expect(quote).toHaveBeenLastCalledWith("1", payToken);
    }
  });

  it.each([
    ["SOL", "0.02", "?amount=0.02&pay=sol", "5rCf1DM8LjKTw4YqhnoLcngyZYeNnQqztScTogYHAS6", "So11111111111111111111111111111111111111112", 9, "20000000"],
    ["SKR", "100", "?amount=100.00&pay=skr", "3EFvYXRRchBUbc2c8cwFWzJLttvYRPYq1dUi9yjug6wB", "SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3", 6, "100000000"],
  ] as const)("returns both legs and a %s buy link", async (payToken, amount, query, legPool, legMint, decimals, rawIn) => {
    const quote = vi.fn(async () => quoted({
      pay_token: payToken, amount_in: amount.includes(".") ? amount : `${amount}.00`, amount_in_raw: rawIn,
      amount_usdc: "3.96", amount_raw: "3960000",
      first_leg: {
        route: { pool: legPool, dex: "Meteora DLMM", input_mint: legMint, input_symbol: payToken, input_decimals: decimals, output_mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", output_symbol: "USDC", output_decimals: 6 },
        quote: { consumedInputRaw: rawIn, outputRaw: "4000000", minimumOutputRaw: "3960000", feeRaw: "40", protocolFeeRaw: "5", feeOnInput: true, priceImpactPct: "0.002" },
      },
      buy_query: query,
    }));
    const result = await preparePurchase({ amount, pay_token: payToken }, { quote: quote as never, siteOrigin: "https://benten.example" });
    expect(quote).toHaveBeenCalledWith(amount, payToken);
    expect(result.data).toMatchObject({
      prepared: true,
      pay_token: payToken,
      amount_in_raw: rawIn,
      amount_usdc: "3.96",
      first_leg: {
        route: { pool: legPool, input_mint: legMint, input_symbol: payToken, output_symbol: "USDC" },
        quote: { consumed_input_raw: rawIn, usdc_output_raw: "4000000", usdc_minimum_output_raw: "3960000", fee_raw: "40", price_impact_pct: "0.002" },
      },
      quote: { output_raw: "2220704", minimum_output_raw: "2198496", expires_at: "2026-09-25T01:00:30.000Z" },
      purchase_url: `https://benten.example/stock/NVDA/buy${query}`,
    });
    expect(result.disclaimer).toBe(DISCLAIMER);
    expect((result as any).eligibility).toMatch(/US persons/);
  });

  it.each(["SOL", "SKR"])("answers over_limit for a %s amount the reader refuses above 10 USDC", async (payToken) => {
    const quote = vi.fn(async () => ({ ok: false as const, reason: "over_limit" as const, max_amount_usdc: "10.00", retryable: false }));
    const result = await preparePurchase({ amount: "1000000", pay_token: payToken }, { quote: quote as never, siteOrigin: null });
    expect(result.data).toEqual({ prepared: false, reason: "over_limit", max_amount_usdc: "10.00", retryable: false });
  });

  it("refuses an answer for another pay token, or a leg that does not match the pay token", async () => {
    const leg = { route: (quoted() as any).route, quote: (quoted() as any).quote };
    for (const [args, answer] of [
      [{ amount: "0.02", pay_token: "SOL" }, quoted()],
      [{ amount: "0.02", pay_token: "SOL" }, quoted({ pay_token: "SKR", first_leg: leg })],
      [{ amount: "0.02", pay_token: "SOL" }, quoted({ pay_token: "SOL", first_leg: null })],
      [{ amount_usdc: "5" }, quoted({ pay_token: "USDC", first_leg: leg })],
    ] as const) {
      const result = await preparePurchase(args, { quote: async () => answer, siteOrigin: null });
      expect(result.data, JSON.stringify(args)).toMatchObject({ prepared: false, reason: "service_unavailable" });
    }
  });

  describe("ticker", () => {
    const META_MINT = "Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu";
    const metaQuote = () => quoted({
      route: { ...(quoted() as Extract<PurchaseQuoteResult, { ok: true }>).route, pool: "D8pGWVN3vWeyexBtMZjyyPbcLhM1oeTEMibE9h3nNRYL", output_mint: META_MINT, output_symbol: "METAx" },
      amount_usdc: "2.00", amount_raw: "2000000", buy_query: "?amount=2.00",
    });

    it("passes the registry's canonical ticker to the reader and links that product's buy flow", async () => {
      const quote = vi.fn(async (_amount: string, _pay?: string, _ticker?: string) => metaQuote());
      const result = await preparePurchase({ ticker: "META", amount_usdc: "2" }, { quote, siteOrigin: "https://benten.example" });
      expect(quote).toHaveBeenCalledWith("2", undefined, "META");
      expect(result.data).toMatchObject({
        prepared: true,
        product: { ticker: "META", symbol: "METAx", mint: META_MINT },
        route: { output_mint: META_MINT, output_symbol: "METAx" },
        purchase_url: "https://benten.example/stock/META/buy?amount=2.00",
      });
      expect(result.eligibility).toMatch(/xStocks to US persons/);
    });

    it("resolves the ticker through the registry first: an unknown ticker never reaches the reader", async () => {
      const quote = vi.fn(async () => metaQuote());
      for (const ticker of ["NOPE", "META!", "Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu", "SPCX"]) {
        const result = await preparePurchase({ ticker, amount_usdc: "2" }, { quote, siteOrigin: null });
        expect(result.data, ticker).toMatchObject({ prepared: false, reason: "invalid_ticker" });
      }
      const typed = await preparePurchase({ ticker: 5, amount_usdc: "2" }, { quote, siteOrigin: null });
      expect(typed.data).toMatchObject({ prepared: false, reason: "invalid_ticker" });
      expect(quote).not.toHaveBeenCalled();
    });

    it("answers not_purchasable when the reader has no route for a registry product", async () => {
      const quote = vi.fn(async () => ({ ok: false, reason: "not_purchasable", max_amount_usdc: "10.00", retryable: false }) as PurchaseQuoteResult);
      const result = await preparePurchase({ ticker: "AMZN", amount_usdc: "2" }, { quote, siteOrigin: null });
      expect(quote).toHaveBeenCalledWith("2", undefined, "AMZN");
      expect(result.data).toMatchObject({ prepared: false, reason: "not_purchasable", retryable: false });
    });

    it("refuses an answer for another product than the one asked for", async () => {
      const result = await preparePurchase({ ticker: "META", amount_usdc: "2" }, { quote: async () => quoted(), siteOrigin: null });
      expect(result.data).toMatchObject({ prepared: false, reason: "service_unavailable" });
      const inverse = await preparePurchase({ amount_usdc: "2" }, { quote: async () => metaQuote(), siteOrigin: null });
      expect(inverse.data).toMatchObject({ prepared: false, reason: "service_unavailable" });
    });

    it("names every advertised ticker in the description, with NVDA as the default", () => {
      for (const ticker of ["NVDA", "META", "MSTR", "GOOGL", "CRCL", "TSLA", "SPY", "HOOD"]) expect(PREPARE_PURCHASE_DESCRIPTION).toContain(ticker);
      expect(PREPARE_PURCHASE_DESCRIPTION).toMatch(/default NVDA/);
    });
  });
});
