#!/usr/bin/env node
/**
 * Generator for the `benten.listed-company-map.v1` artifact: one company row
 * per filing-eligible xStock, bound to the SEC registrant that files for it.
 *
 * Tooling only. No runtime package imports this file; the published runtimes
 * read the generated, reviewable JSON instead, and never match names at run
 * time.
 *
 * It reads the bundled xStocks registry and the SEC EDGAR responses that
 * `scripts/edgar/build-verified-facts.mjs` caches (`company_tickers.json`
 * and one `companyfacts` document per CIK). It never opens a connection.
 *
 * Binding rule. A registry row is filing-eligible when its exclusion reason is
 * null. Its ticker (with `.` written as SEC's `-`) must name exactly one CIK in
 * `company_tickers.json`. That CIK's registrant name is its `submissions`
 * name (`registrantName` in `sec-names.mjs`: the `companyfacts.entityName`
 * spelling is kept only while it names the same registrant). The row stays
 * out of the map (fail closed, recorded in `excluded` with a reason) when:
 *
 *   - `cik_unresolved`: the ticker names no CIK;
 *   - `ticker_on_multiple_ciks`: the ticker names more than one CIK, so one
 *     token could belong to more than one company;
 *   - `cik_shared_by_registry_tokens`: another filing-eligible registry row
 *     resolves to the same CIK, so one company would hold more than one
 *     token (rows the registry already excludes, such as a preferred share
 *     of the same issuer, do not count);
 *   - `companyfacts_unavailable` / `submissions_unavailable` /
 *     `sec_entity_name_unusable`: no usable registrant name;
 *   - `sec_name_sources_disagree`: the registrant name and the
 *     `company_tickers` title do not reduce to the same comparison key, so the
 *     ticker may name a different registrant than the filer;
 *   - `slug_collision`: two companies would share a slug.
 *
 * Display name. Investors read "NVIDIA", not "NVIDIA CORP". The display name
 * is, in order: the reviewed override for the ticker
 * (`listed-company-display-names.json`); else the registry token name without
 * its " xStock" suffix, when that carries no legal form, no leading "The" and
 * no state suffix and its words begin the registrant's comparison key; else
 * (fail closed) the registrant name itself, marked
 * `sec_registrant_fallback` and reported. The registrant name always stays in
 * the evidence, where pages show it as "SEC registrant".
 *
 * The comparison key and the slug are review aids computed here once; the
 * artifact stores the result and its evidence. `generation.verification`
 * copies the recorded independent re-check (`listed-company-verification.json`)
 * and must agree with the rows generated here; a person reviews the map before
 * `generation.human_review` may say anything but `pending`.
 *
 * Usage:
 *   node scripts/companies/build-listed-company-map.mjs [options]
 *
 * Options:
 *   --cache-dir PATH     EDGAR cache (default: $EDGAR_CACHE_DIR, else a
 *                        `benten-edgar` folder in the OS temp directory).
 *   --out-dir PATH       Artifact output directory (default: packages/registry/src).
 *   --generated-at TIME  RFC 3339 time with offset (default: now, UTC).
 *   --generated-by ID    Generator identity recorded in the artifact
 *                        (default: $LISTED_MAP_GENERATED_BY, else "unattributed").
 *   --dry-run            Report only; do not write the artifact.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { comparisonWords, registrantName } from "./sec-names.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REGISTRY_SRC = join(REPO_ROOT, "packages/registry/src");
const ARTIFACT = "listed-company-map-v1.json";
const SCHEMA_VERSION = "benten.listed-company-map.v1";
const METHOD = "registry_ticker_sec_cik_entity_name";
const GENERATOR = "scripts/companies/build-listed-company-map.mjs";
const MAX_DISPLAY_NAME = 80;
const MAX_SLUG = 64;
const DISPLAY_NAMES = join(dirname(fileURLToPath(import.meta.url)), "listed-company-display-names.json");
const VERIFICATION = join(dirname(fileURLToPath(import.meta.url)), "listed-company-verification.json");
/** The registry names every xStock "<name> xStock". */
const TOKEN_SUFFIX = /\s+xStock$/;
/** Connectors never left at either end of a slug. */
const EDGE_CONNECTORS = new Set(["AND", "OF", "THE"]);

function parseArgs(argv) {
  const options = {
    cacheDir: process.env.EDGAR_CACHE_DIR || join(tmpdir(), "benten-edgar"),
    outDir: REGISTRY_SRC,
    generatedAt: `${new Date().toISOString().slice(0, 19)}Z`,
    generatedBy: process.env.LISTED_MAP_GENERATED_BY || "unattributed",
    dryRun: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--cache-dir") options.cacheDir = resolve(argv[index += 1] ?? "");
    else if (argument === "--out-dir") options.outDir = resolve(argv[index += 1] ?? "");
    else if (argument === "--generated-at") options.generatedAt = argv[index += 1] ?? "";
    else if (argument === "--generated-by") options.generatedBy = argv[index += 1] ?? "";
    else throw new TypeError(`Unsupported argument: ${argument}`);
  }
  if (!/^[a-z0-9][a-z0-9.-]{0,63}$/.test(options.generatedBy)) throw new TypeError("Unsupported --generated-by");
  return options;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function readCached(options, name) {
  const path = join(options.cacheDir, name);
  if (!existsSync(path)) return null;
  const bytes = readFileSync(path);
  return { bytes, json: JSON.parse(bytes.toString("utf8")) };
}

/** Registry tickers use a dot where SEC share-class tickers use a hyphen. */
function secTicker(ticker) {
  return ticker.replaceAll(".", "-").toUpperCase();
}

function padCik(cik) {
  return String(cik).replace(/\D/g, "").padStart(10, "0");
}

/** The registrant name as written, with whitespace collapsed and typographic apostrophes made ASCII. */
function displayName(raw) {
  if (typeof raw !== "string") return null;
  const value = raw.replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
  return value.length >= 1 && value.length <= MAX_DISPLAY_NAME && /^[ -~]+$/.test(value) ? value : null;
}

/** Words of a name as written: case folded, apostrophes dropped, `&` as AND; nothing else removed. */
function writtenWords(name) {
  return name.toUpperCase().replace(/[‘’']/g, "").replace(/&/g, " AND ").split(/[^A-Z0-9]+/).filter(Boolean);
}

/**
 * The display name the registry token name gives, or `null`: the token name
 * without " xStock", when its written words are already a comparison key
 * (no legal form, no leading "The", no state suffix) and that key begins the
 * registrant's key.
 */
function tokenDisplayName(tokenName, registrant) {
  if (typeof tokenName !== "string" || !TOKEN_SUFFIX.test(tokenName)) return null;
  const candidate = displayName(tokenName.replace(TOKEN_SUFFIX, ""));
  if (!candidate) return null;
  const written = writtenWords(candidate);
  const key = comparisonWords(candidate);
  const registrantKey = comparisonWords(registrant);
  if (written.length === 0 || written.join(" ") !== key.join(" ") || key.length > registrantKey.length) return null;
  return key.every((word, index) => registrantKey[index] === word) ? candidate : null;
}

function readDisplayNameOverrides() {
  const file = JSON.parse(readFileSync(DISPLAY_NAMES, "utf8"));
  if (file.schema_version !== "benten.listed-company-display-names.v1" || !Array.isArray(file.overrides)) throw new TypeError("invalid display name overrides");
  const overrides = new Map();
  for (const row of file.overrides) {
    const name = displayName(row?.display_name);
    if (typeof row?.ticker !== "string" || !name || name !== row.display_name || overrides.has(row.ticker)) throw new TypeError(`invalid display name override ${row?.ticker}`);
    overrides.set(row.ticker, name);
  }
  return overrides;
}

function slugFor(name) {
  const words = comparisonWords(name);
  while (words.length > 1 && EDGE_CONNECTORS.has(words.at(-1))) words.pop();
  while (words.length > 1 && EDGE_CONNECTORS.has(words[0])) words.shift();
  const slug = words.join("-").toLowerCase();
  return slug.length >= 1 && slug.length <= MAX_SLUG && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) ? slug : null;
}

function build(options) {
  const registryBytes = readFileSync(join(REGISTRY_SRC, "xstocks.json"));
  const registry = JSON.parse(registryBytes.toString("utf8"));
  const tickersFile = readCached(options, "company_tickers.json");
  if (!tickersFile || typeof tickersFile.json !== "object") {
    throw new TypeError(`No cached company_tickers.json in ${options.cacheDir}`);
  }

  const ciksByTicker = new Map();
  const titleByCik = new Map();
  for (const row of Object.values(tickersFile.json)) {
    if (!row || typeof row.ticker !== "string" || row.cik_str === undefined) continue;
    const ticker = row.ticker.toUpperCase();
    const cik = padCik(row.cik_str);
    if (!ciksByTicker.has(ticker)) ciksByTicker.set(ticker, new Set());
    ciksByTicker.get(ticker).add(cik);
    if (typeof row.title === "string" && !titleByCik.has(cik)) titleByCik.set(cik, row.title);
  }
  const ciksOf = (entry) => [...(ciksByTicker.get(secTicker(entry.ticker)) ?? [])].sort();

  // Every filing-eligible registry row that names exactly one CIK. A row the registry already excludes
  // (for example a preferred share of the same issuer) is never a company here, so it cannot share one.
  const registryTickersByCik = new Map();
  for (const entry of registry.filter((row) => row.exclusion_reason === null)) {
    const ciks = ciksOf(entry);
    if (ciks.length !== 1) continue;
    if (!registryTickersByCik.has(ciks[0])) registryTickersByCik.set(ciks[0], []);
    registryTickersByCik.get(ciks[0]).push(entry.ticker);
  }

  const overrides = readDisplayNameOverrides();
  const companyfactsDigests = [];
  const submissionsDigests = [];
  const candidates = [];
  const excluded = [];
  const exclude = (entry, reason, evidence) => {
    excluded.push({ source: "xstocks_registry", ticker: entry.ticker, reason, evidence });
  };

  for (const entry of registry.filter((row) => row.exclusion_reason === null)) {
    const ciks = ciksOf(entry);
    const baseEvidence = {
      sec_ciks: ciks,
      sec_entity_name: null,
      sec_ticker_title: ciks.length === 1 ? displayName(titleByCik.get(ciks[0])) : null,
      registry_token_name: entry.name,
      shared_with_tickers: [],
    };
    if (ciks.length === 0) { exclude(entry, "cik_unresolved", baseEvidence); continue; }
    if (ciks.length > 1) { exclude(entry, "ticker_on_multiple_ciks", baseEvidence); continue; }
    const [cik] = ciks;
    const shared = registryTickersByCik.get(cik).filter((ticker) => ticker !== entry.ticker).sort();
    if (shared.length > 0) {
      exclude(entry, "cik_shared_by_registry_tokens", { ...baseEvidence, shared_with_tickers: shared });
      continue;
    }
    const facts = readCached(options, `${cik}.json`);
    if (!facts) { exclude(entry, "companyfacts_unavailable", baseEvidence); continue; }
    companyfactsDigests.push({ cik, sha256: sha256(facts.bytes) });
    const entityName = displayName(facts.json.entityName);
    const submissions = readCached(options, `submissions-${cik}.json`);
    const evidence = { ...baseEvidence, sec_entity_name: entityName };
    if (!submissions) { exclude(entry, "submissions_unavailable", evidence); continue; }
    submissionsDigests.push({ cik, sha256: sha256(submissions.bytes) });
    const name = displayName(registrantName(facts.json.entityName, submissions.json.name));
    if (!name) { exclude(entry, "sec_entity_name_unusable", evidence); continue; }
    const title = titleByCik.get(cik);
    if (typeof title !== "string" || comparisonWords(name).join(" ") !== comparisonWords(title).join(" ")) {
      exclude(entry, "sec_name_sources_disagree", evidence);
      continue;
    }
    const slug = slugFor(name);
    if (!slug) { exclude(entry, "sec_entity_name_unusable", evidence); continue; }
    const override = overrides.get(entry.ticker);
    const fromToken = tokenDisplayName(entry.name, name);
    const display = override
      ? { name: override, basis: "reviewed_override" }
      : fromToken ? { name: fromToken, basis: "registry_token_name" } : { name, basis: "sec_registrant_fallback" };
    candidates.push({ entry, cik, name, slug, display, evidence });
  }

  const reviewedMap = JSON.parse(readFileSync(join(REGISTRY_SRC, "company-map-v1.json"), "utf8"));
  const takenSlugs = new Set(reviewedMap.companies.map((company) => company.slug));
  const slugCounts = new Map();
  for (const candidate of candidates) slugCounts.set(candidate.slug, (slugCounts.get(candidate.slug) ?? 0) + 1);

  const companies = [];
  for (const candidate of candidates) {
    if (slugCounts.get(candidate.slug) > 1 || takenSlugs.has(candidate.slug)) {
      exclude(candidate.entry, "slug_collision", candidate.evidence);
      continue;
    }
    companies.push({
      slug: candidate.slug,
      display_name: candidate.display.name,
      display_name_basis: candidate.display.basis,
      listing_status: "us_listed",
      instruments: [{
        source: "xstocks_registry",
        ticker: candidate.entry.ticker,
        mint: candidate.entry.mint,
        binding_basis: "issuer_product_name",
      }],
      evidence: {
        sec_cik: candidate.cik,
        sec_registrant_name: candidate.name,
        sec_entity_name: candidate.evidence.sec_entity_name,
        sec_ticker_title: candidate.evidence.sec_ticker_title,
        registry_token_name: candidate.entry.name,
      },
    });
  }
  companies.sort((left, right) => (left.slug < right.slug ? -1 : left.slug > right.slug ? 1 : 0));
  excluded.sort((left, right) => (left.ticker < right.ticker ? -1 : left.ticker > right.ticker ? 1 : 0));
  companyfactsDigests.sort((left, right) => (left.cik < right.cik ? -1 : 1));
  submissionsDigests.sort((left, right) => (left.cik < right.cik ? -1 : 1));
  const unusedOverrides = [...overrides.keys()].filter((ticker) => !companies.some((company) => company.instruments[0].ticker === ticker));
  if (unusedOverrides.length > 0) throw new TypeError(`display name overrides for tickers not in the map: ${unusedOverrides.join(", ")}`);

  const verification = JSON.parse(readFileSync(VERIFICATION, "utf8"));
  if (verification.schema_version !== "benten.listed-company-verification.v1" || verification.counts?.map_companies !== companies.length
    || verification.counts.map_cik_matches_sec !== companies.length) {
    throw new TypeError("the recorded verification does not cover the generated companies");
  }

  return {
    schema_version: SCHEMA_VERSION,
    revision: 2,
    generated_at: options.generatedAt,
    generation: {
      method: METHOD,
      generator: GENERATOR,
      generated_by: options.generatedBy,
      human_review: { status: "pending", reviewer: null, reviewed_at: null },
      verification: {
        method: verification.method,
        checked_on: verification.checked_on,
        checked_by: verification.checked_by,
        counts: { ...verification.counts },
      },
    },
    bound_sources: {
      xstocks_registry_sha256: sha256(registryBytes),
      sec_company_tickers_cache_sha256: sha256(tickersFile.bytes),
      sec_companyfacts_cache_sha256: sha256(Buffer.from(JSON.stringify(companyfactsDigests), "utf8")),
      sec_submissions_cache_sha256: sha256(Buffer.from(JSON.stringify(submissionsDigests), "utf8")),
      display_names_sha256: sha256(readFileSync(DISPLAY_NAMES)),
    },
    companies,
    excluded,
  };
}

const options = parseArgs(process.argv.slice(2));
const artifact = build(options);
if (!options.dryRun) {
  mkdirSync(options.outDir, { recursive: true });
  writeFileSync(join(options.outDir, ARTIFACT), `${JSON.stringify(artifact, null, 2)}\n`);
}
process.stdout.write(`${JSON.stringify({
  ok: true,
  dry_run: options.dryRun,
  companies: artifact.companies.length,
  display_name_basis: Object.fromEntries(["registry_token_name", "reviewed_override", "sec_registrant_fallback"].map((basis) => [basis, artifact.companies.filter((company) => company.display_name_basis === basis).length])),
  sec_registrant_fallback: artifact.companies.filter((company) => company.display_name_basis === "sec_registrant_fallback").map((company) => ({ ticker: company.instruments[0].ticker, display_name: company.display_name })),
  excluded: artifact.excluded.map(({ ticker, reason, evidence }) => ({
    ticker, reason, ...(evidence.shared_with_tickers.length > 0 ? { shared_with: evidence.shared_with_tickers } : {}),
  })),
})}\n`);
