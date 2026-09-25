import { createHash, randomUUID } from "node:crypto";
import { access, lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";

const APP_ID = "@benten/public-web";
const SCHEMA_VERSION = 1;

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isContained(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !path.includes(`${sep}..${sep}`));
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function requireDirectory(path, label) {
  const entry = await lstat(path);
  if (entry.isSymbolicLink() || !entry.isDirectory()) throw new Error(`${label} must be a non-symlink directory`);
}

async function ensureDirectory(path, label) {
  if (!(await pathExists(path))) await mkdir(path, { recursive: true });
  await requireDirectory(path, label);
}

async function artifactManifest(outputDirectory) {
  const entries = [];

  async function visit(directory) {
    const children = await readdir(directory, { withFileTypes: true });
    for (const child of children.sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = resolve(directory, child.name);
      const stat = await lstat(absolute);
      if (stat.isSymbolicLink()) throw new Error(`generated output contains a symlink: ${relative(outputDirectory, absolute)}`);
      if (stat.isDirectory()) {
        await visit(absolute);
        continue;
      }
      if (!stat.isFile()) throw new Error(`generated output contains a non-file entry: ${relative(outputDirectory, absolute)}`);
      const body = await readFile(absolute);
      entries.push({ path: relative(outputDirectory, absolute).replaceAll("\\", "/"), bytes: body.byteLength, sha256: digest(body) });
    }
  }

  await visit(outputDirectory);
  const serialized = JSON.stringify(entries);
  return { digest: digest(serialized), files: entries };
}

function validSidecar(value, expectedOutput) {
  return Boolean(
    value
    && value.schemaVersion === SCHEMA_VERSION
    && value.appId === APP_ID
    && typeof value.outputRealpath === "string"
    && value.outputRealpath === expectedOutput
    && (value.state === "building" || value.state === "complete" || value.state === "failed")
    && value.artifact
    && typeof value.artifact.digest === "string"
    && Array.isArray(value.artifact.files),
  );
}

async function readSidecar(path, expectedOutput) {
  if (!(await pathExists(path))) return null;
  const stat = await lstat(path);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("local Web output owner sidecar must be a regular file");
  let parsed;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new Error("local Web output owner sidecar is malformed");
  }
  if (!validSidecar(parsed, expectedOutput)) throw new Error("local Web output owner sidecar does not bind this exact output");
  return parsed;
}

async function writeSidecar(path, value) {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(temporary, path);
}

function processIsAlive(processId) {
  if (!Number.isInteger(processId) || processId <= 0) return false;
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    return error && error.code === "EPERM";
  }
}

/**
 * Resolve and verify the only output a local Web build may replace. Existing
 * build/, build-capsule/, and build-host/ directories are deliberately absent
 * from this contract.
 */
export async function prepareGuardedOutput(appDirectory) {
  const appRealpath = await realpath(appDirectory);
  const generatedDirectory = resolve(appRealpath, ".generated");
  const workingDirectory = resolve(generatedDirectory, "local-web");
  const outputDirectory = resolve(workingDirectory, "output");
  const sidecarPath = resolve(generatedDirectory, "local-web.owner.json");
  if (!isContained(appRealpath, generatedDirectory) || !isContained(generatedDirectory, workingDirectory) || !isContained(workingDirectory, outputDirectory)) {
    throw new Error("local Web generated output escaped its application directory");
  }

  await ensureDirectory(generatedDirectory, "generated output parent");
  await ensureDirectory(workingDirectory, "local Web working directory");
  const generatedRealpath = await realpath(generatedDirectory);
  const workingRealpath = await realpath(workingDirectory);
  if (!isContained(appRealpath, generatedRealpath) || !isContained(generatedRealpath, workingRealpath)) {
    throw new Error("local Web generated parent realpath escaped its application directory");
  }

  const outputExists = await pathExists(outputDirectory);
  if (outputExists) {
    await requireDirectory(outputDirectory, "local Web generated output");
    if ((await realpath(outputDirectory)) !== outputDirectory) throw new Error("local Web generated output realpath is not canonical");
  }

  const previous = await readSidecar(sidecarPath, outputDirectory);
  if (outputExists && !previous) throw new Error("refusing to replace generated output without a valid owner sidecar");
  if (previous && !outputExists) throw new Error("owner sidecar exists but its generated output is missing");
  if (previous && outputExists) {
    const current = await artifactManifest(outputDirectory);
    if (current.digest !== previous.artifact.digest) throw new Error("generated output changed after its owner sidecar was written");
    if (previous.state === "building" && processIsAlive(previous.processId)) {
      throw new Error(`generated output is still owned by running process ${previous.processId}`);
    }
  }

  const before = outputExists ? await artifactManifest(outputDirectory) : { digest: digest("[]"), files: [] };
  await writeSidecar(sidecarPath, {
    schemaVersion: SCHEMA_VERSION,
    appId: APP_ID,
    outputRealpath: outputDirectory,
    state: "building",
    processId: process.pid,
    startedAt: new Date().toISOString(),
    artifact: before,
  });
  return { appRealpath, outputDirectory, sidecarPath };
}

export async function markGuardedBuild(appDirectory, state) {
  const { outputDirectory, sidecarPath } = await prepareCompletionPaths(appDirectory);
  const artifact = await artifactManifest(outputDirectory);
  if (artifact.files.length === 0) throw new Error("local Web build produced no files");
  await writeSidecar(sidecarPath, {
    schemaVersion: SCHEMA_VERSION,
    appId: APP_ID,
    outputRealpath: outputDirectory,
    state,
    completedAt: new Date().toISOString(),
    artifact,
  });
  return { outputDirectory, artifact };
}

async function prepareCompletionPaths(appDirectory) {
  const appRealpath = await realpath(appDirectory);
  const generatedDirectory = resolve(appRealpath, ".generated");
  const outputDirectory = resolve(generatedDirectory, "local-web", "output");
  const sidecarPath = resolve(generatedDirectory, "local-web.owner.json");
  if (!(await pathExists(outputDirectory))) throw new Error("local Web build did not create its guarded output");
  await requireDirectory(outputDirectory, "local Web generated output");
  if ((await realpath(outputDirectory)) !== outputDirectory) throw new Error("local Web generated output realpath is not canonical");
  const sidecar = await readSidecar(sidecarPath, outputDirectory);
  if (!sidecar || sidecar.state !== "building" || sidecar.processId !== process.pid) {
    throw new Error("local Web build lost ownership of its generated output");
  }
  return { outputDirectory, sidecarPath };
}

export async function recordFailedBuild(appDirectory) {
  try {
    return await markGuardedBuild(appDirectory, "failed");
  } catch {
    return null;
  }
}

export async function removeTaskOwnedOutput(appDirectory) {
  const { outputDirectory, sidecarPath } = await prepareCompletionPaths(appDirectory);
  await rm(outputDirectory, { recursive: true, force: false });
  await rm(sidecarPath, { force: false });
}
