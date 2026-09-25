/**
 * The three top-level destinations of the app shell (app IA section 3.1).
 * Buying is a task entered from a product, not a tab. Every detail page
 * (company, product, provider instrument) sits under Explore, so Explore
 * stays current on those pages.
 */
import { activityPath, holdingsPath, homePath, PUBLIC_WEB_LOCALES, type PublicPage, type PublicWebLocale } from "@/i18n/locales";

export const APP_TABS = ["explore", "holdings", "activity"] as const;
export type AppTab = (typeof APP_TABS)[number];

export function tabPath(locale: PublicWebLocale, tab: AppTab): string {
  switch (tab) {
    case "explore":
      return homePath(locale);
    case "holdings":
      return holdingsPath(locale);
    case "activity":
      return activityPath(locale);
  }
}

/** The tab a page belongs to; a not-found body belongs to none. */
export function tabOf(page: PublicPage): AppTab | null {
  switch (page.kind) {
    case "home":
    case "dossier":
    case "provider":
    case "company":
    case "companies":
    case "stock-evidence":
    case "provider-evidence":
    case "buy":
    case "sell":
    case "about":
    case "learn":
    case "legal":
      return "explore";
    case "holdings":
      return "holdings";
    case "activity":
      return "activity";
    case "not-found":
      return null;
  }
}

/** Tab roots keep one scroll position per path within the visit, so returning by the tab restores it. */
export function isTabRootPath(pathname: string): boolean {
  return PUBLIC_WEB_LOCALES.some((locale) => APP_TABS.some((tab) => tabPath(locale, tab) === pathname));
}
