/**
 * Fail-closed validator for the generated `benten.listed-company-map.v1`
 * artifact (`scripts/companies/build-listed-company-map.mjs`).
 *
 * The artifact links each filing-eligible xStock to one US-listed company. It
 * is generated from the bundled registry and SEC EDGAR identity, then reviewed
 * by a person: `generation.human_review` records whether that review happened,
 * and `generation.verification` what an independent re-check against EDGAR
 * found. Nothing here matches names. The recorded evidence is checked only for
 * shape and for agreement with the registry row it cites, and the display
 * name for agreement with the basis it states: the registry token name
 * without " xStock", a reviewed override, or (fail closed) the SEC
 * registrant name itself.
 *
 * The validator rejects unknown fields, any row that is not a filing-eligible
 * registry row, duplicates within the artifact or with the reviewed company
 * map, a company that holds more than one token or shares its SEC registrant
 * with another company, an unsorted company list, and any filing-eligible
 * registry row that is neither a company nor a recorded exclusion.
 */

const SCHEMA_VERSION = "benten.listed-company-map.v1";
const METHODS = new Set(["registry_ticker_sec_cik_entity_name"]);
const GENERATOR = "scripts/companies/build-listed-company-map.mjs";
const REVIEW_STATUSES = new Set(["pending", "approved"]);
const EXCLUSION_REASONS = new Set([
  "cik_unresolved",
  "ticker_on_multiple_ciks",
  "cik_shared_by_registry_tokens",
  "companyfacts_unavailable",
  "sec_entity_name_unusable",
  "sec_name_sources_disagree",
  "slug_collision",
  "submissions_unavailable",
]);
const DISPLAY_NAME_BASES = new Set(["registry_token_name", "reviewed_override", "sec_registrant_fallback"]);
const TOKEN_SUFFIX = /\s+xStock$/;
const MAX_VERIFICATION_TEXT = 400;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const GENERATED_BY = /^[a-z0-9][a-z0-9.-]{0,63}$/;
/** A public handle, never an email address. */
const HANDLE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const SHA256 = /^[a-f0-9]{64}$/;
const CIK = /^[0-9]{10}$/;
const RFC3339 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(Z|[+-]\d{2}:\d{2})$/;
const PRINTABLE_ASCII = /^[ -~]+$/;
const MAX_SLUG = 64;
const MAX_DISPLAY_NAME = 80;
const MAX_EVIDENCE_TEXT = 160;

const MAP_KEYS = ["schema_version", "revision", "generated_at", "generation", "bound_sources", "companies", "excluded"];
const GENERATION_KEYS = ["method", "generator", "generated_by", "human_review", "verification"];
const REVIEW_KEYS = ["status", "reviewer", "reviewed_at"];
const VERIFICATION_KEYS = ["method", "checked_on", "checked_by", "counts"];
const VERIFICATION_COUNT_KEYS = ["map_companies", "map_cik_matches_sec", "verified_facts_records", "verified_facts_cik_and_accession_match"];
const BOUND_KEYS = [
  "xstocks_registry_sha256", "sec_company_tickers_cache_sha256", "sec_companyfacts_cache_sha256",
  "sec_submissions_cache_sha256", "display_names_sha256",
];
const COMPANY_KEYS = ["slug", "display_name", "display_name_basis", "listing_status", "instruments", "evidence"];
const INSTRUMENT_KEYS = ["source", "ticker", "mint", "binding_basis"];
const COMPANY_EVIDENCE_KEYS = ["sec_cik", "sec_registrant_name", "sec_entity_name", "sec_ticker_title", "registry_token_name"];
const EXCLUSION_KEYS = ["source", "ticker", "reason", "evidence"];
const EXCLUSION_EVIDENCE_KEYS = ["sec_ciks", "sec_entity_name", "sec_ticker_title", "registry_token_name", "shared_with_tickers"];

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(record, keys, message) {
  if (!isRecord(record)) throw new TypeError(message);
  const actual = Object.keys(record);
  if (actual.length !== keys.length || keys.some((key) => !Object.hasOwn(record, key))) throw new TypeError(message);
}

function text(value, maximum) {
  return typeof value === "string" && value.length >= 1 && value.length <= maximum
    && PRINTABLE_ASCII.test(value) && value === value.trim();
}

function nullableText(value, maximum) {
  return value === null || text(value, maximum);
}

function isTimestamp(value) {
  if (typeof value !== "string") return false;
  const match = RFC3339.exec(value);
  if (!match) return false;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    && hour < 24 && minute < 60 && second < 60 && !Number.isNaN(new Date(value).valueOf());
}

function findXStock(xstocks, ticker) {
  return typeof ticker === "string" ? xstocks.find((entry) => entry.ticker === ticker) : undefined;
}

function validateGeneration(record, generatedAt) {
  exactKeys(record, GENERATION_KEYS, "invalid listed company map generation");
  if (!METHODS.has(record.method) || record.generator !== GENERATOR
    || typeof record.generated_by !== "string" || !GENERATED_BY.test(record.generated_by)) {
    throw new TypeError("invalid listed company map generation");
  }
  const review = record.human_review;
  exactKeys(review, REVIEW_KEYS, "invalid listed company map human review");
  if (!REVIEW_STATUSES.has(review.status)) throw new TypeError("invalid listed company map human review");
  if (review.status === "pending" && (review.reviewer !== null || review.reviewed_at !== null)) {
    throw new TypeError("a pending listed company map review names no reviewer");
  }
  if (review.status === "approved" && (typeof review.reviewer !== "string" || !HANDLE.test(review.reviewer)
    || !isTimestamp(review.reviewed_at) || new Date(review.reviewed_at) < new Date(generatedAt))) {
    throw new TypeError("an approved listed company map review needs a reviewer handle and a later review time");
  }
  const verification = record.verification;
  exactKeys(verification, VERIFICATION_KEYS, "invalid listed company map verification");
  exactKeys(verification.counts, VERIFICATION_COUNT_KEYS, "invalid listed company map verification counts");
  if (!text(verification.method, MAX_VERIFICATION_TEXT) || typeof verification.checked_on !== "string" || !DATE.test(verification.checked_on)
    || !text(verification.checked_by, MAX_EVIDENCE_TEXT)
    || VERIFICATION_COUNT_KEYS.some((key) => !Number.isSafeInteger(verification.counts[key]) || verification.counts[key] < 0)
    || verification.counts.map_cik_matches_sec > verification.counts.map_companies
    || verification.counts.verified_facts_cik_and_accession_match > verification.counts.verified_facts_records) {
    throw new TypeError("invalid listed company map verification");
  }
  return {
    method: record.method,
    generator: record.generator,
    generated_by: record.generated_by,
    human_review: { status: review.status, reviewer: review.reviewer, reviewed_at: review.reviewed_at },
    verification: {
      method: verification.method,
      checked_on: verification.checked_on,
      checked_by: verification.checked_by,
      counts: Object.fromEntries(VERIFICATION_COUNT_KEYS.map((key) => [key, verification.counts[key]])),
    },
  };
}

/** One filing-eligible registry row, cited exactly. */
function eligibleEntry(xstocks, ticker, message) {
  const entry = findXStock(xstocks, ticker);
  if (!entry) throw new TypeError(`${message} does not resolve`);
  if (entry.exclusion_reason !== null) throw new TypeError(`${message} is not a filing-eligible xStock`);
  return entry;
}

function validateCompany(company, xstocks) {
  exactKeys(company, COMPANY_KEYS, "invalid listed company");
  if (typeof company.slug !== "string" || company.slug.length > MAX_SLUG || !SLUG.test(company.slug)) {
    throw new TypeError("invalid listed company slug");
  }
  if (!text(company.display_name, MAX_DISPLAY_NAME) || !DISPLAY_NAME_BASES.has(company.display_name_basis)) {
    throw new TypeError("invalid listed company display name");
  }
  if (company.listing_status !== "us_listed") throw new TypeError("invalid listed company listing status");
  if (!Array.isArray(company.instruments) || company.instruments.length !== 1) {
    throw new TypeError("a listed company holds exactly one xStock");
  }
  const [instrument] = company.instruments;
  exactKeys(instrument, INSTRUMENT_KEYS, "invalid listed company instrument");
  if (instrument.source !== "xstocks_registry" || instrument.binding_basis !== "issuer_product_name") {
    throw new TypeError("invalid listed company binding basis");
  }
  const entry = eligibleEntry(xstocks, instrument.ticker, "listed company instrument");
  if (instrument.mint !== entry.mint) throw new TypeError("listed company mint mismatch");
  exactKeys(company.evidence, COMPANY_EVIDENCE_KEYS, "invalid listed company evidence");
  const evidence = company.evidence;
  if (typeof evidence.sec_cik !== "string" || !CIK.test(evidence.sec_cik)
    || !text(evidence.sec_registrant_name, MAX_EVIDENCE_TEXT)
    || !nullableText(evidence.sec_entity_name, MAX_EVIDENCE_TEXT)
    || !nullableText(evidence.sec_ticker_title, MAX_EVIDENCE_TEXT)
    || evidence.registry_token_name !== entry.name) {
    throw new TypeError("invalid listed company evidence");
  }
  // The display name must be what its basis says it is.
  if (company.display_name_basis === "sec_registrant_fallback" && company.display_name !== evidence.sec_registrant_name) {
    throw new TypeError("a fallback display name is the recorded SEC registrant name");
  }
  if (company.display_name_basis === "registry_token_name"
    && (!TOKEN_SUFFIX.test(entry.name) || company.display_name !== entry.name.replace(TOKEN_SUFFIX, ""))) {
    throw new TypeError("a token display name is the registry token name without its xStock suffix");
  }
  return {
    slug: company.slug,
    display_name: company.display_name,
    display_name_basis: company.display_name_basis,
    listing_status: "us_listed",
    instruments: [{ source: "xstocks_registry", ticker: instrument.ticker, mint: instrument.mint, binding_basis: "issuer_product_name" }],
    evidence: {
      sec_cik: evidence.sec_cik,
      sec_registrant_name: evidence.sec_registrant_name,
      sec_entity_name: evidence.sec_entity_name,
      sec_ticker_title: evidence.sec_ticker_title,
      registry_token_name: evidence.registry_token_name,
    },
  };
}

function validateExclusion(record, xstocks) {
  exactKeys(record, EXCLUSION_KEYS, "invalid listed company exclusion");
  if (record.source !== "xstocks_registry" || !EXCLUSION_REASONS.has(record.reason)) {
    throw new TypeError("invalid listed company exclusion reason");
  }
  const entry = eligibleEntry(xstocks, record.ticker, "listed company exclusion");
  exactKeys(record.evidence, EXCLUSION_EVIDENCE_KEYS, "invalid listed company exclusion evidence");
  const evidence = record.evidence;
  const ciks = evidence.sec_ciks;
  const shared = evidence.shared_with_tickers;
  if (!Array.isArray(ciks) || ciks.length > 8 || ciks.some((cik) => typeof cik !== "string" || !CIK.test(cik))
    || !nullableText(evidence.sec_entity_name, MAX_EVIDENCE_TEXT)
    || !nullableText(evidence.sec_ticker_title, MAX_EVIDENCE_TEXT)
    || evidence.registry_token_name !== entry.name
    || !Array.isArray(shared) || shared.length > 8
    || shared.some((ticker) => !findXStock(xstocks, ticker) || ticker === record.ticker)) {
    throw new TypeError("invalid listed company exclusion evidence");
  }
  // The recorded evidence must be the kind the reason describes.
  if ((record.reason === "cik_unresolved") !== (ciks.length === 0)
    || (record.reason === "ticker_on_multiple_ciks") !== (ciks.length > 1)
    || (record.reason === "cik_shared_by_registry_tokens") !== (shared.length > 0)) {
    throw new TypeError("listed company exclusion evidence does not support its reason");
  }
  return {
    source: "xstocks_registry",
    ticker: record.ticker,
    reason: record.reason,
    evidence: {
      sec_ciks: [...ciks],
      sec_entity_name: evidence.sec_entity_name,
      sec_ticker_title: evidence.sec_ticker_title,
      registry_token_name: evidence.registry_token_name,
      shared_with_tickers: [...shared],
    },
  };
}

/**
 * Validate the generated map against the bundled registry and the already
 * validated reviewed company map. The registry digest is checked against file
 * bytes by the package tests, because JSON imports expose no bytes.
 */
export function validateListedCompanyMap(input, sources) {
  if (!isRecord(sources) || !Array.isArray(sources.xstocks) || !isRecord(sources.reviewedMap)
    || !Array.isArray(sources.reviewedMap.companies) || !Array.isArray(sources.reviewedMap.excluded)) {
    throw new TypeError("invalid listed company map sources");
  }
  exactKeys(input, MAP_KEYS, "invalid listed company map keys");
  if (input.schema_version !== SCHEMA_VERSION) throw new TypeError("unsupported listed company map schema");
  if (!Number.isSafeInteger(input.revision) || input.revision < 1) throw new TypeError("invalid listed company map revision");
  if (!isTimestamp(input.generated_at)) throw new TypeError("invalid listed company map generation time");
  const generation = validateGeneration(input.generation, input.generated_at);

  exactKeys(input.bound_sources, BOUND_KEYS, "invalid listed company map bound sources");
  for (const key of BOUND_KEYS) {
    if (typeof input.bound_sources[key] !== "string" || !SHA256.test(input.bound_sources[key])) {
      throw new TypeError("invalid listed company map source digest");
    }
  }
  if (input.bound_sources.xstocks_registry_sha256 !== sources.reviewedMap.bound_sources?.xstocks_registry_sha256) {
    throw new TypeError("listed company map is bound to a different xStocks registry than the reviewed map");
  }
  if (!Array.isArray(input.companies) || !Array.isArray(input.excluded)) {
    throw new TypeError("invalid listed company map rows");
  }

  const reviewedSlugs = new Set(sources.reviewedMap.companies.map((company) => company.slug));
  const reviewedNames = new Set(sources.reviewedMap.companies.map((company) => company.display_name));
  const reviewedTickers = new Set([
    ...sources.reviewedMap.companies.flatMap((company) => company.instruments)
      .filter((instrument) => instrument.source === "xstocks_registry").map((instrument) => instrument.ticker),
    ...sources.reviewedMap.excluded.filter((row) => row.source === "xstocks_registry").map((row) => row.ticker),
  ]);

  const tickers = new Set();
  const claim = (ticker) => {
    if (tickers.has(ticker) || reviewedTickers.has(ticker)) throw new TypeError("duplicate listed company map xStock");
    tickers.add(ticker);
  };
  const slugs = new Set();
  const names = new Set();
  const ciks = new Set();
  let previousSlug = null;
  const companies = input.companies.map((raw) => {
    const company = validateCompany(raw, sources.xstocks);
    if (slugs.has(company.slug) || reviewedSlugs.has(company.slug)
      || names.has(company.display_name) || reviewedNames.has(company.display_name)) {
      throw new TypeError("duplicate listed company");
    }
    if (ciks.has(company.evidence.sec_cik)) throw new TypeError("two listed companies share one SEC registrant");
    if (previousSlug !== null && !(previousSlug < company.slug)) throw new TypeError("listed companies are not sorted by slug");
    previousSlug = company.slug;
    slugs.add(company.slug);
    names.add(company.display_name);
    ciks.add(company.evidence.sec_cik);
    claim(company.instruments[0].ticker);
    return company;
  });
  const excluded = input.excluded.map((raw) => {
    const exclusion = validateExclusion(raw, sources.xstocks);
    claim(exclusion.ticker);
    return exclusion;
  });

  for (const entry of sources.xstocks) {
    if (entry.exclusion_reason === null && !tickers.has(entry.ticker)) {
      throw new TypeError("listed company map does not cover every filing-eligible xStock");
    }
  }
  if (generation.verification.counts.map_companies !== companies.length) {
    throw new TypeError("the recorded verification does not cover the listed companies");
  }

  return {
    schema_version: SCHEMA_VERSION,
    revision: input.revision,
    generated_at: input.generated_at,
    generation,
    bound_sources: { ...input.bound_sources },
    companies,
    excluded,
  };
}
