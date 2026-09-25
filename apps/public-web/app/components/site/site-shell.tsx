import type { ReactNode } from "react";
import { PageContainer } from "@/components/page-container";
import { AppNav } from "@/components/site/app-nav";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { PurchaseStatusSlot } from "@/features/wallet-session/purchase-status-slot";
import { messagesFor } from "@/i18n/messages";
import type { PublicPage, PublicWebLocale } from "@/i18n/locales";

/**
 * The app shell around every page (app IA section 3.2): header, main
 * landmark, footer and, below `md`, the bottom tab bar (last, matching focus order to what is seen). `parentHref` is the
 * page's logical parent; it is given only on detail pages, which then show
 * the back button. The shell's state (the wallet session) lives above it in
 * the root route, so a page change never resets it.
 */
export function SiteShell({ locale, page, parentHref, children }: { locale: PublicWebLocale; page: PublicPage; parentHref?: string; children: ReactNode }) {
  return (
    <div data-app-shell="" className="flex min-h-svh flex-col ps-(--safe-area-left) pe-(--safe-area-right) max-md:pb-(--app-tab-bar-space)">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:ring-3 focus:ring-ring/50"
      >
        {messagesFor(locale).site.skipToContent}
      </a>
      <SiteHeader locale={locale} page={page} parentHref={parentHref} />
      <PurchaseStatusSlot locale={locale} />
      <main id="main" className="flex-1">
        <PageContainer className="py-6 md:py-8">{children}</PageContainer>
      </main>
      <SiteFooter locale={locale} />
      {/* Below md the tabs are the bottom tab bar: last in the DOM, so focus reaches them after the page. */}
      <AppNav locale={locale} page={page} placement="bar" />
    </div>
  );
}
