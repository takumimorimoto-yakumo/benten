import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const target = new URL("../specs/legacy-next-disposition.v1.json", import.meta.url);
const paths = execFileSync("git", ["ls-files", "apps/web"], { encoding: "utf8" })
  .trim().split("\n").filter(Boolean).sort();

function category(path) {
  if (path.startsWith("apps/web/app/api/")) return "replaced_http_route";
  if (path.startsWith("apps/web/lib/i18n/") || path === "apps/web/middleware.ts" || path === "apps/web/middleware.test.ts") {
    return "legacy_localization";
  }
  if (path.endsWith(".test.ts") || path.endsWith(".test.tsx")) return "historical_test";
  if (path === "apps/web/package.json" || path.includes("next.config") || path.endsWith("tsconfig.json") || path.endsWith("vitest.config.mjs") || path.endsWith("next-env.d.ts")) {
    return "next_runtime_config";
  }
  return "legacy_product_ui";
}

const files = paths.map((path) => {
  const bytes = execFileSync("git", ["show", `HEAD:${path}`]);
  return {
    path,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    category: category(path),
    disposition: "remove_only_after_explicit_lr_n0_authority",
    retained_value: "git_history_and_literal_http_oracle",
    moved_to_new_runtime: false,
  };
});
const legacyTreeDigest = createHash("sha256").update(JSON.stringify(
  files.map(({ path, sha256 }) => ({ path, sha256 })),
)).digest("hex");

const expected = {
  schema_version: "benten.legacy-next-disposition.v1",
  legacy_tree_sha256: legacyTreeDigest,
  authority: "none_for_deletion",
  file_count: files.length,
  files,
};

if (process.argv.includes("--write")) {
  await writeFile(target, `${JSON.stringify(expected, null, 2)}\n`);
  process.stdout.write(`wrote ${files.length} legacy paths\n`);
} else {
  const actual = JSON.parse(await readFile(target, "utf8"));
  assert.deepEqual(actual, expected, "legacy disposition manifest has drifted");
  process.stdout.write(`legacy disposition: ${files.length} paths verified\n`);
}
