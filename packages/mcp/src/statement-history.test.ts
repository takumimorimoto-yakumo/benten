import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createServer, validateToolPresentation } from "./server.js";
import { getFinancialsV2 } from "./lib/public-v2.js";

async function call(name: string, args: Record<string, unknown>) {
  const server = createServer();
  const client = new Client({ name: "benten-statement-test", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    return await client.callTool({ name, arguments: args });
  } finally {
    await Promise.all([client.close(), server.close()]);
  }
}

describe("MCP statement history", () => {
  it("keeps the default get_financials output free of statement history", async () => {
    const result = await call("get_financials", { ticker: "NVDA" });
    expect(result.structuredContent?.data).not.toHaveProperty("statement_history");
    const text = JSON.parse((result.content[0] as { text: string }).text);
    expect(text._benten_v2).not.toHaveProperty("statement_history");
  });

  it("returns one statement table for a selected statement and year range, with sources", async () => {
    const result = await call("get_financials", { ticker: "NVDA", statement: "pl", fiscal_year_from: 2020, fiscal_year_to: 2024 });
    expect(result.isError).not.toBe(true);
    const history = (result.structuredContent?.data as any).statement_history;
    expect(Object.keys(history.statements)).toEqual(["pl"]);
    const table = history.statements.pl;
    expect(table.years.map((year: any) => year.fiscal_year)).toEqual([2020, 2021, 2022, 2023, 2024]);
    expect(table.rows.map((row: any) => row.item)).toEqual(expect.arrayContaining(["revenue", "cost_of_revenue", "gross_margin"]));
    for (const year of table.years) {
      for (const cell of Object.values(year.cells) as any[]) {
        if (cell.kind === "reported") {
          expect(cell.filing.accession).toMatch(/^\d{10}-\d{2}-\d{6}$/);
          expect(cell.filing.filing_url).toMatch(/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\//);
        } else {
          expect(cell.status).toBe("calculated");
          expect(cell.inputs).toHaveLength(2);
        }
      }
    }
    const text = JSON.parse((result.content[0] as { text: string }).text);
    expect(text._benten_v2.statement_history).toEqual(history);
  });

  it("returns all four statements, including per-share items, when no statement is selected", async () => {
    const result = await call("get_financials", { ticker: "MSFT", fiscal_year_from: 2024, fiscal_year_to: 2024 });
    const history = (result.structuredContent?.data as any).statement_history;
    expect(Object.keys(history.statements)).toEqual(["pl", "bs", "cf", "per_share"]);
    const perShare = history.statements.per_share.years[0].cells;
    expect(perShare.eps_diluted).toMatchObject({ unit: "USD_per_share", status: "verified_reported" });
  });

  it("refuses a presentation whose text statement history diverges from the structured one", () => {
    const presentation = getFinancialsV2({ ticker: "NVDA", statement: "bs" }, { fiscal_year_from: 2024 });
    expect(() => validateToolPresentation(presentation)).not.toThrow();
    const tampered = structuredClone(presentation);
    const cells = (tampered.text._benten_v2 as any).statement_history.statements.bs.years[0].cells;
    cells.total_assets.value += 1;
    expect(() => validateToolPresentation(tampered)).toThrow(TypeError);
    const dropped = structuredClone(presentation);
    delete (dropped.text._benten_v2 as any).statement_history;
    expect(() => validateToolPresentation(dropped)).toThrow(TypeError);
    const unsourced = structuredClone(presentation);
    for (const target of [unsourced.structured.data as any, unsourced.text._benten_v2 as any]) {
      delete target.statement_history.statements.bs.years[0].cells.total_assets.filing;
    }
    expect(() => validateToolPresentation(unsourced)).toThrow(TypeError);
  });
});
