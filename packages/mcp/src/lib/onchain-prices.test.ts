import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ONCHAIN_DAILY, onchainDailySeries } from "@benten/pricing/onchain-daily";
import { createServer, safeOnchainPricesToolResult } from "../server.js";
import { ONCHAIN_PRICES_NOTE, getOnchainPriceHistory } from "./onchain-prices.js";

const DISCLAIMER = "Factual data only. Not investment advice, a recommendation, or a valuation.";
const NVDA_MINT = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";

async function protocolClient() {
  const server = createServer();
  const client = new Client({ name: "benten-onchain-test", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

afterEach(() => vi.unstubAllGlobals());

describe("get_onchain_price_history presenter", () => {
  it("labels the result as executed trade prices with their source, not quotes", () => {
    const result = getOnchainPriceHistory({ ticker: "NVDA" });
    expect(result).toMatchObject({
      schema_version: "onchain-daily.v1",
      artifact: { revision: ONCHAIN_DAILY.revision, generated_at: ONCHAIN_DAILY.generated_at },
      note: ONCHAIN_PRICES_NOTE,
      not_quote: true,
      disclaimer: DISCLAIMER,
    });
    const data = result.data as any;
    expect(data.found).toBe(true);
    expect(data.identity).toEqual({ ticker: "NVDA", symbol: "NVDAx", mint: NVDA_MINT });
    for (const point of data.points) {
      if (point.status === "observed") {
        expect(point.source).toMatchObject({ pool: data.pool.address });
        expect(typeof point.source.signature).toBe("string");
        expect(point.reason).toBeNull();
      } else {
        expect(point.source).toBeNull();
        expect(point.usdc_per_unscaled_token).toBeNull();
        expect(typeof point.reason).toBe("string");
      }
    }
    expect(data.coverage.sessions).toBe(onchainDailySeries("NVDA")!.points.length);
  });

  it("resolves ticker and mint to the same series", () => {
    expect(getOnchainPriceHistory({ mint: NVDA_MINT }).data).toEqual(getOnchainPriceHistory({ ticker: "NVDA" }).data);
  });

  it("filters by an inclusive date range", () => {
    const all = (getOnchainPriceHistory({ ticker: "NVDA" }).data as any).points;
    const from = all[1].date;
    const to = all[3].date;
    const ranged = getOnchainPriceHistory({ ticker: "NVDA", from, to }).data as any;
    expect(ranged.points.map((point: any) => point.date)).toEqual(all.slice(1, 4).map((point: any) => point.date));
    expect(ranged.period).toMatchObject({ from, to });
    expect(ranged.coverage.sessions).toBe(3);
  });

  it("returns an empty list for a range with no session", () => {
    const data = getOnchainPriceHistory({ ticker: "NVDA", from: "2020-01-01", to: "2020-01-31" }).data as any;
    expect(data).toMatchObject({ found: true, points: [], period: { from: null, to: null } });
  });

  it("fails closed on malformed selectors and dates", () => {
    const invalid = [
      {},
      { ticker: "NVDA", mint: NVDA_MINT },
      { ticker: "NVDA", from: "2026-02-30" },
      { ticker: "NVDA", from: "2026-9-1" },
      { ticker: "NVDA", from: "2026-09-10", to: "2026-09-01" },
    ];
    for (const input of invalid) expect(getOnchainPriceHistory(input as never).data).toMatchObject({ found: false, reason: "invalid_input", retryable: false });
  });

  it("distinguishes unknown identifiers from xStocks without a series", () => {
    expect(getOnchainPriceHistory({ ticker: "NOTREAL" }).data).toMatchObject({ found: false, reason: "unknown_ticker", requested_identifier: "NOTREAL" });
    expect(getOnchainPriceHistory({ mint: "11111111111111111111111111111111" }).data).toMatchObject({ found: false, reason: "unknown_mint" });
    const uncovered = getOnchainPriceHistory({ ticker: "ABNB" }).data as any;
    expect(uncovered).toMatchObject({ found: false, reason: "not_covered" });
    expect(uncovered.covered_tickers).toContain("NVDA");
  });

  it("returns a retryable service_unavailable without leaking the failure", () => {
    const failed = safeOnchainPricesToolResult(() => {
      throw new TypeError("artifact unavailable");
    });
    expect(failed.isError).toBe(true);
    expect(failed.structuredContent.data).toMatchObject({ found: false, reason: "service_unavailable", retryable: true });
    expect(failed.structuredContent.not_quote).toBe(true);
    expect(failed.content[0]!.text).not.toContain("artifact unavailable");
  });
});

describe("get_onchain_price_history protocol", () => {
  it("advertises strict schemas and answers without a network call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { client, server } = await protocolClient();
    const tool = (await client.listTools()).tools.find((item) => item.name === "get_onchain_price_history")!;
    expect(tool.inputSchema.additionalProperties).toBe(false);
    expect(tool.outputSchema).toMatchObject({ type: "object", additionalProperties: false });
    const result = await client.callTool({ name: "get_onchain_price_history", arguments: { ticker: "NVDA", from: "2026-09-01" } });
    expect(result.isError).not.toBe(true);
    const structured = result.structuredContent as any;
    expect(structured.not_quote).toBe(true);
    expect(structured.data.points.every((point: any) => point.date >= "2026-09-01")).toBe(true);
    expect(JSON.parse((result.content as Array<{ text: string }>)[0]!.text)).toEqual(structured);
    const rejected = await client.callTool({ name: "get_onchain_price_history", arguments: { ticker: "NVDA", extra: 1 } });
    expect(rejected.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    await Promise.all([client.close(), server.close()]);
  });
});
