import { data, type LoaderFunctionArgs, type MetaArgs } from "react-router";
import { SiteShell } from "@/components/site/site-shell";
import { LearnPage } from "@/features/static-pages/static-pages";
import { staticPagesCopyFor } from "@/features/static-pages/static-page-copy";
import { homePath } from "@/i18n/locales";
import { messagesFor } from "@/i18n/messages";
import { createStaticPageDocument } from "../lib/static-page.server.js";

export function loader({ params, request }: LoaderFunctionArgs) {
  return data({ document: createStaticPageDocument({ locale: params.locale, pathname: new URL(request.url).pathname, page: "learn", topic: params.topic }) });
}

type LoaderData = Awaited<ReturnType<typeof loader>>["data"];
type LearnPageDocument = Extract<LoaderData["document"], { page: "learn" }>;

function learnDocument(loaderData: LoaderData): LearnPageDocument {
  const { document } = loaderData;
  if (document.page !== "learn") throw new Error("learn route received another page");
  return document;
}

export function meta({ loaderData }: MetaArgs<typeof loader>) {
  const { locale, topic } = learnDocument(loaderData as LoaderData);
  const copy = staticPagesCopyFor(locale).learn[topic];
  return [{ title: `${copy.title} | ${messagesFor(locale).metadata.title}` }, { name: "description", content: copy.description }];
}

export default function Learn({ loaderData }: { loaderData: LoaderData }) {
  const { locale, topic } = learnDocument(loaderData);
  return (
    // Logical parent (app IA section 3.3): Explore.
    <SiteShell locale={locale} page={{ kind: "learn", topic }} parentHref={homePath(locale)}>
      <div data-capsule="static-learn">
        <LearnPage locale={locale} topic={topic} />
      </div>
    </SiteShell>
  );
}
