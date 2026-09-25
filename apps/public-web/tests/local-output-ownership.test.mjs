import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { markGuardedBuild, prepareGuardedOutput } from "../tools/local-output-ownership.mjs";

async function temporaryApp() {
  return mkdtemp(join(tmpdir(), "benten-public-web-output-"));
}

test("creates a contained owner sidecar for a missing generated output", async () => {
  const app = await temporaryApp();
  const guarded = await prepareGuardedOutput(app);
  assert.match(guarded.outputDirectory, /\.generated\/local-web\/output$/);
  const sidecar = JSON.parse(await readFile(guarded.sidecarPath, "utf8"));
  assert.equal(sidecar.state, "building");
  assert.equal(sidecar.outputRealpath, guarded.outputDirectory);

  await mkdir(guarded.outputDirectory);
  await writeFile(join(guarded.outputDirectory, "index.html"), "isolated");
  const completed = await markGuardedBuild(app, "complete");
  assert.equal(completed.artifact.files[0].path, "index.html");
});

test("refuses a foreign output, symlink output, or a post-build mutation", async () => {
  const foreignApp = await temporaryApp();
  const foreignOutput = join(foreignApp, ".generated", "local-web", "output");
  await mkdir(foreignOutput, { recursive: true });
  await writeFile(join(foreignOutput, "foreign.txt"), "foreign");
  await assert.rejects(() => prepareGuardedOutput(foreignApp), /without a valid owner sidecar/);

  const symlinkApp = await temporaryApp();
  await mkdir(join(symlinkApp, ".generated", "local-web"), { recursive: true });
  await symlink(tmpdir(), join(symlinkApp, ".generated", "local-web", "output"));
  await assert.rejects(() => prepareGuardedOutput(symlinkApp), /non-symlink directory/);

  const ownedApp = await temporaryApp();
  const guarded = await prepareGuardedOutput(ownedApp);
  await mkdir(guarded.outputDirectory);
  await writeFile(join(guarded.outputDirectory, "index.html"), "first");
  await markGuardedBuild(ownedApp, "complete");
  await writeFile(join(guarded.outputDirectory, "index.html"), "tampered");
  await assert.rejects(() => prepareGuardedOutput(ownedApp), /changed after its owner sidecar/);
});
