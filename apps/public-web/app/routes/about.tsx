import { data, type LoaderFunctionArgs, type MetaArgs } from "react-router";
import { SiteShell } from "@/components/site/site-shell";
import { AboutPage } from "@/features/static-pages/static-pages";
import { staticPagesCopyFor } from "@/features/static-pages/static-page-copy";
import { homePath } from "@/i18n/locales";
import { messagesFor } from "@/i18n/messages";
import { createStaticPageDocument } from "../lib/static-page.server.js";

export function loader({ params, request }: LoaderFunctionArgs) {
  return data({ document: createStaticPageDocument({ locale: params.locale, pathname: new URL(request.url).pathname, page: "about" }) });
}

type LoaderData = Awaited<ReturnType<typeof loader>>["data"];

export function meta({ loaderData }: MetaArgs<typeof loader>) {
  const { locale } = (loaderData as LoaderData).document;
  const copy = staticPagesCopyFor(locale).about;
  return [{ title: `${copy.title} | ${messagesFor(locale).metadata.title}` }, { name: "description", content: copy.description }];
}

export default function About({ loaderData }: { loaderData: LoaderData }) {
  const { locale } = loaderData.document;
  return (
    // Logical parent (app IA section 3.3): Explore.
    <SiteShell locale={locale} page={{ kind: "about" }} parentHref={homePath(locale)}>
      <div data-capsule="static-about">
        <AboutPage locale={locale} />
      </div>
    </SiteShell>
  );
}
