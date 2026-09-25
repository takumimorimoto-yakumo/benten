/**
 * Build-only: the prerendered purchase frame's copy for the fixed-route
 * Dossier. It reaches the page as loader data, so the purchase catalog and
 * the route wording stay out of every static client chunk (the
 * static-artifact test keeps route and wallet identifiers island-only).
 */
import { NVDAX_USDC_POOL } from "@benten/purchase/route";
import { purchaseFrameFrom, type PurchaseFrame } from "../features/purchase-island/purchase-panel-shell";
import type { PublicWebLocale } from "../i18n/locales";
import { purchaseMessagesFor } from "../i18n/purchase-messages";

export function createPurchaseFrame(locale: PublicWebLocale): PurchaseFrame {
  return purchaseFrameFrom(purchaseMessagesFor(locale), NVDAX_USDC_POOL.toBase58());
}
