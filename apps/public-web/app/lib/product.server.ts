/**
 * Build-only projections for the product pages, their evidence pages and the
 * buy flow frame (app IA sections 4.5, 4.6 and 5). Runs in route loaders
 * during prerendering; never reaches the client graph.
 */
import { companyForXStock } from "@benten/registry";
import { formatBpsAsPercent } from "@benten/purchase/amount";
import { PURCHASE_CONFIG } from "@benten/purchase/config";
import { productRouteForMint } from "@benten/purchase/routes-table";
import type { StockProductView } from "../features/product/product-view";
import type { PublicWebLocale } from "../i18n/locales";
import { isPublishedCompany } from "./company.server.js";
import { createDossierView } from "./dossier.server.js";
import { createPurchaseFrame } from "./purchase-frame.server.js";
import { createStaticFoundationDocument, type StaticFoundationDocument } from "./static-document.server.js";

/** The xStock product page for one allowlisted canonical ticker. */
export function createStockProductView(ticker: string, locale: PublicWebLocale): StockProductView {
  const view = createDossierView(ticker);
  const found = companyForXStock(view.identity.ticker);
  const company = found && isPublishedCompany(found.slug) ? { slug: found.slug, displayName: found.display_name } : null;
  // The product's own pinned pool from the routes table, matched by exact mint.
  const pinned = view.purchase === "fixed_route" ? productRouteForMint(view.identity.mint) : null;
  const route = pinned
    ? { routeLine: createPurchaseFrame(locale, pinned.ticker).routeLine, pool: pinned.pool.toBase58(), slippage: `${formatBpsAsPercent(PURCHASE_CONFIG.slippageBps)}%` }
    : null;
  return { identity: view.identity, purchase: view.purchase, route, company };
}

export type ProductSubpage = "evidence" | "buy" | "sell";

export type ProductSubpageDocument = StaticFoundationDocument & { readonly subpage: ProductSubpage };

/**
 * A product page's subpage document (`.../evidence`, `.../buy`): the product
 * itself is validated exactly as its own page is (allowlist, exact provider
 * record, canonical path), then the one known suffix is added.
 */
export function createProductSubpageDocument(input: {
  readonly locale?: string;
  readonly pathname: string;
  readonly subpage: ProductSubpage;
  readonly ticker?: string;
  readonly provider?: string;
  readonly providerAssetId?: string;
}): ProductSubpageDocument {
  const suffix = `/${input.subpage}`;
  if (!input.pathname.endsWith(suffix)) throw new Error(`static ${input.subpage} document has a noncanonical path`);
  const parent = input.ticker !== undefined
    ? createStaticFoundationDocument({ locale: input.locale, pathname: input.pathname.slice(0, -suffix.length), route: "dossier", ticker: input.ticker })
    : createStaticFoundationDocument({ locale: input.locale, pathname: input.pathname.slice(0, -suffix.length), route: "provider", provider: input.provider, providerAssetId: input.providerAssetId });
  return { ...parent, canonicalPath: `${parent.canonicalPath}${suffix}`, subpage: input.subpage };
}
