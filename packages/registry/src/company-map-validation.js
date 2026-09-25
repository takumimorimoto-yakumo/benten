/**
 * Fail-closed validator for the reviewed `benten.company-map.v1` artifact.
 *
 * The company map is the only source that links an instrument to a company.
 * Names are never compared: not a display name with a provider's company name,
 * not a token name with a company name. The provider's own `company_id` is
 * compared only to detect a provider-side change after review.
 *
 * The validator rejects unknown fields, unresolvable or mismatched
 * instruments, duplicates, unmapped provider entries, a provider artifact
 * revision other than the reviewed one, and any company or instrument order
 * other than the fixed rule, so that no instrument can be placed first by
 * preference.
 */

const SCHEMA_VERSION = "benten.company-map.v1";
const LISTING_STATUSES = new Set(["private", "us_listed"]);
const REVIEW_METHODS = new Set(["manual_source_review"]);
/**
 * `not_offered` records a registry row that no product surface may show (see
 * `isWithheldFromProduct` in `registry-lookup.ts`): the PreStocks track rule
 * makes a project ineligible when it integrates a non-PreStocks pre-IPO token.
 */
const EXCLUSION_REASONS = new Set(["fund_not_single_company", "not_reviewed", "not_offered"]);
/** Hosts of the xStocks issuer's own product pages. */
const ISSUER_PRODUCT_HOSTS = new Set(["assets.backed.fi", "xstocks.fi", "www.xstocks.fi"]);
/** Order rank of each instrument source; xStocks registry rows come first. */
const SOURCE_RANK = { xstocks_registry: 0, provider_assets: 1 };

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** A public handle, never an email address. */
const HANDLE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const SHA256 = /^[a-f0-9]{64}$/;
const RFC3339_WITH_OFFSET = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(Z|[+-]\d{2}:\d{2})$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const PRINTABLE_ASCII = /^[ -~]+$/;
const MAX_SLUG = 64;
const MAX_DISPLAY_NAME = 80;
const MAX_URL = 512;

const MAP_KEYS = ["schema_version", "revision", "reviewed_at", "review", "bound_sources", "companies", "excluded"];
const REVIEW_KEYS = ["reviewer", "method", "issuer_product_checks"];
const CHECK_KEYS = ["ticker", "url", "checked_on"];
const BOUND_KEYS = ["provider_assets_revision", "xstocks_registry_sha256"];
const COMPANY_KEYS = ["slug", "display_name", "listing_status", "instruments"];
const PROVIDER_INSTRUMENT_KEYS = ["source", "provider", "provider_asset_id", "mint", "binding_basis", "provider_company_id"];
const XSTOCK_INSTRUMENT_KEYS = ["source", "ticker", "mint", "binding_basis"];
const PROVIDER_EXCLUSION_KEYS = ["source", "provider", "provider_asset_id", "reason"];
const XSTOCK_EXCLUSION_KEYS = ["source", "ticker", "reason"];

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(record, keys, message) {
  if (!isRecord(record)) throw new TypeError(message);
  const actual = Object.keys(record);
  if (actual.length !== keys.length || keys.some((key) => !Object.hasOwn(record, key))) {
    throw new TypeError(message);
  }
}

function text(value, minimum, maximum) {
  return typeof value === "string" && value.length >= minimum && value.length <= maximum
    && PRINTABLE_ASCII.test(value) && value === value.trim();
}

function calendarDate(year, month, day) {
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return date.getUTCFullYear() === Number(year) && date.getUTCMonth() === Number(month) - 1
    && date.getUTCDate() === Number(day);
}

function isReviewTimestamp(value) {
  if (typeof value !== "string") return false;
  const match = RFC3339_WITH_OFFSET.exec(value);
  if (!match) return false;
  const [, year, month, day, hour, minute, second] = match;
  return calendarDate(year, month, day) && Number(hour) < 24 && Number(minute) < 60
    && Number(second) < 60 && !Number.isNaN(new Date(value).valueOf());
}

function isDate(value) {
  if (typeof value !== "string") return false;
  const match = DATE.exec(value);
  return Boolean(match) && calendarDate(match[1], match[2], match[3]);
}

function isIssuerProductUrl(value) {
  if (!text(value, 1, MAX_URL)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === ""
      && url.search === "" && url.hash === "" && ISSUER_PRODUCT_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

/** Identity used for uniqueness and ordering; never a display string. */
function instrumentIdentity(instrument) {
  return instrument.source === "xstocks_registry"
    ? `xstocks_registry:${instrument.ticker}`
    : `provider_assets:${instrument.provider}:${instrument.provider_asset_id}`;
}

function orderKey(instrument) {
  return instrument.source === "xstocks_registry"
    ? [SOURCE_RANK.xstocks_registry, "", instrument.ticker]
    : [SOURCE_RANK.provider_assets, instrument.provider, instrument.provider_asset_id];
}

function compareKeys(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] < right[index]) return -1;
    if (left[index] > right[index]) return 1;
  }
  return 0;
}

function findProviderEntry(providerAssets, provider, id) {
  return providerAssets.entries.find(
    (entry) => entry.provider === provider && entry.provider_asset_id === id,
  );
}

function findXStock(xstocks, ticker) {
  return xstocks.find((entry) => entry.ticker === ticker);
}

function validateProviderInstrument(record, sources) {
  exactKeys(record, PROVIDER_INSTRUMENT_KEYS, "invalid company map provider instrument");
  if (typeof record.provider !== "string" || typeof record.provider_asset_id !== "string") {
    throw new TypeError("invalid company map provider instrument");
  }
  if (record.binding_basis !== "provider_company_claim") {
    throw new TypeError("invalid company map binding basis");
  }
  const entry = findProviderEntry(sources.providerAssets, record.provider, record.provider_asset_id);
  if (!entry) throw new TypeError("company map provider instrument does not resolve");
  if (record.mint !== entry.mint_or_contract) throw new TypeError("company map provider mint mismatch");
  if (record.provider_company_id !== entry.company_binding.company_id) {
    throw new TypeError("company map provider company id mismatch");
  }
  return {
    source: "provider_assets",
    provider: record.provider,
    provider_asset_id: record.provider_asset_id,
    mint: record.mint,
    binding_basis: "provider_company_claim",
    provider_company_id: record.provider_company_id,
  };
}

function validateXStockInstrument(record, sources) {
  exactKeys(record, XSTOCK_INSTRUMENT_KEYS, "invalid company map xStock instrument");
  if (typeof record.ticker !== "string") throw new TypeError("invalid company map xStock instrument");
  if (record.binding_basis !== "issuer_product_name") {
    throw new TypeError("invalid company map binding basis");
  }
  const entry = findXStock(sources.xstocks, record.ticker);
  if (!entry) throw new TypeError("company map xStock instrument does not resolve");
  if (record.mint !== entry.mint) throw new TypeError("company map xStock mint mismatch");
  // A row the registry excludes (ETF, fund, non-SEC listing, private, preferred)
  // is never one company's instrument.
  if (entry.exclusion_reason !== null) throw new TypeError("company map binds an excluded xStock");
  return { source: "xstocks_registry", ticker: record.ticker, mint: record.mint, binding_basis: "issuer_product_name" };
}

function validateInstrument(record, sources) {
  if (!isRecord(record)) throw new TypeError("invalid company map instrument");
  if (record.source === "provider_assets") return validateProviderInstrument(record, sources);
  if (record.source === "xstocks_registry") return validateXStockInstrument(record, sources);
  throw new TypeError("invalid company map instrument source");
}

function validateExclusion(record, sources) {
  if (!isRecord(record)) throw new TypeError("invalid company map exclusion");
  if (!EXCLUSION_REASONS.has(record.reason)) throw new TypeError("invalid company map exclusion reason");
  if (record.source === "provider_assets") {
    exactKeys(record, PROVIDER_EXCLUSION_KEYS, "invalid company map exclusion");
    const entry = findProviderEntry(sources.providerAssets, record.provider, record.provider_asset_id);
    if (!entry) throw new TypeError("company map exclusion does not resolve");
    return {
      exclusion: { source: "provider_assets", provider: record.provider, provider_asset_id: record.provider_asset_id, reason: record.reason },
      mint: entry.mint_or_contract,
    };
  }
  if (record.source === "xstocks_registry") {
    exactKeys(record, XSTOCK_EXCLUSION_KEYS, "invalid company map exclusion");
    const entry = typeof record.ticker === "string" ? findXStock(sources.xstocks, record.ticker) : undefined;
    if (!entry) throw new TypeError("company map exclusion does not resolve");
    return { exclusion: { source: "xstocks_registry", ticker: record.ticker, reason: record.reason }, mint: entry.mint };
  }
  throw new TypeError("invalid company map exclusion source");
}

function validateReview(record, reviewedAt) {
  exactKeys(record, REVIEW_KEYS, "invalid company map review");
  if (typeof record.reviewer !== "string" || !HANDLE.test(record.reviewer)) {
    throw new TypeError("invalid company map reviewer");
  }
  if (!REVIEW_METHODS.has(record.method)) throw new TypeError("invalid company map review method");
  if (!Array.isArray(record.issuer_product_checks)) throw new TypeError("invalid company map issuer product checks");
  const reviewDate = reviewedAt.slice(0, 10);
  const checks = record.issuer_product_checks.map((check) => {
    exactKeys(check, CHECK_KEYS, "invalid company map issuer product check");
    if (typeof check.ticker !== "string" || !isIssuerProductUrl(check.url) || !isDate(check.checked_on)) {
      throw new TypeError("invalid company map issuer product check");
    }
    if (check.checked_on > reviewDate) throw new TypeError("company map issuer product check postdates review");
    return { ticker: check.ticker, url: check.url, checked_on: check.checked_on };
  });
  return { reviewer: record.reviewer, method: record.method, issuer_product_checks: checks };
}

/**
 * Validate the map against the bundled provider artifact and xStocks registry.
 *
 * `sources.providerAssets` must already be validated. The xStocks registry
 * digest is checked by the package tests, because JSON imports expose no bytes.
 */
export function validateCompanyMap(input, sources) {
  if (!isRecord(sources) || !isRecord(sources.providerAssets) || !Array.isArray(sources.xstocks)) {
    throw new TypeError("invalid company map sources");
  }
  exactKeys(input, MAP_KEYS, "invalid company map keys");
  if (input.schema_version !== SCHEMA_VERSION) throw new TypeError("unsupported company map schema");
  if (!Number.isSafeInteger(input.revision) || input.revision < 1) throw new TypeError("invalid company map revision");
  if (!isReviewTimestamp(input.reviewed_at)) throw new TypeError("invalid company map review time");
  const review = validateReview(input.review, input.reviewed_at);

  exactKeys(input.bound_sources, BOUND_KEYS, "invalid company map bound sources");
  if (input.bound_sources.provider_assets_revision !== sources.providerAssets.revision) {
    throw new TypeError("company map is bound to a different provider assets revision");
  }
  if (typeof input.bound_sources.xstocks_registry_sha256 !== "string"
    || !SHA256.test(input.bound_sources.xstocks_registry_sha256)) {
    throw new TypeError("invalid company map xStocks registry digest");
  }

  if (!Array.isArray(input.companies) || input.companies.length === 0) throw new TypeError("invalid company map companies");
  if (!Array.isArray(input.excluded)) throw new TypeError("invalid company map exclusions");

  const identities = new Set();
  const mints = new Set();
  const claim = (identity, mint) => {
    if (identities.has(identity) || mints.has(mint)) throw new TypeError("duplicate company map instrument");
    identities.add(identity);
    mints.add(mint);
  };

  const slugs = new Set();
  const names = new Set();
  let previousSlug = null;
  const mappedXStockTickers = [];
  const companies = input.companies.map((company) => {
    exactKeys(company, COMPANY_KEYS, "invalid company map company");
    if (typeof company.slug !== "string" || company.slug.length > MAX_SLUG || !SLUG.test(company.slug)) {
      throw new TypeError("invalid company map slug");
    }
    if (!text(company.display_name, 1, MAX_DISPLAY_NAME)) throw new TypeError("invalid company map display name");
    if (slugs.has(company.slug) || names.has(company.display_name)) throw new TypeError("duplicate company map company");
    if (previousSlug !== null && !(previousSlug < company.slug)) throw new TypeError("company map companies are not sorted by slug");
    previousSlug = company.slug;
    slugs.add(company.slug);
    names.add(company.display_name);
    if (!LISTING_STATUSES.has(company.listing_status)) throw new TypeError("invalid company map listing status");
    if (!Array.isArray(company.instruments) || company.instruments.length === 0) {
      throw new TypeError("invalid company map instruments");
    }
    let previousKey = null;
    const instruments = company.instruments.map((raw) => {
      const instrument = validateInstrument(raw, sources);
      const key = orderKey(instrument);
      if (previousKey !== null && compareKeys(previousKey, key) >= 0) {
        throw new TypeError("company map instruments are not in the fixed order");
      }
      previousKey = key;
      claim(instrumentIdentity(instrument), instrument.mint);
      if (instrument.source === "xstocks_registry") mappedXStockTickers.push(instrument.ticker);
      return instrument;
    });
    return { slug: company.slug, display_name: company.display_name, listing_status: company.listing_status, instruments };
  });

  const excluded = input.excluded.map((raw) => {
    const { exclusion, mint } = validateExclusion(raw, sources);
    claim(instrumentIdentity(exclusion), mint);
    return exclusion;
  });

  for (const entry of sources.providerAssets.entries) {
    if (!identities.has(`provider_assets:${entry.provider}:${entry.provider_asset_id}`)) {
      throw new TypeError("company map does not cover every provider assets entry");
    }
  }

  // Every mapped xStock needs exactly one recorded issuer product page check, and
  // no check may refer to an xStock the map does not bind.
  const checkedTickers = review.issuer_product_checks.map((check) => check.ticker);
  if (new Set(checkedTickers).size !== checkedTickers.length
    || checkedTickers.length !== mappedXStockTickers.length
    || mappedXStockTickers.some((ticker) => !checkedTickers.includes(ticker))) {
    throw new TypeError("company map issuer product checks do not match mapped xStocks");
  }

  return {
    schema_version: SCHEMA_VERSION,
    revision: input.revision,
    reviewed_at: input.reviewed_at,
    review,
    bound_sources: {
      provider_assets_revision: input.bound_sources.provider_assets_revision,
      xstocks_registry_sha256: input.bound_sources.xstocks_registry_sha256,
    },
    companies,
    excluded,
  };
}
