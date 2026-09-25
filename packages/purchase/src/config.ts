/**
 * The single place for purchase-flow constants (design contract section 8 and
 * the 2026-09-24 user decisions). Components and flow code import from here;
 * no literal of these values appears elsewhere.
 */

import { SOLANA_RPC_RELAY_PATH } from "@benten/solana-rpc-relay/config";

export const PURCHASE_CONFIG = {
  /** Fixed slippage tolerance, shown and not editable in this submission. */
  slippageBps: 100,
  /** How long one swap preview may be approved. Shorter than a blockhash lifetime. */
  previewTtlMs: 30_000,
  /** When the "10 seconds left" announcement fires. */
  tenSecondWarningMs: 10_000,
  /** Countdown refresh cadence for the visible timer (not announced). */
  countdownTickMs: 1_000,
  /** Signature status polling: first interval, backoff ceiling on relay 429, and total cap. */
  statusPollIntervalMs: 2_000,
  statusPollMaxIntervalMs: 8_000,
  statusPollTimeoutMs: 120_000,
  /**
   * At most 10 USDC per transaction (raw, 6 decimals). Lowered from 100 USDC
   * on 2026-09-24: the one fixed pool (F4inHs...) holds only about $428 of
   * liquidity, so a 100 USDC swap would move its price by a large share of
   * the pool. 10 USDC keeps one purchase small against that depth.
   */
  maxUsdcInRaw: 10_000_000n,
  /**
   * Selling NVDAx back to USDC in the same pool: the limit mirrors the
   * purchase limit on the USDC side, so the quoted USDC output of one sale is
   * at most this (raw, 6 decimals). The NVDAx field is also capped at the
   * amount the pool quotes for exactly this much USDC.
   */
  maxUsdcOutRaw: 10_000_000n,
  /**
   * A sale is also bounded independently of the pool quote: the NVDAx sold is
   * valued at the key-free Pyth reference price (NVDA/USD x the Scaled UI
   * multiplier in effect), and the sale is refused when that value exceeds
   * `maxUsdcOutRaw` by more than this headroom (basis points). The headroom
   * matches `saleReferenceToleranceBps`: a quote at the USDC limit that passes
   * the tolerance check can be worth at most about that much more, so the two
   * checks agree at the limit and neither refuses what the other allows.
   */
  saleReferenceValueHeadroomBps: 300,
  /**
   * A sale is refused when the pool's quoted USDC output is below the
   * reference value of the NVDAx sold by more than this (basis points), so a
   * pool quote far under the reference price is never offered. 3% covers the
   * gap measured on 2026-09-25 at the 10 USDC limit (the pool quoted 0.86%
   * under the reference value, fee 0.10% and price impact 0.38% included)
   * with about 2 points to spare for the pool lagging the reference outside
   * US market hours. Wider would let a badly skewed pool through; narrower
   * would refuse ordinary sales. The slippage minimum is applied on top.
   */
  saleReferenceToleranceBps: 300,
  /**
   * Compute-unit limit of a sale. The builder sets exactly this limit (the
   * SDK's own estimate is replaced) and the sale audit refuses a higher one.
   * One DLMM swap measured on mainnet uses well under this.
   */
  sellComputeUnitLimit: 200_000,
  /**
   * Query parameter of a buy-flow link that carries a suggested USDC amount
   * (for example `/stock/NVDA/buy?amount=5.00`). The flow only prefills the
   * field with it after the amount checks; it never starts a preview or a
   * wallet request.
   */
  deepLinkAmountParam: "amount",
  /**
   * Query parameter of a buy-flow link that selects the pay token (for
   * example `?amount=0.02&pay=sol`). Its value is the lower-case pay token id,
   * matched exactly; `amount` is then read in that token's units. Absent, the
   * link pays with USDC as before.
   */
  deepLinkPayParam: "pay",
  /**
   * Server-side quote reader (the remote MCP `prepare_purchase` tool), per
   * server instance: how long the amount-independent route state (mints,
   * pool, bin arrays) is reused before one refresh reads it again, and how
   * long a failed refresh is answered before the next attempt (the first
   * wait; consecutive failures double it). Refreshes of one state never
   * overlap, and every upstream request of the reader draws on one shared
   * budget (below), whatever the number of callers.
   */
  serverQuoteCacheMs: 5_000,
  serverQuoteMinRefreshMs: 1_000,
  /**
   * Upper bound of a state's wait after failed refreshes: the wait starts at
   * `serverQuoteMinRefreshMs` and doubles with each consecutive failure
   * (1, 2, 4, ... seconds) up to this. A pause after an upstream 429 or
   * `Retry-After` is capped here too.
   */
  serverQuoteMaxBackoffMs: 30_000,
  /**
   * Shared upstream budget of one server quote reader (per server instance),
   * over every state together: a token bucket that refills this many
   * upstream requests a minute. A refresh that finds no token left answers
   * `busy` without reaching the upstream.
   */
  serverQuoteUpstreamPerMinute: 300,
  /**
   * Upstream requests one cold refresh of a state makes, at most (a Meteora
   * DLMM route or a pay-token leg; a Raydium CLMM route makes 3). The bucket
   * starts with (and holds at most) `SERVER_QUOTE_UPSTREAM_BURST` in
   * `server-quote.ts`: one cold refresh of every state (the state count times
   * this), but never more than `serverQuoteUpstreamBurstMax`, so adding
   * routes does not raise what a fresh instance may send at once. Any minute
   * is then at most that burst plus `serverQuoteUpstreamPerMinute` requests.
   */
  serverQuoteRequestsPerColdRefresh: 5,
  /**
   * The most tokens the shared upstream bucket holds (ten 5-request cold
   * refreshes). The reader has one state per product route and per pay-token
   * leg (`SERVER_QUOTE_STATE_COUNT`: 25 routes and 2 legs, 27 states, whose
   * cold refreshes make 103 requests), so a fresh instance serves the first
   * states from the burst and the rest answer `busy` (fail-closed, retryable)
   * until the refill of 5 a second covers them, about 11 s later.
   */
  serverQuoteUpstreamBurstMax: 50,
  /**
   * The most a preview's pool fee may be, in basis points of the amount it is
   * charged on (the consumed input, or the output when the pool charges the
   * fee there): a quote above it is refused as a route check, for every leg
   * of every DLMM purchase. The routes generator lists a pool only when its
   * base fee and its quoted fees at 2 and 10 USDC stay within the same bound
   * (`MAX_POOL_FEE_PCT` in `scripts/routes/lib.mjs`; a test ties the two).
   */
  maxPoolFeeBps: 100,
  /** Wallet Standard chain this route runs on. */
  chain: "solana:mainnet",
  /** Same-origin read-only relay (`@benten/solana-rpc-relay`). */
  rpcRelayPath: SOLANA_RPC_RELAY_PATH,
  /** Commitment used for reads before the transaction is sent. */
  readCommitment: "confirmed",
  /**
   * Highest transaction version the result read accepts from `getTransaction`
   * (version 1 exists on mainnet; asking for 0 makes the RPC answer -32015
   * for such a transaction). The read requests base64 and uses only
   * `meta`, whose token balances do not depend on the message version.
   */
  maxSupportedTransactionVersion: 1,
  /** Solana Explorer (2026-09-24 user decision). */
  explorerTxUrl: (signature: string): string => `https://explorer.solana.com/tx/${encodeURIComponent(signature)}`,
  /** Solana Explorer page of a wallet address, used when no signature is known. */
  explorerAddressUrl: (address: string): string => `https://explorer.solana.com/address/${encodeURIComponent(address)}`,
} as const;

/** Basis points in one whole (100%). */
export const BPS_DENOMINATOR = 10_000;
