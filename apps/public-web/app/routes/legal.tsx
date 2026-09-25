import { data, type LoaderFunctionArgs, type MetaArgs } from "react-router";
import { SiteShell } from "@/components/site/site-shell";
import { LegalPage } from "@/features/static-pages/static-pages";
import { staticPagesCopyFor } from "@/features/static-pages/static-page-copy";
import { homePath } from "@/i18n/locales";
import { messagesFor } from "@/i18n/messages";
import { createStaticPageDocument } from "../lib/static-page.server.js";

export function loader({ params, request }: LoaderFunctionArgs) {
  return data({ document: createStaticPageDocument({ locale: params.locale, pathname: new URL(request.url).pathname, page: "legal", document: params.document }) });
}

type LoaderData = Awaited<ReturnType<typeof loader>>["data"];
type LegalPageDocument = Extract<LoaderData["document"], { page: "legal" }>;

function legalDocument(loaderData: LoaderData): LegalPageDocument {
  const document = loaderData.document;
  if (document.page !== "legal") throw new Error("legal route received another page");
  return document;
}

export function meta({ loaderData }: MetaArgs<typeof loader>) {
  const { locale, document } = legalDocument(loaderData as LoaderData);
  const copy = staticPagesCopyFor(locale).legal[document];
  return [{ title: `${copy.title} | ${messagesFor(locale).metadata.title}` }, { name: "description", content: copy.description }];
}

export default function Legal({ loaderData }: { loaderData: LoaderData }) {
  const { locale, document } = legalDocument(loaderData);
  return (
    // Logical parent (app IA section 3.3): Explore.
    <SiteShell locale={locale} page={{ kind: "legal", document }} parentHref={homePath(locale)}>
      <div data-capsule="static-legal">
        <LegalPage locale={locale} document={document} />
      </div>
    </SiteShell>
  );
}
