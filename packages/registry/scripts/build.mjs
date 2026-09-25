import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const outIndex = args.indexOf("--out-dir");
if (args.length !== 0 && (args.length !== 2 || outIndex !== 0 || !args[1])) {
  throw new TypeError("Usage: node scripts/build.mjs [--out-dir PATH]");
}
const outDir = outIndex === 0 ? resolve(args[1]) : join(packageRoot, "dist");
mkdirSync(outDir, { recursive: true });
execFileSync("pnpm", ["exec", "tsc", "-p", join(packageRoot, "tsconfig.json"), "--outDir", outDir], {
  cwd: packageRoot,
  stdio: "inherit",
});
for (const file of [
  "artifact-validation.js", "artifact-validation.d.ts",
  "coverage-state.js", "coverage-state.d.ts",
  "legacy-validation.js", "legacy-validation.d.ts",
  "provider-assets-validation.js", "provider-assets-validation.d.ts",
  "company-map-validation.js", "company-map-validation.d.ts",
  "listed-company-map-validation.js", "listed-company-map-validation.d.ts",
  "annual-history-validation.js", "annual-history-validation.d.ts",
  "statement-history-validation.js", "statement-history-validation.d.ts",
  "statement-history-data.js", "statement-history-data.d.ts",
  "verified-fact-concepts.json",
  // Imported only by the plain-JS loader above, so the compiler never emits them.
  "verified-statements-annual-v1-pl.json", "verified-statements-annual-v1-bs.json",
  "verified-statements-annual-v1-cf.json", "verified-statements-annual-v1-per_share.json",
]) copyFileSync(join(packageRoot, "src", file), join(outDir, file));
