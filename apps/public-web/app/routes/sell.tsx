import { data, type LoaderFunctionArgs, type MetaArgs } from "react-router";
import { SELL_ROUTE } from "@benten/purchase/routes-table";
import { BuyFlow } from "@/features/buy-flow/buy-flow";
import { dossierPath } from "@/i18n/locales";
import { messagesFor } from "@/i18n/messages";
import { createDossierView } from "../lib/dossier.server.js";
import { createProductSubpageDocument } from "../lib/product.server.js";
import { createSaleFrame } from "../lib/purchase-frame.server.js";

/** The sell flow opens over the product page like the buy flow, so the page behind it turns inert. */
export const handle = { buyFlow: true };

export function loader({ params, request }: LoaderFunctionArgs) {
  const document = createProductSubpageDocument({ locale: params.locale, pathname: new URL(request.url).pathname, subpage: "sell", ticker: params.ticker });
  // Only the one sale route's product (NVDA) has a sell flow; every other ticker, buyable or not, is not found.
  if (document.ticker !== SELL_ROUTE.ticker || createDossierView(document.ticker!).purchase !== "fixed_route") throw data(null, { status: 404 });
  return data({ document, frame: createSaleFrame(document.locale) });
}

type SellLoaderData = Awaited<ReturnType<typeof loader>>["data"];

export function meta({ loaderData }: MetaArgs<typeof loader>) {
  const { document, frame } = loaderData as SellLoaderData;
  return [
    { title: `${frame.heading} | ${messagesFor(document.locale).metadata.title}` },
    // A task, not content: the product page is the page to index.
    { name: "robots", content: "noindex" },
  ];
}

export default function Sell({ loaderData }: { loaderData: SellLoaderData }) {
  const { document, frame } = loaderData;
  return <BuyFlow locale={document.locale} frame={frame} ticker={document.ticker!} productHref={dossierPath(document.locale, document.ticker!)} side="sell" />;
}
