import { data, type LoaderFunctionArgs, type MetaArgs } from "react-router";
import { SiteShell } from "@/components/site/site-shell";
import { ActivityPage } from "@/features/activity/activity-page";
import { messagesFor } from "@/i18n/messages";
import { shellMessagesFor } from "@/i18n/shell-messages";
import { createActivityCatalog } from "../lib/portfolio-catalog.server.js";
import { createStaticFoundationDocument } from "../lib/static-document.server.js";

export function loader({ params, request }: LoaderFunctionArgs) {
  const document = createStaticFoundationDocument({ locale: params.locale, pathname: new URL(request.url).pathname, route: "activity" });
  return data({ document, catalog: createActivityCatalog(document.locale) });
}

type LoaderData = Awaited<ReturnType<typeof loader>>["data"];

/** A tab of the connected app, private to the browser: not for search engines. */
export function meta({ loaderData }: MetaArgs<typeof loader>) {
  const { document } = loaderData as LoaderData;
  const copy = shellMessagesFor(document.locale).activity;
  return [
    { title: `${copy.title} | ${messagesFor(document.locale).metadata.title}` },
    { name: "description", content: copy.description },
    { name: "robots", content: "noindex" },
  ];
}

export default function ActivityRoute({ loaderData }: { loaderData: LoaderData }) {
  const { document, catalog } = loaderData;
  return (
    <SiteShell locale={document.locale} page={{ kind: "activity" }}>
      <div data-capsule="static-activity">
        <ActivityPage locale={document.locale} catalog={catalog} />
      </div>
    </SiteShell>
  );
}
