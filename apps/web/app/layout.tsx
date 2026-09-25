import { headers } from "next/headers";
import Link from "next/link";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { localeFromRequestHeader, localizedPath } from "@/lib/i18n/config";
import { messagesFor } from "@/lib/i18n/messages";
import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = headers();
  const locale = localeFromRequestHeader(requestHeaders.get("x-benten-locale"));
  const pathname = requestHeaders.get("x-benten-pathname") ?? "/";
  const copy = messagesFor(locale);
  const home = localizedPath(locale, "/") ?? "/";

  return <html lang={locale}><body><header className="site-header"><div className="container site-header__inner"><Link className="wordmark" href={home}>Benten</Link><p>{copy.metadata.description}</p><nav className="desktop-nav" aria-label={copy.navigation.primary}><a href={`${home}#how-it-works`}>{copy.navigation.howItWorks}</a><a href={`${home}#registry`}>{copy.navigation.registry}</a><a href={`${home}#provider-references`}>{copy.providers.nav}</a></nav><LocaleSwitcher locale={locale} pathname={pathname} navigation /><details className="mobile-nav"><summary>{copy.navigation.mobileMenu}</summary><nav className="mobile-nav__panel" aria-label={copy.navigation.mobile}><a href={`${home}#how-it-works`}>{copy.navigation.howItWorks}</a><a href={`${home}#registry`}>{copy.navigation.registry}</a><a href={`${home}#provider-references`}>{copy.providers.nav}</a><LocaleSwitcher locale={locale} pathname={pathname} /></nav></details></div></header><main className="container site-main" id="how-it-works">{children}</main><footer className="site-footer"><div className="container site-footer__inner"><p>{copy.footer.disclaimer}</p><p>{copy.footer.walletUnavailable}</p></div></footer></body></html>;
}
