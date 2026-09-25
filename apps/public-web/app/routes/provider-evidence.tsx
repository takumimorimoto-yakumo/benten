import { data, type LoaderFunctionArgs, type MetaArgs } from "react-router";
import { SiteShell } from "@/components/site/site-shell";
import { ProviderEvidencePage } from "@/features/evidence/evidence-pages";
import { providerPath } from "@/i18n/locales";
import { messagesFor } from "@/i18n/messages";
import { productMessagesFor } from "@/i18n/product-messages";
import { createProductSubpageDocument } from "../lib/product.server.js";
import { createProviderView } from "../lib/provider.server.js";

export function loader({ params, request }: LoaderFunctionArgs) {
  const document = createProductSubpageDocument({ locale: params.locale, pathname: new URL(request.url).pathname, subpage: "evidence", provider: params.provider, providerAssetId: params.id });
  return data({ document, view: createProviderView(document.provider!, document.providerAssetId!) });
}

type ProviderEvidenceLoaderData = Awaited<ReturnType<typeof loader>>["data"];

export function meta({ loaderData }: MetaArgs<typeof loader>) {
  const { document, view } = loaderData as ProviderEvidenceLoaderData;
  const copy = productMessagesFor(document.locale).evidence.metadata;
  return [
    { title: `${copy.title(view.symbol)} | ${messagesFor(document.locale).metadata.title}` },
    { name: "description", content: copy.description(view.symbol) },
  ];
}

export default function ProviderEvidence({ loaderData }: { loaderData: ProviderEvidenceLoaderData }) {
  const { document, view } = loaderData;
  return (
    // Logical parent (app IA section 3.3): the instrument's product page.
    <SiteShell locale={document.locale} page={{ kind: "provider-evidence", provider: view.provider, id: view.providerAssetId }} parentHref={providerPath(document.locale, view.provider, view.providerAssetId)}>
      <div data-capsule="static-provider-evidence">
        <ProviderEvidencePage view={view} locale={document.locale} />
      </div>
    </SiteShell>
  );
}
