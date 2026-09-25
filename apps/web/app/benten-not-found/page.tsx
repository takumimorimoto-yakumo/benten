import Link from "next/link";
import { headers } from "next/headers";
import { localeFromRequestHeader, localizedPath } from "@/lib/i18n/config";
import { metadataFor } from "@/lib/i18n/metadata";
import { messagesFor } from "@/lib/i18n/messages";

export function generateMetadata() {
  return metadataFor(localeFromRequestHeader(headers().get("x-benten-locale")));
}

export default function MiddlewareNotFoundPage() {
  const requestHeaders = headers();
  const locale = localeFromRequestHeader(requestHeaders.get("x-benten-locale"));
  const copy = messagesFor(locale).notFound;
  return <><h1 className="page-title">{copy.heading}</h1><p className="page-lede">{copy.body}</p><p><Link href={localizedPath(locale, "/") ?? "/"}>← {copy.back}</Link></p></>;
}
