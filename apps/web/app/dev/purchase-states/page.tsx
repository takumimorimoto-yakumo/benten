import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { StockPage } from "@/components/stock-page";
import { isLocale } from "@/lib/i18n/config";
import { isPurchaseFixtureName } from "@benten/purchase/fixtures";

export const metadata: Metadata = { robots: { index: false, follow: false }, title: "Benten purchase panel states" };

/**
 * DEV-ONLY: the real NVDA stock page with the purchase panel rendered from a
 * reducer fixture (`?state=<fixture>&locale=<locale>`), for screenshots of
 * states that need a wallet or the network. No RPC, no wallet, nothing is
 * signed or sent. The site header and footer follow the `/dev` path locale
 * (English); the page body follows `locale`.
 */
export default function PurchaseStatesPage({ searchParams }: { searchParams: { state?: string; locale?: string } }) {
  if (process.env.NODE_ENV === "production") notFound();
  const state = isPurchaseFixtureName(searchParams.state) ? searchParams.state : "reviewReady";
  const locale = isLocale(searchParams.locale) ? searchParams.locale : "en";
  return <StockPage ticker="NVDA" locale={locale} purchaseFixture={state} />;
}
