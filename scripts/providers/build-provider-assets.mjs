#!/usr/bin/env node
/**
 * Fail-closed producer for the static `provider-assets.v1` identity artifact.
 *
 * Tooling only. No runtime package imports this file; the published runtimes stay
 * network-free and read the generated static artifact instead.
 *
 * It reads the credential-less public PreStocks asset catalog, records the exact
 * raw response bytes with a SHA-256 digest and a UTC observation time, and emits
 * only provider-reported identity, rights claims and reference values. It never
 * derives a quote, a currency, a timestamp, a valuation or a chain identity, and
 * it never writes the xStocks registry.
 *
 * Numbers never pass through a JavaScript `number`: the raw response text is read
 * by the lossless JSON reader below, which keeps every numeric lexeme as text.
 * Only a nonnegative, non-exponent lexeme in the contract `DecimalString` form is
 * published, with trailing fractional zeroes removed and no rounding. Anything
 * else omits the reference and records an unknown.
 *
 * Usage:
 *   node scripts/providers/build-provider-assets.mjs [options]
 *
 * Options:
 *   --cache-dir PATH   Raw provider response cache (default: $PROVIDER_CACHE_DIR,
 *                      else a `benten-providers` folder in the OS temp directory).
 *                      Raw responses are never written inside the repository.
 *   --seed-dir PATH    Directory holding the pre-captured list response used by
 *                      --offline when the cache has no copy (default:
 *                      $PROVIDER_SEED_DIR).
 *   --out-dir PATH     Artifact output directory (default: packages/registry/src).
 *   --offline          Use the cache and seed files only; never open a connection.
 *   --dry-run          Report only; do not write any artifact.
 *
 * Environment:
 *   PROVIDER_USER_AGENT  Overrides the descriptive provider User-Agent header.
 *   PROVIDER_CACHE_DIR   Default raw-response cache directory.
 *   PROVIDER_SEED_DIR    Default pre-captured list-response directory.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REGISTRY_SRC = join(REPO_ROOT, "packages/registry/src");

const DEFAULT_USER_AGENT = "Benten open-source tooling (contact via repository)";
const USER_AGENT = process.env.PROVIDER_USER_AGENT || DEFAULT_USER_AGENT;
const SCHEMA_VERSION = "provider-assets.v1";
const PRODUCER_SCHEMA_REVISION = "provider-assets-producer.v1";
const REDISTRIBUTION_STATUS = "pending_terms_review";

const PRESTOCKS_LIST_URL = "https://prestocks.com/api/prestocks";

/** Pre-captured list response used by --offline when the cache has no copy. */
const SEED_FILES = {
  prestocks: "prestocks-api-20260923.json",
};

const PRESTOCKS_REFERENCE_KINDS = [
  ["markPrice", "prestock_mark_reference"],
  ["tokenPrice", "prestock_token_reference"],
  ["impliedValuation", "prestock_implied_valuation_reference"],
];

/**
 * Restrictions record what Benten has not reviewed, never what the instrument
 * grants or withholds: the provider's terms document has not been read. The
 * provider's own wording about rights stays in `provider_statement`, quoted
 * with attribution.
 */
const UNREVIEWED_RESTRICTIONS = ["provider_terms_not_reviewed", "no_public_source_verification"];

const BLOCK_ORDER = ["display", "comparison", "release"];
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

// ---------------------------------------------------------------------------
// Lossless JSON reader. Numbers become { __number: "<exact lexeme>" }.
// ---------------------------------------------------------------------------

function parseLossless(text) {
  let index = 0;

  function fail(message) {
    throw new TypeError(`${message} at offset ${index}`);
  }

  function skipWhitespace() {
    while (index < text.length && (text[index] === " " || text[index] === "\t" || text[index] === "\n" || text[index] === "\r")) {
      index += 1;
    }
  }

  function literal(word, value) {
    if (text.slice(index, index + word.length) !== word) fail("invalid literal");
    index += word.length;
    return value;
  }

  function readString() {
    if (text[index] !== '"') fail("expected string");
    const start = index;
    index += 1;
    while (index < text.length) {
      const character = text[index];
      if (character === "\\") {
        index += 2;
        continue;
      }
      if (character === '"') {
        index += 1;
        return JSON.parse(text.slice(start, index));
      }
      index += 1;
    }
    return fail("unterminated string");
  }

  function readNumber() {
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(index));
    if (!match) fail("expected number");
    index += match[0].length;
    return { __number: match[0] };
  }

  function readArray() {
    index += 1;
    const items = [];
    skipWhitespace();
    if (text[index] === "]") {
      index += 1;
      return items;
    }
    for (;;) {
      items.push(readValue());
      skipWhitespace();
      if (text[index] === ",") {
        index += 1;
        continue;
      }
      if (text[index] === "]") {
        index += 1;
        return items;
      }
      fail("expected , or ]");
    }
  }

  function readObject() {
    index += 1;
    const record = Object.create(null);
    skipWhitespace();
    if (text[index] === "}") {
      index += 1;
      return record;
    }
    for (;;) {
      skipWhitespace();
      const key = readString();
      skipWhitespace();
      if (text[index] !== ":") fail("expected :");
      index += 1;
      record[key] = readValue();
      skipWhitespace();
      if (text[index] === ",") {
        index += 1;
        continue;
      }
      if (text[index] === "}") {
        index += 1;
        return record;
      }
      fail("expected , or }");
    }
  }

  function readValue() {
    skipWhitespace();
    const character = text[index];
    if (character === "{") return readObject();
    if (character === "[") return readArray();
    if (character === '"') return readString();
    if (character === "t") return literal("true", true);
    if (character === "f") return literal("false", false);
    if (character === "n") return literal("null", null);
    return readNumber();
  }

  const value = readValue();
  skipWhitespace();
  if (index !== text.length) fail("trailing content");
  return value;
}

/** Contract DecimalString, or null when the lexeme is not publishable. */
function toDecimalString(node) {
  const lexeme = node && typeof node === "object" && typeof node.__number === "string"
    ? node.__number
    : typeof node === "string" ? node : null;
  if (lexeme === null || !/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(lexeme)) return null;
  const [integerPart, fractionPart = ""] = lexeme.split(".");
  const fraction = fractionPart.replace(/0+$/, "");
  if (integerPart.length > 38 || fraction.length > 18) return null;
  return fraction.length > 0 ? `${integerPart}.${fraction}` : integerPart;
}

function plainString(node, minimum, maximum) {
  if (typeof node !== "string" || node.length < minimum || node.length > maximum) return null;
  return /^[\x20-\x7e]+$/.test(node) ? node : null;
}

// ---------------------------------------------------------------------------
// Identity and canonicalization helpers.
// ---------------------------------------------------------------------------

function base58Decode(input) {
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

function isSolanaAddress(input) {
  return base58Decode(input)?.length === 32;
}

/**
 * RFC 8785 JCS. Every published value is a string, boolean, null, array or
 * object with printable ASCII keys and values, and the artifact holds no JSON
 * number, so sorted keys plus `JSON.stringify` on scalars is canonical.
 */
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  if (typeof value === "number") throw new TypeError("Artifact must not contain a JSON number");
  return JSON.stringify(value);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function utcTimestamp(date) {
  return `${date.toISOString().slice(0, 19)}Z`;
}

function unknown(code, blocks) {
  return { code, blocks: BLOCK_ORDER.filter((block) => blocks.includes(block)) };
}

/** One short sentence, never a provider marketing paragraph. */
function firstSentence(text, maximum = 200) {
  const match = /^[^.]{1,400}\./.exec(String(text).trim());
  const sentence = match ? match[0].trim() : "";
  return sentence.length > 0 && sentence.length <= maximum ? sentence : null;
}

function lastSentence(text, maximum = 200) {
  const paragraphs = String(text).split("\n").map((line) => line.trim()).filter(Boolean);
  const candidate = paragraphs[paragraphs.length - 1] ?? "";
  return firstSentence(candidate, maximum);
}

// ---------------------------------------------------------------------------
// Raw response acquisition and cache.
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const options = {
    cacheDir: process.env.PROVIDER_CACHE_DIR || join(tmpdir(), "benten-providers"),
    seedDir: process.env.PROVIDER_SEED_DIR || "",
    outDir: REGISTRY_SRC,
    offline: false,
    dryRun: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--offline") options.offline = true;
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--cache-dir") options.cacheDir = resolve(argv[index += 1] ?? "");
    else if (argument === "--seed-dir") options.seedDir = resolve(argv[index += 1] ?? "");
    else if (argument === "--out-dir") options.outDir = resolve(argv[index += 1] ?? "");
    else throw new TypeError(`Unsupported argument: ${argument}`);
  }
  return options;
}

function cachePaths(options, provider, name) {
  if (!/^[a-z0-9-]+$/.test(name) || !/^[a-z]+$/.test(provider)) {
    throw new TypeError("Unsupported cache entry name");
  }
  const directory = join(options.cacheDir, provider);
  return {
    directory,
    body: join(directory, `${name}.json`),
    meta: join(directory, `${name}.meta.json`),
  };
}

/**
 * Return `{url, observed_at, response_digest, text}` for one provider response.
 * The cache stores the exact bytes plus the observation time that produced them.
 */
async function readResponse(options, provider, name, url, seedName) {
  const paths = cachePaths(options, provider, name);
  if (options.offline) {
    if (existsSync(paths.body) && existsSync(paths.meta)) {
      const bytes = readFileSync(paths.body);
      const meta = JSON.parse(readFileSync(paths.meta, "utf8"));
      if (meta.source_url !== url || meta.response_digest !== sha256(bytes)) {
        throw new TypeError(`Cached response for ${url} does not match its receipt`);
      }
      return { source_url: url, observed_at: meta.observed_at, response_digest: meta.response_digest, text: bytes.toString("utf8") };
    }
    if (!seedName || !options.seedDir) throw new TypeError(`No cached or seeded response for ${url}`);
    const seedPath = join(options.seedDir, seedName);
    if (!existsSync(seedPath)) throw new TypeError(`No cached or seeded response for ${url}`);
    const bytes = readFileSync(seedPath);
    return {
      source_url: url,
      observed_at: utcTimestamp(statSync(seedPath).mtime),
      response_digest: sha256(bytes),
      text: bytes.toString("utf8"),
    };
  }
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "application/json" } });
  if (!response.ok) throw new TypeError(`Provider read failed for ${url}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const observedAt = utcTimestamp(new Date());
  const digest = sha256(bytes);
  mkdirSync(paths.directory, { recursive: true });
  writeFileSync(paths.body, bytes);
  writeFileSync(paths.meta, `${JSON.stringify({ source_url: url, observed_at: observedAt, response_digest: digest }, null, 2)}\n`);
  return { source_url: url, observed_at: observedAt, response_digest: digest, text: bytes.toString("utf8") };
}

// ---------------------------------------------------------------------------
// Entry construction.
// ---------------------------------------------------------------------------

function prestocksEntry(item, digest) {
  const symbol = plainString(item.symbol, 1, 32);
  const displayName = plainString(item.name, 1, 160);
  const address = plainString(item.contract_address, 32, 44);
  const externalUrl = plainString(item.external_url, 1, 512);
  const statement = lastSentence(item.description);
  if (!symbol || !displayName || !externalUrl || !statement || !address || !isSolanaAddress(address)) {
    throw new TypeError(`PreStocks item is not publishable: ${String(item.symbol)}`);
  }
  if (!/^[A-Z0-9]{1,32}$/.test(symbol)) throw new TypeError(`Unsupported PreStocks symbol: ${symbol}`);
  const companyName = plainString(displayName.replace(/\s+PreStocks$/, ""), 1, 160);
  if (!companyName || companyName === displayName) {
    throw new TypeError(`PreStocks display name lost its company: ${displayName}`);
  }

  const references = [];
  const unknowns = [
    unknown("source_as_of_unknown", ["display", "comparison"]),
    unknown("chain_identity_unknown", ["release"]),
    unknown("redistribution_pending", ["release"]),
    unknown("currency_unknown", ["comparison"]),
    unknown("rights_unknown", ["comparison", "release"]),
  ];
  for (const [field, kind] of PRESTOCKS_REFERENCE_KINDS) {
    const value = toDecimalString(item[field]);
    if (value === null) continue;
    references.push({ kind, value, currency: null, provider_reported_as_of: null });
  }
  const supply = toDecimalString(item.supply);

  return {
    provider: "prestocks",
    provider_asset_id: symbol,
    asset_kind: "prestock_provider_instrument",
    symbol,
    display_name: displayName,
    mint_or_contract: address,
    evidence_state: "candidate_unverified",
    company_binding: {
      company_id: symbol.toLowerCase(),
      company_name: companyName,
      binding_status: "provider_claim_only",
      evidence_refs: [digest],
    },
    rights: {
      status: "provider_claim_only",
      instrument_kind: "economic_exposure_instrument",
      equity_ownership: "unknown",
      voting_rights: "unknown",
      redemption_kind: "unknown",
      restrictions: UNREVIEWED_RESTRICTIONS,
      evidence_refs: [digest],
      provider_statement: statement,
    },
    references,
    ...(supply === null ? {} : {
      supply_reference: { value: supply, basis: "provider_reported_supply", provider_reported_as_of: null },
    }),
    external_url: externalUrl,
    source_digest: digest,
    unknowns,
    not_quote: true,
    not_authorization: true,
  };
}

function source(provider, response) {
  return {
    provider,
    source_url: response.source_url,
    observed_at: response.observed_at,
    response_digest: response.response_digest,
    schema_revision: PRODUCER_SCHEMA_REVISION,
    redistribution_status: REDISTRIBUTION_STATUS,
  };
}

async function build(options) {
  const prestocksResponse = await readResponse(
    options, "prestocks", "assets", PRESTOCKS_LIST_URL, SEED_FILES.prestocks,
  );

  const prestocksItems = parseLossless(prestocksResponse.text);
  if (!Array.isArray(prestocksItems)) throw new TypeError("Provider catalog is not an array");

  const sources = [source("prestocks", prestocksResponse)];
  const entries = prestocksItems.map((item) => prestocksEntry(item, prestocksResponse.response_digest));

  entries.sort((left, right) => (
    left.provider.localeCompare(right.provider)
    || left.provider_asset_id.localeCompare(right.provider_asset_id)
  ));
  const identities = new Set();
  const mints = new Set();
  for (const entry of entries) {
    const identity = `${entry.provider}:${entry.provider_asset_id}`;
    if (identities.has(identity) || mints.has(entry.mint_or_contract)) {
      throw new TypeError(`Duplicate provider asset: ${identity}`);
    }
    identities.add(identity);
    mints.add(entry.mint_or_contract);
  }

  const fetchedAt = sources.map((item) => item.observed_at).sort().at(-1);
  const artifact = { schema_version: SCHEMA_VERSION, revision: "", fetched_at: fetchedAt, sources, entries };
  const { revision: _omitted, ...withoutRevision } = artifact;
  artifact.revision = sha256(Buffer.from(canonicalJson(withoutRevision), "utf8"));
  return artifact;
}

const options = parseArgs(process.argv.slice(2));
const artifact = await build(options);
const artifactBytes = Buffer.from(`${JSON.stringify(artifact, null, 2)}\n`, "utf8");
const counts = {
  prestocks: artifact.entries.filter((entry) => entry.provider === "prestocks").length,
};
const manifest = {
  schema_version: SCHEMA_VERSION,
  artifact: "provider-assets-v1.json",
  sha256: sha256(artifactBytes),
  revision: artifact.revision,
  fetched_at: artifact.fetched_at,
  counts,
};

if (!options.dryRun) {
  mkdirSync(options.outDir, { recursive: true });
  writeFileSync(join(options.outDir, "provider-assets-v1.json"), artifactBytes);
  writeFileSync(join(options.outDir, "provider-assets-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  dry_run: options.dryRun,
  offline: options.offline,
  revision: artifact.revision,
  fetched_at: artifact.fetched_at,
  counts,
  sources: artifact.sources.length,
  references: artifact.entries.reduce((total, entry) => total + entry.references.length, 0),
})}\n`);
