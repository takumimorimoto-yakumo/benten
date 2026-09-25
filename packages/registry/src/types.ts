/**
 * Registry entry for a single xStocks token and its underlying issuer.
 *
 * This is the canonical shape of each element in `xstocks.json`. It is
 * derived from two source-of-truth snapshots (the xStocks universe and the
 * SEC-derived financial snapshot coverage set) and is not fetched at runtime.
 */
export type ExclusionReason = "etf" | "non_sec_listing" | "private" | "preferred" | null;

export interface XStockEntry {
  /** On-chain token symbol, e.g. "NVDAx". */
  symbol: string;
  /** Underlying equity ticker, e.g. "NVDA" (symbol with the trailing "x" removed). */
  ticker: string;
  /** Human-readable token name, e.g. "NVIDIA xStock". */
  name: string;
  /** Solana mint address for this token. */
  mint: string;
  /** Solana address of the token issuer (common across all xStocks). */
  issuer: string;
  /** Whether the issuer address has been verified against the source registry. */
  issuer_verified: true;
  /** Token decimals. */
  decimals: number;
  /** Whether this ticker is structurally eligible for SEC-derived financial coverage. */
  fundamentals_available: boolean;
  /** Reason for missing coverage, or null if covered. */
  exclusion_reason: ExclusionReason;
}
