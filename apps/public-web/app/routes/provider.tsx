import { data, type LoaderFunctionArgs, type MetaArgs } from "react-router";
import { SiteShell } from "@/components/site/site-shell";
import { ProviderProductPage } from "@/features/product/provider-product-page";
import { companyPath, homePath } from "@/i18n/locales";
import { messagesFor, referenceMessagesFor } from "@/i18n/messages";
import { providerChartData } from "../lib/chart.server.js";
import { createProviderView } from "../lib/provider.server.js";
import { createStaticFoundationDocument } from "../lib/static-document.server.js";

export function loader({ params, request }: LoaderFunctionArgs) {
  const document = createStaticFoundationDocument({
    locale: params.locale,
    pathname: new URL(request.url).pathname,
    route: "provider",
    provider: params.provider,
    providerAssetId: params.id,
  });
  // The document validated the instrument against the reviewed artifact, so it is exact here.
  const view = createProviderView(document.provider!, document.providerAssetId!);
  return data({ document, view, chart: providerChartData({ provider: view.provider, id: view.providerAssetId, mint: view.mint }) });
}

type ProviderLoaderData = Awaited<ReturnType<typeof loader>>["data"];

export function meta({ loaderData }: MetaArgs<typeof loader>) {
  const { document, view } = loaderData as ProviderLoaderData;
  const messages = messagesFor(document.locale);
  const copy = referenceMessagesFor(document.locale).provider.metadata;
  const provider = messages.home.providers.names[view.provider];
  return [
    { title: `${copy.title(view.symbol, provider)} | ${messages.metadata.title}` },
    { name: "description", content: copy.description(view.displayName, provider) },
  ];
}

export default function Provider({ loaderData }: { loaderData: ProviderLoaderData }) {
  const { document, view, chart } = loaderData;
  return (
    // Logical parent (app IA section 3.3): the instrument's company page, otherwise Explore.
    <SiteShell locale={document.locale} page={{ kind: "provider", provider: view.provider, id: view.providerAssetId }} parentHref={view.company.page ? companyPath(document.locale, view.company.page.slug) : homePath(document.locale)}>
      <div data-capsule="static-provider">
        <ProviderProductPage view={view} chart={chart} locale={document.locale} />
      </div>
    </SiteShell>
  );
}
