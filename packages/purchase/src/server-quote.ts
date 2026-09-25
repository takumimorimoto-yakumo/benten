/**
 * Server-side, read-only quote of a product's fixed route (the routes table,
 * `routes-table.ts`; default NVDAx/USDC) for the remote MCP
 * `prepare_purchase` tool. It reads the product's route mints and pinned
 * pool from the server-configured upstream RPC (the relay's upstream) and
 * returns facts: the quote, when it stops being current, and the buy-flow
 * link query. Paying with SOL or SKR, it quotes the same fixed two-leg route
 * as the buy page (pay token -> USDC in the token's pinned pool, then
 * exactly that leg's USDC minimum -> the product in its pinned pool) and
 * refuses a first leg quoted above the per-transaction USDC limit.
 *
 * Upstream reads are bounded per reader (one per server instance), whatever
 * the number of callers: each amount-independent state (per product, its
 * route mints, pool and bin arrays; and per pay token, its mint, first-leg
 * pool and bin arrays) is its own independent state, read by at most one
 * refresh at a time and reused for `serverQuoteCacheMs`; every amount is
 * quoted locally from it. Three limits apply on top, all per reader:
 *  - every upstream request draws one token from one shared bucket
 *    (`serverQuoteUpstreamPerMinute` a minute, at most
 *    `SERVER_QUOTE_UPSTREAM_BURST` saved); a refresh that finds none answers
 *    `busy` without reaching the upstream;
 *  - a state's failed refreshes are answered for a wait that starts at
 *    `serverQuoteMinRefreshMs` and doubles with each consecutive failure up
 *    to `serverQuoteMaxBackoffMs`; a success resets it;
 *  - an upstream 429, or any response carrying `Retry-After`, pauses every
 *    state's refreshes together (for `Retry-After`, or a doubling wait over
 *    consecutive 429s, capped at `serverQuoteMaxBackoffMs`), answering
 *    `busy`. A cached state still current is served during the pause.
 *
 * It builds no transaction, signs nothing and sends nothing: the user opens
 * the link, the page reads a fresh quote, and the user's own wallet shows and
 * signs the transaction. Bundled for Node by `pnpm --filter @benten/purchase
 * build` (dependencies stay external) so a Node host can import it.
 */

import { Connection, type FetchFn } from "@solana/web3.js";
import { UPSTREAM_TIMEOUT_MS, UPSTREAM_URL_ENV } from "@benten/solana-rpc-relay/config";
import { resolveUpstreamUrl, type RelayEnvironment } from "@benten/solana-rpc-relay";

import { formatRawUnits, formatScaledUnits, parsePayTokenInput } from "./amount";
import { PURCHASE_CONFIG } from "./config";
import { deepLinkQuery } from "./deep-link";
import { previewExpiry } from "./purchase-machine";
import { quoteLegOnPoolState, quoteOnPoolState, readLegPoolState, readPoolState, type PoolState, type RouteQuote } from "./quote";
import { PAY_TOKEN_UNITS, PAY_TOKENS, resolvePayToken, USDC_DECIMALS, USDC_MINT, USDC_SYMBOL, type PayTokenId } from "./route";
import { DEFAULT_PRODUCT, PRODUCT_ROUTES, PRODUCT_TICKERS, resolveProductTicker, type ProductTicker } from "./routes-table";
import { effectiveMultiplier, type ScaledUiAmountConfig } from "./mint-info";
import { readPayMint, readRouteMints, type RelayConnection } from "./rpc";
import { quoteClmmOnState, readClmmRouteState, type ClmmState } from "./clmm-quote";
import { ROUTE_DEX_LABELS, type RouteDexLabel } from "./route-dex";

export type ServerQuoteFailure = "invalid_amount" | "invalid_pay_token" | "not_purchasable" | "over_limit" | "busy" | "route_check" | "upstream_unavailable";

export interface ServerQuoteRoute {
  pool: string;
  dex: RouteDexLabel;
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

/**
 * The product output in display units: the Token-2022 Scaled UI multiplier in
 * effect when the answer was made (read from the product's mint account with
 * the pool) and the quoted output and minimum output at it, truncated to the
 * mint's decimals. The raw amounts in `quote` stay what the swap uses.
 */
export interface ServerQuoteProductDisplay {
  multiplier: string;
  output: string;
  minimum_output: string;
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
    /** `null` when the product mint carries no readable Scaled UI multiplier. */
    product_display: ServerQuoteProductDisplay | null;
    quoted_at_ms: number;
    expires_at_ms: number;
    buy_query: string;
  }
  | { ok: false; reason: ServerQuoteFailure; max_amount_usdc: string; retryable: boolean };

/**
 * Reads one quote for an amount text in `payToken` units, buying `ticker`.
 * `payToken` is matched exactly against the pay-token allowlist
 * (`resolvePayToken`); omitted, the amount is USDC. `ticker` is matched
 * exactly against the routes table keys (`resolveProductTicker`; the caller
 * resolves user input through the registry first); omitted, the product is
 * NVDA. Anything else answers `not_purchasable`.
 */
export type ServerQuoteReader = (amountText: string, payToken?: string, ticker?: string) => Promise<ServerQuoteResult>;

/**
 * Independent cached states of one reader: one per product route and one per
 * two-leg pay token. They share one upstream budget (`createUpstreamGuard`).
 */
export const SERVER_QUOTE_STATE_COUNT = PRODUCT_TICKERS.length + 2;

/**
 * Tokens the shared upstream bucket holds at most and starts with: one cold
 * refresh of every state, capped at `serverQuoteUpstreamBurstMax`.
 */
export const SERVER_QUOTE_UPSTREAM_BURST = Math.min(SERVER_QUOTE_STATE_COUNT * PURCHASE_CONFIG.serverQuoteRequestsPerColdRefresh, PURCHASE_CONFIG.serverQuoteUpstreamBurstMax);

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

function productQuoteRoute(product: ProductTicker): ServerQuoteRoute {
  const route = PRODUCT_ROUTES[product];
  return {
    pool: route.pool.toBase58(),
    dex: ROUTE_DEX_LABELS[route.dex],
    input_mint: USDC_MINT.toBase58(),
    input_symbol: USDC_SYMBOL,
    input_decimals: USDC_DECIMALS,
    output_mint: route.productMint.toBase58(),
    output_symbol: route.symbol,
    output_decimals: route.decimals,
  };
}

type LegPayToken = Exclude<PayTokenId, "USDC">;

function legRoute(payToken: LegPayToken): ServerQuoteRoute {
  const token = PAY_TOKENS[payToken];
  return {
    pool: token.leg!.pool.toBase58(),
    dex: ROUTE_DEX_LABELS["meteora-dlmm"],
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

/** The wait after `count` consecutive failures: `serverQuoteMinRefreshMs` doubled per failure, capped at `serverQuoteMaxBackoffMs`. */
export function backoffMs(count: number): number {
  const base = PURCHASE_CONFIG.serverQuoteMinRefreshMs;
  const max = PURCHASE_CONFIG.serverQuoteMaxBackoffMs;
  if (count <= 1) return Math.min(base, max);
  // Past 2^15 x base the cap applies anyway; stop doubling to keep the number finite.
  return Math.min(base * 2 ** Math.min(count - 1, 15), max);
}

/** The HTTP date form a `Retry-After` may carry (IMF-fixdate, for example `Sun, 06 Nov 1994 08:49:37 GMT`). */
const IMF_FIXDATE = /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/;

/**
 * `Retry-After` as milliseconds from `nowMs`, or `null` when absent or
 * unreadable. Only the two standard forms are read: delta seconds (digits
 * only) and an IMF-fixdate; anything else (a sign, a fraction, another date
 * form the platform's lenient parser would accept) is `null`.
 */
export function retryAfterMs(value: string | null, nowMs: number): number | null {
  if (value === null) return null;
  const text = value.trim();
  if (/^\d+$/.test(text)) return Number(text) * 1_000;
  if (!IMF_FIXDATE.test(text)) return null;
  const date = Date.parse(text);
  return Number.isFinite(date) ? Math.max(0, date - nowMs) : null;
}

/**
 * The reader's shared upstream protection: one token bucket over every
 * request, and one pause for every state after an upstream 429 or
 * `Retry-After`. Time is the reader's `now`.
 */
export function createUpstreamGuard(now: () => number) {
  const perMinute = PURCHASE_CONFIG.serverQuoteUpstreamPerMinute;
  const burst = SERVER_QUOTE_UPSTREAM_BURST;
  let tokens: number = burst;
  let refilledAt = now();
  let pausedUntil = 0;
  let rateLimits = 0;

  function refill(at: number): void {
    tokens = Math.min(burst, tokens + (Math.max(0, at - refilledAt) * perMinute) / 60_000);
    refilledAt = at;
  }

  return {
    /** Whether a refresh may start now: not paused, and at least one token left. */
    open(): boolean {
      const at = now();
      refill(at);
      return at >= pausedUntil && tokens >= 1;
    },
    /** Take one token for one upstream request; `false` (nothing taken) while paused or out of tokens. */
    take(): boolean {
      const at = now();
      refill(at);
      if (at < pausedUntil || tokens < 1) return false;
      tokens -= 1;
      return true;
    },
    /** Read an upstream response: a 429 or a `Retry-After` pauses every state. Returns whether it did. */
    observe(response: Response): boolean {
      const at = now();
      const limited = response.status === 429;
      const retryAfter = retryAfterMs(response.headers.get("retry-after"), at);
      if (!limited && retryAfter === null) {
        rateLimits = 0;
        return false;
      }
      if (limited) rateLimits += 1;
      const wait = Math.min(Math.max(retryAfter ?? 0, limited ? backoffMs(rateLimits) : 0), PURCHASE_CONFIG.serverQuoteMaxBackoffMs);
      pausedUntil = Math.max(pausedUntil, at + wait);
      return true;
    },
  };
}

type UpstreamGuard = ReturnType<typeof createUpstreamGuard>;

/** Marks one refresh that the guard stopped (no token, a pause, or an upstream 429 / `Retry-After`). */
interface RefreshAttempt {
  limited: boolean;
}

function guardedFetch(fetchImpl: typeof fetch, guard: UpstreamGuard, attempt: RefreshAttempt): FetchFn {
  return (async (input, init) => {
    if (!guard.take()) {
      attempt.limited = true;
      throw new Error("the upstream budget is spent or paused");
    }
    const response = await fetchImpl(input as string, {
      ...(init as RequestInit),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (guard.observe(response)) attempt.limited = true;
    return response;
  }) as FetchFn;
}

/** A route's amount-independent state: a DLMM pool and its bin arrays, or a CLMM pool and its tick arrays. */
type RouteState = PoolState | ClmmState;

/** A product route's state with the product mint's Scaled UI configuration read in the same refresh. */
type ProductRouteState = RouteState & { productScaledUi?: ScaledUiAmountConfig | null };

type CachedState = RouteState & {
  /** When the state was read; quotes computed from it are dated here. */
  at: number;
  /** The upstream it was read from; a changed upstream invalidates it. */
  upstream: string;
};

type RefreshOutcome = CachedState | FailedQuote;
type StateRead = (connection: Connection) => Promise<RouteState | FailedQuote>;
type ConnectionFor = (upstream: URL, attempt: RefreshAttempt) => Connection;

/**
 * One cached amount-independent state: at most one refresh at a time, reused
 * for `serverQuoteCacheMs`. A failed refresh is answered for `backoffMs` of
 * the consecutive failures before the next attempt. A refresh the shared
 * guard stops answers `busy` and does not count as a failure (the guard's
 * own pause and budget govern the next attempt).
 */
function createCachedState(read: StateRead, connectionFor: ConnectionFor, guard: UpstreamGuard, now: () => number) {
  let state: CachedState | null = null;
  let refreshing: Promise<RefreshOutcome> | null = null;
  let lastFailure: { at: number; upstream: string; result: FailedQuote; count: number } | null = null;

  async function readState(upstream: URL): Promise<{ outcome: RefreshOutcome; limited: boolean }> {
    const attempt: RefreshAttempt = { limited: false };
    try {
      const outcome = await read(connectionFor(upstream, attempt));
      if (attempt.limited && !("pool" in outcome)) return { outcome: failure("busy", true), limited: true };
      return { outcome: "pool" in outcome ? { ...outcome, at: now(), upstream: upstream.href } : outcome, limited: false };
    } catch (error) {
      if (attempt.limited) return { outcome: failure("busy", true), limited: true };
      return { outcome: error instanceof Error && (error.name === "RoutePoolMismatchError" || error.name === "ClmmUnsupportedError") ? failure("route_check", false) : failure("upstream_unavailable", true), limited: false };
    }
  }

  function refresh(upstream: URL): Promise<RefreshOutcome> {
    refreshing ??= readState(upstream).then(({ outcome, limited }) => {
      if ("pool" in outcome) {
        state = outcome;
        lastFailure = null;
      } else if (!limited) {
        const count = lastFailure && lastFailure.upstream === upstream.href ? lastFailure.count + 1 : 1;
        lastFailure = { at: now(), upstream: upstream.href, result: outcome, count };
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
    if (lastFailure && lastFailure.upstream === upstream.href && now() - lastFailure.at < backoffMs(lastFailure.count)) return Promise.resolve(lastFailure.result);
    // The shared budget is spent or every state is paused: answer busy without reaching the upstream.
    if (!guard.open()) return Promise.resolve(failure("busy", true));
    return refresh(upstream);
  };
}

function relayOf(connection: Connection): RelayConnection {
  return { connection, lastFailure: () => null };
}

/** One reader per server instance: one cache and one refresh at a time per amount-independent state. */
export function createServerQuoteReader(options: ServerQuoteOptions): ServerQuoteReader {
  const now = options.now ?? Date.now;
  // One guard for the whole reader: every state's requests draw on the same budget and pause together.
  const guard = createUpstreamGuard(now);
  const connectionFor: ConnectionFor = (upstream, attempt) => new Connection(upstream.href, {
    commitment: PURCHASE_CONFIG.readCommitment,
    disableRetryOnRateLimit: true,
    fetch: guardedFetch(options.fetchImpl ?? fetch, guard, attempt),
  });

  // One independent state per product route: a busy or failing pool never delays another product's quotes.
  const routeStates = {} as Record<ProductTicker, ReturnType<typeof createCachedState>>;
  for (const product of PRODUCT_TICKERS) {
    routeStates[product] = createCachedState(async (connection) => {
      const mints = await readRouteMints(relayOf(connection), product);
      if (!mints || mints.usdc.decimals !== USDC_DECIMALS || mints.nvdax.decimals !== PRODUCT_ROUTES[product].decimals) return failure("route_check", false);
      const state = PRODUCT_ROUTES[product].dex === "raydium-clmm" ? await readClmmRouteState(connection, product) : await readPoolState(connection, { product });
      return { ...state, productScaledUi: mints.nvdax.scaledUiAmount };
    }, connectionFor, guard, now);
  }

  const legStates = {} as Record<LegPayToken, ReturnType<typeof createCachedState>>;
  for (const payToken of ["SOL", "SKR"] as const satisfies readonly LegPayToken[]) {
    const token = PAY_TOKENS[payToken];
    legStates[payToken] = createCachedState(async (connection) => {
      const [mint, pool] = await Promise.all([readPayMint(relayOf(connection), payToken), readLegPoolState(connection, token.leg!)]);
      if (!mint || mint.decimals !== token.decimals) return failure("route_check", false);
      return pool;
    }, connectionFor, guard, now);
  }

  /** The product output at the multiplier in effect now, or `null` without a readable multiplier. */
  function productDisplay(state: ProductRouteState, product: ProductTicker, quote: RouteQuote): ServerQuoteProductDisplay | null {
    if (!state.productScaledUi) return null;
    const multiplier = effectiveMultiplier(state.productScaledUi, now());
    if (!/^\d+(?:\.\d+)?$/.test(multiplier)) return null;
    const decimals = PRODUCT_ROUTES[product].decimals;
    const output = formatScaledUnits(BigInt(quote.outputRaw), decimals, multiplier);
    const minimum = formatScaledUnits(BigInt(quote.minimumOutputRaw), decimals, multiplier);
    return output !== null && minimum !== null ? { multiplier, output, minimum_output: minimum } : null;
  }

  function secondLeg(state: RouteState, usdcRaw: bigint): RouteQuote | null {
    try {
      if ("poolState" in state) return quoteClmmOnState(state, usdcRaw, PURCHASE_CONFIG.slippageBps).quote;
      return quoteOnPoolState(state, usdcRaw, PURCHASE_CONFIG.slippageBps).quote;
    } catch {
      return null;
    }
  }

  return async (amountText, payTokenText, tickerText) => {
    const payToken = payTokenText === undefined ? "USDC" : resolvePayToken(payTokenText);
    if (payToken === null) return failure("invalid_pay_token", false);
    const product = tickerText === undefined ? DEFAULT_PRODUCT : resolveProductTicker(tickerText);
    if (product === null) return failure("not_purchasable", false);
    const routeState = routeStates[product];
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
        route: productQuoteRoute(product),
        quote,
        product_display: productDisplay(outcome, product, quote),
        quoted_at_ms: outcome.at,
        expires_at_ms: previewExpiry(outcome.at),
        buy_query: deepLinkQuery(amount.raw),
      };
    }

    const [route, leg] = await Promise.all([routeState(upstream), legStates[payToken](upstream)]);
    if (!("pool" in route)) return route;
    if (!("pool" in leg)) return leg;
    // A first leg is always a DLMM pool state; a CLMM state here would be a wiring error.
    if ("poolState" in leg) return failure("route_check", false);
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
      route: productQuoteRoute(product),
      quote,
      product_display: productDisplay(route, product, quote),
      quoted_at_ms: quotedAt,
      expires_at_ms: previewExpiry(quotedAt),
      buy_query: deepLinkQuery(amount.raw, payToken),
    };
  };
}
