import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createServer, validateToolPresentation } from "./server.js";
import { getFinancialsV2, getFundamentalsV2 } from "./lib/public-v2.js";

async function call(name: string, args: Record<string, unknown>) {
  const server = createServer();
  const client = new Client({ name: "benten-annual-test", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    return await client.callTool({ name, arguments: args });
  } finally {
    await Promise.all([client.close(), server.close()]);
  }
}

describe("MCP annual history", () => {
  it("keeps the default get_fundamentals output free of annual history", async () => {
    const result = await call("get_fundamentals", { ticker: "NVDA" });
    expect(result.structuredContent?.data).not.toHaveProperty("annual_history");
    const text = JSON.parse((result.content[0] as { text: string }).text);
    expect(text._benten_v2).not.toHaveProperty("annual_history");
  });

  it("returns a sourced ten-year series for a fiscal-year range", async () => {
    const result = await call("get_fundamentals", { ticker: "NVDA", fiscal_year_from: 2016, fiscal_year_to: 2025 });
    expect(result.isError).not.toBe(true);
    const history = (result.structuredContent?.data as any).annual_history;
    expect(history).toMatchObject({ first_fiscal_year: 2016, fiscal_year_from: 2016, fiscal_year_to: 2025 });
    const years = new Set(history.points.map((point: any) => point.fiscal_year));
    expect([...years]).toEqual([2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]);
    for (const point of history.points) {
      expect(point.accession).toMatch(/^\d{10}-\d{2}-\d{6}$/);
      expect(point.filing_url).toMatch(/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\//);
      expect(point.filed >= point.period_end).toBe(true);
      expect(["verified_reported", "unverified_or_derived"]).toContain(point.status);
    }
    const text = JSON.parse((result.content[0] as { text: string }).text);
    expect(text._benten_v2.annual_history).toEqual(history);
  });

  it("limits get_financials history to the selected statement", async () => {
    const result = await call("get_financials", { ticker: "NVDA", statement: "cf", fiscal_year_from: 2020 });
    const data = result.structuredContent?.data as any;
    expect(Object.keys(data.statements)).toEqual(["cf"]);
    expect(new Set(data.annual_history.points.map((point: any) => point.metric))).toEqual(new Set(["operating_cf"]));
  });

  it("rejects an inverted range as invalid input and an out-of-range year at the schema", async () => {
    const inverted = await call("get_fundamentals", { ticker: "NVDA", fiscal_year_from: 2025, fiscal_year_to: 2020 });
    expect(inverted.structuredContent?.data).toMatchObject({ found: false, reason: "invalid_input" });
    const outOfRange = await call("get_financials", { ticker: "NVDA", fiscal_year_from: 1200 });
    expect(outOfRange.isError).toBe(true);
  });

  it("refuses a presentation whose text history diverges from the structured history", () => {
    const presentation = getFundamentalsV2({ ticker: "NVDA" }, { fiscal_year_from: 2025 });
    expect(() => validateToolPresentation(presentation)).not.toThrow();
    const tampered = structuredClone(presentation);
    (tampered.text._benten_v2 as any).annual_history.points[0].value += 1;
    expect(() => validateToolPresentation(tampered)).toThrow(TypeError);
    const dropped = structuredClone(getFinancialsV2({ ticker: "NVDA" }, {}));
    delete (dropped.text._benten_v2 as any).annual_history;
    expect(() => validateToolPresentation(dropped)).toThrow(TypeError);
  });
});
