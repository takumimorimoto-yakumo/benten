#!/usr/bin/env node
/**
 * Fail-closed producer for the source-verified overlay.
 *
 * Tooling only. No runtime package imports this file; the published runtimes stay
 * network-free and read the generated static artifacts instead.
 *
 * It reads the bundled registry, resolves every covered ticker to an SEC CIK,
 * reads the free credential-less EDGAR XBRL `companyfacts` and `submissions`
 * APIs, and promotes a ticker only when the latest annual 10-K reports the
 * required facts in USD under one accession and one fiscal period. Anything
 * ambiguous, derived, non-USD, or outside that accession is skipped and the
 * ticker keeps its legacy snapshot.
 *
 * Usage:
 *   node scripts/edgar/build-verified-facts.mjs [options]
 *
 * Options:
 *   --cache-dir PATH   Raw EDGAR JSON cache (default: $EDGAR_CACHE_DIR, else a
 *                      `benten-edgar` folder in the OS temp directory). Raw
 *                      responses are never written inside the repository.
 *   --offline          Use the cache only; never open a network connection.
 *   --only A,B,C       Restrict the run to these registry tickers.
 *   --ledger-date DATE Evidence ledger date stamp (default: today, UTC).
 *   --dry-run          Report only; do not write any artifact.
 *
 * Environment:
 *   EDGAR_USER_AGENT   Overrides the descriptive SEC User-Agent header.
 *   EDGAR_CACHE_DIR    Default raw-response cache directory.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { registrantName } from "../companies/sec-names.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REGISTRY_SRC = join(REPO_ROOT, "packages/registry/src");
const DOCS_ROOT = join(REPO_ROOT, "docs");

const DEFAULT_USER_AGENT = "Benten open-source tooling (contact via repository)";
const USER_AGENT = process.env.EDGAR_USER_AGENT || DEFAULT_USER_AGENT;
/** SEC asks for at most ten requests per second; this producer stays at five. */
const MIN_REQUEST_INTERVAL_MS = 200;
const REQUEST_ATTEMPTS = 3;

const COMPANY_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const ANNUAL_DAYS_MIN = 350;
const ANNUAL_DAYS_MAX = 380;

/** First present concept wins; the chosen one is published as `source_concept`. */
const CONCEPT_PRIORITY = {
  revenue: [
    "Revenues",
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
  ],
  net_income_parent: ["NetIncomeLoss"],
  total_assets: ["Assets"],
  total_liabilities: ["Liabilities"],
  operating_cf: ["NetCashProvidedByUsedInOperatingActivities"],
};
const DURATION_FACTS = ["revenue", "net_income_parent", "operating_cf"];
const INSTANT_FACTS = ["total_assets", "total_liabilities"];
const FACT_ORDER = ["revenue", "net_income_parent", "total_assets", "total_liabilities", "operating_cf"];
const REQUIRED_FACTS = ["revenue", "net_income_parent", "total_assets"];
const STATEMENT_FOR_FACT = {
  revenue: "pl",
  net_income_parent: "pl",
  total_assets: "bs",
  total_liabilities: "bs",
  operating_cf: "cf",
};
const STATEMENT_NAMES = ["pl", "bs", "cf"];

const OMISSION_REASONS = {
  concept_absent: "No supported directly reported concept was present in the selected 10-K under a USD unit.",
  context_absent: "The supported concept exists but reports no USD fact in the selected accession and fiscal period.",
  ambiguous_value: "The selected accession and fiscal period reported more than one distinct USD value for this concept.",
  ambiguous_period: "The selected accession reported more than one annual duration for this concept.",
  period_mismatch: "The reported duration does not match the fiscal period taken from the balance-sheet date.",
  unsafe_value: "The reported USD value is not a finite integer.",
};

function parseArgs(argv) {
  const options = {
    cacheDir: process.env.EDGAR_CACHE_DIR || join(tmpdir(), "benten-edgar"),
    offline: false,
    only: null,
    ledgerDate: new Date().toISOString().slice(0, 10),
    dryRun: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--offline") options.offline = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--cache-dir") options.cacheDir = resolve(argv[++index] ?? "");
    else if (arg === "--ledger-date") options.ledgerDate = argv[++index] ?? "";
    else if (arg === "--only") options.only = new Set((argv[++index] ?? "").split(",").filter(Boolean));
    else throw new TypeError(`Unknown argument: ${arg}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.ledgerDate)) throw new TypeError("Invalid --ledger-date");
  return options;
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

let nextRequestAt = 0;
async function throttledFetch(url) {
  const wait = nextRequestAt - Date.now();
  if (wait > 0) await sleep(wait);
  nextRequestAt = Date.now() + MIN_REQUEST_INTERVAL_MS;
  return fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
}

async function fetchJson(url) {
  let lastStatus = 0;
  for (let attempt = 1; attempt <= REQUEST_ATTEMPTS; attempt += 1) {
    let response;
    try {
      response = await throttledFetch(url);
    } catch {
      await sleep(1000 * attempt);
      continue;
    }
    if (response.ok) return await response.json();
    lastStatus = response.status;
    if (response.status === 404) return null;
    await sleep(1000 * attempt);
  }
  throw new Error(`EDGAR request failed (${lastStatus}): ${url}`);
}

function cacheRead(file) {
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}

async function cachedJson(url, cacheFile, options) {
  const cached = cacheRead(cacheFile);
  if (cached !== undefined) return cached;
  if (options.offline) return null;
  const payload = await fetchJson(url);
  if (payload === null) return null;
  mkdirSync(dirname(cacheFile), { recursive: true });
  writeFileSync(cacheFile, JSON.stringify(payload));
  return payload;
}

/** Registry tickers use a dot where SEC share-class tickers use a hyphen. */
function secTicker(ticker) {
  return ticker.replaceAll(".", "-");
}

function padCik(cik) {
  return String(cik).replace(/\D/g, "").padStart(10, "0");
}

/**
 * Resolve registry tickers to CIKs.
 *
 * The canonical map is `company_tickers.json`. When that file is unavailable
 * the producer falls back to the EDGAR full-text-search entity index and keeps
 * only a hit whose published ticker list contains the exact SEC ticker.
 */
async function resolveCiks(tickers, options) {
  const mapFile = join(options.cacheDir, "cik-map.json");
  const resolved = cacheRead(mapFile) ?? {};
  let directory = null;
  try {
    directory = await cachedJson(COMPANY_TICKERS_URL, join(options.cacheDir, "company_tickers.json"), options);
  } catch {
    directory = null;
  }
  if (directory && typeof directory === "object") {
    const byTicker = new Map();
    for (const row of Object.values(directory)) {
      if (row && typeof row.ticker === "string" && row.cik_str !== undefined) {
        byTicker.set(row.ticker.toUpperCase(), padCik(row.cik_str));
      }
    }
    for (const ticker of tickers) {
      const cik = byTicker.get(secTicker(ticker).toUpperCase());
      if (cik) resolved[ticker] = { cik, via: "company_tickers" };
    }
  }
  const unresolved = tickers.filter((ticker) => !resolved[ticker]);
  for (const ticker of unresolved) {
    if (options.offline) continue;
    const search = secTicker(ticker);
    const url = `https://efts.sec.gov/LATEST/search-index?q=&forms=10-K&entityName=${encodeURIComponent(search)}`;
    let payload = null;
    try {
      payload = await fetchJson(url);
    } catch {
      payload = null;
    }
    const names = new Set();
    for (const hit of payload?.hits?.hits ?? []) {
      for (const name of hit?._source?.display_names ?? []) names.add(name);
    }
    const ciks = new Set();
    for (const name of names) {
      const match = /^(.*?)\s+\(([^()]*)\)\s+\(CIK (\d{10})\)$/.exec(name);
      if (!match) continue;
      const published = match[2].split(",").map((value) => value.trim().toUpperCase());
      if (published.includes(search.toUpperCase())) ciks.add(match[3]);
    }
    if (ciks.size === 1) resolved[ticker] = { cik: [...ciks][0], via: "full_text_search" };
  }
  mkdirSync(options.cacheDir, { recursive: true });
  writeFileSync(mapFile, JSON.stringify(resolved, null, 2));
  return resolved;
}

function spanDays(start, end) {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000);
}

/** Latest annual filing: the 10-K/FY accession with the greatest filing date. */
function selectAccession(usGaap) {
  let best = null;
  const forms = new Set();
  for (const concept of Object.values(usGaap)) {
    for (const fact of concept?.units?.USD ?? []) {
      if (typeof fact.form === "string") forms.add(fact.form);
      if (fact.form !== "10-K" || fact.fp !== "FY") continue;
      if (typeof fact.accn !== "string" || typeof fact.filed !== "string") continue;
      if (!best || fact.filed > best.filed || (fact.filed === best.filed && fact.accn > best.accn)) {
        best = { accn: fact.accn, filed: fact.filed };
      }
    }
  }
  return { best, forms };
}

/** Fiscal period end: the latest balance-sheet date inside the selected filing. */
function selectPeriodEnd(usGaap, accn) {
  let periodEnd = null;
  for (const fact of usGaap.Assets?.units?.USD ?? []) {
    if (fact.accn !== accn || fact.start !== undefined || typeof fact.end !== "string") continue;
    if (!periodEnd || fact.end > periodEnd) periodEnd = fact.end;
  }
  return periodEnd;
}

/**
 * Fiscal year as SEC companyfacts labels it for the selected filing.
 *
 * The calendar year of the period end is not the issuer's own fiscal-year name
 * for a January or February year end, so the `fy` value carried by the selected
 * 10-K facts is used instead. It must be one unambiguous integer.
 */
function selectFiscalYear(usGaap, accn) {
  const years = new Set();
  for (const concept of Object.values(usGaap)) {
    for (const fact of concept?.units?.USD ?? []) {
      if (fact.accn !== accn || fact.form !== "10-K" || fact.fp !== "FY") continue;
      if (Number.isInteger(fact.fy)) years.add(fact.fy);
    }
  }
  return years.size === 1 ? [...years][0] : null;
}

/** First priority concept with any annual USD duration in the selected filing. */
function durationCandidates(usGaap, factName, accn, periodEnd) {
  for (const concept of CONCEPT_PRIORITY[factName]) {
    const byStart = new Map();
    for (const fact of usGaap[concept]?.units?.USD ?? []) {
      if (fact.accn !== accn || fact.end !== periodEnd || typeof fact.start !== "string") continue;
      const days = spanDays(fact.start, fact.end);
      if (days < ANNUAL_DAYS_MIN || days > ANNUAL_DAYS_MAX) continue;
      if (!byStart.has(fact.start)) byStart.set(fact.start, new Set());
      byStart.get(fact.start).add(fact.val);
    }
    if (byStart.size > 0) return { concept, byStart };
  }
  return null;
}

function instantValue(usGaap, factName, accn, periodEnd) {
  for (const concept of CONCEPT_PRIORITY[factName]) {
    const series = usGaap[concept]?.units?.USD;
    if (!series) continue;
    const values = new Set();
    for (const fact of series) {
      if (fact.accn !== accn || fact.start !== undefined || fact.end !== periodEnd) continue;
      values.add(fact.val);
    }
    if (values.size === 0) continue;
    if (values.size > 1) return { concept, reason: "ambiguous_value" };
    const value = [...values][0];
    if (!Number.isSafeInteger(value)) return { concept, reason: "unsafe_value" };
    return { concept, value };
  }
  return { reason: "concept_absent" };
}

/**
 * Reject a revenue concept that cannot be the issuer's top line.
 *
 * Some filers tag only a fragment of their income under a
 * `RevenueFromContractWithCustomer*` concept - a REIT whose top line is lease
 * income, or an asset manager that also reports a much larger consolidated
 * `Revenues`. Operating cash flow or net income exceeding the reported revenue
 * is a mechanical signal that the selected concept is not comparable to the
 * other issuers, so the ticker is not promoted.
 */
function isPlausibleRevenue(facts) {
  const revenue = facts.revenue?.value;
  if (!Number.isSafeInteger(revenue)) return true;
  for (const name of ["operating_cf", "net_income_parent"]) {
    const value = facts[name]?.value;
    if (Number.isSafeInteger(value) && value > revenue) return false;
  }
  return true;
}

/**
 * Extract one fiscal period of directly reported facts from one accession.
 * Returns `{ error }` when the ticker cannot be promoted at all.
 */
function extractFacts(companyfacts) {
  const usGaap = companyfacts?.facts?.["us-gaap"];
  if (!usGaap) {
    return { error: companyfacts?.facts?.["ifrs-full"] ? "reports_under_ifrs" : "no_us_gaap_usd_facts" };
  }
  const { best: filing, forms } = selectAccession(usGaap);
  if (!filing) {
    return { error: forms.has("20-F") ? "files_form_20f_not_10k" : "no_annual_10k_in_companyfacts" };
  }
  const periodEnd = selectPeriodEnd(usGaap, filing.accn);
  if (!periodEnd) return { error: "no_balance_sheet_date_in_filing" };

  const durations = {};
  const omitted = {};
  for (const name of DURATION_FACTS) durations[name] = durationCandidates(usGaap, name, filing.accn, periodEnd);

  const requiredDurations = REQUIRED_FACTS.filter((name) => DURATION_FACTS.includes(name));
  const absentDurations = requiredDurations.filter((name) => !durations[name] || durations[name].byStart.size === 0);
  if (absentDurations.length > 0) {
    return {
      error: `required_fact_not_in_selected_accession:${absentDurations.join("+")}`,
      accn: filing.accn,
      filed: filing.filed,
      periodEnd,
    };
  }
  const startSets = requiredDurations.map((name) => durations[name].byStart);
  const shared = [...startSets[0].keys()].filter((start) => startSets.every((set) => set.has(start)));
  if (shared.length !== 1) {
    return { error: "annual_duration_not_unique", accn: filing.accn, filed: filing.filed, periodEnd };
  }
  const periodStart = shared[0];

  const facts = {};
  const concepts = {};
  for (const name of DURATION_FACTS) {
    const candidate = durations[name];
    if (!candidate) {
      omitted[name] = "concept_absent";
      continue;
    }
    concepts[name] = candidate.concept;
    const values = candidate.byStart.get(periodStart);
    if (!values) {
      omitted[name] = "period_mismatch";
      continue;
    }
    if (values.size > 1) {
      omitted[name] = "ambiguous_value";
      continue;
    }
    const value = [...values][0];
    if (!Number.isSafeInteger(value)) {
      omitted[name] = "unsafe_value";
      continue;
    }
    facts[name] = { value, concept: `us-gaap:${candidate.concept}` };
  }
  for (const name of INSTANT_FACTS) {
    const result = instantValue(usGaap, name, filing.accn, periodEnd);
    if (result.concept) concepts[name] = result.concept;
    if (result.reason) {
      omitted[name] = result.reason;
      continue;
    }
    facts[name] = { value: result.value, concept: `us-gaap:${result.concept}` };
  }
  const missing = REQUIRED_FACTS.filter((name) => !facts[name]);
  if (missing.length > 0) {
    return { error: `required_fact_unavailable:${missing.join("+")}`, accn: filing.accn, filed: filing.filed, periodEnd, omitted };
  }
  if (!isPlausibleRevenue(facts)) {
    return { error: "implausible_revenue_concept", accn: filing.accn, filed: filing.filed, periodEnd };
  }
  const fiscalYear = selectFiscalYear(usGaap, filing.accn);
  if (fiscalYear === null) {
    return { error: "fiscal_year_not_unique", accn: filing.accn, filed: filing.filed, periodEnd };
  }
  return { accn: filing.accn, filed: filing.filed, periodStart, periodEnd, fiscalYear, facts, omitted, concepts };
}

/** Primary 10-K document for one accession, from the submissions index. */
function primaryDocument(submissions, accn) {
  const recent = submissions?.filings?.recent;
  if (!recent || !Array.isArray(recent.accessionNumber)) return null;
  for (let index = 0; index < recent.accessionNumber.length; index += 1) {
    if (recent.accessionNumber[index] !== accn) continue;
    return {
      form: recent.form?.[index] ?? null,
      filingDate: recent.filingDate?.[index] ?? null,
      primaryDocument: recent.primaryDocument?.[index] ?? null,
      reportDate: recent.reportDate?.[index] ?? null,
    };
  }
  return null;
}

function buildFactSet(names, extraction, periodRefs, source) {
  const facts = {};
  const usedPeriods = new Set();
  for (const name of FACT_ORDER) {
    if (!names.includes(name) || !extraction.facts[name]) continue;
    const periodRef = DURATION_FACTS.includes(name) ? periodRefs.duration : periodRefs.instant;
    usedPeriods.add(periodRef);
    facts[name] = {
      kind: "verified_reported",
      value: extraction.facts[name].value,
      currency: "USD",
      unit: "currency",
      scale: 1,
      period_ref: periodRef,
      source_ref: source.source_ref,
      source_concept: extraction.facts[name].concept,
    };
  }
  if (Object.keys(facts).length === 0) return null;
  const periods = {};
  for (const ref of [periodRefs.duration, periodRefs.instant]) {
    if (usedPeriods.has(ref)) periods[ref] = periodRefs.definitions[ref];
  }
  return { kind: "source_verified", periods, source_refs: { [source.source_ref]: source }, facts };
}

function buildRecord(ticker, entityName, extraction, cik, document) {
  const fiscalYear = extraction.fiscalYear;
  const fiscalMonth = Number(extraction.periodEnd.slice(5, 7));
  const slug = ticker.toLowerCase();
  /** Refs are keyed by period end so a fiscal-year label can never collide or mislead. */
  const periodStamp = extraction.periodEnd.replaceAll("-", "");
  const durationRef = `${slug}-${periodStamp}-duration`;
  const instantRef = `${slug}-${periodStamp}-instant`;
  const periodRefs = {
    duration: durationRef,
    instant: instantRef,
    definitions: {
      [durationRef]: {
        period_ref: durationRef,
        fiscal_year: fiscalYear,
        fiscal_month: fiscalMonth,
        period_kind: "FY",
        fact_period_type: "duration",
        period_start: extraction.periodStart,
        period_end: extraction.periodEnd,
      },
      [instantRef]: {
        period_ref: instantRef,
        fiscal_year: fiscalYear,
        fiscal_month: fiscalMonth,
        period_kind: "FY",
        fact_period_type: "instant",
        period_start: null,
        period_end: extraction.periodEnd,
      },
    },
  };
  const source = {
    source_ref: `${slug}-${periodStamp}-10k`,
    form: "10-K",
    accession_number: extraction.accn,
    filed_at: extraction.filed,
    filing_url: `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${extraction.accn.replaceAll("-", "")}/${document}`,
    source_authority: "SEC EDGAR",
  };
  const record = {
    identity: { underlying_company: entityName, source },
    fundamentals: buildFactSet(FACT_ORDER, extraction, periodRefs, source),
    statements: {
      pl: buildFactSet(["revenue", "net_income_parent"], extraction, periodRefs, source),
      bs: buildFactSet(["total_assets", "total_liabilities"], extraction, periodRefs, source),
      cf: buildFactSet(["operating_cf"], extraction, periodRefs, source),
    },
  };
  return { record, fiscalYear, source, periodRefs };
}

function legacyComparison(legacy, ticker, fiscalYear, facts) {
  const row = legacy.fundamentals?.[ticker]?.data;
  if (!row) return { status: "no_legacy_row" };
  if (row.metrics_fiscal_year !== fiscalYear) {
    return { status: "fiscal_year_differs", legacy_fiscal_year: row.metrics_fiscal_year ?? null };
  }
  const differences = {};
  for (const name of FACT_ORDER) {
    const verified = facts[name]?.value;
    const legacyValue = row[name];
    if (verified === undefined || typeof legacyValue !== "number") continue;
    const absolute = verified - legacyValue;
    if (absolute === 0) continue;
    const relative = legacyValue === 0 ? null : absolute / Math.abs(legacyValue);
    differences[name] = {
      verified,
      legacy: legacyValue,
      absolute,
      relative: relative === null ? null : Number(relative.toFixed(6)),
      over_one_percent: relative !== null && Math.abs(relative) > 0.01,
    };
  }
  return Object.keys(differences).length === 0
    ? { status: "matches", legacy_fiscal_year: fiscalYear }
    : { status: "differs", legacy_fiscal_year: fiscalYear, differences };
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Differing leaf paths between two records, for the reproduction oracle. */
function diffPaths(before, after, path = "", found = []) {
  if (canonicalJson(before) === canonicalJson(after)) return found;
  const bothRecords = before && after && typeof before === "object" && typeof after === "object"
    && !Array.isArray(before) && !Array.isArray(after);
  if (!bothRecords) {
    found.push({ path: path || "/", before: before ?? null, after: after ?? null });
    return found;
  }
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    diffPaths(before[key], after[key], `${path}/${key}`, found);
  }
  return found;
}

/** Property-order independent comparison, matching the artifact validator. */
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(text) {
  return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  mkdirSync(options.cacheDir, { recursive: true });

  const registryBytes = readFileSync(join(REGISTRY_SRC, "xstocks.json"));
  const legacyBytes = readFileSync(join(REGISTRY_SRC, "financials-snapshot.json"));
  const registry = JSON.parse(registryBytes.toString("utf8"));
  const legacy = JSON.parse(legacyBytes.toString("utf8"));
  const previousOverlay = JSON.parse(readFileSync(join(REGISTRY_SRC, "verified-facts-v2.json"), "utf8"));
  const previousManifest = JSON.parse(readFileSync(join(REGISTRY_SRC, "snapshot-manifest.json"), "utf8"));

  const covered = registry
    .filter((entry) => entry.fundamentals_available)
    .map((entry) => entry.ticker)
    .filter((ticker) => !options.only || options.only.has(ticker))
    .sort();

  const ciks = await resolveCiks(covered, options);
  const records = {};
  const promoted = [];
  const stayedLegacy = [];
  const conceptChoices = {};
  const legacyMismatches = {};
  const unresolvedCiks = [];
  const issuers = [];

  for (const ticker of covered) {
    const resolution = ciks[ticker];
    if (!resolution) {
      unresolvedCiks.push(ticker);
      stayedLegacy.push({ ticker, reason: "cik_unresolved" });
      continue;
    }
    const cik = resolution.cik;
    const companyfacts = await cachedJson(
      `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`,
      join(options.cacheDir, `${cik}.json`),
      options,
    );
    if (!companyfacts) {
      stayedLegacy.push({ ticker, cik, reason: "companyfacts_unavailable" });
      continue;
    }
    const extraction = extractFacts(companyfacts);
    if (extraction.error) {
      stayedLegacy.push({ ticker, cik, reason: extraction.error });
      continue;
    }
    const submissions = await cachedJson(
      `https://data.sec.gov/submissions/CIK${cik}.json`,
      join(options.cacheDir, `submissions-${cik}.json`),
      options,
    );
    const filing = submissions ? primaryDocument(submissions, extraction.accn) : null;
    if (!filing) {
      stayedLegacy.push({ ticker, cik, reason: "filing_index_entry_missing" });
      continue;
    }
    if (filing.form !== "10-K" || filing.filingDate !== extraction.filed) {
      stayedLegacy.push({ ticker, cik, reason: "filing_index_disagrees_with_companyfacts" });
      continue;
    }
    if (typeof filing.primaryDocument !== "string" || !/^[A-Za-z0-9._-]+\.htm$/.test(filing.primaryDocument)) {
      stayedLegacy.push({ ticker, cik, reason: "no_canonical_primary_document" });
      continue;
    }
    // The CIK's own registrant (see `registrantName`): companyfacts.entityName can name a co-filer.
    const entityName = registrantName(companyfacts.entityName, submissions.name) ?? "";
    if (entityName.length < 1 || entityName.length > 512) {
      stayedLegacy.push({ ticker, cik, reason: "entity_name_unusable" });
      continue;
    }
    const built = buildRecord(ticker, entityName, extraction, cik, filing.primaryDocument);
    records[ticker] = built.record;
    promoted.push(ticker);
    conceptChoices[ticker] = Object.fromEntries(
      FACT_ORDER.filter((name) => extraction.facts[name]).map((name) => [name, extraction.facts[name].concept]),
    );
    const comparison = legacyComparison(legacy, ticker, built.fiscalYear, extraction.facts);
    if (comparison.status !== "matches") legacyMismatches[ticker] = comparison;

    const omitted = {};
    for (const [name, reason] of Object.entries(extraction.omitted)) {
      if (!extraction.facts[name]) omitted[name] = OMISSION_REASONS[reason] ?? reason;
    }
    issuers.push({
      ticker,
      company: entityName,
      source: {
        accession_number: built.source.accession_number,
        form: built.source.form,
        filed_at: built.source.filed_at,
        filing_url: built.source.filing_url,
      },
      period: {
        start: extraction.periodStart,
        end: extraction.periodEnd,
        fiscal_year: built.fiscalYear,
        currency: "USD",
      },
      facts: Object.fromEntries(
        FACT_ORDER.filter((name) => extraction.facts[name]).map((name) => [name, {
          value: extraction.facts[name].value,
          concept: extraction.facts[name].concept,
          period_type: DURATION_FACTS.includes(name) ? "duration" : "instant",
        }]),
      ),
      ...(Object.keys(omitted).length > 0 ? { omitted } : {}),
    });
  }

  const overlay = { schema_version: "2.0", records: Object.fromEntries([...promoted].sort().map((ticker) => [ticker, records[ticker]])) };
  const overlayText = stableJson(overlay);
  const overlayHash = sha256(overlayText);

  const reproduction = {};
  const reproductionDifferences = {};
  for (const ticker of Object.keys(previousOverlay.records)) {
    if (!records[ticker]) {
      reproduction[ticker] = "absent_from_new_overlay";
      continue;
    }
    const differences = diffPaths(previousOverlay.records[ticker], records[ticker]);
    reproduction[ticker] = differences.length === 0 ? "reproduced_exactly" : "differs";
    if (differences.length > 0) reproductionDifferences[ticker] = differences;
  }

  // The multi-year annual artifact has its own reviewed producer; this run carries its
  // bytes into the manifest unchanged so both artifacts stay hash-bound to one revision.
  const annualBytes = readFileSync(join(REGISTRY_SRC, "verified-facts-annual-v1.json"));
  const annualYears = Object.values(JSON.parse(annualBytes.toString("utf8")).records)
    .reduce((total, record) => total + record.years.length, 0);
  // The per-statement artifacts (revision 2.2) are carried the same way.
  const statementBytes = Object.fromEntries(["pl", "bs", "cf", "per_share"].map((statement) => [statement,
    readFileSync(join(REGISTRY_SRC, `verified-statements-annual-v1-${statement}.json`))]));
  const statementYears = Object.values(statementBytes).reduce((total, bytes) => total
    + Object.values(JSON.parse(bytes.toString("utf8")).records).reduce((sum, record) => sum + record.years.length, 0), 0);

  const legacyFundamentals = legacy.fundamentals ?? {};
  const snapshotAvailable = registry.filter((entry) => Boolean(legacyFundamentals[entry.ticker] || overlay.records[entry.ticker]?.fundamentals)).length;
  const manifest = {
    schema_version: "2.0",
    artifact_revision: `${options.ledgerDate}-edgar-annual-${overlayHash.slice(0, 8)}`,
    published_at: `${new Date().toISOString().slice(0, 19)}Z`,
    registry_as_of: previousManifest.registry_as_of,
    registry_source_url: previousManifest.registry_source_url,
    financial_source_authority: "SEC EDGAR",
    registry_snapshot_sha256: createHash("sha256").update(registryBytes).digest("hex"),
    legacy_financial_snapshot_sha256: createHash("sha256").update(legacyBytes).digest("hex"),
    verified_overlay_sha256: overlayHash,
    verified_annual_sha256: createHash("sha256").update(annualBytes).digest("hex"),
    verified_statements_sha256: Object.fromEntries(Object.entries(statementBytes)
      .map(([statement, bytes]) => [statement, createHash("sha256").update(bytes).digest("hex")])),
    record_counts: {
      registry: registry.length,
      eligible: registry.filter((entry) => entry.fundamentals_available).length,
      snapshot_available: snapshotAvailable,
      source_verified: Object.values(overlay.records).filter((record) => Boolean(record.fundamentals)).length,
      annual_years: annualYears,
      statement_years: statementYears,
    },
  };

  const publicLedger = {
    schema_version: "1.0",
    verified_on: options.ledgerDate,
    candidate_sha256: overlayHash,
    method: "Each fact was taken from one SEC submission accession and one companyfacts USD record: the latest annual 10-K, one fiscal period bounded by that filing's balance-sheet date, one directly reported concept, and no derived or mixed-accession value.",
    supported_fact_contract: { currency: "USD", unit: "currency", scale: 1, form: "10-K", surfaces: ["fundamentals", "statement"] },
    issuers,
    excluded_metrics: ["fcf", "calculated metrics", "inferred facts"],
  };

  const reasonCounts = {};
  for (const entry of stayedLegacy) reasonCounts[entry.reason] = (reasonCounts[entry.reason] ?? 0) + 1;
  const evidence = {
    schema_version: "1.0",
    generated_on: options.ledgerDate,
    producer: "scripts/edgar/build-verified-facts.mjs",
    source_api: ["https://data.sec.gov/api/xbrl/companyfacts/", "https://data.sec.gov/submissions/"],
    artifact_revision: manifest.artifact_revision,
    verified_overlay_sha256: overlayHash,
    counts: {
      covered_tickers: covered.length,
      promoted: promoted.length,
      stayed_legacy: stayedLegacy.length,
      unresolved_ciks: unresolvedCiks.length,
      legacy_comparisons_flagged: Object.keys(legacyMismatches).length,
    },
    known_limitations: {
      companyfacts_single_attribution: "companyfacts collapses a repeated concept/period/value to one record and attributes it to a single accession, which is not always the 10-K. A required fact attributed to another filing is reported as required_fact_not_in_selected_accession and the ticker stays legacy rather than being published under a 10-K source reference it cannot be proven to carry.",
      no_bank_revenue_proxy: "Interest-and-dividend revenue proxies for bank holding companies are not substituted for a reported revenue concept.",
      implausible_revenue_gate: "A ticker whose selected revenue concept is smaller than the same filing's operating cash flow or net income is not promoted and stays legacy with reason implausible_revenue_concept. The reported concept covers only a fragment of the issuer's top line (a REIT reporting lease income, or an asset manager whose consolidated Revenues are tagged separately), so it is not comparable to the other issuers. No additional revenue concept is substituted.",
      round_numbered_values_not_reconciled: "Published values are the literal companyfacts numbers and are not reconciled against the filing HTML. Visa (V) revenue 40000000000 for accession 0001403161-25-000089 is one such literal value; the filing document itself was not viewed while this artifact was produced.",
      fiscal_year_label: "fiscal_year is the SEC companyfacts `fy` value carried by the selected 10-K facts, not the calendar year of the period end, so a January or February year end keeps the issuer's own fiscal-year name. Period and source references are keyed by the period end date instead of a year.",
    },
    selection_rules: {
      filing: "Greatest `filed` among us-gaap USD facts with form 10-K and fp FY; facts from other accessions are never mixed in.",
      period: "Fiscal period end is the latest us-gaap:Assets instant date inside that accession; durations must span 350-380 days and end on it.",
      promotion: "A ticker is promoted only when revenue, net_income_parent and total_assets are all present under those rules and the reported revenue is at least as large as the same filing's operating cash flow and net income.",
      units: "USD only. ifrs-full filers and non-USD reporters stay legacy.",
    },
    promoted,
    stayed_legacy: stayedLegacy,
    stayed_legacy_reason_counts: reasonCounts,
    unresolved_ciks: unresolvedCiks,
    cik_resolution_sources: Object.fromEntries(Object.entries(ciks).map(([ticker, value]) => [ticker, value.via])),
    concept_choices: conceptChoices,
    legacy_comparisons: legacyMismatches,
    previous_overlay_reproduction: reproduction,
    previous_overlay_differences: reproductionDifferences,
  };

  process.stdout.write(`${JSON.stringify({
    promoted: promoted.length,
    stayed_legacy: stayedLegacy.length,
    reasons: reasonCounts,
    reproduction,
    reproduction_differences: reproductionDifferences,
    artifact_revision: manifest.artifact_revision,
  }, null, 2)}\n`);

  if (options.dryRun) return;
  writeFileSync(join(REGISTRY_SRC, "verified-facts-v2.json"), overlayText);
  writeFileSync(join(REGISTRY_SRC, "snapshot-manifest.json"), stableJson(manifest));
  writeFileSync(join(DOCS_ROOT, "source-verification-ledger.json"), stableJson(publicLedger));
  mkdirSync(join(DOCS_ROOT, "evidence"), { recursive: true });
  writeFileSync(join(DOCS_ROOT, "evidence", `edgar-verified-facts-${options.ledgerDate}.json`), stableJson(evidence));
}

await main();
