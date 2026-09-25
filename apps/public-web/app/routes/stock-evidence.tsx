import { data, type LoaderFunctionArgs, type MetaArgs } from "react-router";
import { SiteShell } from "@/components/site/site-shell";
import { StockEvidencePage } from "@/features/evidence/evidence-pages";
import { dossierPath } from "@/i18n/locales";
import { messagesFor } from "@/i18n/messages";
import { productMessagesFor } from "@/i18n/product-messages";
import { createDossierView } from "../lib/dossier.server.js";
import { createProductSubpageDocument } from "../lib/product.server.js";
import { statementsSource } from "../lib/statements.server.js";

export function loader({ params, request }: LoaderFunctionArgs) {
  const document = createProductSubpageDocument({ locale: params.locale, pathname: new URL(request.url).pathname, subpage: "evidence", ticker: params.ticker });
  const view = createDossierView(document.ticker!);
  const statements = statementsSource(document.ticker!, { years: "all" });
  // With the statements, the annual history comes from the statements file; the five-fact history is not sent.
  return data({ document, view: statements ? { ...view, annual: null } : view, statements });
}

type StockEvidenceLoaderData = Awaited<ReturnType<typeof loader>>["data"];

export function meta({ loaderData }: MetaArgs<typeof loader>) {
  const { document, view } = loaderData as StockEvidenceLoaderData;
  const copy = productMessagesFor(document.locale).evidence.metadata;
  return [
    { title: `${copy.title(view.identity.symbol)} | ${messagesFor(document.locale).metadata.title}` },
    { name: "description", content: copy.description(view.identity.symbol) },
  ];
}

export default function StockEvidence({ loaderData }: { loaderData: StockEvidenceLoaderData }) {
  const { document, view, statements } = loaderData;
  return (
    // Logical parent (app IA section 3.3): the product page.
    <SiteShell locale={document.locale} page={{ kind: "stock-evidence", ticker: view.identity.ticker }} parentHref={dossierPath(document.locale, view.identity.ticker)}>
      <div data-capsule="static-stock-evidence">
        <StockEvidencePage view={view} statements={statements} locale={document.locale} />
      </div>
    </SiteShell>
  );
}
