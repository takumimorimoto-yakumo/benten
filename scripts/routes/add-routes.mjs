/**
 * One command to add purchasable xStocks: `pnpm routes:add <candidates>`.
 * Bundles `cli.ts` with the purchase package's own pool SDK and helpers (the
 * SDK's ESM build uses directory imports Node's resolver refuses, as in
 * `packages/purchase/scripts/build-server-quote.mjs`) into a temporary
 * directory, then runs it with the given arguments. Read-only on mainnet.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
// The purchase source imports these workspace packages through their built output.
const BUILT_DEPENDENCIES = ["registry", "solana", "solana-rpc-relay"];
// Built in dependency order (registry first), each only when its output is missing.
for (const name of BUILT_DEPENDENCIES) {
  if (existsSync(join(root, "packages", name, "dist"))) continue;
  const built = spawnSync("pnpm", ["--filter", `@benten/${name}`, "build"], { cwd: root, stdio: "inherit" });
  if (built.status !== 0) process.exit(built.status ?? 2);
}
const directory = mkdtempSync(join(tmpdir(), "benten-routes-"));
const outfile = join(directory, "cli.mjs");
try {
  await build({
    entryPoints: [join(root, "scripts", "routes", "cli.ts")],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    nodePaths: [join(root, "packages", "purchase", "node_modules"), join(root, "node_modules")],
    banner: { js: "import { createRequire as __bentenCreateRequire } from 'node:module'; import { fileURLToPath as __bentenFileURLToPath } from 'node:url'; import { dirname as __bentenDirname } from 'node:path'; const require = __bentenCreateRequire(import.meta.url); const __filename = __bentenFileURLToPath(import.meta.url); const __dirname = __bentenDirname(__filename);" },
    logLevel: "warning",
    legalComments: "none",
  });
  const run = spawnSync(process.execPath, [outfile, ...process.argv.slice(2)], { stdio: "inherit", env: { ...process.env, BENTEN_REPO_ROOT: root } });
  process.exitCode = run.status ?? 2;
} finally {
  rmSync(directory, { recursive: true, force: true });
}
