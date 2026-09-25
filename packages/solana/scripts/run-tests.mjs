import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  }));
  return paths.flat();
}

export async function selectCompiledTests(sourceRoot, outputRoot) {
  const sources = (await walk(sourceRoot))
    .filter((path) => path.endsWith(".test.ts"))
    .sort();
  return sources.map((source) => join(
    outputRoot,
    relative(sourceRoot, source).replace(/\.ts$/, ".js"),
  ));
}

async function main() {
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const tests = await selectCompiledTests(join(packageRoot, "src"), join(packageRoot, "dist"));
  if (tests.length === 0) throw new Error("No current Solana source tests found");
  const result = spawnSync(process.execPath, ["--test", ...tests], { stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
