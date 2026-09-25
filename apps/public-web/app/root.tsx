import { useEffect } from "react";
import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration, useLocation, useMatches, useRouteError, type Location } from "react-router";
import { ClientNavigation } from "@/features/navigation/client-navigation";
import { isTabRootPath } from "@/features/navigation/app-tabs";
import { RouteFocus } from "@/features/navigation/route-focus";
import { AppSessionProvider } from "@/features/wallet-session/app-session";
import { PwaHead } from "@/features/pwa/pwa-head";
import { themeBootScript } from "@/features/theme/theme-boot";
import { DEFAULT_LOCALE, isPublicWebLocale, type PublicWebLocale } from "@/i18n/locales";
import "./static.css";

/** The document language comes from the matched page's validated route identity. */
function documentLocale(matches: ReturnType<typeof useMatches>): PublicWebLocale {
  for (const match of [...matches].reverse()) {
    const data = match.data as { document?: { locale?: unknown } } | undefined;
    if (isPublicWebLocale(data?.document?.locale)) return data.document.locale;
  }
  return DEFAULT_LOCALE;
}

/**
 * A route opts out of client scripts with `handle = { hydrate: false }`: its
 * prerendered document is served under another URL (a not-found body), so the
 * router must not hydrate it as the page that URL would match.
 */
function hydrates(matches: ReturnType<typeof useMatches>): boolean {
  return !matches.some((match) => (match.handle as { hydrate?: unknown } | undefined)?.hydrate === false);
}

/**
 * Scroll positions: tab roots keep one position per path for the visit, so
 * returning to Explore by its tab restores where the list was; every other
 * page is restored per history entry (Back and Forward).
 */
function scrollKey(location: Location): string {
  return isTabRootPath(location.pathname) ? location.pathname : location.key;
}

/** Built once per server process: the same text in every document. */
const THEME_BOOT_SCRIPT = themeBootScript();

export function Layout({ children }: { children: React.ReactNode }) {
  const matches = useMatches();
  const locale = documentLocale(matches);
  const interactive = hydrates(matches);
  // The theme boot script sets `class`, `style` (color-scheme) and `data-theme-choice` on <html> before
  // hydration, so this one element's own attributes may differ from the prerender.
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        {/* Before the stylesheet, so the chosen theme is on <html> for the first paint. It also runs in documents that do not hydrate. */}
        <script data-theme-boot="" dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        {/* Until the stylesheet applies, the browser's own canvas and controls follow the operating system. */}
        <meta name="color-scheme" content="light dark" />
        {/* viewport-fit=cover lets the header and tab bar pad with the safe-area insets; zoom stays enabled. */}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <Meta />
        <Links />
        <PwaHead locale={locale} />
      </head>
      <body>
        {children}
        {interactive ? <ScrollRestoration getKey={scrollKey} /> : null}
        {interactive ? <Scripts /> : null}
      </body>
    </html>
  );
}

/** Reload guard: one full-document retry per address. */
const RETRY_KEY = "benten:document-retry";

/**
 * The app shell's lasting state sits here, above every page: one wallet
 * session (and, once loaded, the purchase island's runtime), the delegated
 * client-side navigation for plain internal links, and focus on the new
 * page's heading after a navigation.
 */
export default function Root() {
  const { pathname } = useLocation();
  // A page that rendered clears the retry guard, so a later failure at that address may retry again.
  useEffect(() => {
    try {
      window.sessionStorage.removeItem(RETRY_KEY);
    } catch {
      // Storage unavailable: nothing to clear.
    }
  }, [pathname]);
  return (
    <AppSessionProvider>
      <ClientNavigation />
      <RouteFocus />
      <Outlet />
    </AppSessionProvider>
  );
}

/**
 * A client-side navigation the prerendered site cannot serve (for example a
 * path with no prerendered data file) falls back to loading the document
 * itself, once: the host then answers with the right page, redirect or
 * not-found body. A second failure at the same address stops retrying.
 */
export function ErrorBoundary() {
  const error = useRouteError();
  useEffect(() => {
    const target = `${window.location.pathname}${window.location.search}`;
    let retried = false;
    try {
      retried = window.sessionStorage.getItem(RETRY_KEY) === target;
      window.sessionStorage.setItem(RETRY_KEY, target);
    } catch {
      retried = false;
    }
    if (!retried) window.location.reload();
  }, [error]);
  return (
    <main id="main" className="p-6 text-sm">
      <p>{isRouteErrorResponse(error) ? `${error.status}` : null}</p>
      <p><a className="underline underline-offset-4" href="/" data-document-link="">Benten</a></p>
    </main>
  );
}
