/**
 * Read-only Solana JSON-RPC relay. Served at `SOLANA_RPC_RELAY_PATH` by the
 * standalone facts API (`apps/public-api`) and by the legacy Next route
 * (`apps/web/app/api/solana-rpc/route.ts`), both through `handler.ts`.
 *
 * Why it exists: the browser purchase island (P1-2 in
 * `specs/stocklana-submission-plan-2026-09-23.md`) builds an unsigned swap in
 * the user's browser, but the public mainnet RPC rejects browser-origin
 * requests. This relay forwards a small, measured set of read-only methods
 * from the browser to one upstream RPC chosen by server-only configuration.
 *
 * SECURITY INVARIANTS (do not weaken without a security review):
 *  1. Read-only. Only the methods in `ALLOWED_METHODS` are forwarded. Every
 *     other method -- including every method that submits a transaction or
 *     requests funds -- is answered with a JSON-RPC error and never reaches
 *     the upstream. `getTokenAccountsByOwner` is further held to a
 *     canonical owner key, a token-program or supported-product-mint filter
 *     and a non-slicing encoding.
 *  2. Never relays signed bytes. A `simulateTransaction` request is decoded
 *     here and rejected if any signature slot is non-zero, if `sigVerify` is
 *     requested, or if the bytes do not re-serialize to exactly the input.
 *  3. The upstream URL comes only from the server environment and may carry
 *     a provider credential. It never appears in a response body, an error
 *     message, a response header, or the client bundle.
 *  4. No client header (Cookie, Origin, Authorization, forwarding headers) is
 *     sent upstream; the upstream request carries only `content-type`.
 *  5. Nothing here logs request or response bodies.
 *  6. Only the Benten page itself may call it: a request whose
 *     `Sec-Fetch-Site` is not `same-origin` or whose `Origin` is not the
 *     site's own origin is answered 403 before its body is read
 *     (`callerRejection`).
 *  7. Each client is held to a per-instance call budget (`createRateLimiter`);
 *     over budget the relay answers 429 without contacting the upstream.
 *
 * This module holds no keys, signs nothing and sends no transaction.
 */

import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { SUPPORTED_PRODUCTS, TOKEN_PROGRAM_ADDRESSES } from "@benten/solana/supported-products";

import {
  DEFAULT_UPSTREAM_URL,
  MAX_BATCH_ITEMS,
  MAX_BODY_BYTES,
  MAX_UPSTREAM_RESPONSE_BYTES,
  RATE_LIMIT_MAX_CALLS,
  RATE_LIMIT_MAX_TRACKED_CLIENTS,
  RATE_LIMIT_WINDOW_MS,
  UPSTREAM_TIMEOUT_MS,
} from "./config.js";

/**
 * The only JSON-RPC methods this relay forwards, each with the reason it is
 * needed. Measured on 2026-09-24 by recording every request the
 * `@meteora-ag/dlmm@1.9.14` path in `packages/purchase/src/build-swap.ts` issues
 * (`DLMM.create` -> `getBinArrayForSwap` -> `swapQuote` -> `swap`), plus the
 * unsigned simulate of gate G-B1. Do not add a method without the same kind
 * of evidence.
 */
export const ALLOWED_METHODS: ReadonlySet<string> = new Set([
  // `DLMM.create` reads the pool, both mints and reserves; `getBinArrayForSwap`
  // reads the bin arrays (measured: 2 calls each).
  "getMultipleAccounts",
  // `pool.swap` reads the user's token accounts to decide whether it must add
  // an associated-token-account creation instruction (measured: 2 calls). The
  // dev spike page also reads the NVDAx account's pre-simulation balance.
  "getAccountInfo",
  // `pool.swap` sets the unsigned transaction's recent blockhash (measured: 1 call).
  "getLatestBlockhash",
  // `pool.swap` estimates compute units by simulating the unsigned
  // transaction, and gate G-B1 simulates the built transaction (measured: 1
  // call each, both with zeroed signatures and sigVerify false). Signed bytes
  // and sigVerify are rejected below.
  "simulateTransaction",
  // Next step (post-submission tracking, by polling rather than WebSocket):
  // poll the user-submitted signature's confirmation status.
  "getSignatureStatuses",
  // Next step: read the finalized transaction's pre/post token balances to
  // show the NVDAx holding delta.
  "getTransaction",
  // Tracking decides that a user-sent transaction was dropped only when the
  // current block height is past the transaction's `lastValidBlockHeight`
  // (design contract section 5). Read-only, no parameters that carry bytes.
  "getBlockHeight",
  // Holdings screen (/portfolio, 2026-09-24 user decision): read which
  // supported product tokens the connected public key holds. Read-only. The
  // owner, the filter (one of the two token programs, or one supported
  // product mint) and the config are checked below
  // (`checkTokenAccountsByOwnerParams`); anything else is rejected before the
  // upstream is contacted.
  "getTokenAccountsByOwner",
]);

/** `getTokenAccountsByOwner` config keys forwarded upstream; `encoding` is required. */
const ALLOWED_TOKEN_ACCOUNTS_CONFIG_KEYS: ReadonlySet<string> = new Set(["encoding", "commitment", "minContextSlot"]);
/** Encodings with no byte slicing; `jsonParsed` for wallets, `base64` for the SDK-free holdings decoder. */
const ALLOWED_TOKEN_ACCOUNTS_ENCODINGS: ReadonlySet<string> = new Set(["jsonParsed", "base64"]);
const ALLOWED_COMMITMENTS: ReadonlySet<string> = new Set(["processed", "confirmed", "finalized"]);

/** `simulateTransaction` config keys forwarded upstream. Measured from `pool.swap` and the G-B1 page. */
const ALLOWED_SIMULATE_CONFIG_KEYS: ReadonlySet<string> = new Set([
  "sigVerify",
  "replaceRecentBlockhash",
  "commitment",
  "encoding",
  // The G-B1 page asks for the NVDAx token account's simulated post-state.
  "accounts",
]);

const ALLOWED_REQUEST_KEYS: ReadonlySet<string> = new Set(["jsonrpc", "id", "method", "params"]);
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export const RPC_ERROR = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotAllowed: -32601,
  invalidParams: -32602,
  upstream: -32000,
  callerNotAllowed: -32001,
  rateLimited: -32005,
} as const;

type JsonRpcId = string | number | null;

interface JsonRpcCall {
  jsonrpc: "2.0";
  id: JsonRpcId;
  method: string;
  params?: unknown[];
}

interface JsonRpcErrorResponse {
  jsonrpc: "2.0";
  id: JsonRpcId;
  error: { code: number; message: string };
}

type CallCheck = { ok: true; call: JsonRpcCall } | { ok: false; error: JsonRpcErrorResponse };

export interface RelayOptions {
  /** Raw value of `SOLANA_RPC_UPSTREAM_URL` (server environment only). */
  upstreamUrl: string | undefined;
  /** Raw value of `SOLANA_RPC_RELAY_ALLOWED_ORIGINS` (server environment only). */
  allowedOrigins?: string | undefined;
  /** Per-client limiter. The route passes one per server instance; unit tests may omit it. */
  rateLimiter?: RelayRateLimiter;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
}

/**
 * Caller check: only the Benten page itself may use the relay.
 *
 * Browsers attach `Sec-Fetch-Site` and `Origin` to a `fetch` POST and page
 * scripts cannot forge either, so a third-party web page that tries to use
 * this relay (and spend its upstream quota) is refused here. A non-browser
 * client can forge both headers; for that case this is not authentication,
 * only a filter, and the per-client rate limit below is the remaining bound.
 *
 * Allowed origin: when the server-only `SOLANA_RPC_RELAY_ALLOWED_ORIGINS` is
 * set, exactly the origins listed there. Otherwise the origin is derived from
 * the request's own `Host`, because a Vercel preview deployment is served from
 * a per-deployment host that cannot be listed in advance; a same-origin page
 * always sends an `Origin` whose host equals the `Host` it requested. Plain
 * `http:` is accepted only for a loopback host (a local server).
 */
export function callerRejection(headers: Headers, configuredOrigins: string | undefined): string | null {
  const fetchSite = headers.get("sec-fetch-site");
  if (fetchSite !== null && fetchSite !== "same-origin") return "cross-site caller";
  const origin = headers.get("origin");
  if (origin === null) {
    // A browser always sends Origin on a POST; without it only an explicit same-origin fetch is accepted.
    return fetchSite === "same-origin" ? null : "caller origin missing";
  }
  return allowedOrigins(headers, configuredOrigins).has(origin) ? null : "caller origin not allowed";
}

const LOOPBACK_HOST = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/;
const HOST_HEADER = /^[a-z0-9.-]+(?::\d{1,5})?$|^\[[0-9a-f:]+\](?::\d{1,5})?$/i;

/**
 * The exact origins a same-site caller may present: the configured list when
 * set, otherwise the site's own origin derived from `Host`. Exported for the
 * other API routes that apply the same origin rule with their own policy.
 */
export function allowedOrigins(headers: Headers, configuredOrigins: string | undefined): Set<string> {
  const configured = (configuredOrigins ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  if (configured.length > 0) return new Set(configured);
  const host = headers.get("host")?.trim().toLowerCase() ?? "";
  if (!HOST_HEADER.test(host)) return new Set();
  const origins = new Set([`https://${host}`]);
  if (LOOPBACK_HOST.test(host)) origins.add(`http://${host}`);
  return origins;
}

export interface RateDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface RelayRateLimiter {
  take(clientKey: string, calls: number, now: number): RateDecision;
}

/**
 * Fixed-window, in-memory, per-client call counter.
 *
 * Limits of this design, stated plainly: on a serverless platform every
 * function instance keeps its own map, so the effective limit is per
 * instance, not global, and a cold start forgets every window. It bounds a
 * single noisy client on one instance; it is not a quota. A shared store
 * would be needed for a global limit, and this relay deliberately has none.
 */
export function createRateLimiter(
  limits: { windowMs: number; maxCalls: number; maxClients: number } = {
    windowMs: RATE_LIMIT_WINDOW_MS,
    maxCalls: RATE_LIMIT_MAX_CALLS,
    maxClients: RATE_LIMIT_MAX_TRACKED_CLIENTS,
  },
): RelayRateLimiter {
  const windows = new Map<string, { startedAt: number; calls: number }>();
  return {
    take(clientKey, calls, now) {
      let entry = windows.get(clientKey);
      if (!entry || now - entry.startedAt >= limits.windowMs) {
        if (entry) windows.delete(clientKey);
        while (windows.size >= limits.maxClients) {
          const oldest = windows.keys().next().value as string;
          windows.delete(oldest);
        }
        entry = { startedAt: now, calls: 0 };
        windows.set(clientKey, entry);
      }
      if (entry.calls + calls > limits.maxCalls) {
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((entry.startedAt + limits.windowMs - now) / 1000)) };
      }
      entry.calls += calls;
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}

/**
 * Client key for the rate limit. On Vercel both headers are set by the
 * platform from the connecting address; elsewhere they may be caller-supplied,
 * which again makes the limit a courtesy bound, not a guarantee.
 */
export function clientKeyOf(headers: Headers): string {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unknown";
}

function errorResponse(id: JsonRpcId, code: number, message: string): JsonRpcErrorResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function idOf(value: unknown): JsonRpcId {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const id = (value as Record<string, unknown>).id;
    if (typeof id === "string" || (typeof id === "number" && Number.isFinite(id))) return id;
  }
  return null;
}

/** Resolve the configured upstream. Returns `null` for a non-https or malformed value (fail closed). */
export function resolveUpstreamUrl(raw: string | undefined): URL | null {
  const value = raw?.trim() ?? "";
  try {
    const url = new URL(value === "" ? DEFAULT_UPSTREAM_URL : value);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * Decide whether a base64 wire transaction is safe to simulate: it must
 * decode, re-serialize to exactly the same bytes, and carry only all-zero
 * signature slots. Returns the rejection reason, or `null` when acceptable.
 */
export function unsignedTransactionRejection(encoded: unknown): string | null {
  if (typeof encoded !== "string" || encoded.length === 0 || !BASE64.test(encoded)) {
    return "transaction must be base64";
  }
  const bytes = Buffer.from(encoded, "base64");
  let transaction: VersionedTransaction;
  try {
    transaction = VersionedTransaction.deserialize(bytes);
  } catch {
    return "transaction could not be decoded";
  }
  let reserialized: Uint8Array;
  try {
    reserialized = transaction.serialize();
  } catch {
    return "transaction could not be decoded";
  }
  if (!Buffer.from(reserialized).equals(bytes)) return "transaction is not canonically encoded";
  if (transaction.signatures.some((signature) => signature.some((byte) => byte !== 0))) {
    return "signed transactions are not relayed";
  }
  return null;
}

function checkSimulateParams(params: unknown[] | undefined): string | null {
  if (!params || params.length < 1 || params.length > 2) return "simulateTransaction takes a transaction and a config";
  const config = params[1];
  if (config === undefined || config === null || typeof config !== "object" || Array.isArray(config)) {
    return "simulateTransaction requires a config with encoding base64";
  }
  const entries = config as Record<string, unknown>;
  for (const key of Object.keys(entries)) {
    if (!ALLOWED_SIMULATE_CONFIG_KEYS.has(key)) return "unsupported simulateTransaction config";
  }
  if (entries.encoding !== "base64") return "simulateTransaction requires encoding base64";
  if (entries.sigVerify !== undefined && entries.sigVerify !== false) return "sigVerify is not relayed";
  return unsignedTransactionRejection(params[0]);
}

/** A canonical base58 32-byte public key: decodes and re-encodes to exactly the same text. */
export function isCanonicalPublicKey(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 32 || value.length > 44) return false;
  try {
    return new PublicKey(value).toBase58() === value;
  } catch {
    return false;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * `getTokenAccountsByOwner` is relayed only as `[owner, filter, config]` where
 * the owner is a canonical public key, the filter is exactly one of
 * `{ programId }` naming the SPL Token or Token-2022 program or `{ mint }`
 * naming a supported product mint, and the config carries a non-slicing
 * encoding. Returns the rejection reason, or `null` when acceptable.
 */
export function checkTokenAccountsByOwnerParams(params: unknown[] | undefined): string | null {
  if (!params || params.length !== 3) return "getTokenAccountsByOwner takes an owner, a filter and a config";
  const [owner, filter, config] = params;
  if (!isCanonicalPublicKey(owner)) return "owner must be a public key";
  if (!isPlainObject(filter) || Object.keys(filter).length !== 1) return "filter must be one programId or one mint";
  if ("programId" in filter) {
    if (typeof filter.programId !== "string" || !TOKEN_PROGRAM_ADDRESSES.has(filter.programId)) return "programId must be a token program";
  } else if ("mint" in filter) {
    if (typeof filter.mint !== "string" || !SUPPORTED_PRODUCTS.has(filter.mint)) return "mint is not a supported product";
  } else {
    return "filter must be one programId or one mint";
  }
  if (!isPlainObject(config)) return "getTokenAccountsByOwner requires a config with an encoding";
  for (const key of Object.keys(config)) {
    if (!ALLOWED_TOKEN_ACCOUNTS_CONFIG_KEYS.has(key)) return "unsupported getTokenAccountsByOwner config";
  }
  if (typeof config.encoding !== "string" || !ALLOWED_TOKEN_ACCOUNTS_ENCODINGS.has(config.encoding)) {
    return "encoding must be jsonParsed or base64";
  }
  if (config.commitment !== undefined && (typeof config.commitment !== "string" || !ALLOWED_COMMITMENTS.has(config.commitment))) {
    return "unsupported commitment";
  }
  if (config.minContextSlot !== undefined && !(Number.isSafeInteger(config.minContextSlot) && (config.minContextSlot as number) >= 0)) {
    return "minContextSlot must be a non-negative integer";
  }
  return null;
}

/** Validate one JSON-RPC call against the allowlist and the unsigned-bytes rule. */
export function checkCall(value: unknown): CallCheck {
  const id = idOf(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: errorResponse(id, RPC_ERROR.invalidRequest, "invalid request") };
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !ALLOWED_REQUEST_KEYS.has(key)) || record.jsonrpc !== "2.0" ||
    typeof record.method !== "string" || (record.params !== undefined && !Array.isArray(record.params)) ||
    !("id" in record) || (record.id !== null && idOf(record) === null)) {
    return { ok: false, error: errorResponse(id, RPC_ERROR.invalidRequest, "invalid request") };
  }
  if (!ALLOWED_METHODS.has(record.method)) {
    return { ok: false, error: errorResponse(id, RPC_ERROR.methodNotAllowed, "method not allowed by this relay") };
  }
  const params = record.params as unknown[] | undefined;
  if (record.method === "simulateTransaction") {
    const rejection = checkSimulateParams(params);
    if (rejection) return { ok: false, error: errorResponse(id, RPC_ERROR.invalidParams, rejection) };
  }
  if (record.method === "getTokenAccountsByOwner") {
    const rejection = checkTokenAccountsByOwnerParams(params);
    if (rejection) return { ok: false, error: errorResponse(id, RPC_ERROR.invalidParams, rejection) };
  }
  const call: JsonRpcCall = { jsonrpc: "2.0", id, method: record.method };
  if (params !== undefined) call.params = params;
  return { ok: true, call };
}

/** Read at most `limit` bytes of the body. Returns `null` when the body is larger. Shared with the other body-carrying API routes. */
export async function readBoundedText(body: ReadableStream<Uint8Array> | null, limit: number): Promise<string | null> {
  if (!body) return "";
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

function containsUpstreamIdentity(text: string, upstream: URL): boolean {
  return text.includes(upstream.host) || text.includes(upstream.href);
}

/** Relay one POSTed JSON-RPC request (single or batch) to the configured upstream. */
export async function relaySolanaRpc(request: Request, options: RelayOptions): Promise<Response> {
  const rejection = callerRejection(request.headers, options.allowedOrigins);
  if (rejection) {
    await request.body?.cancel().catch(() => undefined);
    return jsonResponse(errorResponse(null, RPC_ERROR.callerNotAllowed, rejection), 403);
  }
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return jsonResponse(errorResponse(null, RPC_ERROR.invalidRequest, "request body too large"), 413);
  }
  const text = await readBoundedText(request.body, MAX_BODY_BYTES);
  if (text === null) {
    return jsonResponse(errorResponse(null, RPC_ERROR.invalidRequest, "request body too large"), 413);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return jsonResponse(errorResponse(null, RPC_ERROR.parse, "parse error"), 400);
  }

  const isBatch = Array.isArray(parsed);
  let outgoing: JsonRpcCall | JsonRpcCall[];
  if (isBatch) {
    const items = parsed as unknown[];
    if (items.length === 0 || items.length > MAX_BATCH_ITEMS) {
      return jsonResponse(errorResponse(null, RPC_ERROR.invalidRequest, `batch must have 1 to ${MAX_BATCH_ITEMS} calls`), 400);
    }
    const checks = items.map(checkCall);
    if (checks.some((check) => !check.ok)) {
      // Fail closed: one rejected call rejects the whole batch; nothing is forwarded.
      return jsonResponse(checks.map((check, index) => check.ok
        ? errorResponse(idOf(items[index]), RPC_ERROR.invalidRequest, "batch rejected: another call was not allowed")
        : check.error), 400);
    }
    outgoing = checks.map((check) => (check as { ok: true; call: JsonRpcCall }).call);
  } else {
    const check = checkCall(parsed);
    if (!check.ok) return jsonResponse(check.error, 400);
    outgoing = check.call;
  }

  if (options.rateLimiter) {
    const calls = Array.isArray(outgoing) ? outgoing.length : 1;
    const decision = options.rateLimiter.take(clientKeyOf(request.headers), calls, (options.now ?? Date.now)());
    if (!decision.allowed) {
      const response = jsonResponse(errorResponse(idOf(parsed), RPC_ERROR.rateLimited, "relay rate limit reached"), 429);
      response.headers.set("retry-after", String(decision.retryAfterSeconds));
      return response;
    }
  }

  const upstream = resolveUpstreamUrl(options.upstreamUrl);
  if (!upstream) {
    return jsonResponse(errorResponse(idOf(parsed), RPC_ERROR.upstream, "relay is not configured"), 503);
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetchImpl(upstream.href, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(outgoing),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(options.timeoutMs ?? UPSTREAM_TIMEOUT_MS),
    });
  } catch (error: unknown) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return jsonResponse(
      errorResponse(idOf(parsed), RPC_ERROR.upstream, timedOut ? "upstream RPC timed out" : "upstream RPC unavailable"),
      timedOut ? 504 : 502,
    );
  }

  if (upstreamResponse.status === 429) {
    await upstreamResponse.body?.cancel().catch(() => undefined);
    return jsonResponse(errorResponse(idOf(parsed), RPC_ERROR.upstream, "upstream RPC rate limited"), 429);
  }
  const upstreamText = upstreamResponse.ok
    ? await readBoundedText(upstreamResponse.body, MAX_UPSTREAM_RESPONSE_BYTES).catch(() => null)
    : null;
  if (!upstreamResponse.ok) await upstreamResponse.body?.cancel().catch(() => undefined);
  if (upstreamText === null || containsUpstreamIdentity(upstreamText, upstream)) {
    return jsonResponse(errorResponse(idOf(parsed), RPC_ERROR.upstream, "upstream RPC unavailable"), 502);
  }
  try {
    JSON.parse(upstreamText);
  } catch {
    return jsonResponse(errorResponse(idOf(parsed), RPC_ERROR.upstream, "upstream RPC unavailable"), 502);
  }
  return new Response(upstreamText, {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** Response for every non-POST method. */
export function methodNotAllowedResponse(): Response {
  return new Response(JSON.stringify(errorResponse(null, RPC_ERROR.invalidRequest, "method not allowed")), {
    status: 405,
    headers: { allow: "POST", "content-type": "application/json", "cache-control": "no-store" },
  });
}
