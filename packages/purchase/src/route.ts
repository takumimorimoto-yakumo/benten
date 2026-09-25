/**
 * The verified purchase routes: pinned identities only, never derived from
 * caller input. The per-product pools live in `routes-table.ts`; this module
 * keeps the shared constants (USDC, the DLMM program, the pay-token legs).
 *
 * The NVDAx route was observed read-only in
 * `docs/route-feasibility-2026-09-14.md` and referenced from
 * `specs/stocklana-submission-plan-2026-09-23.md` (P1-2).
 */

import { PublicKey } from "@solana/web3.js";

import { PRODUCT_ROUTES, productRouteForMint } from "./routes-table";
import { PAY_TOKEN_UNITS, type PayTokenId } from "./token-units";

export {
  DEFAULT_PRODUCT,
  PRODUCT_ROUTES,
  PRODUCT_TICKERS,
  productRoute,
  productRouteForMint,
  purchasableRoute,
  resolveProductTicker,
  type ProductRoute,
  type ProductTicker,
} from "./routes-table";

/** The NVDAx route's pool (`PRODUCT_ROUTES.NVDA`), kept under its original name. */
export const NVDAX_USDC_POOL = PRODUCT_ROUTES.NVDA.pool;
/** NVDAx mint. Token-2022, 8 decimals. Its pool's token X. */
export const NVDAX_MINT = PRODUCT_ROUTES.NVDA.productMint;
/** USDC mint. Legacy SPL Token, 6 decimals. Token Y of every product pool. */
export const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
/** Meteora DLMM program that owns the pool. */
export const DLMM_PROGRAM_ID = new PublicKey("LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo");
/** Solana compute-budget program (the SDK prepends a compute-unit limit). */
export const COMPUTE_BUDGET_PROGRAM_ID = new PublicKey("ComputeBudget111111111111111111111111111111");
/** SPL Memo program v2, passed to the DLMM swap as an account for Token-2022 transfers. */
export const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

/**
 * The Pyth NVDA/USD feed (`Equity.US.NVDA/USD`, one underlying share) a sale
 * is valued against, read key-free from its receiver-owned price accounts.
 * Pinned here so the browser does not load the whole feed map; a test keeps
 * it equal to the reviewed feed map entry bound to `NVDAX_MINT`.
 */
export const NVDA_REFERENCE_FEED = {
  feedId: "b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593",
  pythSymbol: "Equity.US.NVDA/USD",
  priceAccounts: [
    { shard: 0, address: "2w1Tg1XTZbUib7srfRoStJ4v5JXVsK7roQEGMsMaGZFC" },
    { shard: 1, address: "5VETJ8h3p4JrESYrzhjTDAWPEjDjfcnduqe9CjxgqBNd" },
  ],
  receiverProgram: "rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ",
} as const;

/** Decimals the route is verified for (SDK-free home: `token-units.ts`). */
export { NVDAX_DECIMALS, SKR_DECIMALS, SOL_DECIMALS, USDC_DECIMALS } from "./token-units";
export { PAY_TOKEN_IDS, PAY_TOKEN_UNITS, resolvePayToken, type PayTokenId } from "./token-units";

/** Wrapped SOL mint (legacy SPL Token, 9 decimals). Native SOL is wrapped into it for the first leg and unwrapped after. */
export const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
/**
 * SKR, the Solana Mobile ecosystem token. Legacy SPL Token, 6 decimals.
 * Mint published at https://docs.solanamobile.com/solana-mobile-stack/skr
 * (observed 2026-09-25); the decimals and token program are read back from
 * the mint account before every preview.
 */
export const SKR_MINT = new PublicKey("SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3");

/**
 * First leg of a two-leg purchase: one pinned Meteora DLMM pool whose token X
 * is the pay token and whose token Y is USDC. Both mints are legacy SPL Token.
 * The pool's USDC output is the exact input of the product's pinned pool.
 * Observed read-only on 2026-09-25 (Meteora DLMM API and a mainnet build):
 *  - SOL/USDC 5rCf1D...: bin step 4, base fee 0.04%, about $6.9M liquidity.
 *  - SKR/USDC 3EFvYX...: bin step 50, base fee 0.3%, about $29K liquidity,
 *    the deepest SKR/USDC DLMM pool at the time.
 */
export interface PayLeg {
  readonly pool: PublicKey;
  /** The pay token (pool token X). */
  readonly tokenXMint: PublicKey;
  /** USDC (pool token Y). */
  readonly tokenYMint: PublicKey;
}

export const SOL_USDC_POOL = new PublicKey("5rCf1DM8LjKTw4YqhnoLcngyZYeNnQqztScTogYHAS6");
export const SKR_USDC_POOL = new PublicKey("3EFvYXRRchBUbc2c8cwFWzJLttvYRPYq1dUi9yjug6wB");

export interface PayTokenRoute {
  readonly id: PayTokenId;
  /** Display label only, never used to resolve a token. */
  readonly symbol: string;
  readonly mint: PublicKey;
  readonly decimals: number;
  /** Native SOL: the balance is the wallet's lamports and the first leg wraps and unwraps it. */
  readonly native: boolean;
  /** `null` for USDC, which swaps in the fixed pool directly. */
  readonly leg: PayLeg | null;
}

/** Every token the panel accepts as payment. A closed allowlist keyed by `PayTokenId`. */
export const PAY_TOKENS: Readonly<Record<PayTokenId, PayTokenRoute>> = {
  USDC: { id: "USDC", symbol: "USDC", mint: USDC_MINT, ...PAY_TOKEN_UNITS.USDC, leg: null },
  SOL: { id: "SOL", symbol: "SOL", mint: WSOL_MINT, ...PAY_TOKEN_UNITS.SOL, leg: { pool: SOL_USDC_POOL, tokenXMint: WSOL_MINT, tokenYMint: USDC_MINT } },
  SKR: { id: "SKR", symbol: "SKR", mint: SKR_MINT, ...PAY_TOKEN_UNITS.SKR, leg: { pool: SKR_USDC_POOL, tokenXMint: SKR_MINT, tokenYMint: USDC_MINT } },
};

/** Symbols as shown in the panel. Display labels only, never used to resolve a token. */
export const USDC_SYMBOL = "USDC";
export const NVDAX_SYMBOL = PRODUCT_ROUTES.NVDA.symbol;

/**
 * Whether a registry entry's mint is one Benten can buy. Exact mint
 * comparison against the routes table; never a ticker, symbol or name match.
 */
export function isPurchasableMint(mint: string): boolean {
  return productRouteForMint(mint) !== null;
}
