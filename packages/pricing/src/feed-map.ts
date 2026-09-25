/**
 * The reviewed Pyth feed map (`pyth-feeds-v1.json`): which Pyth price feed
 * belongs to which supported product, which Solana price accounts carry it,
 * and whether it may value a holding.
 *
 * The artifact is validated when this module loads and the process fails
 * closed on any violation: unknown keys, a malformed feed id or address, a
 * duplicate feed id, a binding to a mint that is not a supported product, a
 * binding whose kind or ticker disagrees with the registry, or an
 * underlying-share feed whose Pyth symbol is not exactly
 * `Equity.US.<ticker>/USD`. No binding is ever made by name.
 */

import feedMapJson from "./pyth-feeds-v1.json" with { type: "json" };
import { supportedProductForMint } from "@benten/solana/supported-products";

export type FeedRole = "xstock_underlying_share" | "xstock_token" | "private_company_index";
export type ConversionBasis = "xstock_scaled_ui_amount";
export type ValuationBlockReason = "unit_basis_unverified";

export type FeedBinding =
  | { kind: "xstock"; mint: string; ticker: string }
  | { kind: "prestocks"; mint: string; provider_asset_id: string };

export interface PriceAccountRef {
  shard: number;
  address: string;
}

export interface FeedMapEntry {
  feed_id: string;
  pyth_symbol: string;
  pyth_description: string;
  asset_type: "Equity" | "Crypto";
  quote_currency: "USD";
  role: FeedRole;
  binding: FeedBinding;
  price_accounts: PriceAccountRef[];
  valuation:
    | { use: true; unit_basis: "one_underlying_share"; conversion: ConversionBasis }
    | { use: false; reason: ValuationBlockReason };
  instrument_checks: Array<"pyth_redemption_rate_matches_mint_multiplier">;
}

export interface FeedMapV1 {
  schema_version: "benten.pyth-feed-map.v1";
  revision: string;
  checked_at: string;
  source: {
    feed_metadata_url: string;
    network: "solana-mainnet";
    receiver_program: string;
    push_oracle_program: string;
    price_account_derivation: string;
    binding_rule: string;
  };
  conversion_bases: Record<ConversionBasis, { statement: string; evidence: Array<{ kind: string; url?: string; checked_at: string; finding: string }> }>;
  entries: FeedMapEntry[];
}

const FEED_ID = /^[0-9a-f]{64}$/;
const ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ROLES: ReadonlySet<string> = new Set(["xstock_underlying_share", "xstock_token", "private_company_index"]);

function fail(message: string): never {
  throw new Error(`invalid Pyth feed map: ${message}`);
}

function keysExactly(value: unknown, keys: readonly string[], where: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${where} must be an object`);
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(`${where} has unexpected keys`);
  return record;
}

function text(value: unknown, where: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) fail(`${where} must be a short string`);
  return value;
}

function validateEntry(value: unknown, index: number): FeedMapEntry {
  const where = `entries[${index}]`;
  const entry = keysExactly(value, ["feed_id", "pyth_symbol", "pyth_description", "asset_type", "quote_currency", "role", "binding", "price_accounts", "valuation", "instrument_checks"], where);
  if (typeof entry.feed_id !== "string" || !FEED_ID.test(entry.feed_id)) fail(`${where}.feed_id`);
  text(entry.pyth_symbol, `${where}.pyth_symbol`);
  text(entry.pyth_description, `${where}.pyth_description`);
  if (entry.asset_type !== "Equity" && entry.asset_type !== "Crypto") fail(`${where}.asset_type`);
  if (entry.quote_currency !== "USD") fail(`${where}.quote_currency`);
  if (typeof entry.role !== "string" || !ROLES.has(entry.role)) fail(`${where}.role`);

  const bindingKind = (entry.binding as { kind?: unknown } | null)?.kind;
  const binding = bindingKind === "xstock"
    ? keysExactly(entry.binding, ["kind", "mint", "ticker"], `${where}.binding`)
    : keysExactly(entry.binding, ["kind", "mint", "provider_asset_id"], `${where}.binding`);
  const product = supportedProductForMint(binding.mint);
  if (!product) fail(`${where}.binding.mint is not a supported product`);
  if (product.kind === "xstock") {
    if (bindingKind !== "xstock" || binding.ticker !== product.ticker) fail(`${where}.binding disagrees with the registry`);
    if (entry.role === "private_company_index") fail(`${where}.role does not fit an xStock`);
    if (entry.role === "xstock_underlying_share" && entry.pyth_symbol !== `Equity.US.${product.ticker}/USD`) fail(`${where}.pyth_symbol is not the ticker's feed`);
  } else {
    if (bindingKind !== "prestocks" || binding.provider_asset_id !== product.providerAssetId) fail(`${where}.binding disagrees with the provider artifact`);
    if (entry.role !== "private_company_index") fail(`${where}.role does not fit a PreStocks instrument`);
  }

  if (!Array.isArray(entry.price_accounts) || entry.price_accounts.length === 0 || entry.price_accounts.length > 2) fail(`${where}.price_accounts`);
  const shards = new Set<number>();
  for (const [accountIndex, account] of entry.price_accounts.entries()) {
    const ref = keysExactly(account, ["shard", "address"], `${where}.price_accounts[${accountIndex}]`);
    if (!Number.isInteger(ref.shard) || (ref.shard as number) < 0 || (ref.shard as number) > 0xffff || shards.has(ref.shard as number)) fail(`${where}.price_accounts shard`);
    shards.add(ref.shard as number);
    if (typeof ref.address !== "string" || !ADDRESS.test(ref.address)) fail(`${where}.price_accounts address`);
  }

  const use = (entry.valuation as { use?: unknown } | null)?.use;
  if (use === true) {
    const valuation = keysExactly(entry.valuation, ["use", "unit_basis", "conversion"], `${where}.valuation`);
    if (valuation.unit_basis !== "one_underlying_share" || valuation.conversion !== "xstock_scaled_ui_amount") fail(`${where}.valuation basis`);
    if (entry.role !== "xstock_underlying_share") fail(`${where}.valuation may only use an underlying-share feed`);
  } else {
    const valuation = keysExactly(entry.valuation, ["use", "reason"], `${where}.valuation`);
    if (valuation.use !== false || valuation.reason !== "unit_basis_unverified") fail(`${where}.valuation reason`);
  }
  if (!Array.isArray(entry.instrument_checks) || entry.instrument_checks.some((check) => check !== "pyth_redemption_rate_matches_mint_multiplier")) {
    fail(`${where}.instrument_checks`);
  }
  return entry as unknown as FeedMapEntry;
}

/** Validate a feed map artifact. Throws on the first violation. */
export function validateFeedMap(value: unknown): FeedMapV1 {
  const map = keysExactly(value, ["schema_version", "revision", "checked_at", "source", "conversion_bases", "entries"], "feed map");
  if (map.schema_version !== "benten.pyth-feed-map.v1") fail("schema_version");
  text(map.revision, "revision");
  if (typeof map.checked_at !== "string" || !DATE.test(map.checked_at)) fail("checked_at");
  const source = keysExactly(map.source, ["feed_metadata_url", "network", "receiver_program", "push_oracle_program", "price_account_derivation", "binding_rule"], "source");
  if (source.network !== "solana-mainnet") fail("source.network");
  for (const key of ["receiver_program", "push_oracle_program"] as const) {
    if (typeof source[key] !== "string" || !ADDRESS.test(source[key] as string)) fail(`source.${key}`);
  }
  keysExactly(map.conversion_bases, ["xstock_scaled_ui_amount"], "conversion_bases");
  if (!Array.isArray(map.entries) || map.entries.length === 0) fail("entries");
  const entries = map.entries.map(validateEntry);
  const ids = new Set<string>();
  const addresses = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.feed_id)) fail(`duplicate feed_id ${entry.feed_id}`);
    ids.add(entry.feed_id);
    for (const account of entry.price_accounts) {
      if (addresses.has(account.address)) fail(`duplicate price account ${account.address}`);
      addresses.add(account.address);
    }
  }
  return map as unknown as FeedMapV1;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

/** The bundled, validated, frozen feed map. */
export const FEED_MAP: FeedMapV1 = deepFreeze(validateFeedMap(feedMapJson));

const byFeedId = new Map(FEED_MAP.entries.map((entry) => [entry.feed_id, entry]));

/** Exact feed id lookup (lowercase hex, no `0x`). `undefined` for any feed outside the map. */
export function feedEntry(feedId: unknown): FeedMapEntry | undefined {
  return typeof feedId === "string" ? byFeedId.get(feedId) : undefined;
}

/** Every feed of one supported product mint, exact mint equality. */
export function feedsForMint(mint: string): FeedMapEntry[] {
  return FEED_MAP.entries.filter((entry) => entry.binding.mint === mint);
}

/** The one feed that may value holdings of `mint`, if any. */
export function valuationFeedForMint(mint: string): FeedMapEntry | undefined {
  return FEED_MAP.entries.find((entry) => entry.binding.mint === mint && entry.valuation.use);
}
