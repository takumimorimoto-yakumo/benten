import { data, type LoaderFunctionArgs, type MetaArgs } from "react-router";
import { BuyFlow } from "@/features/buy-flow/buy-flow";
import { dossierPath } from "@/i18n/locales";
import { messagesFor } from "@/i18n/messages";
import { createDossierView } from "../lib/dossier.server.js";
import { createProductSubpageDocument } from "../lib/product.server.js";
import { createPurchaseFrame } from "../lib/purchase-frame.server.js";

/** Marks this child route as the buy flow, so the product page behind it turns inert. */
export const handle = { buyFlow: true };

export function loader({ params, request }: LoaderFunctionArgs) {
  const document = createProductSubpageDocument({ locale: params.locale, pathname: new URL(request.url).pathname, subpage: "buy", ticker: params.ticker });
  // Only the product whose mint equals the pinned route constant has a flow; every other ticker is not found.
  if (createDossierView(document.ticker!).purchase !== "fixed_route") throw data(null, { status: 404 });
  return data({ document, frame: createPurchaseFrame(document.locale) });
}

type BuyLoaderData = Awaited<ReturnType<typeof loader>>["data"];

export function meta({ loaderData }: MetaArgs<typeof loader>) {
  const { document, frame } = loaderData as BuyLoaderData;
  return [
    { title: `${frame.heading} | ${messagesFor(document.locale).metadata.title}` },
    // A task, not content: the product page is the page to index.
    { name: "robots", content: "noindex" },
  ];
}

export default function Buy({ loaderData }: { loaderData: BuyLoaderData }) {
  const { document, frame } = loaderData;
  return <BuyFlow locale={document.locale} frame={frame} productHref={dossierPath(document.locale, document.ticker!)} />;
}
