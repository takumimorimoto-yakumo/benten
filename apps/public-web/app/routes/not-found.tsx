/**
 * A prerendered not-found body for one locale and scope. The host serves it
 * for an unknown public path, always with status 404, and never under its own
 * address. It is served at the requested URL, so it ships without client
 * scripts (`handle.hydrate`): the router must not hydrate it as another page.
 */
import { data, type LoaderFunctionArgs, type MetaArgs } from "react-router";
import { SiteShell } from "@/components/site/site-shell";
import { NotFoundPage } from "@/features/references/not-found-page";
import { isPublicWebLocale } from "@/i18n/locales";
import { messagesFor, referenceMessagesFor } from "@/i18n/messages";
import { isNotFoundScope, notFoundDocumentPath } from "../lib/not-found.js";

export const handle = { hydrate: false };

export function loader({ params, request }: LoaderFunctionArgs) {
  const { locale, scope } = params;
  if (!isPublicWebLocale(locale) || !isNotFoundScope(scope) || new URL(request.url).pathname !== notFoundDocumentPath(locale, scope)) {
    throw new Error("not-found document has a noncanonical path");
  }
  return data({ document: { kind: "static-not-found-v1" as const, locale, scope } });
}

type NotFoundLoaderData = Awaited<ReturnType<typeof loader>>["data"];

export function meta({ loaderData }: MetaArgs<typeof loader>) {
  const { document } = loaderData as NotFoundLoaderData;
  return [
    { title: `${referenceMessagesFor(document.locale).notFound.title} | ${messagesFor(document.locale).metadata.title}` },
    { name: "robots", content: "noindex" },
  ];
}

export default function NotFound({ loaderData }: { loaderData: NotFoundLoaderData }) {
  const { document } = loaderData;
  return (
    <SiteShell locale={document.locale} page={{ kind: "not-found" }}>
      <NotFoundPage scope={document.scope} locale={document.locale} />
    </SiteShell>
  );
}
