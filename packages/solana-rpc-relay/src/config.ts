/**
 * Contract and limits for the read-only Solana JSON-RPC relay (`relay.ts`).
 * One place for every relay constant; the relay, its HTTP hosts (the facts
 * API and the legacy Next route), the public-Web ingress and the browser
 * purchase code import from here. This module has no runtime dependency, so
 * browser and ingress code can import it without loading any Solana SDK.
 */

/** The one same-origin path the relay is served on. */
export const SOLANA_RPC_RELAY_PATH = "/api/solana-rpc";

/**
 * Server-only environment variable (never `NEXT_PUBLIC_` or `VITE_`) holding
 * the upstream RPC URL, which may carry a provider credential.
 */
export const UPSTREAM_URL_ENV = "SOLANA_RPC_UPSTREAM_URL";

/** Used when `SOLANA_RPC_UPSTREAM_URL` is unset or empty. Public, credential-free. */
export const DEFAULT_UPSTREAM_URL = "https://api.mainnet-beta.solana.com";

/** Maximum accepted request body, in bytes. The largest measured request is a ~1 KB simulate. */
export const MAX_BODY_BYTES = 64 * 1024;
/** Maximum number of calls in one JSON-RPC batch. */
export const MAX_BATCH_ITEMS = 8;
/** Upstream request timeout, in milliseconds. */
export const UPSTREAM_TIMEOUT_MS = 10_000;
/** Maximum accepted upstream response body, in bytes. Bin-array reads are the largest measured (~tens of KB). */
export const MAX_UPSTREAM_RESPONSE_BYTES = 4 * 1024 * 1024;

/**
 * Per-client rate limit: at most `RATE_LIMIT_MAX_CALLS` JSON-RPC calls (a
 * batch counts each call) per `RATE_LIMIT_WINDOW_MS`. Sized from the purchase
 * flow: one swap preview issues about 12 calls and tracking one signature
 * polls about once every 2 s for at most 2 minutes, so one honest purchase
 * stays well below the limit while a scripted caller is cut off quickly.
 */
export const RATE_LIMIT_WINDOW_MS = 60_000;
export const RATE_LIMIT_MAX_CALLS = 120;
/** Upper bound on remembered clients per server instance; the oldest window is evicted first. */
export const RATE_LIMIT_MAX_TRACKED_CLIENTS = 10_000;

/**
 * Server-only environment variable (never `NEXT_PUBLIC_` or `VITE_`) holding a
 * comma-separated list of exact origins allowed to call the relay. When it is
 * unset, the allowed origin is derived from the request's own `Host`.
 */
export const ALLOWED_ORIGINS_ENV = "SOLANA_RPC_RELAY_ALLOWED_ORIGINS";
