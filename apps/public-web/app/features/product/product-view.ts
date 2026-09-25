/**
 * Browser-safe view models of the product pages (app IA section 4.5). The
 * build-only projections in `app/lib/product.server.ts` fill them from the
 * registry, the provider artifact and the pinned purchase route.
 */
import type { DossierView } from "@/features/dossier/dossier-view";

/**
 * The one purchase route of a buyable product, as page copy. It arrives as
 * loader data, so the pool and DEX wording never enters a static client chunk.
 */
export type ProductRouteView = {
  /** The purchase catalog's route line, with the pool shortened. */
  readonly routeLine: string;
  /** The full pool address, for Copy. */
  readonly pool: string;
  /** The fixed slippage tolerance, formatted for the locale. */
  readonly slippage: string;
  /** The pool's recorded liquidity and the date it was read, formatted for the locale; `null` when none was recorded. */
  readonly liquidity: { readonly amount: string; readonly date: string } | null;
};

export type StockProductView = {
  readonly identity: DossierView["identity"];
  readonly purchase: DossierView["purchase"];
  /** Present only for the product with a route. */
  readonly route: ProductRouteView | null;
  /** The company page, from the reviewed company maps by exact ticker; `null` when none is published. */
  readonly company: { readonly slug: string; readonly displayName: string } | null;
};
