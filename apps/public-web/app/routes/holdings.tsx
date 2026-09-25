import { data, type LoaderFunctionArgs, type MetaArgs } from "react-router";
import { SiteShell } from "@/components/site/site-shell";
import { HoldingsPage } from "@/features/holdings/holdings-page";
import { messagesFor } from "@/i18n/messages";
import { shellMessagesFor } from "@/i18n/shell-messages";
import { createHoldingsProducts } from "../lib/portfolio-catalog.server.js";
import { createStaticFoundationDocument } from "../lib/static-document.server.js";

export function loader({ params, request }: LoaderFunctionArgs) {
  const document = createStaticFoundationDocument({ locale: params.locale, pathname: new URL(request.url).pathname, route: "holdings" });
  return data({ document, products: createHoldingsProducts(document.locale) });
}

type LoaderData = Awaited<ReturnType<typeof loader>>["data"];

/** A tab of the connected app, private to the browser: not for search engines. */
export function meta({ loaderData }: MetaArgs<typeof loader>) {
  const { document } = loaderData as LoaderData;
  const copy = shellMessagesFor(document.locale).holdings;
  return [
    { title: `${copy.title} | ${messagesFor(document.locale).metadata.title}` },
    { name: "description", content: copy.description },
    { name: "robots", content: "noindex" },
  ];
}

export default function HoldingsRoute({ loaderData }: { loaderData: LoaderData }) {
  const { document, products } = loaderData;
  return (
    <SiteShell locale={document.locale} page={{ kind: "holdings" }}>
      <div data-capsule="static-holdings">
        <HoldingsPage locale={document.locale} products={products} />
      </div>
    </SiteShell>
  );
}
