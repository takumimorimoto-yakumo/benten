/**
 * Server-side, read-only quote of the fixed NVDAx/USDC route for the remote
 * MCP `prepare_purchase` tool. It reads the route mints and the pinned pool
 * from the server-configured upstream RPC (the relay's upstream) and returns
 * facts: the quote, when it stops being current, and the buy-flow link query.
 *
 * Upstream reads are bounded per reader (one per server instance), whatever
 * the number of callers: the amount-independent state (route mints, pool,
 * bin arrays) is read by at most one refresh at a time and reused for
 * `serverQuoteCacheMs`; every amount is quoted locally from it. A failed
 * refresh is answered for `serverQuoteMinRefreshMs` before the next one, so
 * at most 60000 / serverQuoteMinRefreshMs refreshes run per minute.
 *
 * It builds no transaction, signs nothing and sends nothing: the user opens
 * the link, the page reads a fresh quote, and the user's own wallet shows and
 * signs the transaction. Bundled for Node by `pnpm --filter @benten/purchase
 * build` (dependencies stay external) so a Node host can import it.
 */

import { Connection, type FetchFn } from "@solana/web3.js";
import { UPSTREAM_TIMEOUT_MS, UPSTREAM_URL_ENV } from "@benten/solana-rpc-relay/config";
import { resolveUpstreamUrl, type RelayEnvironment } from "@benten/solana-rpc-relay";

import { formatRawUnits, parseUsdcInput } from "./amount";
import { PURCHASE_CONFIG } from "./config";
import { deepLinkQuery } from "./deep-link";
import { previewExpiry } from "./purchase-machine";
import { quoteOnPoolState, readPoolState, type PoolState, type RouteQuote } from "./quote";
import { NVDAX_DECIMALS, NVDAX_MINT, NVDAX_SYMBOL, NVDAX_USDC_POOL, USDC_DECIMALS, USDC_MINT, USDC_SYMBOL } from "./route";
import { readRouteMints } from "./rpc";

export type ServerQuoteFailure = "invalid_amount" | "over_limit" | "busy" | "route_check" | "upstream_unavailable";

export interface ServerQuoteRoute {
  pool: string;
  dex: "Meteora DLMM";
  input_mint: string;
  input_symbol: string;
  input_decimals: number;
  output_mint: string;
  output_symbol: string;
  output_decimals: number;
}

export type ServerQuoteResult =
  | {
    ok: true;
    amount_usdc: string;
    amount_raw: string;
    max_amount_usdc: string;
    slippage_bps: number;
    route: ServerQuoteRoute;
    quote: RouteQuote;
    quoted_at_ms: number;
    expires_at_ms: number;
    buy_query: string;
  }
  | { ok: false; reason: ServerQuoteFailure; max_amount_usdc: string; retryable: boolean };

export type ServerQuoteReader = (amountText: string) => Promise<ServerQuoteResult>;

export interface ServerQuoteOptions {
  /**
   * Server environment, for example `process.env`, read on every quote like
   * the relay: the upstream is `SOLANA_RPC_UPSTREAM_URL` (default the public
   * mainnet RPC); a non-https value fails every read closed.
   */
  env: RelayEnvironment;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

const MAX_AMOUNT_USDC = formatRawUnits(PURCHASE_CONFIG.maxUsdcInRaw, USDC_DECIMALS);

const ROUTE: ServerQuoteRoute = {
  pool: NVDAX_USDC_POOL.toBase58(),
  dex: "Meteora DLMM",
  input_mint: USDC_MINT.toBase58(),
  input_symbol: USDC_SYMBOL,
  input_decimals: USDC_DECIMALS,
  output_mint: NVDAX_MINT.toBase58(),
  output_symbol: NVDAX_SYMBOL,
  output_decimals: NVDAX_DECIMALS,
};

type FailedQuote = Extract<ServerQuoteResult, { ok: false }>;

function failure(reason: ServerQuoteFailure, retryable: boolean): FailedQuote {
  return { ok: false, reason, max_amount_usdc: MAX_AMOUNT_USDC, retryable };
}

function timedFetch(fetchImpl: typeof fetch): FetchFn {
  return (input, init) => fetchImpl(input as string, {
    ...(init as RequestInit),
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  }) as ReturnType<FetchFn>;
}

interface RouteState extends PoolState {
  /** When the state was read; quotes computed from it are dated here. */
  at: number;
  /** The upstream it was read from; a changed upstream invalidates it. */
  upstream: string;
}

type RefreshOutcome = RouteState | FailedQuote;

/** One reader per server instance: one route-state cache and one refresh at a time. */
export function createServerQuoteReader(options: ServerQuoteOptions): ServerQuoteReader {
  const now = options.now ?? Date.now;
  let state: RouteState | null = null;
  let refreshing: Promise<RefreshOutcome> | null = null;
  let lastFailure: { at: number; upstream: string; result: FailedQuote } | null = null;

  async function readState(upstream: URL): Promise<RefreshOutcome> {
    try {
      const connection = new Connection(upstream.href, {
        commitment: PURCHASE_CONFIG.readCommitment,
        disableRetryOnRateLimit: true,
        fetch: timedFetch(options.fetchImpl ?? fetch),
      });
      const mints = await readRouteMints({ connection, lastFailure: () => null });
      if (!mints || mints.usdc.decimals !== USDC_DECIMALS || mints.nvdax.decimals !== NVDAX_DECIMALS) {
        return failure("route_check", false);
      }
      const pool = await readPoolState(connection);
      return { ...pool, at: now(), upstream: upstream.href };
    } catch (error) {
      return error instanceof Error && error.name === "RoutePoolMismatchError" ? failure("route_check", false) : failure("upstream_unavailable", true);
    }
  }

  function refresh(upstream: URL): Promise<RefreshOutcome> {
    refreshing ??= readState(upstream).then((outcome) => {
      if ("pool" in outcome) {
        state = outcome;
        lastFailure = null;
      } else {
        lastFailure = { at: now(), upstream: upstream.href, result: outcome };
      }
      return outcome;
    }).finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  async function currentState(upstream: URL): Promise<RefreshOutcome> {
    if (state && state.upstream === upstream.href && now() - state.at < PURCHASE_CONFIG.serverQuoteCacheMs) return state;
    if (refreshing) return refreshing;
    if (lastFailure && lastFailure.upstream === upstream.href && now() - lastFailure.at < PURCHASE_CONFIG.serverQuoteMinRefreshMs) return lastFailure.result;
    return refresh(upstream);
  }

  return async (amountText) => {
    const parsed = parseUsdcInput(amountText);
    if (!parsed.ok) return failure(parsed.error === "overLimit" ? "over_limit" : "invalid_amount", false);
    const upstream = resolveUpstreamUrl(options.env[UPSTREAM_URL_ENV]);
    if (!upstream) return failure("upstream_unavailable", false);
    const outcome = await currentState(upstream);
    if (!("pool" in outcome)) return outcome;
    let quote: RouteQuote;
    try {
      ({ quote } = quoteOnPoolState(outcome, parsed.raw, PURCHASE_CONFIG.slippageBps));
    } catch {
      return failure("upstream_unavailable", true);
    }
    return {
      ok: true,
      amount_usdc: formatRawUnits(parsed.raw, USDC_DECIMALS),
      amount_raw: parsed.raw.toString(),
      max_amount_usdc: MAX_AMOUNT_USDC,
      slippage_bps: PURCHASE_CONFIG.slippageBps,
      route: ROUTE,
      quote,
      quoted_at_ms: outcome.at,
      expires_at_ms: previewExpiry(outcome.at),
      buy_query: deepLinkQuery(parsed.raw),
    };
  };
}
