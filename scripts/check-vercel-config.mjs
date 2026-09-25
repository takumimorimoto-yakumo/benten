import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const config = JSON.parse(
  await readFile(new URL("../vercel.json", import.meta.url), "utf8"),
);

// One Project from the repository root: the build writes `.vercel/output`
// (Build Output API v3) itself, so no framework preset may run, and the
// legacy Next.js app is not built for hosting.
assert.deepEqual(config, {
  $schema: "https://openapi.vercel.sh/vercel.json",
  framework: null,
  installCommand: "pnpm install --frozen-lockfile",
  buildCommand: "pnpm build && pnpm build:vercel",
});

assert.equal(
  Object.hasOwn(config, "outputDirectory"),
  false,
  "the Build Output API directory must not be overridden",
);

const rootPackage = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
assert.equal(rootPackage.scripts["build:vercel"], "node scripts/vercel/build-output.mjs");
assert.equal(/--filter web\b/.test(rootPackage.scripts.build), false, "the hosted build must not build the legacy Next.js app");

console.log("check-vercel-config: PASSED");
