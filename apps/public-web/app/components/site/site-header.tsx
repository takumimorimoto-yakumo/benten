import { Link } from "react-router";
import { PageContainer } from "@/components/page-container";
import { AppNav } from "@/components/site/app-nav";
import { BackButton } from "@/components/site/back-button";
import { LanguageSwitcher } from "@/components/site/language-switcher";
import { ThemeMenu } from "@/components/site/theme-menu";
import { appIconPath, FAVICONS } from "@/features/pwa/pwa-config";
import { WalletMenu } from "@/features/wallet-session/wallet-menu";
import { homePath, type PublicPage, type PublicWebLocale } from "@/i18n/locales";
import { shellMessagesFor } from "@/i18n/shell-messages";

/**
 * The app header (app IA section 3.2): back (detail pages only), the Benten
 * mark and name, the tabs from `md`, language, the theme and the wallet.
 * Below `md` it stays at the top of the viewport under the top safe area;
 * the tabs move to the bottom tab bar (after the page in the DOM, so focus
 * goes header, page, tabs), and the mark, language, theme and wallet show
 * their icons only (the home link keeps its name in `aria-label`). The left group
 * may shrink; the controls never do, so nothing overlaps at 390px or at
 * 200% text.
 */
export function SiteHeader({ locale, page, parentHref }: { locale: PublicWebLocale; page: PublicPage; parentHref?: string }) {
  const copy = shellMessagesFor(locale).nav;
  return (
    <header data-app-header="" className="border-b bg-background pt-(--safe-area-top) max-md:sticky max-md:top-0 max-md:z-40">
      <PageContainer className="flex h-(--app-header-height) items-center gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {parentHref ? <BackButton parentHref={parentHref} label={copy.back} /> : null}
          <Link
            to={homePath(locale)}
            aria-label={copy.home}
            data-app-home=""
            className="flex min-h-(--app-header-control-size) min-w-(--app-header-control-size) shrink items-center justify-center gap-2 text-lg font-semibold tracking-tight md:min-h-8 md:min-w-8"
          >
            {/* The mark follows the app theme (the `dark:` variant), not the tab strip: it sits on the app's own background. Transparent, no ground fill, so no corner radius to clip. */}
            <img src={appIconPath(FAVICONS.light)} alt="" className="size-(--app-header-mark-size) shrink-0 dark:hidden" />
            <img src={appIconPath(FAVICONS.dark)} alt="" className="hidden size-(--app-header-mark-size) shrink-0 dark:block" />
            <span className="min-w-0 truncate max-md:hidden">Benten</span>
          </Link>
        </div>
        <AppNav locale={locale} page={page} placement="header" />
        <div className="ms-auto flex shrink-0 items-center gap-1">
          <LanguageSwitcher locale={locale} page={page} />
          <ThemeMenu locale={locale} />
          <WalletMenu locale={locale} variant="header" />
        </div>
      </PageContainer>
    </header>
  );
}
