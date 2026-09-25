import { data, type LoaderFunctionArgs, type MetaArgs } from "react-router";
import { SiteShell } from "@/components/site/site-shell";
import { ExplorePage } from "@/features/explore/explore-page";
import { companyMessagesFor } from "@/i18n/company-messages";
import { messagesFor } from "@/i18n/messages";
import { createExploreView } from "../lib/directory.server.js";
import { createStaticFoundationDocument } from "../lib/static-document.server.js";

export function loader({ params, request }: LoaderFunctionArgs) {
  return data({
    document: createStaticFoundationDocument({
      locale: params.locale,
      pathname: new URL(request.url).pathname,
      route: "home",
    }),
    view: createExploreView(),
  });
}

type HomeLoaderData = Awaited<ReturnType<typeof loader>>["data"];

export function meta({ loaderData }: MetaArgs<typeof loader>) {
  const { locale } = (loaderData as HomeLoaderData).document;
  return [{ title: messagesFor(locale).metadata.title }, { name: "description", content: companyMessagesFor(locale).explore.description }];
}

export default function Home({ loaderData }: { loaderData: HomeLoaderData }) {
  const { document, view } = loaderData;
  return (
    <SiteShell locale={document.locale} page={{ kind: "home" }}>
      <div data-capsule="static-home">
        <ExplorePage view={view} locale={document.locale} />
      </div>
    </SiteShell>
  );
}
