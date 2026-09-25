import { data, type LoaderFunctionArgs, type MetaArgs } from "react-router";
import { SiteShell } from "@/components/site/site-shell";
import { CompanyPage } from "@/features/references/company-page";
import { homePath } from "@/i18n/locales";
import { companyMessagesFor } from "@/i18n/company-messages";
import { messagesFor } from "@/i18n/messages";
import { companyChartData } from "../lib/chart.server.js";
import { createCompanyView } from "../lib/company.server.js";
import { companyStatementsSource } from "../lib/statements.server.js";
import { createStaticFoundationDocument } from "../lib/static-document.server.js";

export function loader({ params, request }: LoaderFunctionArgs) {
  const document = createStaticFoundationDocument({
    locale: params.locale,
    pathname: new URL(request.url).pathname,
    route: "company",
    slug: params.slug,
  });
  // The document validated the slug against the published company list, so it is exact here.
  const view = createCompanyView(document.slug!);
  return data({ document, view, chart: companyChartData(view), statements: companyStatementsSource(view) });
}

type CompanyLoaderData = Awaited<ReturnType<typeof loader>>["data"];

export function meta({ loaderData }: MetaArgs<typeof loader>) {
  const { document, view } = loaderData as CompanyLoaderData;
  const copy = companyMessagesFor(document.locale).company;
  return [
    { title: `${copy.title(view.displayName)} | ${messagesFor(document.locale).metadata.title}` },
    { name: "description", content: copy.description(view.displayName) },
  ];
}

export default function Company({ loaderData }: { loaderData: CompanyLoaderData }) {
  const { document, view, chart, statements } = loaderData;
  return (
    <SiteShell locale={document.locale} page={{ kind: "company", slug: view.slug }} parentHref={homePath(document.locale)}>
      <div data-capsule="static-company">
        <CompanyPage view={view} chart={chart} statements={statements} locale={document.locale} />
      </div>
    </SiteShell>
  );
}
