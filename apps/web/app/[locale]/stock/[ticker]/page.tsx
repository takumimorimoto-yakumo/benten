import { notFound } from "next/navigation";
import { StockPage } from "@/components/stock-page";
import { isLocale } from "@/lib/i18n/config";
import { stockMetadataFor } from "@/lib/i18n/metadata";
type LocalizedStockParams = { params: { locale: string; ticker: string } };
export function generateMetadata(context: LocalizedStockParams) { const locale = context?.params?.locale; return isLocale(locale) && locale !== "en" ? stockMetadataFor(locale, context.params?.ticker ?? "xStock") : {}; }
export default function LocalizedStockPage({ params }: LocalizedStockParams) { if (!isLocale(params?.locale) || params.locale === "en") notFound(); return <StockPage ticker={params.ticker} locale={params.locale} />; }
