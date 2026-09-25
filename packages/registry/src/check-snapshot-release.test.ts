import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "../../..");
const script = join(repoRoot, "scripts/check-snapshot-release.mjs");
const sourceRoot = join(repoRoot, "packages/registry/src");
const STATEMENT_FILES = ["pl", "bs", "cf", "per_share"].map((statement) => `verified-statements-annual-v1-${statement}.json`);
const PRE_STATEMENT_FILES = ["xstocks.json", "financials-snapshot.json", "verified-facts-v2.json", "verified-facts-annual-v1.json", "snapshot-manifest.json"];
const currentRevision = JSON.parse(readFileSync(join(sourceRoot, "snapshot-manifest.json"), "utf8")).artifact_revision as string;

function candidateCopy(): string {
  const root = mkdtempSync(join(tmpdir(), "benten-candidate-"));
  for (const file of [...PRE_STATEMENT_FILES, ...STATEMENT_FILES]) {
    cpSync(join(sourceRoot, file), join(root, file));
  }
  return root;
}

function rewriteCandidate(candidate: string, mutate: (snapshot: any) => void, revision?: string): void {
  const snapshotPath = join(candidate, "financials-snapshot.json");
  const manifestPath = join(candidate, "snapshot-manifest.json");
  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
  mutate(snapshot);
  writeFileSync(snapshotPath, `${JSON.stringify(snapshot)}\n`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.legacy_financial_snapshot_sha256 = createHash("sha256").update(readFileSync(snapshotPath)).digest("hex");
  if (revision !== undefined) manifest.artifact_revision = revision;
  writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
}

// Each case spawns the checker, which validates every artifact of two roots (about 1 s alone);
// under a parallel suite that exceeds the default 5 s.
describe("check-snapshot-release", { timeout: 30_000 }, () => {
  it("accepts identical full artifact bytes under the same revision", () => {
    const candidate = candidateCopy();
    const output = execFileSync(process.execPath, [script, "--current-root", sourceRoot, "--candidate-root", candidate], { encoding: "utf8" });
    expect(JSON.parse(output)).toMatchObject({ ok: true, artifact_revision: currentRevision });
  });
  it("accepts a full candidate against a legacy bootstrap and does not mutate either root", () => {
    const current = mkdtempSync(join(tmpdir(), "benten-current-"));
    cpSync(join(sourceRoot, "xstocks.json"), join(current, "xstocks.json"));
    cpSync(join(sourceRoot, "financials-snapshot.json"), join(current, "financials-snapshot.json"));
    const candidate = candidateCopy();
    const before = execFileSync("shasum", ["-a", "256", ...[current, candidate].flatMap((root) => [join(root, "xstocks.json"), join(root, "financials-snapshot.json"), ...(root === candidate ? [join(root, "verified-facts-v2.json"), join(root, "snapshot-manifest.json")] : [])])], { encoding: "utf8" });
    const output = execFileSync(process.execPath, [script, "--current-root", current, "--candidate-root", candidate], { encoding: "utf8" });
    const after = execFileSync("shasum", ["-a", "256", ...[current, candidate].flatMap((root) => [join(root, "xstocks.json"), join(root, "financials-snapshot.json"), ...(root === candidate ? [join(root, "verified-facts-v2.json"), join(root, "snapshot-manifest.json")] : [])])], { encoding: "utf8" });
    expect(JSON.parse(output)).toMatchObject({ ok: true, hashes_verified: true, counts: { registry: 154, eligible: 129, snapshot_available: 128, source_verified: 107, annual_years: expect.any(Number), statement_years: expect.any(Number) } });
    expect(after).toBe(before);
  });

  it("fails deterministically on a raw-byte hash mismatch", () => {
    const candidate = candidateCopy();
    writeFileSync(join(candidate, "verified-facts-v2.json"), readFileSync(join(candidate, "verified-facts-v2.json"), "utf8") + "\n");
    const before = readFileSync(join(candidate, "verified-facts-v2.json"));
    const result = spawnSync(process.execPath, [script, "--current-root", sourceRoot, "--candidate-root", candidate], { encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ ok: false, errors: [{ code: "HASH_MISMATCH", path: "verified-facts-v2.json" }] });
    expect(readFileSync(join(candidate, "verified-facts-v2.json"))).toEqual(before);
  });

  it("rejects manifest count drift", () => {
    const candidate = candidateCopy();
    const path = join(candidate, "snapshot-manifest.json");
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    manifest.record_counts.source_verified = 1;
    writeFileSync(path, `${JSON.stringify(manifest)}\n`);
    const result = spawnSync(process.execPath, [script, "--current-root", sourceRoot, "--candidate-root", candidate], { encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ ok: false, errors: [{ code: "COUNT_MISMATCH", path: "snapshot-manifest.json" }] });
  });

  it("rejects unexpected snapshot JSON artifacts", () => {
    const candidate = candidateCopy();
    writeFileSync(join(candidate, "extra-snapshot.json"), "{}\n");
    const result = spawnSync(process.execPath, [script, "--current-root", sourceRoot, "--candidate-root", candidate], { encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(JSON.parse(result.stdout).errors).toContainEqual({ code: "UNEXPECTED_ARTIFACT", path: "extra-snapshot.json" });
  });

  it("rejects an unknown legacy snapshot field before publication", () => {
    const candidate = candidateCopy();
    const path = join(candidate, "financials-snapshot.json");
    const snapshot = JSON.parse(readFileSync(path, "utf8"));
    snapshot.fundamentals.ABNB.data.unverified_field = 1;
    writeFileSync(path, `${JSON.stringify(snapshot)}\n`);
    const result = spawnSync(process.execPath, [script, "--current-root", sourceRoot, "--candidate-root", candidate], { encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ ok: false, errors: [{ code: "SCHEMA_INVALID", path: "packages/registry/src" }] });
  });

  it.each([
    ["numeric string", (snapshot: any) => { snapshot.fundamentals.ABNB.data.revenue = "12241000000"; }],
    ["overlong company", (snapshot: any) => { snapshot.fundamentals.ABNB.data.company_name = "x".repeat(513); }],
    ["object statement date", (snapshot: any) => { snapshot.financials.ABNB.as_of = {}; }],
    ["invalid region and month", (snapshot: any) => { snapshot.financials.ABNB.statements.pl.region = "EU"; snapshot.financials.ABNB.statements.pl.fiscal_month = 13; }],
  ])("rejects shared legacy validator case: %s", (_name, mutate) => {
    const candidate = candidateCopy();
    const path = join(candidate, "financials-snapshot.json");
    const snapshot = JSON.parse(readFileSync(path, "utf8"));
    mutate(snapshot);
    writeFileSync(path, `${JSON.stringify(snapshot)}\n`);
    const before = readFileSync(path);
    const result = spawnSync(process.execPath, [script, "--current-root", sourceRoot, "--candidate-root", candidate], { encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ ok: false, errors: [{ code: "SCHEMA_INVALID", path: "packages/registry/src" }] });
    expect(readFileSync(path)).toEqual(before);
  });

  it("rejects changed artifact bytes under the current revision", () => {
    const candidate = candidateCopy();
    rewriteCandidate(candidate, (snapshot) => { snapshot.fundamentals.ABNB.data.revenue += 1; });
    const before = readFileSync(join(candidate, "financials-snapshot.json"));
    const result = spawnSync(process.execPath, [script, "--current-root", sourceRoot, "--candidate-root", candidate], { encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ ok: false, errors: [{ code: "REVISION_REUSED", path: "snapshot-manifest.json" }] });
    expect(readFileSync(join(candidate, "financials-snapshot.json"))).toEqual(before);
  });

  it("accepts changed valid artifact bytes under a new revision", () => {
    const candidate = candidateCopy();
    rewriteCandidate(candidate, (snapshot) => { snapshot.fundamentals.ABNB.data.revenue += 1; }, "test-new-revision");
    const output = execFileSync(process.execPath, [script, "--current-root", sourceRoot, "--candidate-root", candidate], { encoding: "utf8" });
    expect(JSON.parse(output)).toMatchObject({ ok: true, artifact_revision: "test-new-revision" });
  });

  it("accepts a supported month-qualified fiscal label under a new revision", () => {
    const candidate = candidateCopy();
    rewriteCandidate(candidate, (snapshot) => {
      snapshot.fundamentals.ABNB.as_of = "FY2025 M12 FY";
      snapshot.financials.ABNB.as_of = "FY2025 M12 FY";
    }, "test-month-qualified-label");
    const output = execFileSync(process.execPath, [script, "--current-root", sourceRoot, "--candidate-root", candidate], { encoding: "utf8" });
    expect(JSON.parse(output)).toMatchObject({ ok: true, artifact_revision: "test-month-qualified-label" });
  });

  it("counts verified-only fundamentals in the union and preserves availability", () => {
    const candidate = candidateCopy();
    rewriteCandidate(candidate, (snapshot) => {
      delete snapshot.fundamentals.NVDA;
      delete snapshot.financials.NVDA;
    }, "verified-only-nvda");
    const output = execFileSync(process.execPath, [script, "--current-root", sourceRoot, "--candidate-root", candidate], { encoding: "utf8" });
    const result = JSON.parse(output);
    expect(result.counts.snapshot_available).toBe(128);
    expect(result.changes).toEqual([]);
  });

  it("accepts the annual candidate against a current root published before the annual artifact", () => {
    const current = mkdtempSync(join(tmpdir(), "benten-current-"));
    for (const file of ["xstocks.json", "financials-snapshot.json", "verified-facts-v2.json", "snapshot-manifest.json"]) {
      cpSync(join(sourceRoot, file), join(current, file));
    }
    const manifestPath = join(current, "snapshot-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    delete manifest.verified_annual_sha256;
    delete manifest.record_counts.annual_years;
    manifest.artifact_revision = "pre-annual-baseline";
    writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
    const output = execFileSync(process.execPath, [script, "--current-root", current, "--candidate-root", candidateCopy()], { encoding: "utf8" });
    expect(JSON.parse(output)).toMatchObject({ ok: true, artifact_revision: currentRevision, changes: [] });
  });

  it("requires the annual artifact in a candidate", () => {
    const candidate = candidateCopy();
    rmSync(join(candidate, "verified-facts-annual-v1.json"));
    const result = spawnSync(process.execPath, [script, "--current-root", sourceRoot, "--candidate-root", candidate], { encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ ok: false, errors: [{ code: "MISSING_ARTIFACT", path: "snapshot-manifest.json" }] });
  });

  it("rejects an annual artifact whose bytes differ from the manifest hash", () => {
    const candidate = candidateCopy();
    const path = join(candidate, "verified-facts-annual-v1.json");
    writeFileSync(path, `${readFileSync(path, "utf8")}\n`);
    const result = spawnSync(process.execPath, [script, "--current-root", sourceRoot, "--candidate-root", candidate], { encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ ok: false, errors: [{ code: "HASH_MISMATCH", path: "verified-facts-annual-v1.json" }] });
  });

  it("rejects an annual artifact with an unknown property", () => {
    const candidate = candidateCopy();
    const path = join(candidate, "verified-facts-annual-v1.json");
    const annual = JSON.parse(readFileSync(path, "utf8"));
    annual.records.NVDA.years[0].estimate = 1;
    writeFileSync(path, `${JSON.stringify(annual)}\n`);
    const manifestPath = join(candidate, "snapshot-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.verified_annual_sha256 = createHash("sha256").update(readFileSync(path)).digest("hex");
    manifest.artifact_revision = "annual-unknown-property";
    writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
    const result = spawnSync(process.execPath, [script, "--current-root", sourceRoot, "--candidate-root", candidate], { encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ ok: false, errors: [{ code: "SCHEMA_INVALID", path: "packages/registry/src" }] });
  });

  it("accepts the statement candidate against a current root published before the statement artifacts", () => {
    const current = mkdtempSync(join(tmpdir(), "benten-current-"));
    for (const file of PRE_STATEMENT_FILES) cpSync(join(sourceRoot, file), join(current, file));
    const manifestPath = join(current, "snapshot-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    delete manifest.verified_statements_sha256;
    delete manifest.record_counts.statement_years;
    manifest.artifact_revision = "pre-statements-baseline";
    writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
    const output = execFileSync(process.execPath, [script, "--current-root", current, "--candidate-root", candidateCopy()], { encoding: "utf8" });
    expect(JSON.parse(output)).toMatchObject({ ok: true, artifact_revision: currentRevision, changes: [] });
  });

  it("requires every statement artifact in a candidate", () => {
    const candidate = candidateCopy();
    rmSync(join(candidate, STATEMENT_FILES[3]!));
    const result = spawnSync(process.execPath, [script, "--current-root", sourceRoot, "--candidate-root", candidate], { encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ ok: false, errors: [{ code: "MISSING_ARTIFACT", path: "snapshot-manifest.json" }] });
  });

  it("rejects a statement artifact whose bytes differ from the manifest hash", () => {
    const candidate = candidateCopy();
    const path = join(candidate, STATEMENT_FILES[0]!);
    writeFileSync(path, `${readFileSync(path, "utf8")}\n`);
    const result = spawnSync(process.execPath, [script, "--current-root", sourceRoot, "--candidate-root", candidate], { encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ ok: false, errors: [{ code: "HASH_MISMATCH", path: STATEMENT_FILES[0] }] });
  });

  it("rejects a statement artifact with an estimate or unknown property", () => {
    const candidate = candidateCopy();
    const path = join(candidate, STATEMENT_FILES[0]!);
    const history = JSON.parse(readFileSync(path, "utf8"));
    history.records.NVDA.years[0].facts.gross_profit.estimate = true;
    writeFileSync(path, `${JSON.stringify(history)}\n`);
    const manifestPath = join(candidate, "snapshot-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.verified_statements_sha256.pl = createHash("sha256").update(readFileSync(path)).digest("hex");
    manifest.artifact_revision = "statement-unknown-property";
    writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
    const result = spawnSync(process.execPath, [script, "--current-root", sourceRoot, "--candidate-root", candidate], { encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ ok: false, errors: [{ code: "SCHEMA_INVALID", path: "packages/registry/src" }] });
  });
});
