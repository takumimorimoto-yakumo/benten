import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { providerAssets } from "@benten/registry";
import { createServer, safeProviderToolResult } from "../server.js";
import { listProviderAssetsV2 } from "./provider-assets.js";

const DISCLAIMER = "Factual data only. Not investment advice, a recommendation, or a valuation.";

async function protocolClient() {
  const server = createServer();
  const client = new Client({ name: "benten-provider-test", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

afterEach(() => vi.unstubAllGlobals());

describe("list_provider_assets presenter", () => {
  it("labels every result as a provider reference rather than a quote", () => {
    const result = listProviderAssetsV2();
    expect(result).toMatchObject({
      schema_version: "provider-assets.v1",
      artifact: { revision: providerAssets.revision, fetched_at: providerAssets.fetched_at },
      not_quote: true,
      disclaimer: DISCLAIMER,
    });
    expect((result.data as any).items).toHaveLength(8);
  });

  it("keeps an unknown provider asset distinct from a malformed selector", () => {
    expect(listProviderAssetsV2({ provider_asset_id: "NOPE" }).data)
      .toMatchObject({ found: false, reason: "asset_not_found", requested_identifier: "NOPE" });
    expect(listProviderAssetsV2({ provider: "xstocks" } as never).data)
      .toMatchObject({ found: false, reason: "invalid_input" });
    expect(listProviderAssetsV2({ provider: "other" } as never).data)
      .toMatchObject({ found: false, reason: "invalid_input" });
  });

  it("returns a retryable service_unavailable without leaking the failure", () => {
    const failed = safeProviderToolResult(() => {
      throw new TypeError("artifact unavailable");
    });
    expect(failed.isError).toBe(true);
    expect((failed.structuredContent.data as any)).toMatchObject({
      found: false, reason: "service_unavailable", retryable: true,
    });
    expect(failed.content[0].text).not.toContain("artifact unavailable");
  });
});

describe("list_provider_assets protocol", () => {
  it("advertises a strict schema and makes no network call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { client, server } = await protocolClient();
    const tool = (await client.listTools()).tools.find((item) => item.name === "list_provider_assets")!;
    expect(tool.inputSchema.additionalProperties).toBe(false);
    expect(tool.outputSchema).toMatchObject({ type: "object", additionalProperties: false });
    expect(tool.description).toMatch(/not a quote/);
    expect(tool.description).toMatch(/not xStocks/);

    const prestocks = await client.callTool({ name: "list_provider_assets", arguments: { provider: "prestocks" } });
    const data = prestocks.structuredContent?.data as any;
    expect(data.items).toHaveLength(8);
    expect(data.items.every((item: any) => item.provider === "prestocks" && !("underlying_kind" in item))).toBe(true);
    expect(prestocks.structuredContent?.not_quote).toBe(true);
    expect(prestocks.content).toHaveLength(1);
    expect(JSON.parse((prestocks.content[0] as { text: string }).text)).toEqual(prestocks.structuredContent);
    const removed = await client.callTool({ name: "list_provider_assets", arguments: { provider: "other" } });
    expect(removed.isError).toBe(true);
    expect(removed.structuredContent).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    await Promise.all([client.close(), server.close()]);
  });

  it("selects one entry by id and fails closed on a miss", async () => {
    const { client, server } = await protocolClient();
    const selected = await client.callTool({
      name: "list_provider_assets",
      arguments: { provider: "prestocks", provider_asset_id: "SPACEX" },
    });
    const items = (selected.structuredContent?.data as any).items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      asset_kind: "prestock_provider_instrument",
      evidence_state: "candidate_unverified",
      company_binding: { company_id: "spacex", binding_status: "provider_claim_only" },
      not_quote: true,
    });
    expect(items[0].references.every((reference: any) => reference.currency === null)).toBe(true);

    const missing = await client.callTool({
      name: "list_provider_assets",
      arguments: { provider_asset_id: "NOT_A_PROVIDER_ASSET" },
    });
    expect(missing.structuredContent?.data).toMatchObject({ found: false, reason: "asset_not_found" });
    await Promise.all([client.close(), server.close()]);
  });

  it("rejects an unknown argument at the protocol boundary", async () => {
    const { client, server } = await protocolClient();
    const rejected = await client.callTool({
      name: "list_provider_assets",
      arguments: { provider: "prestocks", debug: true },
    });
    expect(rejected.isError).toBe(true);
    expect((rejected.content as Array<{ text: string }>)[0].text).toMatch(/Unrecognized key/);
    expect(rejected.structuredContent).toBeUndefined();
    await Promise.all([client.close(), server.close()]);
  });
});
