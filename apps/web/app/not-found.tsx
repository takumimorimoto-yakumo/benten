import Link from "next/link";
import { headers } from "next/headers";
import { localeFromRequestHeader, localizedPath } from "@/lib/i18n/config";
import { messagesFor } from "@/lib/i18n/messages";

export default function NotFound() {
  const locale = localeFromRequestHeader(headers().get("x-benten-locale"));
  const copy = messagesFor(locale).notFound;
  return <><h1 className="page-title">{copy.heading}</h1><p className="page-lede">{copy.body}</p><p><Link href={localizedPath(locale, "/") ?? "/"}>← {copy.back}</Link></p></>;
}
