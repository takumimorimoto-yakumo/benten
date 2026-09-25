import { portfolioMessagesFor } from "@/i18n/holdings-messages";
import type { PublicWebLocale } from "@/i18n/locales";
import { pagesMessagesFor, type PageLabels, type PagesCopy } from "@/i18n/pages-messages";
import { shellMessagesFor } from "@/i18n/shell-messages";
import { PAGE_FACTS } from "./static-page-config";

/** Labels other screens own, repeated on the pages exactly as those screens show them. */
export function pageLabelsFor(locale: PublicWebLocale): PageLabels {
  const activity = portfolioMessagesFor(locale).activity;
  return {
    clearHistory: activity.clear,
    checkAgain: activity.checkAgain,
    disconnect: shellMessagesFor(locale).wallet.disconnect,
  };
}

/** The static pages' copy in one locale, with the stated facts and borrowed labels filled in. */
export function staticPagesCopyFor(locale: PublicWebLocale): PagesCopy {
  return pagesMessagesFor(locale, PAGE_FACTS, pageLabelsFor(locale));
}
