/**
 * Build-only: the prerendered purchase frame's copy for a buyable product's
 * page and buy flow. It reaches the page as loader data, so the purchase
 * catalog and the route wording stay out of every static client chunk (the
 * static-artifact test keeps route and wallet identifiers island-only).
 */
import { ROUTE_DEX_LABELS } from "@benten/purchase/route-dex";
import { DEFAULT_PRODUCT, productRoute, resolveProductTicker, SELL_ROUTE } from "@benten/purchase/routes-table";
import { purchaseFrameFrom, saleFrameFrom, type PurchaseFrame } from "../features/purchase-island/purchase-panel-shell";
import type { PublicWebLocale } from "../i18n/locales";
import { purchaseMessagesFor } from "../i18n/purchase-messages";

/** `ticker` is the canonical registry ticker of a buyable product (default NVDA); anything else throws. */
export function createPurchaseFrame(locale: PublicWebLocale, ticker: string = DEFAULT_PRODUCT): PurchaseFrame {
  const product = resolveProductTicker(ticker);
  if (product === null) throw new Error(`no fixed route for ${ticker}`);
  const route = productRoute(product);
  return purchaseFrameFrom(purchaseMessagesFor(locale, route.symbol), route.pool.toBase58(), ROUTE_DEX_LABELS[route.dex]);
}

/** The sell flow's prerendered frame: the same pool, the sale's heading and route line. */
export function createSaleFrame(locale: PublicWebLocale): PurchaseFrame {
  return saleFrameFrom(purchaseMessagesFor(locale, SELL_ROUTE.symbol), SELL_ROUTE.pool.toBase58(), ROUTE_DEX_LABELS[SELL_ROUTE.dex]);
}
