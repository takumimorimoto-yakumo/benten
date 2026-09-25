/**
 * `GET /api/prices?feed=<id>[&feed=<id>...]`: Pyth reference prices for
 * feeds in the reviewed feed map (`@benten/pricing`), read-only.
 *
 * Why a server route and not the browser calling Pyth: Pyth's Hermes HTTP
 * API needs an API key since 2026-08-26 and this repository takes none. The
 * key-free source is the Pyth receiver program's public price accounts on
 * Solana, read here with one `getMultipleAccounts` against the same
 * server-configured upstream RPC as the relay. Serving it here lets every
 * visitor share one per-instance cache instead of each browser reading the
 * RPC, and keeps the accepted accounts fixed by the feed map.
 *
 * Boundaries, mirroring the relay:
 *  - only feed ids in the feed map are accepted (exact lowercase hex), at
 *    most `PRICING_CONFIG.maxFeedsPerRequest`, no other query key, no repeat;
 *  - only the feed map's price accounts are read; nothing from the request
 *    reaches the upstream but those addresses;
 *  - same-origin callers only (`callerRejection`), a per-client call budget,
 *    an upstream timeout and body bound, and a per-feed cache;
 *  - the upstream URL comes only from the server environment and never
 *    appears in a response.
 */

import {
  ALLOWED_ORIGINS_ENV,
  UPSTREAM_URL_ENV,
  callerRejection,
  clientKeyOf,
  createRateLimiter,
  resolveUpstreamUrl,
  type RelayEnvironment,
  type RelayRateLimiter,
} from "@benten/solana-rpc-relay";
import {
  FEED_MAP,
  PRICES_DISCLAIMER,
  PRICING_CONFIG,
  PriceRpcError,
  feedEntry,
  observeFeeds,
  priceResult,
  type PriceAccountsRpc,
  type PriceObservation,
  type PricesResponse,
} from "@benten/pricing";

export type PricesHandler = (request: Request) => Promise<Response>;

export interface PricesHandlerOptions {
  /** Server environment, for example `process.env`. Read on every request. */
  env: RelayEnvironment;
  /** Test seam for the upstream call; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  now?: () => number;
  rateLimiter?: RelayRateLimiter;
}

const ALLOW = "GET, HEAD";
const FEED_ID = /^[0-9a-f]{64}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const HEADERS = { "cache-control": "no-store", "content-type": "application/json" } as const;

type QueryResult = { ok: true; feedIds: string[] } | { ok: false; code: "invalid_query" | "feed_not_allowed" };

/** Strict raw query: one or more `feed` keys, each an exact feed-map id, no repeats, nothing else. */
export function parsePricesQuery(search: URLSearchParams): QueryResult {
  const feedIds: string[] = [];
  for (const [key, value] of search) {
    if (key !== "feed" || !FEED_ID.test(value) || feedIds.includes(value)) return { ok: false, code: "invalid_query" };
    feedIds.push(value);
  }
  if (feedIds.length === 0 || feedIds.length > PRICING_CONFIG.maxFeedsPerRequest) return { ok: false, code: "invalid_query" };
  if (feedIds.some((feedId) => !feedEntry(feedId))) return { ok: false, code: "feed_not_allowed" };
  return { ok: true, feedIds };
}

function json(body: object, status: number, method: string, extra: Record<string, string> = {}): Response {
  return new Response(method === "HEAD" ? null : JSON.stringify(body), { status, headers: { ...HEADERS, ...extra } });
}

function errorBody(code: string) {
  return { error: { code }, disclaimer: PRICES_DISCLAIMER };
}

async function readBoundedText(body: ReadableStream<Uint8Array> | null, limit: number): Promise<string | null> {
  if (!body) return null;
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** The one upstream read: `getMultipleAccounts` of feed-map price accounts, base64. */
function upstreamAccountsRpc(upstream: URL | null, fetchImpl: typeof fetch): PriceAccountsRpc {
  return async (addresses) => {
    if (!upstream) throw new PriceRpcError("upstream_unavailable");
    let response: Response;
    try {
      response = await fetchImpl(upstream.href, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getMultipleAccounts", params: [addresses, { encoding: "base64", commitment: "confirmed" }] }),
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(PRICING_CONFIG.upstreamTimeoutMs),
      });
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      throw new PriceRpcError(timedOut ? "upstream_timeout" : "upstream_unavailable");
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new PriceRpcError("upstream_unavailable");
    }
    const text = await readBoundedText(response.body, PRICING_CONFIG.maxUpstreamResponseBytes).catch(() => null);
    if (text === null) throw new PriceRpcError("upstream_unavailable");
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new PriceRpcError("upstream_unavailable");
    }
    const value = (body as { result?: { value?: unknown } } | null)?.result?.value;
    if (!Array.isArray(value) || value.length !== addresses.length) throw new PriceRpcError("upstream_unavailable");
    return value.map((entry) => {
      if (entry === null) return null;
      const account = entry as { owner?: unknown; data?: unknown };
      const data = Array.isArray(account.data) && account.data.length === 2 && account.data[1] === "base64" && typeof account.data[0] === "string" && BASE64.test(account.data[0])
        ? new Uint8Array(Buffer.from(account.data[0], "base64"))
        : null;
      // An account the decoder cannot read is passed on as unreadable data, so it is reported, not skipped.
      return typeof account.owner === "string" ? { owner: account.owner, data: data ?? new Uint8Array(0) } : null;
    });
  };
}

/** Build the prices endpoint. One cache and one call budget per handler, that is, per server instance. */
export function createPricesHandler(options: PricesHandlerOptions): PricesHandler {
  const now = options.now ?? Date.now;
  const rateLimiter = options.rateLimiter ?? createRateLimiter();
  const cache = new Map<string, PriceObservation>();
  const inFlight = new Map<string, Promise<PriceObservation>>();

  async function observations(feedIds: string[]): Promise<Map<string, PriceObservation>> {
    const at = now();
    const result = new Map<string, PriceObservation>();
    const missing: string[] = [];
    for (const feedId of feedIds) {
      const cached = cache.get(feedId);
      if (cached && at - cached.observedAtMs < PRICING_CONFIG.cacheTtlMs) result.set(feedId, cached);
      else if (!inFlight.has(feedId)) missing.push(feedId);
    }
    if (missing.length > 0) {
      // One upstream read for every feed not cached; concurrent requests for the same feeds wait on it.
      const rpc = upstreamAccountsRpc(resolveUpstreamUrl(options.env[UPSTREAM_URL_ENV]), options.fetchImpl ?? fetch);
      const read = observeFeeds(missing, rpc, now).then((map) => {
        for (const [feedId, observation] of map) cache.set(feedId, observation);
        return map;
      });
      for (const feedId of missing) inFlight.set(feedId, read.then((map) => map.get(feedId)!).finally(() => inFlight.delete(feedId)));
    }
    for (const feedId of feedIds) {
      if (!result.has(feedId)) result.set(feedId, (await inFlight.get(feedId)) ?? cache.get(feedId)!);
    }
    return result;
  }

  return async (request) => {
    const method = request.method.toUpperCase();
    await request.body?.cancel().catch(() => undefined);
    if (method !== "GET" && method !== "HEAD") {
      return new Response(null, { status: 405, headers: { allow: ALLOW, "cache-control": "no-store" } });
    }
    const rejection = callerRejection(request.headers, options.env[ALLOWED_ORIGINS_ENV]);
    if (rejection) return json(errorBody("caller_not_allowed"), 403, method);
    const query = parsePricesQuery(new URL(request.url).searchParams);
    if (!query.ok) return json(errorBody(query.code), 400, method);
    const decision = rateLimiter.take(clientKeyOf(request.headers), 1, now());
    if (!decision.allowed) return json(errorBody("rate_limited"), 429, method, { "retry-after": String(decision.retryAfterSeconds) });

    const observed = await observations(query.feedIds);
    const at = now();
    const body: PricesResponse = {
      prices: query.feedIds.map((feedId) => priceResult(feedId, observed.get(feedId) ?? null, at)),
      feed_map_revision: FEED_MAP.revision,
      disclaimer: PRICES_DISCLAIMER,
    };
    return json(body, 200, method);
  };
}
