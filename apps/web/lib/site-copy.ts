export const SITE_COPY = {
  descriptor: "Open-source financial facts for Solana xStocks.",
  heading: "Start with a Solana mint. End at the filing.",
  supporting: "Resolve token identity, underlying company, and source-backed financial facts for agents. Facts only.",
  reassurance: "No wallet required.",
  lookupLabel: "xStocks mint",
  resolve: "Resolve mint",
  resolving: "Resolving…",
  tryNvda: "Try NVDA",
  mcpTitle: "Use Benten in your agent",
  mcpDescription: "Build from this repository, then add the local server to your MCP client.",
  copyCommands: "Copy local commands",
  copied: "Copied",
  legacyTitle: "Legacy snapshot",
  legacyExplanation: "Filing date, unit, source, and reported-versus-calculated status are unverified for these values.",
  unknownMint: "This mint is not in the current Benten registry.",
  invalidMint: "Enter a valid Solana address.",
  serviceUnavailable: "Benten could not read the current public snapshot. Try again.",
} as const;

export const VERIFIED_FACT_LABELS = {
  revenue: "Revenue",
  net_income_parent: "Net income attributable to parent",
  total_assets: "Total assets",
  total_liabilities: "Total liabilities",
  operating_cf: "Operating cash flow",
} as const;

export const PREFERRED_FACTS = [
  "revenue",
  "net_income_parent",
  "total_assets",
  "total_liabilities",
  "operating_cf",
] as const;

export const MCP_COMMANDS = "pnpm install\npnpm build\nnode packages/mcp/dist/index.js";
