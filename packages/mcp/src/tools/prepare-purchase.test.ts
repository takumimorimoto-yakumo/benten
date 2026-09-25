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
      [{ amount: "5" }, "invalid_amount"],
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
      required: ["amount_usdc"],
      properties: {
        amount_usdc: { anyOf: [{ type: "string", maxLength: 32 }, { type: "number", exclusiveMinimum: 0 }] },
        wallet_address: { type: "string", maxLength: 64 },
      },
    });
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
});
