/**
 * Purchase result measured from the finalized transaction itself (design
 * contract section 5, "Result"): the wallet's token balance change per mint,
 * computed from `meta.preTokenBalances` / `meta.postTokenBalances` as
 * `bigint`. Never taken from the preview numbers.
 */

import { PAY_TOKENS, USDC_MINT, type PayTokenId } from "./route";
import { DEFAULT_PRODUCT, productRoute, type ProductTicker } from "./routes-table";

export interface TokenBalanceEntry {
  accountIndex: number;
  mint: string;
  owner?: string | null;
  uiTokenAmount: { amount: string };
}

export interface FinalizedTransactionMeta {
  err: unknown;
  preTokenBalances?: TokenBalanceEntry[] | null;
  postTokenBalances?: TokenBalanceEntry[] | null;
  /** Lamport balances per account key; index 0 is the fee payer (the audited wallet). */
  preBalances?: number[] | null;
  postBalances?: number[] | null;
}

export interface MeasuredResult {
  /** The product received by the wallet, raw units of its mint (named for the first product). */
  nvdaxDeltaRaw: bigint;
  /** USDC that left the wallet, raw units (6 decimals). Negative when USDC arrived (a two-leg purchase leaves any USDC above its minimum). */
  usdcPaidRaw: bigint;
  /** The token the wallet paid with. */
  payToken: PayTokenId;
  /**
   * The pay token that left the wallet, raw units. For native SOL this is the
   * fee payer's whole lamport change, so it includes the network fee and any
   * account deposit. `null` when it could not be read.
   */
  paidRaw: bigint | null;
}

const RAW_AMOUNT = /^\d+$/;

function sumFor(entries: TokenBalanceEntry[], owner: string, mint: string): bigint | null {
  let total = 0n;
  for (const entry of entries) {
    if (entry.owner !== owner || entry.mint !== mint) continue;
    const amount = entry.uiTokenAmount?.amount;
    if (typeof amount !== "string" || !RAW_AMOUNT.test(amount)) return null;
    total += BigInt(amount);
  }
  return total;
}

/**
 * `sum(post) - sum(pre)` of raw amounts for token accounts owned by `owner`
 * with mint `mint`. A missing pre entry counts as 0 (the account was created
 * by the transaction). Returns `null` when a balance amount is malformed.
 */
export function tokenDeltaRaw(pre: TokenBalanceEntry[], post: TokenBalanceEntry[], owner: string, mint: string): bigint | null {
  const before = sumFor(pre, owner, mint);
  const after = sumFor(post, owner, mint);
  return before === null || after === null ? null : after - before;
}

/**
 * Lamports that left the fee payer (account index 0), or `null` when the
 * balances are absent or malformed, or when the payer ended with more SOL
 * than it started with (not a payment, so shown as unknown).
 */
function feePayerLamportsSpent(meta: FinalizedTransactionMeta): bigint | null {
  const before = meta.preBalances?.[0];
  const after = meta.postBalances?.[0];
  if (!Number.isSafeInteger(before) || !Number.isSafeInteger(after)) return null;
  const spent = BigInt(before as number) - BigInt(after as number);
  return spent < 0n ? null : spent;
}

/**
 * Measure the purchase of `product` (default NVDA) for the wallet that
 * approved it. Returns `null` when
 * the transaction's token balances are unavailable or unreadable, or when it
 * failed (a failed transaction bought nothing).
 */

export function measurePurchase(meta: FinalizedTransactionMeta | null | undefined, walletAddress: string, payToken: PayTokenId = "USDC", product: ProductTicker = DEFAULT_PRODUCT): MeasuredResult | null {
  if (!meta || (meta.err !== null && meta.err !== undefined)) return null;
  const pre = meta.preTokenBalances;
  const post = meta.postTokenBalances;
  if (!Array.isArray(pre) || !Array.isArray(post)) return null;
  const nvdaxDeltaRaw = tokenDeltaRaw(pre, post, walletAddress, productRoute(product).productMint.toBase58());
  const usdcDeltaRaw = tokenDeltaRaw(pre, post, walletAddress, USDC_MINT.toBase58());
  if (nvdaxDeltaRaw === null || usdcDeltaRaw === null) return null;
  const route = PAY_TOKENS[payToken];
  let paidRaw: bigint | null;
  if (payToken === "USDC") paidRaw = -usdcDeltaRaw;
  else if (route.native) paidRaw = feePayerLamportsSpent(meta);
  else {
    const delta = tokenDeltaRaw(pre, post, walletAddress, route.mint.toBase58());
    paidRaw = delta === null ? null : -delta;
  }
  return { nvdaxDeltaRaw, usdcPaidRaw: -usdcDeltaRaw, payToken, paidRaw };
}
