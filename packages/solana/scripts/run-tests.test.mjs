import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { test } from "node:test";
import { selectCompiledTests } from "./run-tests.mjs";

test("selects each current source test once and ignores stale generated tests", async () => {
  const root = await mkdtemp(join(tmpdir(), "benten-solana-tests-"));
  const source = join(root, "src");
  const output = join(root, "dist");
  await mkdir(join(source, "venues"), { recursive: true });
  await mkdir(join(output, "venues"), { recursive: true });
  await writeFile(join(source, "alpha.test.ts"), "");
  await writeFile(join(source, "venues", "beta.test.ts"), "");
  await writeFile(join(output, "alpha.test.js"), "");
  await writeFile(join(output, "venues", "beta.test.js"), "");
  await writeFile(join(output, "retired.test.js"), "");

  expectPaths(await selectCompiledTests(source, output), [
    join(output, "alpha.test.js"),
    join(output, "venues", "beta.test.js"),
  ]);
});

function expectPaths(actual, expected) {
  assert.deepEqual(actual, expected);
  assert.equal(new Set(actual).size, actual.length);
}
