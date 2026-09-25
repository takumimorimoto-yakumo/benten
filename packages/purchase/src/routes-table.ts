/**
 * The purchase routes table: every xStock Benten can buy, each through one
 * pinned Meteora DLMM pool against USDC. A closed allowlist keyed by the
 * registry ticker; nothing here is derived from caller input, a symbol or a
 * name, and every lookup is an exact key or exact mint comparison.
 *
 * Each entry was observed read-only on mainnet on 2026-09-25: the pool
 * account is owned by the DLMM program, its token X is the product mint and
 * its token Y is USDC (both read back from the pool account), the product
 * mint is owned by Token-2022 with 8 decimals, carries the Scaled UI Amount
 * extension, and its transfer-hook program is unset. Liquidity at the time:
 * META about $10K, MSTR $4.9K, GOOGL $2.2K, AMD $2.2K, CRCL $1.4K, TSLA
 * $1.3K, SPY $1.1K, HOOD $0.8K, NVDA $0.4K (the deepest xStock/USDC DLMM pool
 * of each product).
 * The browser and the server read every pool again before quoting and stop
 * when the pool or mint no longer carries this identity.
 *
 * The registry (`@benten/registry`) stays the allowlist of what a ticker or
 * mint names; this table only says which of those Benten can buy. Callers
 * reach it in two exact ways:
 *  - by mint: pages and links pass a registry entry's mint to
 *    `productRouteForMint` (or `isPurchasableMint` in `route.ts`), an exact
 *    comparison against the table's product mints;
 *  - by ticker: the remote MCP tool resolves user input through the registry
 *    (`resolveTicker`) before the server quote reader, which, like the
 *    purchase machine and the audit, accepts only an exact table key
 *    (`resolveProductTicker`).
 * `purchasableRoute` checks a whole registry entry (ticker key, mint and
 * decimals all equal to the table's); the tests use it to pin every mint and
 * decimals value here to the registry.
 */

import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@benten/solana";

import { CLMM_PRODUCT_ROUTES, CLMM_PRODUCT_TICKERS } from "./routes-table-clmm";

/** Registry tickers of the purchasable products, in display order (the Meteora DLMM routes, then the Raydium CLMM routes). */
export const PRODUCT_TICKERS = ["NVDA", "META", "MSTR", "GOOGL", "CRCL", "TSLA", "SPY", "HOOD", "AMD", ...CLMM_PRODUCT_TICKERS] as const;
export type ProductTicker = (typeof PRODUCT_TICKERS)[number];

/** The product a flow buys when none is named (the original single route). */
export const DEFAULT_PRODUCT: ProductTicker = "NVDA";

/**
 * Which side of the pool is the product. Only one orientation is verified
 * and supported: the product is token X and USDC token Y, so a USDC-in swap
 * is `swapForY = false`. A pool with the other orientation cannot be listed
 * without changing this type, the quote direction and the audit's account
 * order together.
 */
export type PoolOrientation = "product_x_usdc_y";

/** The DEX program a route's pool belongs to. Each product has exactly one route. */
export type RouteDex = "meteora-dlmm" | "raydium-clmm";

export interface ProductRoute {
  /** Registry ticker (the table key). */
  readonly ticker: ProductTicker;
  /** On-chain token symbol from the registry. Display only, never used to resolve a token. */
  readonly symbol: string;
  readonly productMint: PublicKey;
  /** The one pool this product is bought through (a Meteora DLMM pool, or a Raydium CLMM pool state). */
  readonly pool: PublicKey;
  readonly dex: RouteDex;
  readonly orientation: PoolOrientation;
  readonly decimals: number;
  /** Token program that owns the product mint. */
  readonly tokenProgram: PublicKey;
}

const PRODUCT_DECIMALS = 8;

function route(ticker: ProductTicker, symbol: string, productMint: string, pool: string): ProductRoute {
  return Object.freeze({
    ticker,
    symbol,
    productMint: new PublicKey(productMint),
    pool: new PublicKey(pool),
    orientation: "product_x_usdc_y",
    dex: "meteora-dlmm",
    decimals: PRODUCT_DECIMALS,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
  });
}

/** Every purchasable product and its one pinned pool. */
export const PRODUCT_ROUTES: Readonly<Record<ProductTicker, ProductRoute>> = Object.freeze({
  NVDA: route("NVDA", "NVDAx", "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh", "F4inHs4RQARpASmvLpj45QjGLdkukeGQrtQ22pimVy2a"),
  META: route("META", "METAx", "Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu", "D8pGWVN3vWeyexBtMZjyyPbcLhM1oeTEMibE9h3nNRYL"),
  MSTR: route("MSTR", "MSTRx", "XsP7xzNPvEHS1m6qfanPUGjNmdnmsLKEoNAnHjdxxyZ", "CK751YkvVdjWF6cC3Mcs6ibb16DQ417ohXDZ52CRC4xS"),
  GOOGL: route("GOOGL", "GOOGLx", "XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN", "HgerAhee6opeBQZSLYALL87kBAe9sa3gXM3qj7S4Jdk5"),
  CRCL: route("CRCL", "CRCLx", "XsueG8BtpquVJX9LVLLEGuViXUungE6WmK5YZ3p3bd1", "DUJM3UvCd9o7CtQ771JR8x5ecn9AsbiH1GnEZAWwCinT"),
  TSLA: route("TSLA", "TSLAx", "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB", "BCZLEgknvcyCsJ9ERRN38U4gBTNn4ftU11fEtV3XHnK2"),
  SPY: route("SPY", "SPYx", "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W", "6uAw2iue69CTGsENLS3j2ur4NnBtbmGptFZ1ZZUje5PJ"),
  HOOD: route("HOOD", "HOODx", "XsvNBAYkrDRNhA7wPHQfX3ZUXZyZLdnCQDfHZ56bzpg", "AiKXdE3vAtCQTD9REbMEwNnuUfxHAZtBaHoVHdQirBUU"),
  AMD: route("AMD", "AMDx", "XsXcJ6GZ9kVnjqGsjBnktRcuwMBmvKWh8S93RefZ1rF", "DsxZiQTsdJbGJojzbdAy9yK7absibgAgUnMLTdNaWr4c"),
  ...CLMM_PRODUCT_ROUTES,
});

/** Exact-match gate for a ticker that is already a table key (for example one read back from state). `null` otherwise. */
export function resolveProductTicker(value: unknown): ProductTicker | null {
  return typeof value === "string" && (PRODUCT_TICKERS as readonly string[]).includes(value) ? (value as ProductTicker) : null;
}

/** The route of a table ticker. Throws for anything else: callers pass a value already gated by `resolveProductTicker`. */
export function productRoute(ticker: ProductTicker): ProductRoute {
  const found = resolveProductTicker(ticker);
  if (found === null) throw new Error("product has no pinned route");
  return PRODUCT_ROUTES[found];
}

/**
 * The pinned route of a product bought through a Meteora DLMM pool, or `null`
 * for a product on another DEX. The DLMM reader and builders take their route
 * from here, so a Raydium CLMM product wired to them by mistake is refused
 * before any pool is read, never read as a DLMM pool.
 */
export function dlmmProductRoute(ticker: ProductTicker): ProductRoute | null {
  const route = productRoute(ticker);
  return route.dex === "meteora-dlmm" ? route : null;
}

/**
 * The one route a sale uses: selling stays on NVDAx (its pinned pool, mint and
 * token program), whatever products can be bought.
 */
export const SELL_ROUTE: ProductRoute = productRoute("NVDA");

const ROUTES_BY_MINT: ReadonlyMap<string, ProductRoute> = new Map(PRODUCT_TICKERS.map((ticker) => [PRODUCT_ROUTES[ticker].productMint.toBase58(), PRODUCT_ROUTES[ticker]]));

/** The route whose product mint equals `mint` exactly, or `null`. */
export function productRouteForMint(mint: unknown): ProductRoute | null {
  return typeof mint === "string" ? ROUTES_BY_MINT.get(mint) ?? null : null;
}

/** The fields of a registry entry this gate compares. */
export interface RegistryProductEntry {
  readonly ticker: string;
  readonly mint: string;
  readonly decimals: number;
}

/**
 * The route of a registry entry (the result of `resolveTicker` or
 * `resolveMint`), or `null` when the entry is missing or Benten cannot buy
 * it. The entry's ticker must be a table key, and its mint and decimals must
 * equal the table's exactly.
 */
export function purchasableRoute(entry: RegistryProductEntry | null | undefined): ProductRoute | null {
  if (!entry) return null;
  const ticker = resolveProductTicker(entry.ticker);
  if (ticker === null) return null;
  const found = PRODUCT_ROUTES[ticker];
  return found.productMint.toBase58() === entry.mint && found.decimals === entry.decimals ? found : null;
}
