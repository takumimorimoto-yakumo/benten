import { data, Outlet, useMatches, type LoaderFunctionArgs, type MetaArgs } from "react-router";
import { SiteShell } from "@/components/site/site-shell";
import { StockProductPage } from "@/features/product/stock-product-page";
import { companiesPath, companyPath } from "@/i18n/locales";
import { messagesFor } from "@/i18n/messages";
import { productMessagesFor } from "@/i18n/product-messages";
import { xStockChartData } from "../lib/chart.server.js";
import { createStockProductView } from "../lib/product.server.js";
import { createStaticFoundationDocument } from "../lib/static-document.server.js";

/** The children of this route: the buy flow (app IA section 5.1) and the sell flow. */
const FLOW_SUFFIXES = ["/buy", "/sell"] as const;

export function loader({ params, request }: LoaderFunctionArgs) {
  const pathname = new URL(request.url).pathname;
  // The product page also renders under its buy flow child; the product's own document is the path without it.
  const suffix = FLOW_SUFFIXES.find((candidate) => pathname.endsWith(candidate));
  const productPathname = suffix ? pathname.slice(0, -suffix.length) : pathname;
  const document = createStaticFoundationDocument({
    locale: params.locale,
    pathname: productPathname,
    route: "dossier",
    ticker: params.ticker,
  });
  // The document validated the ticker against the allowlist, so it is canonical here.
  const view = createStockProductView(document.ticker!, document.locale);
  return data({ document, view, chart: xStockChartData(view.identity, { figures: false }) });
}

type DossierLoaderData = Awaited<ReturnType<typeof loader>>["data"];

export function meta({ loaderData }: MetaArgs<typeof loader>) {
  const { document, view } = loaderData as DossierLoaderData;
  const copy = messagesFor(document.locale).metadata;
  return [
    { title: `${view.identity.symbol} | ${copy.title}` },
    { name: "description", content: productMessagesFor(document.locale).product.metadata.description(view.identity.symbol, view.identity.tokenName) },
  ];
}

/** Whether the buy flow (a child route marked with `handle.buyFlow`) is open over this page. */
function useBuyFlowOpen(): boolean {
  return useMatches().some((match) => (match.handle as { buyFlow?: unknown } | undefined)?.buyFlow === true);
}

export default function Dossier({ loaderData }: { loaderData: DossierLoaderData }) {
  const { document, view, chart } = loaderData;
  const buyOpen = useBuyFlowOpen();
  return (
    <>
      {/* While the buy flow is open the page behind it is inert: not focusable, not clickable, not read. */}
      <div className="contents" inert={buyOpen}>
        {/* Logical parent (app IA section 3.3): the company page when one is published, otherwise the companies list (funds, and tokens no company is linked to). */}
        <SiteShell locale={document.locale} page={{ kind: "dossier", ticker: view.identity.ticker }} parentHref={view.company ? companyPath(document.locale, view.company.slug) : companiesPath(document.locale)}>
          <div data-capsule="static-dossier">
            <StockProductPage view={view} chart={chart} locale={document.locale} />
          </div>
        </SiteShell>
      </div>
      <Outlet />
    </>
  );
}
