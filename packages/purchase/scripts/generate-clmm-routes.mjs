/**
 * Regenerate `src/routes-table-clmm.ts` from `scripts/clmm-candidates.json`
 * (read-only mainnet reads; `RPC` overrides the public endpoint). Bundles the
 * TypeScript generator with esbuild into a temporary file and runs it.
 *
 *   node packages/purchase/scripts/generate-clmm-routes.mjs <registry xstocks.json>
 */
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const here = new URL(".", import.meta.url).pathname;
const registry = process.argv[2] ?? join(here, "../../registry/src/xstocks.json");
const table = join(here, "../src/routes-table-clmm.ts");
// The generator imports the table it rewrites: start from an empty ticker list so the old entries never have to agree with it.
writeFileSync(table, readFileSync(table, "utf8").replace(/export const CLMM_PRODUCT_TICKERS = \[[^\]]*\] as const;/, "export const CLMM_PRODUCT_TICKERS = [] as const;"));
const dir = mkdtempSync(join(tmpdir(), "clmm-routes-"));
const outfile = join(dir, "generate.mjs");
try {
  await build({
    entryPoints: [join(here, "generate-clmm-routes.ts")],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
    logLevel: "warning",
  });
  execFileSync(process.execPath, [outfile, join(here, "clmm-candidates.json"), registry, table], { stdio: "inherit", env: process.env });
} finally {
  rmSync(dir, { recursive: true, force: true });
}
