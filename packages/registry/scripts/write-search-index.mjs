// Regenerate `src/company-search-index-v1.json` from the built read model.
// Usage: pnpm --filter @benten/registry build && node packages/registry/scripts/write-search-index.mjs
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { buildCompanySearchIndex } = await import(join(packageRoot, "dist", "search-index-source.js"));
const index = buildCompanySearchIndex();
writeFileSync(join(packageRoot, "src", "company-search-index-v1.json"), `${JSON.stringify(index, null, 2)}\n`);
process.stdout.write(`wrote ${index.entries.length} search entries\n`);
