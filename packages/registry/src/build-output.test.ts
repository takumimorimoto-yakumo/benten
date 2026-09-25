import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const packageRoot = resolve(import.meta.dirname, "..");

describe("registry production emit", () => {
  it("excludes test JavaScript and declarations from a clean outDir", () => {
    const outDir = mkdtempSync(join(tmpdir(), "benten-registry-emit-"));
    execFileSync(process.execPath, [join(packageRoot, "scripts/build.mjs"), "--out-dir", outDir], {
      cwd: packageRoot,
      encoding: "utf8",
    });
    const emitted = readdirSync(outDir, { recursive: true })
      .map(String)
      .filter((path) => path.endsWith(".js") || path.endsWith(".d.ts"));
    expect(emitted.filter((path) => path.includes(".test."))).toEqual([]);
    expect(emitted).toEqual(expect.arrayContaining([
      "artifact-validation.js", "artifact-validation.d.ts",
      "coverage-state.js", "coverage-state.d.ts",
      "legacy-validation.js", "legacy-validation.d.ts",
      "company-map-validation.js", "company-map-validation.d.ts", "company-read-model.js",
      "financial-request.js", "financial-request.d.ts",
      "index.js", "index.d.ts",
    ]));
  });
});
