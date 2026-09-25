import { BackLink } from "@/components/back-link";
import { companyMessagesFor } from "@/i18n/company-messages";
import { companiesPath, homePath, type PublicWebLocale } from "@/i18n/locales";
import { referenceMessagesFor } from "@/i18n/messages";
import type { NotFoundScope } from "@/lib/not-found";

/** Where each scope's reader most likely wanted to go: the list the missing page would have belonged to. */
function backPath(scope: NotFoundScope, locale: PublicWebLocale): string {
  return scope === "page" ? homePath(locale) : companiesPath(locale);
}

/** The body of a not-found document. The host serves it with status 404; the wording names no ticker or record. */
export function NotFoundPage({ scope, locale }: { scope: NotFoundScope; locale: PublicWebLocale }) {
  const copy = referenceMessagesFor(locale).notFound;
  const directory = companyMessagesFor(locale).notFound;
  return (
    <div data-reference-page="not-found" data-not-found-scope={scope} className="flex max-w-prose flex-col gap-3">
      <h1 className="text-3xl font-semibold tracking-tight">{copy.title}</h1>
      <p className="text-muted-foreground">{scope === "company" ? directory.company : copy.body[scope]}</p>
      <BackLink href={backPath(scope, locale)}>{scope === "page" ? copy.back.page : directory.back}</BackLink>
    </div>
  );
}
