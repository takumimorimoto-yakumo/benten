import { data, type LoaderFunctionArgs, type MetaArgs } from "react-router";
import { SiteShell } from "@/components/site/site-shell";
import { CompaniesPage } from "@/features/explore/companies-page";
import { companyMessagesFor } from "@/i18n/company-messages";
import { homePath } from "@/i18n/locales";
import { messagesFor } from "@/i18n/messages";
import { createCompaniesView } from "../lib/directory.server.js";
import { createStaticFoundationDocument } from "../lib/static-document.server.js";

export function loader({ params, request }: LoaderFunctionArgs) {
  return data({
    document: createStaticFoundationDocument({
      locale: params.locale,
      pathname: new URL(request.url).pathname,
      route: "companies",
    }),
    view: createCompaniesView(),
  });
}

type CompaniesLoaderData = Awaited<ReturnType<typeof loader>>["data"];

export function meta({ loaderData }: MetaArgs<typeof loader>) {
  const { locale } = (loaderData as CompaniesLoaderData).document;
  const copy = companyMessagesFor(locale).companies;
  return [{ title: `${copy.title} | ${messagesFor(locale).metadata.title}` }, { name: "description", content: copy.description }];
}

export default function Companies({ loaderData }: { loaderData: CompaniesLoaderData }) {
  const { document, view } = loaderData;
  return (
    // Logical parent (app IA section 3.3): Explore.
    <SiteShell locale={document.locale} page={{ kind: "companies" }} parentHref={homePath(document.locale)}>
      <div data-capsule="static-companies">
        <CompaniesPage view={view} locale={document.locale} />
      </div>
    </SiteShell>
  );
}
