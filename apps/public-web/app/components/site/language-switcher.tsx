import { ChevronDownIcon, LanguagesIcon } from "lucide-react";
import { Link } from "react-router";
import { HEADER_MENU_BUTTON_CLASS, HeaderDisclosure } from "@/components/site/header-disclosure";
import { buttonVariants } from "@/components/ui/button";
import { LOCALE_LABELS, messagesFor } from "@/i18n/messages";
import { PUBLIC_WEB_LOCALES, pagePath, type PublicPage, type PublicWebLocale } from "@/i18n/locales";
import { LOCALE_SHORT_LABELS } from "@/i18n/shell-messages";
import { cn } from "@/lib/utils";

/**
 * A compact language button showing the current locale (below `md` the icon
 * alone), opening the list of the same page in every locale (app IA section
 * 3.2). Every target is a
 * prerendered canonical path; the list works without JavaScript. After
 * hydration a choice closes the list: another locale is a page change, after
 * which focus goes to the new page's heading (route focus, app IA section
 * 3.3); the current locale keeps the page and returns focus to the button.
 */
export function LanguageSwitcher({ locale, page }: { locale: PublicWebLocale; page: PublicPage }) {
  const copy = messagesFor(locale).site;
  return (
    <HeaderDisclosure
      data-language-menu=""
      summaryClassName={cn(buttonVariants({ variant: "ghost" }), HEADER_MENU_BUTTON_CLASS)}
      summary={
        <>
          <LanguagesIcon aria-hidden="true" />
          <span aria-hidden="true" className="max-md:hidden">{LOCALE_SHORT_LABELS[locale]}</span>
          <span className="sr-only">{`${copy.language}: ${LOCALE_LABELS[locale]}`}</span>
          <ChevronDownIcon aria-hidden="true" className="text-muted-foreground max-md:hidden" />
        </>
      }
    >
      {(close) => (
        <nav aria-label={copy.language}>
          <ul className="flex flex-col">
            {PUBLIC_WEB_LOCALES.map((candidate) => {
              const label = LOCALE_LABELS[candidate];
              const current = candidate === locale;
              return (
                <li key={candidate}>
                  <Link
                    to={pagePath(candidate, page)}
                    hrefLang={candidate}
                    lang={candidate}
                    aria-current={current ? "page" : undefined}
                    onClick={close}
                    className="flex min-h-(--touch-target-min) items-center rounded-md px-2 text-sm hover:bg-accent aria-[current=page]:font-medium md:min-h-8"
                  >
                    {label}
                    {current ? <span className="sr-only"> ({copy.currentLanguage(label)})</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </HeaderDisclosure>
  );
}
