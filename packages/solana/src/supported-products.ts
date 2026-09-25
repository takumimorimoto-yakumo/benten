/**
 * The token mints Benten treats as its supported products, keyed by exact
 * mint address, and the two token programs they may live under.
 *
 * One place for this set: the read-only RPC relay accepts a
 * `getTokenAccountsByOwner` mint filter only for these mints, and the
 * holdings reader keeps only token accounts of these mints. Both import it
 * from here, so the two can never disagree.
 *
 * The set is derived from the bundled `@benten/registry` artifacts only:
 * every product xStocks entry (`productXStocks`, which leaves out the SPCX and
 * VCX rows withheld under the PreStocks track rule on non-PreStocks pre-IPO
 * tokens), and every PreStocks provider entry. It is never built
 * from caller input, a symbol or a name; membership is exact mint equality.
 *
 * This module has no Solana SDK dependency, so browser code can import it
 * without loading one.
 */

import { productXStocks, providerAssets } from "@benten/registry";

/** Legacy SPL Token program. A fixed protocol constant, not user input. */
export const TOKEN_PROGRAM_ADDRESS = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
/** SPL Token-2022 program. A fixed protocol constant, not user input. */
export const TOKEN_2022_PROGRAM_ADDRESS = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

/** The only token programs a supported product token account may be owned by. */
export const TOKEN_PROGRAM_ADDRESSES: ReadonlySet<string> = new Set([TOKEN_PROGRAM_ADDRESS, TOKEN_2022_PROGRAM_ADDRESS]);

export type SupportedProduct =
  | {
    kind: "xstock";
    mint: string;
    /** On-chain token symbol from the registry, e.g. `NVDAx`. Display only. */
    symbol: string;
    /** Underlying equity ticker from the registry, e.g. `NVDA`. */
    ticker: string;
  }
  | {
    kind: "prestocks";
    mint: string;
    /** Provider-assigned identifier from the provider artifact, e.g. `OPENAI`. */
    providerAssetId: string;
    /** Provider symbol. Display only. */
    symbol: string;
  };

function buildSupportedProducts(): ReadonlyMap<string, SupportedProduct> {
  const products = new Map<string, SupportedProduct>();
  const add = (product: SupportedProduct) => {
    // Fail closed at module load: one mint must never name two products.
    if (products.has(product.mint)) throw new Error(`duplicate supported product mint: ${product.mint}`);
    products.set(product.mint, Object.freeze(product));
  };
  for (const entry of productXStocks) add({ kind: "xstock", mint: entry.mint, symbol: entry.symbol, ticker: entry.ticker });
  for (const entry of providerAssets.entries) {
    if (entry.provider !== "prestocks") continue;
    add({ kind: "prestocks", mint: entry.mint_or_contract, providerAssetId: entry.provider_asset_id, symbol: entry.symbol });
  }
  return products;
}

/** Every supported product, keyed by its exact mint address. */
export const SUPPORTED_PRODUCTS: ReadonlyMap<string, SupportedProduct> = buildSupportedProducts();

/** Exact mint lookup. `undefined` for any mint that is not a supported product. */
export function supportedProductForMint(mint: unknown): SupportedProduct | undefined {
  return typeof mint === "string" ? SUPPORTED_PRODUCTS.get(mint) : undefined;
}
