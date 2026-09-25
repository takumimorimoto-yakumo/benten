/**
 * Fail-closed validator for the static `provider-assets.v1` identity artifact.
 *
 * The artifact carries provider-reported identity, rights claims and reference
 * values for PreStocks instruments. It is never a quote, a valuation, an audited
 * NAV or an authorization. This validator rejects unknown fields, coercion,
 * duplicate identities, dangling evidence digests and any revision that does not
 * reproduce from the artifact bytes.
 */

const PROVIDERS = new Set(["prestocks"]);
const ASSET_KIND_FOR_PROVIDER = {
  prestocks: "prestock_provider_instrument",
};
const REFERENCE_KINDS_FOR_PROVIDER = {
  prestocks: new Set([
    "prestock_mark_reference",
    "prestock_token_reference",
    "prestock_implied_valuation_reference",
  ]),
};
const EVIDENCE_STATES = new Set(["candidate_unverified", "verified_reference"]);
const BINDING_STATUSES = new Set(["public_source_verified", "provider_claim_only", "unknown"]);
const RIGHTS_STATUSES = new Set([
  "public_source_verified", "provider_terms_observed", "provider_claim_only", "unknown",
]);
const INSTRUMENT_KINDS = new Set([
  "tracker_certificate", "economic_exposure_instrument", "unknown",
]);
const REDEMPTION_KINDS = new Set(["provider_terms", "conditional", "none", "unknown"]);
/**
 * `rights.restrictions` records only what Benten has not reviewed, never what
 * the instrument grants or withholds: Benten has not read the provider's
 * terms document. Must match `UNREVIEWED_RESTRICTIONS` in
 * `scripts/providers/build-provider-assets.mjs`.
 */
const UNREVIEWED_RESTRICTIONS = new Set(["provider_terms_not_reviewed", "no_public_source_verification"]);
const REDISTRIBUTION_STATUSES = new Set(["approved", "pending_terms_review"]);
const UNKNOWN_CODES = new Set([
  "source_as_of_unknown", "currency_unknown", "rights_unknown", "company_binding_unknown",
  "chain_identity_unknown", "provider_catalog_mismatch", "redistribution_pending",
  "execution_quote_unavailable", "asset_not_found",
]);
const BLOCKS = new Set(["display", "comparison", "release"]);
const SUPPLY_BASES = new Set(["provider_reported_supply"]);

/**
 * Hosts a published provider link may point at. The artifact is a catalog of one
 * named provider, so an off-allowlist host in `external_url` or `terms_url`
 * means the artifact no longer describes that provider.
 */
const LINK_HOSTS = new Set(["prestocks.com", "www.prestocks.com"]);
/** Provider-assigned identifier; never a path, a query or a display string. */
const PROVIDER_ASSET_ID = /^[A-Za-z0-9._-]{1,128}$/;

const SHA256 = /^[a-f0-9]{64}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
/** Contract DecimalString, restricted to its canonical trailing-zero-free form. */
const DECIMAL = /^(?:0|[1-9][0-9]*)(?:\.(?:[0-9]*[1-9]))?$/;
const PRINTABLE_ASCII = /^[ -~]+$/;
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const ARTIFACT_KEYS = ["schema_version", "revision", "fetched_at", "sources", "entries"];
const SOURCE_KEYS = [
  "provider", "source_url", "observed_at", "response_digest", "schema_revision",
  "redistribution_status",
];
const ENTRY_KEYS = [
  "provider", "provider_asset_id", "asset_kind", "symbol", "display_name", "mint_or_contract",
  "evidence_state", "company_binding", "rights", "references", "external_url", "source_digest",
  "unknowns", "not_quote", "not_authorization",
];
const COMPANY_BINDING_KEYS = ["company_id", "company_name", "binding_status", "evidence_refs"];
const RIGHTS_KEYS = [
  "status", "instrument_kind", "equity_ownership", "voting_rights", "redemption_kind",
  "restrictions", "evidence_refs", "provider_statement",
];
const REFERENCE_KEYS = ["kind", "value", "currency", "provider_reported_as_of"];
const SUPPLY_KEYS = ["value", "basis", "provider_reported_as_of"];
const UNKNOWN_KEYS = ["code", "blocks"];
const MANIFEST_KEYS = ["schema_version", "artifact", "sha256", "revision", "fetched_at", "counts"];

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(record, required, optional, message) {
  const actual = Object.keys(record);
  const allowed = new Set([...required, ...optional]);
  if (actual.some((key) => !allowed.has(key)) || required.some((key) => !Object.hasOwn(record, key))) {
    throw new TypeError(message);
  }
}

function text(value, minimum, maximum) {
  return typeof value === "string" && value.length >= minimum && value.length <= maximum
    && PRINTABLE_ASCII.test(value);
}

function isTimestamp(value) {
  if (typeof value !== "string" || !TIMESTAMP.test(value)) return false;
  const date = new Date(value);
  return !Number.isNaN(date.valueOf()) && `${date.toISOString().slice(0, 19)}Z` === value;
}

function isDecimalString(value) {
  if (typeof value !== "string" || !DECIMAL.test(value)) return false;
  const [integerPart, fractionPart = ""] = value.split(".");
  return integerPart.length <= 38 && fractionPart.length <= 18;
}

function isPublicHttpsUrl(value) {
  if (!text(value, 1, 512)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}

/** A public HTTPS URL whose host belongs to the catalogued provider. */
function isProviderLinkUrl(value) {
  if (!isPublicHttpsUrl(value)) return false;
  return LINK_HOSTS.has(new URL(value).hostname);
}

/** Decode base58 without a dependency so an address is proved to be 32 bytes. */
export function decodeBase58(input) {
  if (typeof input !== "string" || input.length === 0) return null;
  const bytes = [];
  for (const character of input) {
    const digit = BASE58_ALPHABET.indexOf(character);
    if (digit < 0) return null;
    let carry = digit;
    for (let position = 0; position < bytes.length; position += 1) {
      carry += bytes[position] * 58;
      bytes[position] = carry % 256;
      carry = Math.floor(carry / 256);
    }
    while (carry > 0) {
      bytes.push(carry % 256);
      carry = Math.floor(carry / 256);
    }
  }
  let leadingZeroes = 0;
  while (leadingZeroes < input.length && input[leadingZeroes] === "1") leadingZeroes += 1;
  return new Uint8Array([...new Array(leadingZeroes).fill(0), ...bytes.reverse()]);
}

function isSolanaAddress(value) {
  return text(value, 32, 44) && decodeBase58(value)?.length === 32;
}

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

/**
 * SHA-256 over a UTF-8 string. Implemented here so the registry keeps the same
 * dependency-free, environment-neutral posture as its other validators.
 */
export function sha256Hex(input) {
  const bytes = new TextEncoder().encode(input);
  const bitLength = bytes.length * 8;
  const blockCount = Math.ceil((bytes.length + 9) / 64);
  const padded = new Uint8Array(blockCount * 64);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(padded.length - 4, bitLength >>> 0, false);

  const state = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const schedule = new Uint32Array(64);
  const rotate = (value, amount) => (value >>> amount) | (value << (32 - amount));
  for (let block = 0; block < blockCount; block += 1) {
    for (let index = 0; index < 16; index += 1) schedule[index] = view.getUint32(block * 64 + index * 4, false);
    for (let index = 16; index < 64; index += 1) {
      const s0 = rotate(schedule[index - 15], 7) ^ rotate(schedule[index - 15], 18) ^ (schedule[index - 15] >>> 3);
      const s1 = rotate(schedule[index - 2], 17) ^ rotate(schedule[index - 2], 19) ^ (schedule[index - 2] >>> 10);
      schedule[index] = (schedule[index - 16] + s0 + schedule[index - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = state;
    for (let index = 0; index < 64; index += 1) {
      const S1 = rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + choose + SHA256_K[index] + schedule[index]) >>> 0;
      const S0 = rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    const round = [a, b, c, d, e, f, g, h];
    for (let index = 0; index < 8; index += 1) state[index] = (state[index] + round[index]) >>> 0;
  }
  return state.map((word) => word.toString(16).padStart(8, "0")).join("");
}

/**
 * RFC 8785 JCS. The artifact holds no JSON number and only printable-ASCII
 * strings, so sorted keys plus `JSON.stringify` on scalars is canonical.
 */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  if (typeof value === "number") throw new TypeError("Provider artifact must not contain a JSON number");
  return JSON.stringify(value);
}

function validateSource(value) {
  if (!isRecord(value)) throw new TypeError("Invalid provider source");
  exactKeys(value, SOURCE_KEYS, [], "Unknown provider source property");
  if (!PROVIDERS.has(value.provider)
    || !isPublicHttpsUrl(value.source_url)
    || !isTimestamp(value.observed_at)
    || typeof value.response_digest !== "string" || !SHA256.test(value.response_digest)
    || !text(value.schema_revision, 1, 128)
    || !REDISTRIBUTION_STATUSES.has(value.redistribution_status)) {
    throw new TypeError("Invalid provider source");
  }
  return value;
}

function validateEvidenceRefs(value, digests, message) {
  if (!Array.isArray(value) || value.length > 8) throw new TypeError(message);
  for (const digest of value) {
    if (typeof digest !== "string" || !SHA256.test(digest) || !digests.has(digest)) {
      throw new TypeError(message);
    }
  }
  return value;
}

function validateCompanyBinding(value, digests) {
  if (!isRecord(value)) throw new TypeError("Invalid provider company binding");
  exactKeys(value, COMPANY_BINDING_KEYS, [], "Unknown provider company binding property");
  if (!text(value.company_id, 1, 128)
    || !text(value.company_name, 1, 160)
    || !BINDING_STATUSES.has(value.binding_status)) {
    throw new TypeError("Invalid provider company binding");
  }
  validateEvidenceRefs(value.evidence_refs, digests, "Invalid provider company binding evidence");
  return value;
}

function validateRights(value, digests) {
  if (!isRecord(value)) throw new TypeError("Invalid provider rights evidence");
  exactKeys(value, RIGHTS_KEYS, ["terms_url"], "Unknown provider rights property");
  if (!RIGHTS_STATUSES.has(value.status)
    || !INSTRUMENT_KINDS.has(value.instrument_kind)
    || (value.equity_ownership !== false && value.equity_ownership !== "unknown")
    || (value.voting_rights !== false && value.voting_rights !== "unknown")
    || !REDEMPTION_KINDS.has(value.redemption_kind)
    || !Array.isArray(value.restrictions) || value.restrictions.length > 16
    || value.restrictions.some((restriction) => !UNREVIEWED_RESTRICTIONS.has(restriction))
    || !text(value.provider_statement, 1, 200)
    || (Object.hasOwn(value, "terms_url") && !isProviderLinkUrl(value.terms_url))) {
    throw new TypeError("Invalid provider rights evidence");
  }
  // Non-equity rights may be asserted only from reviewed public or terms evidence.
  if ((value.equity_ownership === false || value.voting_rights === false)
    && value.status !== "public_source_verified" && value.status !== "provider_terms_observed") {
    throw new TypeError("Provider rights assert non-equity class without reviewed evidence");
  }
  validateEvidenceRefs(value.evidence_refs, digests, "Invalid provider rights evidence");
  return value;
}

function validateReferences(value, provider) {
  if (!Array.isArray(value) || value.length > 8) throw new TypeError("Invalid provider references");
  const kinds = new Set();
  for (const reference of value) {
    if (!isRecord(reference)) throw new TypeError("Invalid provider reference");
    exactKeys(reference, REFERENCE_KEYS, [], "Unknown provider reference property");
    if (!REFERENCE_KINDS_FOR_PROVIDER[provider].has(reference.kind)
      || kinds.has(reference.kind)
      || !isDecimalString(reference.value)
      || (reference.currency !== null && !text(reference.currency, 1, 16))
      || (reference.provider_reported_as_of !== null && !isTimestamp(reference.provider_reported_as_of))) {
      throw new TypeError("Invalid provider reference");
    }
    kinds.add(reference.kind);
  }
  return value;
}

function validateSupplyReference(value) {
  if (!isRecord(value)) throw new TypeError("Invalid provider supply reference");
  exactKeys(value, SUPPLY_KEYS, [], "Unknown provider supply reference property");
  if (!isDecimalString(value.value)
    || !SUPPLY_BASES.has(value.basis)
    || (value.provider_reported_as_of !== null && !isTimestamp(value.provider_reported_as_of))) {
    throw new TypeError("Invalid provider supply reference");
  }
  return value;
}

function validateUnknowns(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32) {
    throw new TypeError("Invalid provider unknowns");
  }
  const codes = new Set();
  for (const item of value) {
    if (!isRecord(item)) throw new TypeError("Invalid provider unknown");
    exactKeys(item, UNKNOWN_KEYS, [], "Unknown provider unknown property");
    if (!UNKNOWN_CODES.has(item.code) || codes.has(item.code)
      || !Array.isArray(item.blocks) || item.blocks.length < 1 || item.blocks.length > 3
      || item.blocks.some((block, index) => !BLOCKS.has(block) || item.blocks.indexOf(block) !== index)) {
      throw new TypeError("Invalid provider unknown");
    }
    codes.add(item.code);
  }
  return value;
}

function validateEntry(value, digests) {
  if (!isRecord(value)) throw new TypeError("Invalid provider asset entry");
  exactKeys(value, ENTRY_KEYS, ["supply_reference"], "Unknown provider asset property");
  if (!PROVIDERS.has(value.provider)
    || value.asset_kind !== ASSET_KIND_FOR_PROVIDER[value.provider]
    || typeof value.provider_asset_id !== "string" || !PROVIDER_ASSET_ID.test(value.provider_asset_id)
    || !text(value.symbol, 1, 32)
    || !text(value.display_name, 1, 160)
    || !isSolanaAddress(value.mint_or_contract)
    || !EVIDENCE_STATES.has(value.evidence_state)
    || !isProviderLinkUrl(value.external_url)
    || typeof value.source_digest !== "string" || !digests.has(value.source_digest)
    || value.not_quote !== true
    || value.not_authorization !== true) {
    throw new TypeError("Invalid provider asset entry");
  }
  validateCompanyBinding(value.company_binding, digests);
  validateRights(value.rights, digests);
  validateReferences(value.references, value.provider);
  if (Object.hasOwn(value, "supply_reference")) validateSupplyReference(value.supply_reference);
  validateUnknowns(value.unknowns);
  const blocksRelease = value.unknowns.some((item) => item.blocks.includes("release"));
  if (value.evidence_state === "verified_reference" && blocksRelease) {
    throw new TypeError("Provider entry cannot be verified while an unknown blocks release");
  }
  return value;
}

/** Validate the whole artifact and recompute its revision from its own bytes. */
export function validateProviderAssets(input) {
  if (!isRecord(input)) throw new TypeError("Invalid provider assets artifact");
  exactKeys(input, ARTIFACT_KEYS, [], "Unknown provider assets property");
  if (input.schema_version !== "provider-assets.v1"
    || typeof input.revision !== "string" || !SHA256.test(input.revision)
    || !isTimestamp(input.fetched_at)
    || !Array.isArray(input.sources) || input.sources.length < 1 || input.sources.length > 32
    || !Array.isArray(input.entries) || input.entries.length < 1 || input.entries.length > 512) {
    throw new TypeError("Invalid provider assets artifact");
  }

  const digests = new Set();
  const urls = new Set();
  for (const source of input.sources) {
    validateSource(source);
    if (urls.has(source.source_url)) throw new TypeError("Duplicate provider source URL");
    if (source.observed_at > input.fetched_at) throw new TypeError("Provider source observed after the artifact fetch");
    urls.add(source.source_url);
    digests.add(source.response_digest);
  }

  const identities = new Set();
  const mints = new Set();
  let previous = "";
  for (const entry of input.entries) {
    validateEntry(entry, digests);
    const identity = `${entry.provider}\u0000${entry.provider_asset_id}`;
    if (identities.has(identity)) throw new TypeError("Duplicate provider asset identity");
    if (mints.has(entry.mint_or_contract)) throw new TypeError("Duplicate provider asset mint");
    if (identity <= previous) throw new TypeError("Provider asset entries are not sorted");
    identities.add(identity);
    mints.add(entry.mint_or_contract);
    previous = identity;
  }

  const { revision: _declared, ...withoutRevision } = input;
  if (sha256Hex(canonicalJson(withoutRevision)) !== input.revision) {
    throw new TypeError("Provider assets revision does not reproduce from the artifact");
  }
  return input;
}

/** Validate the sidecar manifest against the already-validated artifact. */
export function validateProviderAssetsManifest(input, artifact) {
  if (!isRecord(input)) throw new TypeError("Invalid provider assets manifest");
  exactKeys(input, MANIFEST_KEYS, [], "Unknown provider assets manifest property");
  if (input.schema_version !== "provider-assets.v1"
    || input.artifact !== "provider-assets-v1.json"
    // Shape only. The digest is checked against the artifact's actual bytes by
    // `provider-assets.test.ts`, because the registry stays browser-neutral and
    // this module therefore never reads a file.
    || typeof input.sha256 !== "string" || !SHA256.test(input.sha256)
    || input.revision !== artifact.revision
    || input.fetched_at !== artifact.fetched_at
    || !isRecord(input.counts)) {
    throw new TypeError("Invalid provider assets manifest");
  }
  exactKeys(input.counts, [...PROVIDERS], [], "Unknown provider assets manifest count");
  for (const provider of PROVIDERS) {
    const counted = artifact.entries.filter((entry) => entry.provider === provider).length;
    if (input.counts[provider] !== counted) {
      throw new TypeError("Provider assets manifest counts do not match the artifact");
    }
  }
  return input;
}
