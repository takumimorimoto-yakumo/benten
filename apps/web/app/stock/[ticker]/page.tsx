import { StockPage } from "@/components/stock-page";
import { stockMetadataFor } from "@/lib/i18n/metadata";
type StockParams = { params: { ticker: string } };
export function generateMetadata(context: StockParams) { return stockMetadataFor("en", context?.params?.ticker ?? "xStock"); }
export default function EnglishStockPage({ params }: StockParams) { return <StockPage ticker={params.ticker} locale="en" />; }
