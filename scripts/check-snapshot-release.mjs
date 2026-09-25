#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  validateSnapshotManifest,
  validateSnapshotManifestBeforeStatements,
  validateVerifiedOverlay,
} from "../packages/registry/src/artifact-validation.js";
import { validateLegacyFinancialsSnapshot } from "../packages/registry/src/legacy-validation.js";
import { countAnnualYears, validateVerifiedAnnualHistory } from "../packages/registry/src/annual-history-validation.js";
import {
  STATEMENT_DETAIL_NAMES,
  countStatementYears,
  statementArtifactFile,
  validateVerifiedStatementHistories,
} from "../packages/registry/src/statement-history-validation.js";
import {
  countAvailableFundamentals,
  coverageAvailabilityFromRecords,
  verifiedRecordHasFacts,
} from "../packages/registry/src/coverage-state.js";

const BASE_FILES = ["xstocks.json", "financials-snapshot.json"];
const ANNUAL_FILE = "verified-facts-annual-v1.json";
const STATEMENT_FILES = STATEMENT_DETAIL_NAMES.map(statementArtifactFile);
const V2_FILES = [...BASE_FILES, "verified-facts-v2.json", ANNUAL_FILE, ...STATEMENT_FILES, "snapshot-manifest.json"];
/** A current root published before the statement artifacts (revision 2.1). */
const PRE_STATEMENT_FILES = [...BASE_FILES, "verified-facts-v2.json", ANNUAL_FILE, "snapshot-manifest.json"];
/** A current root published before the annual artifact existed carries the three v2 files only. */
const PRE_ANNUAL_FILES = [...BASE_FILES, "verified-facts-v2.json", "snapshot-manifest.json"];
const ARTIFACT_PATTERN = /(?:snapshot|verified-facts|verified-statements|manifest).*\.json$/;
/** The provider identity artifact has its own producer, manifest and validator. */
const PROVIDER_FILES = ["provider-assets-v1.json", "provider-assets-manifest.json"];
const REGISTRY_KEYS = [
  "symbol", "ticker", "name", "mint", "issuer", "issuer_verified", "decimals",
  "fundamentals_available", "exclusion_reason",
];
const EXCLUSION_REASONS = new Set(["etf", "non_sec_listing", "private", "preferred"]);
const STATEMENTS = ["pl", "bs", "cf"];
const ABNB_MINT = "XscSc1zjbVizEnhCzzehJ9fzztm3WRKdn9pjmriKDuN";

function exactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseJson(bytes) {
  return JSON.parse(bytes.toString("utf8"));
}

function validateRegistry(input) {
  if (!Array.isArray(input)) throw new TypeError("Invalid registry");
  const tickers = new Set();
  const mints = new Set();
  for (const entry of input) {
    if (!exactKeys(entry, REGISTRY_KEYS)) throw new TypeError("Invalid registry entry");
    if (
      typeof entry.symbol !== "string" || entry.symbol.length < 1 || entry.symbol.length > 32
      || typeof entry.ticker !== "string" || !/^[A-Z0-9.-]{1,16}$/.test(entry.ticker)
      || typeof entry.name !== "string" || entry.name.length < 1 || entry.name.length > 512
      || typeof entry.mint !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(entry.mint)
      || typeof entry.issuer !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(entry.issuer)
      || entry.issuer_verified !== true
      || !Number.isInteger(entry.decimals) || entry.decimals < 0 || entry.decimals > 18
      || typeof entry.fundamentals_available !== "boolean"
      || (entry.fundamentals_available ? entry.exclusion_reason !== null : !EXCLUSION_REASONS.has(entry.exclusion_reason))
      || tickers.has(entry.ticker) || mints.has(entry.mint)
    ) throw new TypeError("Invalid registry entry");
    tickers.add(entry.ticker);
    mints.add(entry.mint);
  }
  return input;
}

function readRoot(root, requireV2) {
  const names = new Set(readdirSync(root));
  const unexpected = [...names]
    .filter((name) => ARTIFACT_PATTERN.test(name) && !V2_FILES.includes(name) && !PROVIDER_FILES.includes(name))
    .sort();
  if (unexpected.length) return { errors: unexpected.map((path) => ({ code: "UNEXPECTED_ARTIFACT", path })) };
  const hasBase = BASE_FILES.every((name) => names.has(name));
  const hasV2 = V2_FILES.every((name) => names.has(name));
  const noStatements = STATEMENT_FILES.every((name) => !names.has(name));
  const preStatements = !requireV2 && !hasV2 && noStatements && PRE_STATEMENT_FILES.every((name) => names.has(name));
  const preAnnual = !requireV2 && !hasV2 && noStatements && !names.has(ANNUAL_FILE) && PRE_ANNUAL_FILES.every((name) => names.has(name));
  if (!hasBase || (requireV2 && !hasV2)
      || (!requireV2 && !hasV2 && !preAnnual && !preStatements && (names.has("verified-facts-v2.json") || names.has("snapshot-manifest.json")
        || names.has(ANNUAL_FILE) || !noStatements))) {
    return { errors: [{ code: "MISSING_ARTIFACT", path: requireV2 ? "snapshot-manifest.json" : "packages/registry/src" }] };
  }
  const present = hasV2 ? V2_FILES : preStatements ? PRE_STATEMENT_FILES : preAnnual ? PRE_ANNUAL_FILES : BASE_FILES;
  const files = Object.fromEntries(present.map((name) => [name, readFileSync(join(root, name))]));
  try {
    const registry = validateRegistry(parseJson(files["xstocks.json"]));
    const eligibleTickers = new Set(registry.filter((entry) => entry.fundamentals_available).map((entry) => entry.ticker));
    const legacy = validateLegacyFinancialsSnapshot(parseJson(files["financials-snapshot.json"]), eligibleTickers);
    if (!hasV2 && !preAnnual && !preStatements) return { kind: "legacy_bootstrap", registry, legacy, overlay: { schema_version: "2.0", records: {} } };
    const overlay = validateVerifiedOverlay(parseJson(files["verified-facts-v2.json"]), eligibleTickers);
    if (preAnnual) {
      // Read-only comparison baseline from before the annual artifact; never a candidate.
      const rawManifest = parseJson(files["snapshot-manifest.json"]);
      return {
        kind: "v2_pre_annual", registry, legacy, overlay, manifest: rawManifest,
        artifactHashes: Object.fromEntries(PRE_ANNUAL_FILES.filter((name) => name !== "snapshot-manifest.json")
          .map((name) => [name, sha256(files[name])])),
      };
    }
    const annual = validateVerifiedAnnualHistory(parseJson(files[ANNUAL_FILE]), eligibleTickers);
    // A revision 2.1 root is a read-only comparison baseline: no statement artifacts or hashes.
    const manifest = preStatements
      ? validateSnapshotManifestBeforeStatements(parseJson(files["snapshot-manifest.json"]))
      : validateSnapshotManifest(parseJson(files["snapshot-manifest.json"]));
    const statements = preStatements ? null : validateVerifiedStatementHistories(Object.fromEntries(STATEMENT_DETAIL_NAMES
      .map((statement) => [statement, parseJson(files[statementArtifactFile(statement)])])), annual);
    const hashes = {
      "xstocks.json": [manifest.registry_snapshot_sha256, sha256(files["xstocks.json"])],
      "financials-snapshot.json": [manifest.legacy_financial_snapshot_sha256, sha256(files["financials-snapshot.json"])],
      "verified-facts-v2.json": [manifest.verified_overlay_sha256, sha256(files["verified-facts-v2.json"])],
      [ANNUAL_FILE]: [manifest.verified_annual_sha256, sha256(files[ANNUAL_FILE])],
      ...(preStatements ? {} : Object.fromEntries(STATEMENT_DETAIL_NAMES.map((statement) => [statementArtifactFile(statement),
        [manifest.verified_statements_sha256[statement], sha256(files[statementArtifactFile(statement)])]]))),
    };
    const hashErrors = Object.entries(hashes)
      .filter(([, [expected, actual]]) => expected !== actual)
      .map(([path]) => ({ code: "HASH_MISMATCH", path }));
    if (hashErrors.length) return { errors: hashErrors };
    const counts = {
      registry: registry.length,
      eligible: eligibleTickers.size,
      snapshot_available: countAvailableFundamentals(registry, legacy.fundamentals, overlay.records),
      source_verified: Object.values(overlay.records).filter(verifiedRecordHasFacts).length,
      annual_years: countAnnualYears(annual),
      ...(statements ? { statement_years: Object.values(countStatementYears(statements)).reduce((a, b) => a + b, 0) } : {}),
    };
    if (Object.entries(counts).some(([key, value]) => manifest.record_counts[key] !== value)) {
      return { errors: [{ code: "COUNT_MISMATCH", path: "snapshot-manifest.json" }] };
    }
    if (registry.find((entry) => entry.mint === ABNB_MINT)?.ticker !== "ABNB") {
      return { errors: [{ code: "IDENTIFIER_MISMATCH", path: "xstocks.json" }] };
    }
    return {
      kind: preStatements ? "v2_pre_statements" : "v2", registry, legacy, overlay, manifest, counts,
      artifactHashes: Object.fromEntries(Object.entries(hashes).map(([path, [, actual]]) => [path, actual])),
    };
  } catch {
    return { errors: [{ code: "SCHEMA_INVALID", path: "packages/registry/src" }] };
  }
}

function states(bundle) {
  return new Map(bundle.registry.map((entry) => {
    const fundamentals = bundle.legacy.fundamentals[entry.ticker];
    const legacyStatements = bundle.legacy.financials[entry.ticker]?.statements;
    const verified = bundle.overlay.records[entry.ticker];
    const availability = coverageAvailabilityFromRecords(fundamentals, bundle.legacy.financials[entry.ticker], verified);
    const hasLegacyFinancials = Boolean(fundamentals || legacyStatements && Object.values(legacyStatements).some(Boolean));
    return [entry.ticker, {
      eligible: entry.fundamentals_available,
      available: availability.snapshot_status === "available",
      capabilities: STATEMENTS.map((name) => availability.capabilities[name]).join(","),
      source: verifiedRecordHasFacts(verified)
        ? "source_verified"
        : hasLegacyFinancials ? "legacy_snapshot" : "not_applicable",
    }];
  }));
}

function changesBetween(current, candidate) {
  const before = states(current);
  const after = states(candidate);
  const tickers = [...new Set([...before.keys(), ...after.keys()])].sort();
  const changes = [];
  for (const ticker of tickers) {
    const a = before.get(ticker);
    const b = after.get(ticker);
    const fields = [];
    if (!a) fields.push("added");
    else if (!b) fields.push("removed");
    else {
      if (a.eligible !== b.eligible) fields.push("eligibility");
      if (a.available !== b.available || a.capabilities !== b.capabilities) fields.push("availability");
      if (a.source !== b.source) fields.push("source_status");
    }
    if (fields.length) changes.push({ ticker, changes: fields });
  }
  return changes;
}

function parseArgs(argv) {
  if (argv.length !== 4 || argv[0] !== "--current-root" || argv[2] !== "--candidate-root") return null;
  return { currentRoot: argv[1], candidateRoot: argv[3] };
}

const args = parseArgs(process.argv.slice(2));
if (!args) {
  process.stdout.write(`${JSON.stringify({ ok: false, errors: [{ code: "INVALID_ARGUMENTS", path: "command" }] })}\n`);
  process.exitCode = 2;
} else {
  let current;
  let candidate;
  try {
    current = readRoot(args.currentRoot, false);
    candidate = readRoot(args.candidateRoot, true);
  } catch {
    process.stdout.write(`${JSON.stringify({ ok: false, errors: [{ code: "READ_FAILED", path: "packages/registry/src" }] })}\n`);
    process.exitCode = 1;
  }
  if (current && candidate) {
    const errors = [...(current.errors ?? []), ...(candidate.errors ?? [])];
    if (["v2", "v2_pre_annual", "v2_pre_statements"].includes(current.kind) && candidate.kind === "v2"
        && current.manifest.artifact_revision === candidate.manifest.artifact_revision
        && Object.keys(candidate.artifactHashes).some((path) => current.artifactHashes[path] !== candidate.artifactHashes[path])) {
      errors.push({ code: "REVISION_REUSED", path: "snapshot-manifest.json" });
    }
    if (errors.length) {
      const unique = [...new Map(errors.map((error) => [`${error.code}:${error.path}`, error])).values()]
        .sort((a, b) => `${a.code}:${a.path}`.localeCompare(`${b.code}:${b.path}`));
      process.stdout.write(`${JSON.stringify({ ok: false, errors: unique })}\n`);
      process.exitCode = 1;
    } else {
      process.stdout.write(`${JSON.stringify({
        ok: true,
        artifact_revision: candidate.manifest.artifact_revision,
        hashes_verified: true,
        counts: candidate.counts,
        changes: changesBetween(current, candidate),
      })}\n`);
    }
  }
}
