/**
 * Constants of the Raydium CLMM routes. The shared purchase constants
 * (slippage, the per-transaction USDC limit, the two-leg compute limit) stay
 * in `config.ts` and `pay-config.ts`; these apply to the CLMM leg only.
 */

export const CLMM_CONFIG = {
  /**
   * Initialized tick arrays read at and above the current price in one
   * request. A 10 USDC swap on every pinned pool walked one array when the
   * routes were generated (2026-09-25); the others cover price moves.
   */
  tickArraysRead: 4,
  /**
   * Most tick arrays one swap may name: the arrays the quote walks plus one
   * more. The audit refuses more, which also keeps the two-leg transaction
   * under the legacy size limit.
   */
  maxTickArrays: 3,
  /**
   * Compute-unit limit of a one-leg CLMM purchase. The builder sets exactly
   * this and the audit refuses a higher one. Measured by simulation on
   * mainnet 2026-09-25 (one `swap_v2` plus one token account creation).
   */
  computeUnitLimit: 200_000,
  /**
   * Highest pool trade fee a CLMM route may carry, parts per million (1%).
   * The price-impact gate does not see fees, so a pool with a high fee tier
   * would pass it; the generator refuses such a pool, and the runtime read
   * refuses a pinned pool whose config has since been raised above this.
   */
  maxTradeFeeRate: 10_000,
  /** Highest fee a generator gate quote may pay, as a share of its input (basis points, 1%). */
  maxQuotedFeeBps: 100,
  /**
   * Largest gap between a gate quote's price per share (USDC in over the
   * product out at the Scaled UI multiplier in effect) and the Pyth price of
   * the underlying share, when that price is fresh (basis points, 3%).
   */
  maxReferenceDeviationBps: 300,
} as const;
