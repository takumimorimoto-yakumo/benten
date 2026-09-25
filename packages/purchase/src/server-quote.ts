/**
 * Server-side, read-only quote of the fixed NVDAx/USDC route for the remote
 * MCP `prepare_purchase` tool. It reads the route mints and the pinned pool
 * from the server-configured upstream RPC (the relay's upstream) and returns
 * facts: the quote, when it stops being current, and the buy-flow link query.
 * Paying with SOL or SKR, it quotes the same fixed two-leg route as the buy
 * page (pay token -> USDC in the token's pinned pool, then exactly that leg's
 * USDC minimum -> NVDAx in the fixed pool) and refuses a first leg quoted
 * above the per-transaction USDC limit.
 *
 * Upstream reads are bounded per reader (one per server instance), whatever
 * the number of callers: each amount-independent state (the route mints,
 * pool and bin arrays; and per pay token, its mint, first-leg pool and bin
 * arrays) is read by at most one refresh at a time and reused for
 * `serverQuoteCacheMs`; every amount is quoted locally from it. A failed
 * refresh is answered for `serverQuoteMinRefreshMs` before the next one, so
 * each state runs at most 60000 / serverQuoteMinRefreshMs refreshes per
 * minute.
 *
 * It builds no transaction, signs nothing and sends nothing: the user opens
 * the link, the page reads a fresh quote, and the user's own wallet shows and
 * signs the transaction. Bundled for Node by `pnpm --filter @benten/purchase
 * build` (dependencies stay external) so a Node host can import it.
 */

import { Connection, type FetchFn } from "@solana/web3.js";
import { UPSTREAM_TIMEOUT_MS, UPSTREAM_URL_ENV } from "@benten/solana-rpc-relay/config";
import { resolveUpstreamUrl, type RelayEnvironment } from "@benten/solana-rpc-relay";

import { formatRawUnits, parsePayTokenInput } from "./amount";
import { PURCHASE_CONFIG } from "./config";
import { deepLinkQuery } from "./deep-link";
import { previewExpiry } from "./purchase-machine";
import { quoteLegOnPoolState, quoteOnPoolState, readLegPoolState, readPoolState, type PoolState, type RouteQuote } from "./quote";
import { NVDAX_DECIMALS, NVDAX_MINT, NVDAX_SYMBOL, NVDAX_USDC_POOL, PAY_TOKEN_UNITS, PAY_TOKENS, resolvePayToken, USDC_DECIMALS, USDC_MINT, USDC_SYMBOL, type PayTokenId } from "./route";
import { readPayMint, readRouteMints, type RelayConnection } from "./rpc";

export type ServerQuoteFailure = "invalid_amount" | "invalid_pay_token" | "over_limit" | "busy" | "route_check" | "upstream_unavailable";

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

/** The first leg of a two-leg quote: the pay token -> USDC in its pinned pool. */
export interface ServerQuoteLeg {
  route: ServerQuoteRoute;
  /** `outputRaw` is the estimated USDC; `minimumOutputRaw` is the USDC the second leg swaps. */
  quote: RouteQuote;
}

export type ServerQuoteResult =
  | {
    ok: true;
    /** The token the purchase pays with. */
    pay_token: PayTokenId;
    /** The pay-token input, decimal text and raw base units. */
    amount_in: string;
    amount_in_raw: string;
    /** USDC swapped into the fixed pool: the input itself for USDC, the first leg's minimum otherwise. */
    amount_usdc: string;
    amount_raw: string;
    max_amount_usdc: string;
    slippage_bps: number;
    /** `null` when paying with USDC (one leg). */
    first_leg: ServerQuoteLeg | null;
    route: ServerQuoteRoute;
    quote: RouteQuote;
    quoted_at_ms: number;
    expires_at_ms: number;
    buy_query: string;
  }
  | { ok: false; reason: ServerQuoteFailure; max_amount_usdc: string; retryable: boolean };

/**
 * Reads one quote for an amount text in `payToken` units. `payToken` is
 * matched exactly against the pay-token allowlist (`resolvePayToken`);
 * omitted, the amount is USDC.
 */
export type ServerQuoteReader = (amountText: string, payToken?: string) => Promise<ServerQuoteResult>;

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

type LegPayToken = Exclude<PayTokenId, "USDC">;

function legRoute(payToken: LegPayToken): ServerQuoteRoute {
  const token = PAY_TOKENS[payToken];
  return {
    pool: token.leg!.pool.toBase58(),
    dex: "Meteora DLMM",
    input_mint: token.mint.toBase58(),
    input_symbol: token.symbol,
    input_decimals: token.decimals,
    output_mint: USDC_MINT.toBase58(),
    output_symbol: USDC_SYMBOL,
    output_decimals: USDC_DECIMALS,
  };
}

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

interface CachedState extends PoolState {
  /** When the state was read; quotes computed from it are dated here. */
  at: number;
  /** The upstream it was read from; a changed upstream invalidates it. */
  upstream: string;
}

type RefreshOutcome = CachedState | FailedQuote;
type StateRead = (connection: Connection) => Promise<PoolState | FailedQuote>;

/**
 * One cached amount-independent state: at most one refresh at a time, reused
 * for `serverQuoteCacheMs`, and a failed refresh answered for
 * `serverQuoteMinRefreshMs` before the next attempt.
 */
function createCachedState(read: StateRead, connectionFor: (upstream: URL) => Connection, now: () => number) {
  let state: CachedState | null = null;
  let refreshing: Promise<RefreshOutcome> | null = null;
  let lastFailure: { at: number; upstream: string; result: FailedQuote } | null = null;

  async function readState(upstream: URL): Promise<RefreshOutcome> {
    try {
      const outcome = await read(connectionFor(upstream));
      return "pool" in outcome ? { ...outcome, at: now(), upstream: upstream.href } : outcome;
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

  return (upstream: URL): Promise<RefreshOutcome> => {
    if (state && state.upstream === upstream.href && now() - state.at < PURCHASE_CONFIG.serverQuoteCacheMs) return Promise.resolve(state);
    if (refreshing) return refreshing;
    if (lastFailure && lastFailure.upstream === upstream.href && now() - lastFailure.at < PURCHASE_CONFIG.serverQuoteMinRefreshMs) return Promise.resolve(lastFailure.result);
    return refresh(upstream);
  };
}

function relayOf(connection: Connection): RelayConnection {
  return { connection, lastFailure: () => null };
}

/** One reader per server instance: one cache and one refresh at a time per amount-independent state. */
export function createServerQuoteReader(options: ServerQuoteOptions): ServerQuoteReader {
  const now = options.now ?? Date.now;
  const connectionFor = (upstream: URL) => new Connection(upstream.href, {
    commitment: PURCHASE_CONFIG.readCommitment,
    disableRetryOnRateLimit: true,
    fetch: timedFetch(options.fetchImpl ?? fetch),
  });

  const routeState = createCachedState(async (connection) => {
    const mints = await readRouteMints(relayOf(connection));
    if (!mints || mints.usdc.decimals !== USDC_DECIMALS || mints.nvdax.decimals !== NVDAX_DECIMALS) return failure("route_check", false);
    return readPoolState(connection);
  }, connectionFor, now);

  const legStates = {} as Record<LegPayToken, ReturnType<typeof createCachedState>>;
  for (const payToken of ["SOL", "SKR"] as const satisfies readonly LegPayToken[]) {
    const token = PAY_TOKENS[payToken];
    legStates[payToken] = createCachedState(async (connection) => {
      const [mint, pool] = await Promise.all([readPayMint(relayOf(connection), payToken), readLegPoolState(connection, token.leg!)]);
      if (!mint || mint.decimals !== token.decimals) return failure("route_check", false);
      return pool;
    }, connectionFor, now);
  }

  function secondLeg(state: PoolState, usdcRaw: bigint): RouteQuote | null {
    try {
      return quoteOnPoolState(state, usdcRaw, PURCHASE_CONFIG.slippageBps).quote;
    } catch {
      return null;
    }
  }

  return async (amountText, payTokenText) => {
    const payToken = payTokenText === undefined ? "USDC" : resolvePayToken(payTokenText);
    if (payToken === null) return failure("invalid_pay_token", false);
    const parsed = parsePayTokenInput(typeof amountText === "string" ? amountText : "", payToken);
    if (!parsed.ok) return failure(parsed.error === "overLimit" ? "over_limit" : "invalid_amount", false);
    const amount = { raw: parsed.raw, text: formatRawUnits(parsed.raw, PAY_TOKEN_UNITS[payToken].decimals) };
    const upstream = resolveUpstreamUrl(options.env[UPSTREAM_URL_ENV]);
    if (!upstream) return failure("upstream_unavailable", false);

    if (payToken === "USDC") {
      const outcome = await routeState(upstream);
      if (!("pool" in outcome)) return outcome;
      const quote = secondLeg(outcome, amount.raw);
      if (!quote) return failure("upstream_unavailable", true);
      return {
        ok: true,
        pay_token: payToken,
        amount_in: amount.text,
        amount_in_raw: amount.raw.toString(),
        amount_usdc: amount.text,
        amount_raw: amount.raw.toString(),
        max_amount_usdc: MAX_AMOUNT_USDC,
        slippage_bps: PURCHASE_CONFIG.slippageBps,
        first_leg: null,
        route: ROUTE,
        quote,
        quoted_at_ms: outcome.at,
        expires_at_ms: previewExpiry(outcome.at),
        buy_query: deepLinkQuery(amount.raw),
      };
    }

    const [route, leg] = await Promise.all([routeState(upstream), legStates[payToken](upstream)]);
    if (!("pool" in route)) return route;
    if (!("pool" in leg)) return leg;
    let first: RouteQuote;
    try {
      first = quoteLegOnPoolState(leg, amount.raw, PURCHASE_CONFIG.slippageBps);
    } catch {
      return failure("upstream_unavailable", true);
    }
    // The first pool cannot take the whole amount: far above what the limit allows.
    if (first.consumedInputRaw !== amount.raw.toString()) return failure("over_limit", false);
    const usdcOutRaw = BigInt(first.outputRaw);
    const usdcMinimumRaw = BigInt(first.minimumOutputRaw);
    // The per-transaction limit in USD terms, as on the buy page: the first leg's quoted USDC.
    if (usdcOutRaw > PURCHASE_CONFIG.maxUsdcInRaw) return failure("over_limit", false);
    if (usdcMinimumRaw <= 0n) return failure("invalid_amount", false);
    const quote = secondLeg(route, usdcMinimumRaw);
    if (!quote) return failure("upstream_unavailable", true);
    const quotedAt = Math.min(route.at, leg.at);
    return {
      ok: true,
      pay_token: payToken,
      amount_in: amount.text,
      amount_in_raw: amount.raw.toString(),
      amount_usdc: formatRawUnits(usdcMinimumRaw, USDC_DECIMALS),
      amount_raw: usdcMinimumRaw.toString(),
      max_amount_usdc: MAX_AMOUNT_USDC,
      slippage_bps: PURCHASE_CONFIG.slippageBps,
      first_leg: { route: legRoute(payToken), quote: first },
      route: ROUTE,
      quote,
      quoted_at_ms: quotedAt,
      expires_at_ms: previewExpiry(quotedAt),
      buy_query: deepLinkQuery(amount.raw, payToken),
    };
  };
}
