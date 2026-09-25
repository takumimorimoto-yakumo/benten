#!/usr/bin/env node
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";

const NVDA_MINT = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const serverPath = fileURLToPath(new URL("./index.js", import.meta.url));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    stderr: "pipe",
  });
  const client = new Client({ name: "benten-smoke", version: "1.0.0" });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    assert(listed.tools.length === 6, "expected six MCP tools");
    assert(listed.tools.every((tool) => tool.outputSchema), "every tool must advertise outputSchema");

    const nvda = await client.callTool({
      name: "get_fundamentals",
      arguments: { mint: NVDA_MINT },
    });
    const nvdaStructured = nvda.structuredContent as Record<string, any> | undefined;
    const revenue = nvdaStructured?.data?.verified_facts?.facts?.revenue;
    const period = nvdaStructured?.data?.verified_facts?.periods?.[revenue?.period_ref];
    const source = nvdaStructured?.data?.verified_facts?.source_refs?.[revenue?.source_ref];
    assert(nvdaStructured?.data?.identity?.ticker === "NVDA", "NVDA mint did not resolve");
    assert(revenue?.unit === "currency" && revenue?.currency === "USD", "NVDA verified revenue unit missing");
    assert(period?.period_end === "2026-01-25", "NVDA verified revenue period missing");
    assert(source?.filing_url?.startsWith("https://www.sec.gov/Archives/"), "NVDA verified filing URL missing");
    const nvdaContent = nvda.content as Array<{ type: string; text?: string }> | undefined;
    assert(nvdaContent?.length === 1 && nvdaContent[0]?.type === "text", "expected one readable JSON item");
    assert(typeof nvdaContent[0].text === "string", "expected JSON text content");
    JSON.parse(nvdaContent[0].text);

    const history = await client.callTool({
      name: "get_onchain_price_history",
      arguments: { mint: NVDA_MINT },
    });
    const historyStructured = history.structuredContent as Record<string, any> | undefined;
    const observed = historyStructured?.data?.points?.find((point: any) => point.status === "observed");
    assert(historyStructured?.not_quote === true, "on-chain history must be labeled not_quote");
    assert(historyStructured?.data?.identity?.ticker === "NVDA", "on-chain history NVDA mint did not resolve");
    assert(typeof observed?.source?.signature === "string" && observed.source.pool === historyStructured.data.pool.address, "on-chain point must name its signature and pool");

    const asml = await client.callTool({
      name: "get_fundamentals",
      arguments: { ticker: "ASML" },
    });
    const asmlStructured = asml.structuredContent as Record<string, any> | undefined;
    assert(asmlStructured?.data?.reason === "no_data", "ASML must be no_data");

    const unknown = await client.callTool({
      name: "get_financials",
      arguments: { mint: "11111111111111111111111111111111" },
    });
    const unknownStructured = unknown.structuredContent as Record<string, any> | undefined;
    assert(unknownStructured?.data?.reason === "unknown_mint", "unknown mint must fail closed");

    const wallet = await client.callTool({
      name: "get_wallet_holdings",
      arguments: { address: NVDA_MINT },
    });
    const walletStructured = wallet.structuredContent as Record<string, any> | undefined;
    assert(walletStructured?.data?.reason === "wallet_correctness_unverified", "wallet fallback changed");

    const prestocks = await client.callTool({
      name: "list_provider_assets",
      arguments: { provider: "prestocks" },
    });
    const prestocksStructured = prestocks.structuredContent as Record<string, any> | undefined;
    assert(prestocksStructured?.data?.items?.length === 8, "expected eight PreStocks provider assets");
    assert(prestocksStructured?.not_quote === true, "provider assets must stay labelled as not a quote");

    const missingProviderAsset = await client.callTool({
      name: "list_provider_assets",
      arguments: { provider_asset_id: "NOT_A_PROVIDER_ASSET" },
    });
    const missingStructured = missingProviderAsset.structuredContent as Record<string, any> | undefined;
    assert(missingStructured?.data?.reason === "asset_not_found", "unknown provider asset must fail closed");

    process.stdout.write(JSON.stringify({
      ok: true,
      initialized: true,
      tools: listed.tools.map((tool) => tool.name).sort(),
      checks: [
        "nvda_mint_verified", "asml_no_data", "unknown_mint", "wallet_unavailable",
        "prestocks_provider_assets", "provider_asset_not_found",
      ],
      artifact_revision: nvdaStructured?.artifact_revision,
      hero: {
        mint: NVDA_MINT,
        ticker: nvdaStructured?.data?.identity?.ticker,
        company: nvdaStructured?.data?.identity?.underlying_company,
        fact: {
          name: "revenue",
          value: revenue.value,
          currency: revenue.currency,
          unit: revenue.unit,
          scale: revenue.scale,
          period,
          source,
        },
      },
    }) + "\n");
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : "unknown smoke failure",
  }) + "\n");
  process.exitCode = 1;
});
