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
   * long a failed refresh is answered before the next attempt. Refreshes
   * never overlap, so upstream reads stay at most 60000 / serverQuoteMinRefreshMs
   * refreshes a minute whatever the number of callers.
   */
  serverQuoteCacheMs: 5_000,
  serverQuoteMinRefreshMs: 1_000,
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
