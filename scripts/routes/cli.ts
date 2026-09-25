/**
 * The routes generator's entry point (run through `add-routes.mjs`, which
 * bundles it). Reads the candidates, observes each on mainnet read-only,
 * decides, and rewrites every file that lists the purchasable products.
 * Signs and sends nothing.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import {
  evaluateObservation,
  clmmEvidence,
  evidenceRecord,
  feeRecord,
  mergeRoutes,
  parseCandidates,
  parseClmmRoutesTable,
  parseRoutesTable,
  renderEvidence,
  renderMcpTickers,
  renderReadme,
  renderRoutesTable,
  renderSymbolsModule,
} from "./lib.mjs";
import { connectionFor, observeCandidate } from "./observe";

const USAGE = `usage: pnpm routes:add <candidates.json|.md> [--check] [--dry-run] [--reobserve] [--report <file>]

  <candidates>   JSON array [{"ticker": "AMZN", "pool": "<DLMM pool>"}], or a Markdown file
                 with exactly one \`\`\`json block holding that array.
  --check        Write nothing; exit 1 when a file would change.
  --dry-run      Write nothing; print what would change.
  --reobserve    Record fresh liquidity and today's date for listed entries in the input
                 (by default they keep their recorded observation).
  --report FILE  Also write the full per-check report as JSON.
  RPC            Env SOLANA_RPC_URL (default: the public mainnet RPC). Read-only.`;

const root = process.env.BENTEN_REPO_ROOT ?? process.cwd();
const FILES = {
  table: "packages/purchase/src/routes-table.ts",
  clmmTable: "packages/purchase/src/routes-table-clmm.ts",
  evidence: "packages/purchase/src/routes-observed.json",
  symbols: "packages/purchase/src/product-symbols.ts",
  mcp: "packages/mcp/src/tools/prepare-purchase.ts",
  readme: "README.md",
} as const;

function parseArgs(argv: string[]) {
  const flags = { check: false, dryRun: false, reobserve: false, report: null as string | null, input: null as string | null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--check") flags.check = true;
    else if (arg === "--dry-run") flags.dryRun = true;
    else if (arg === "--reobserve") flags.reobserve = true;
    else if (arg === "--report") flags.report = argv[++i] ?? null;
    else if (arg === "--help" || arg === "-h") {
      console.log(USAGE);
      process.exit(0);
    } else if (arg.startsWith("--")) throw new Error(`unknown option ${arg}`);
    else if (flags.input === null) flags.input = arg;
    else throw new Error("one candidates file only");
  }
  if (flags.input === null) throw new Error("the candidates file is required");
  // pnpm runs the script from the repository root; a relative path is the caller's.
  flags.input = resolve(process.env.INIT_CWD ?? process.cwd(), flags.input);
  return flags;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const read = (path: string) => readFileSync(join(root, path), "utf8");
  const inputText = readFileSync(flags.input!, "utf8");
  const candidates = parseCandidates(inputText, flags.input!);
  const tableSource = read(FILES.table);
  const listed = parseRoutesTable(tableSource);
  // The Raydium CLMM entries are listed with their recorded evidence; this generator observes DLMM pools only.
  const clmmRoutes = parseClmmRoutesTable(read(FILES.clmmTable));
  const previousEvidence: Record<string, any> = existsSync(join(root, FILES.evidence)) ? JSON.parse(read(FILES.evidence)) : {};
  const rpc = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
  const connection = connectionFor(rpc);
  const today = new Date().toISOString().slice(0, 10);

  console.log(`candidates: ${candidates.length} from ${flags.input}; listed: ${listed.length}; RPC ${new URL(rpc).host}`);
  const results: any[] = [];
  for (const [index, candidate] of candidates.entries()) {
    const progress = `[${index + 1}/${candidates.length}] ${candidate.ticker} ${candidate.pool}`;
    if ("inputError" in candidate && candidate.inputError) {
      results.push({ candidate, ok: false, checks: [{ id: "input", ok: false, detail: candidate.inputError }], observation: null });
      console.log(`${progress}  EXCLUDE input: ${candidate.inputError}`);
      continue;
    }
    const observation = await observeCandidate(connection, candidate);
    const verdict = evaluateObservation(candidate, observation);
    results.push({ candidate, observation, ...verdict });
    const failed = verdict.checks.filter((entry) => !entry.ok);
    console.log(`${progress}  ${verdict.ok ? "PASS" : "FAIL"}  liquidity ~$${Math.round(observation.liquidityUsd)}  (${failed.length} failed)`);
    for (const entry of verdict.checks) console.log(`    ${entry.ok ? "ok  " : "FAIL"} ${entry.id}: ${entry.detail}`);
    for (const entry of verdict.recorded) console.log(`    note ${entry.id}: ${entry.detail}`);
  }

  const { routes, added, excluded } = mergeRoutes(listed, results);
  const evidence: Record<string, any> = {};
  for (const row of routes) {
    const result = results.find((entry) => entry.ok && entry.candidate.ticker === row.ticker && entry.candidate.pool === row.pool);
    if (result) evidence[row.ticker] = evidenceRecord(result.candidate, result.observation, previousEvidence[row.ticker], flags.reobserve, today);
    else if (previousEvidence[row.ticker]?.pool === row.pool) {
      // A listed entry that failed keeps its record; its fees are still a fresh reading of the same pool.
      const observed = results.find((entry) => entry.observation && entry.candidate.ticker === row.ticker && entry.candidate.pool === row.pool);
      const { liquidityUsd, observedOn, ...identity } = previousEvidence[row.ticker];
      evidence[row.ticker] = { ...identity, ...feeRecord(observed?.observation), liquidityUsd, observedOn };
    }
    else throw new Error(`${row.ticker} is listed but has no evidence record and did not pass in this run; include it in the input`);
  }

  for (const row of routes) if (clmmRoutes.some((entry) => entry.ticker === row.ticker)) throw new Error(`${row.ticker} is listed both as a DLMM entry and as a Raydium CLMM entry`);
  const everyRoute = [...routes, ...clmmRoutes];
  const everyEvidence = { ...evidence, ...clmmEvidence(clmmRoutes, previousEvidence) };
  const outputs: [string, string][] = [
    [FILES.table, renderRoutesTable(tableSource, routes, evidence)],
    [FILES.evidence, renderEvidence(everyRoute, everyEvidence)],
    [FILES.symbols, renderSymbolsModule(everyRoute)],
    [FILES.mcp, renderMcpTickers(read(FILES.mcp), everyRoute)],
    [FILES.readme, renderReadme(read(FILES.readme), everyRoute, everyEvidence)],
  ];
  const changed = outputs.filter(([path, text]) => !existsSync(join(root, path)) || read(path) !== text).map(([path]) => path);

  const listedFailures = excluded.filter((entry) => entry.listed);
  console.log(`\nadded: ${added.length ? added.join(", ") : "none"}`);
  console.log(`excluded: ${excluded.length ? "" : "none"}`);
  for (const entry of excluded) console.log(`  ${entry.ticker} ${entry.pool}${entry.listed ? " (listed; kept unchanged)" : ""}\n    - ${entry.reasons.join("\n    - ")}`);
  console.log(`table: ${routes.length} DLMM products (${routes.map((row) => row.ticker).join(", ")}) and ${clmmRoutes.length} Raydium CLMM products (${clmmRoutes.map((row) => row.ticker).join(", ")})`);
  console.log(`files that ${flags.check || flags.dryRun ? "would change" : "changed"}: ${changed.length ? changed.join(", ") : "none"}`);

  if (flags.report) {
    const report = { generatedAt: new Date().toISOString(), input: relative(process.cwd(), flags.input!), added, excluded, table: routes.map((row) => row.ticker), changed, results: results.map(({ candidate, ok, checks, recorded, observation }) => ({ candidate, ok, checks, recorded: recorded ?? [], fees: observation?.pool?.fees ?? null, reference: observation?.reference ?? null, liquidityUsd: observation?.liquidityUsd ?? null })) };
    writeFileSync(flags.report, `${JSON.stringify(report, null, 2)}\n`);
  }
  if (!flags.check && !flags.dryRun) for (const [path, text] of outputs) if (changed.includes(path)) writeFileSync(join(root, path), text);
  if (changed.length > 0 && !flags.check && !flags.dryRun) console.log("next: pnpm build && pnpm typecheck && pnpm test (the observed-evidence tests read the new records)");
  if (listedFailures.length > 0) {
    console.log("a listed entry failed re-verification; it stays in the table until removed on purpose");
    process.exitCode = 1;
  }
  if (flags.check && changed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`error: ${error instanceof Error ? error.message : String(error)}\n\n${USAGE}`);
  process.exitCode = 2;
});
