/**
 * The `GET /api/prices` response contract, shared by the facts API (which
 * builds it) and browser code (which parses it). The parser is strict and
 * fail-closed: an unknown key, a wrong type, or a feed the caller did not
 * ask for rejects the whole body.
 */

import type { PythPriceResult } from "./prices.js";

export const PRICES_DISCLAIMER =
  "Pyth reference prices read from public Solana accounts. Not a quote, an offer, investment advice, or a valuation of any holding.";

export interface PricesResponse {
  prices: PythPriceResult[];
  feed_map_revision: string;
  disclaimer: string;
}

const PRICE_KEYS_AVAILABLE = [
  "kind", "feed_id", "pyth_symbol", "role", "observed_at", "status", "price", "confidence", "exponent", "price_raw",
  "confidence_raw", "currency", "publish_time", "publish_time_unix", "stale_after_seconds", "source", "not_quote",
].sort();
const PRICE_KEYS_UNAVAILABLE = ["kind", "feed_id", "pyth_symbol", "role", "observed_at", "status", "reason"].sort();
const SOURCE_KEYS = ["network", "program", "account", "shard", "posted_slot", "verification"].sort();
const DECIMAL = /^-?\d+(?:\.\d+)?$/;
const INTEGER = /^-?\d+$/;
const REASONS: ReadonlySet<string> = new Set([
  "not_in_feed_map", "no_price_account", "malformed_price_account", "future_publish_time", "upstream_unavailable", "upstream_timeout",
]);

function sameKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validPrice(value: unknown): value is PythPriceResult {
  if (!isRecord(value) || value.kind !== "pyth_reference" || typeof value.feed_id !== "string" || typeof value.observed_at !== "string") return false;
  if (value.pyth_symbol !== null && typeof value.pyth_symbol !== "string") return false;
  if (value.role !== null && typeof value.role !== "string") return false;
  if (value.status === "unavailable") return sameKeys(value, PRICE_KEYS_UNAVAILABLE) && typeof value.reason === "string" && REASONS.has(value.reason);
  if (value.status !== "fresh" && value.status !== "stale") return false;
  if (!sameKeys(value, PRICE_KEYS_AVAILABLE) || value.not_quote !== true || value.currency !== "USD") return false;
  if (typeof value.price !== "string" || !DECIMAL.test(value.price) || typeof value.confidence !== "string" || !DECIMAL.test(value.confidence)) return false;
  if (typeof value.price_raw !== "string" || !INTEGER.test(value.price_raw) || typeof value.confidence_raw !== "string" || !INTEGER.test(value.confidence_raw)) return false;
  if (!Number.isInteger(value.exponent) || !Number.isSafeInteger(value.publish_time_unix) || !Number.isFinite(value.stale_after_seconds)) return false;
  if (typeof value.publish_time !== "string" || !isRecord(value.source) || !sameKeys(value.source, SOURCE_KEYS)) return false;
  return value.source.verification === "full" && typeof value.source.account === "string" && typeof value.source.posted_slot === "string";
}

/** Parse a `/api/prices` body for exactly `requestedFeedIds`. `null` when anything is off. */
export function parsePricesResponse(body: unknown, requestedFeedIds: readonly string[]): PricesResponse | null {
  if (!isRecord(body) || !sameKeys(body, ["disclaimer", "feed_map_revision", "prices"])) return null;
  if (typeof body.disclaimer !== "string" || typeof body.feed_map_revision !== "string" || !Array.isArray(body.prices)) return null;
  if (body.prices.length !== requestedFeedIds.length) return null;
  if (!body.prices.every((price, index) => validPrice(price) && price.feed_id === requestedFeedIds[index])) return null;
  return body as unknown as PricesResponse;
}
