#!/usr/bin/env node
/**
 * Benten MCP server entrypoint (stdio transport).
 *
 * Inputs are allowlist-gated, wallet access is read-only, and financial data
 * comes only from the repository's sanitized static snapshot.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(() => {
  console.error("benten mcp server failed to start");
  process.exitCode = 1;
});
