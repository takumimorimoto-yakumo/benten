import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import legacySnapshot from "../../registry/src/financials-snapshot.json" with { type: "json" };
import { excludedXStocks, isWithheldFromProduct, xstocks } from "@benten/registry";
import { createServer, safeToolResult } from "./server.js";
import { getFundamentalsV2 } from "./lib/public-v2.js";

const ABNB_MINT = "XscSc1zjbVizEnhCzzehJ9fzztm3WRKdn9pjmriKDuN";

async function protocolClient() {
  const server = createServer();
  const client = new Client({ name: "benten-test", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

afterEach(() => vi.unstubAllGlobals());

describe("MCP Profile A protocol", () => {
  it("advertises strict input and output schemas for all six tools", async () => {
    const { client, server } = await protocolClient();
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
      "get_financials", "get_fundamentals", "get_onchain_price_history", "get_wallet_holdings", "list_provider_assets", "list_xstocks",
    ]);
    for (const tool of tools.tools) {
      expect(tool.inputSchema.additionalProperties).toBe(false);
      expect(tool.outputSchema).toMatchObject({ type: "object", additionalProperties: false });
    }
    await Promise.all([client.close(), server.close()]);
  });

  it("converges ticker and mint and returns one parseable v1-compatible text item", async () => {
    const { client, server } = await protocolClient();
    const ticker = await client.callTool({ name: "get_fundamentals", arguments: { ticker: "ABNB" } });
    const mint = await client.callTool({ name: "get_fundamentals", arguments: { mint: ABNB_MINT } });
    expect((ticker.structuredContent?.data as any).identity).toEqual((mint.structuredContent?.data as any).identity);
    expect(ticker.structuredContent).toMatchObject({ schema_version: "2.0", release_profile: "mint_core" });
    expect(ticker.content).toHaveLength(1);
    const text = JSON.parse((ticker.content[0] as { text: string }).text);
    expect(text.data).toEqual({ found: true, ...legacySnapshot.fundamentals.ABNB.data });
    expect(text.as_of).toBe(legacySnapshot.fundamentals.ABNB.as_of);
    expect(text._benten_v2).toMatchObject({ release_profile: "mint_core", legacy_data: { status: "legacy_snapshot" } });
    expect(text.source).toBe("Benten legacy financial snapshot; filing source, unit, and fact kind unverified");
    const selected = await client.callTool({
      name: "list_xstocks",
      arguments: { mint: ABNB_MINT, covered_only: true },
    });
    expect((selected.structuredContent?.data as any).items).toHaveLength(1);
    expect((selected.structuredContent?.data as any).items[0].identity).toEqual((ticker.structuredContent?.data as any).identity);
    const invalidSelector = await client.callTool({
      name: "list_xstocks",
      arguments: { ticker: "ABNB", mint: ABNB_MINT },
    });
    expect(invalidSelector.structuredContent?.data).toMatchObject({ found: false, reason: "invalid_input" });
    await Promise.all([client.close(), server.close()]);
  });

  it("returns application missing states and rejects strict invalid inputs", async () => {
    const { client, server } = await protocolClient();
    const asml = await client.callTool({ name: "get_fundamentals", arguments: { ticker: "ASML" } });
    expect(asml.isError).not.toBe(true);
    expect(asml.structuredContent?.data).toMatchObject({ found: false, reason: "no_data", identity: { ticker: "ASML" } });
    const unknown = await client.callTool({ name: "get_financials", arguments: { mint: "11111111111111111111111111111111" } });
    expect(unknown.structuredContent?.data).toMatchObject({ found: false, reason: "unknown_mint" });
    const malformedMint = await client.callTool({ name: "get_financials", arguments: { mint: "not-a-mint" } });
    expect(malformedMint.structuredContent?.data).toMatchObject({ found: false, reason: "invalid_input" });
    const unicodeFold = await client.callTool({ name: "get_fundamentals", arguments: { ticker: "mſft" } });
    expect(unicodeFold.structuredContent?.data).toMatchObject({
      found: false,
      reason: "unknown_ticker",
      requested_identifier: "mſft",
    });
    for (const rawTicker of [" unknown ", "notreal", "NVDA' OR '1'='1"]) {
      for (const name of ["get_fundamentals", "get_financials"]) {
        const result = await client.callTool({ name, arguments: { ticker: rawTicker } });
        const text = JSON.parse((result.content[0] as { text: string }).text);
        expect(text.data.ticker).toBe(rawTicker);
        expect(text.data.reason).toBe("unknown_ticker");
        expect(text._benten_v2.requested_identifier.value).toBe(rawTicker.trim().toUpperCase());
      }
    }
    const verified = await client.callTool({ name: "get_fundamentals", arguments: { ticker: "NVDA" } });
    const verifiedText = JSON.parse((verified.content[0] as { text: string }).text);
    const structuredFact = (verified.structuredContent?.data as any).verified_facts.facts.revenue;
    const textFact = verifiedText._benten_v2.verified_subset.fundamentals
      .find((fact: { name: string }) => fact.name === "revenue");
    expect(textFact).toMatchObject({
      value: structuredFact.value,
      currency: structuredFact.currency,
      unit: structuredFact.unit,
      scale: structuredFact.scale,
      source_concept: structuredFact.source_concept,
    });
    expect(textFact.period.period_ref).toBe(structuredFact.period_ref);
    expect(textFact.source.source_ref).toBe(structuredFact.source_ref);
    const verifiedSet = (verified.structuredContent?.data as any).verified_facts;
    const expectedExpanded = Object.entries(verifiedSet.facts).map(([name, fact]: [string, any]) => ({
      name,
      value: fact.value,
      currency: fact.currency,
      unit: fact.unit,
      scale: fact.scale,
      source_concept: fact.source_concept,
      period: verifiedSet.periods[fact.period_ref],
      source: verifiedSet.source_refs[fact.source_ref],
    }));
    expect(verifiedText._benten_v2.verified_subset.fundamentals).toEqual(expectedExpanded);
    expect(verifiedText._benten_v2.artifact_revision).toBe(verified.structuredContent?.artifact_revision);
    expect(verifiedText._benten_v2.identity).toEqual((verified.structuredContent?.data as any).identity);
    expect(verifiedText._benten_v2.coverage).toEqual((verified.structuredContent?.data as any).coverage);
    const ineligible = await client.callTool({ name: "get_fundamentals", arguments: { ticker: "BDWAP" } });
    expect(ineligible.structuredContent?.data).toMatchObject({ found: false, reason: "not_eligible" });
    expect(JSON.parse((ineligible.content[0] as { text: string }).text).data).toMatchObject({ reason: "not_covered" });
    for (const arguments_ of [{}, { ticker: "ABNB", mint: ABNB_MINT }]) {
      const invalid = await client.callTool({ name: "get_fundamentals", arguments: arguments_ });
      expect(invalid.isError).not.toBe(true);
      expect(invalid.structuredContent?.data).toMatchObject({ found: false, reason: "invalid_input" });
    }
    const unknownField = await client.callTool({ name: "get_fundamentals", arguments: { ticker: "ABNB", extra: true } });
    expect(unknownField.isError).toBe(true);
    expect(unknownField.structuredContent).toBeUndefined();
    await Promise.all([client.close(), server.close()]);
  });

  it("returns all or one statement and preserves a capability-specific missing row", async () => {
    const { client, server } = await protocolClient();
    const all = await client.callTool({ name: "get_financials", arguments: { ticker: "ABNB" } });
    expect(Object.keys((all.structuredContent?.data as any).statements)).toEqual(["pl", "bs", "cf"]);
    const one = await client.callTool({ name: "get_financials", arguments: { ticker: "ABNB", statement: "cf" } });
    expect(Object.keys((one.structuredContent?.data as any).statements)).toEqual(["cf"]);
    const verified = await client.callTool({ name: "get_financials", arguments: { ticker: "NVDA", statement: "cf" } });
    const verifiedText = JSON.parse((verified.content[0] as { text: string }).text);
    const verifiedSet = (verified.structuredContent?.data as any).statements.cf.verified_facts;
    const operatingCf = verifiedText._benten_v2.verified_subset.statements.cf[0];
    expect(operatingCf).toEqual({
      name: "operating_cf",
      value: verifiedSet.facts.operating_cf.value,
      currency: verifiedSet.facts.operating_cf.currency,
      unit: verifiedSet.facts.operating_cf.unit,
      scale: verifiedSet.facts.operating_cf.scale,
      source_concept: verifiedSet.facts.operating_cf.source_concept,
      period: verifiedSet.periods[verifiedSet.facts.operating_cf.period_ref],
      source: verifiedSet.source_refs[verifiedSet.facts.operating_cf.source_ref],
    });
    expect(verifiedText._benten_v2.verified_subset.statements.pl).toEqual([]);
    expect(verifiedText._benten_v2.verified_subset.statements.bs).toEqual([]);
    const missing = await client.callTool({ name: "get_financials", arguments: { ticker: "SLMT", statement: "bs" } });
    expect(missing.structuredContent?.data).toMatchObject({ found: true, statements: { bs: { availability: "no_data", verified_facts: null, legacy_snapshot: null } } });
    const missingText = JSON.parse((missing.content[0] as { text: string }).text);
    expect(missingText.as_of).toBe(legacySnapshot.financials.SLMT.as_of);
    expect(missingText._benten_v2.legacy_data).toMatchObject({ status: "legacy_snapshot", scope: "/data" });
    const invalid = await client.callTool({ name: "get_financials", arguments: { ticker: "NVDA", statement: "quarterly" } });
    expect(invalid.isError).not.toBe(true);
    expect(invalid.structuredContent?.data).toMatchObject({
      found: false,
      reason: "invalid_statement",
      identity: { ticker: "NVDA" },
    });
    const unknownTickerFirst = await client.callTool({
      name: "get_financials",
      arguments: { ticker: "ZZUNKNOWN", statement: "quarterly" },
    });
    expect(unknownTickerFirst.structuredContent?.data).toMatchObject({ found: false, reason: "unknown_ticker" });
    const unknownMintFirst = await client.callTool({
      name: "get_financials",
      arguments: { mint: "11111111111111111111111111111111", statement: "quarterly" },
    });
    expect(unknownMintFirst.structuredContent?.data).toMatchObject({ found: false, reason: "unknown_mint" });
    expect(excludedXStocks).toHaveLength(25);
    for (const entry of excludedXStocks.filter((excluded) => !isWithheldFromProduct(excluded))) {
      for (const statement of ["", "quarterly"]) {
        const result = await client.callTool({
          name: "get_financials",
          arguments: { ticker: entry.ticker, statement },
        });
        expect(result.structuredContent?.data).toMatchObject({
          found: false,
          reason: "not_eligible",
          identity: { ticker: entry.ticker },
          coverage: { filing_eligibility: "not_eligible" },
        });
        expect(JSON.parse((result.content[0] as { text: string }).text).data).toEqual({
          found: false,
          ticker: entry.ticker,
          reason: "not_covered",
          exclusion_reason: entry.exclusion_reason,
        });
      }
    }
    await Promise.all([client.close(), server.close()]);
  });

  it("returns wallet correctness unavailable without constructing an RPC connection", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { client, server } = await protocolClient();
    const result = await client.callTool({ name: "get_wallet_holdings", arguments: { address: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh" } });
    expect(result.structuredContent?.data).toEqual({
      available: false,
      reason: "wallet_correctness_unverified",
      retryable: false,
      release_profile: "mint_core",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    const malformed = await client.callTool({ name: "get_wallet_holdings", arguments: { address: "not-an-address" } });
    expect(malformed.isError).not.toBe(true);
    expect(malformed.structuredContent?.data).toMatchObject({ found: false, reason: "invalid_input" });
    await Promise.all([client.close(), server.close()]);
  });
});

describe("MCP registry rows withheld from the product", () => {
  // The PreStocks track rule makes a project ineligible when it integrates a
  // non-PreStocks pre-IPO token; the registry rows SPCX and VCX are withheld.
  const withheld = xstocks.filter(isWithheldFromProduct);

  it("never lists or resolves SPCX or VCX through any tool", async () => {
    expect(withheld.map((entry) => entry.ticker)).toEqual(["SPCX", "VCX"]);
    const { client, server } = await protocolClient();
    const listed = await client.callTool({ name: "list_xstocks", arguments: {} });
    const tickers = (listed.structuredContent?.data as { items: Array<{ identity: { ticker: string } }> }).items
      .map((item) => item.identity.ticker);
    expect(tickers).toHaveLength(152);
    for (const entry of withheld) {
      expect(tickers).not.toContain(entry.ticker);
      for (const name of ["get_fundamentals", "get_financials"]) {
        const byTicker = await client.callTool({ name, arguments: { ticker: entry.ticker } });
        expect(byTicker.structuredContent?.data).toMatchObject({ found: false, reason: "unknown_ticker", identity: null });
        const byMint = await client.callTool({ name, arguments: { mint: entry.mint } });
        expect(byMint.structuredContent?.data).toMatchObject({ found: false, reason: "unknown_mint", identity: null });
      }
    }
    const privateOnly = await client.callTool({ name: "list_xstocks", arguments: { exclusion_reason: "private" } });
    expect(privateOnly.structuredContent?.data).toEqual({ found: true, items: [] });
    await Promise.all([client.close(), server.close()]);
  });
});

describe("MCP public error boundary", () => {
  it("replaces thrown transport details with a fixed structured error", async () => {
    const result = await safeToolResult(async () => { throw new Error("sentinel credential"); });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).not.toContain("sentinel");
    expect(result.structuredContent?.data).toMatchObject({ found: false, reason: "service_unavailable" });
  });

  it.each([
    ["revision", (value: any) => { value.text._benten_v2.artifact_revision = "wrong"; }],
    ["identity", (value: any) => { value.text._benten_v2.identity = { ...value.text._benten_v2.identity, ticker: "MSFT" }; }],
    ["coverage", (value: any) => { value.text._benten_v2.coverage = { ...value.text._benten_v2.coverage, source_status: "legacy_snapshot" }; }],
    ["fact value", (value: any) => { value.text._benten_v2.verified_subset.fundamentals[0].value += 1; }],
    ["phantom fact", (value: any) => { value.text._benten_v2.verified_subset.fundamentals.push(value.text._benten_v2.verified_subset.fundamentals[0]); }],
    ["broken source ref", (value: any) => { value.structured.data.verified_facts.facts.revenue.source_ref = "missing"; }],
    ["broken period ref", (value: any) => { value.structured.data.verified_facts.facts.revenue.period_ref = "missing"; }],
  ])("fails closed on a %s mismatch", async (_name, mutate) => {
    const presentation: any = structuredClone(getFundamentalsV2({ ticker: "NVDA" }));
    mutate(presentation);
    const result = await safeToolResult(() => presentation);
    expect(result.isError).toBe(true);
    expect(result.structuredContent?.data).toMatchObject({ found: false, reason: "service_unavailable" });
    expect(result.content).toHaveLength(1);
    expect(() => JSON.parse(result.content[0].text)).not.toThrow();
  });

  it("fails closed when text cannot be serialized", async () => {
    const presentation: any = getFundamentalsV2({ ticker: "NVDA" });
    presentation.text.cycle = presentation.text;
    const result = await safeToolResult(() => presentation);
    expect(result.isError).toBe(true);
    expect(result.structuredContent?.data).toMatchObject({ found: false, reason: "service_unavailable" });
  });
});
