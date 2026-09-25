import { Badge } from "@/components/ui/badge";
import { PageContainer } from "@/components/page-container";
import { messagesFor } from "@/i18n/messages";
import { aboutPath, LEARN_TOPICS, learnPath, LEGAL_DOCUMENTS, legalPath, type PublicWebLocale } from "@/i18n/locales";
import { pagesNavMessagesFor, pageTextOf } from "@/i18n/pages-nav-messages";

/** Links to About, the learn topics and the legal documents (app IA section 3.2), in three labelled groups. */
function FooterPageLinks({ locale }: { locale: PublicWebLocale }) {
  const nav = pagesNavMessagesFor(locale);
  const groups = [
    { key: "about", heading: nav.footer.about, links: [{ href: aboutPath(locale), label: nav.footer.label }] },
    { key: "learn", heading: nav.footer.learn, links: LEARN_TOPICS.map((topic) => ({ href: learnPath(locale, topic), label: pageTextOf(nav.topics[topic]) })) },
    { key: "legal", heading: nav.footer.legal, links: LEGAL_DOCUMENTS.map((document) => ({ href: legalPath(locale, document), label: nav.documents[document] })) },
  ];
  return (
    <nav aria-label={nav.footer.navLabel} data-footer-pages="" className="grid gap-6 border-b py-8 text-sm sm:grid-cols-3">
      {groups.map((group) => (
        <div key={group.key} className="flex flex-col gap-2">
          <h2 className="font-medium">{group.heading}</h2>
          <ul className="flex flex-col">
            {group.links.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="inline-flex min-h-(--touch-target-min) items-center text-muted-foreground underline-offset-4 hover:text-foreground hover:underline md:min-h-0 md:py-1">{link.label}</a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/**
 * The disclaimer shown on every page, and the release state: this runtime is
 * not a reviewed public release (moved out of the header, app IA section 3.2).
 */
export function SiteFooter({ locale }: { locale: PublicWebLocale }) {
  const copy = messagesFor(locale);
  return (
    <footer className="mt-12 border-t">
      <PageContainer>
        <FooterPageLinks locale={locale} />
        <section id="disclaimer" aria-labelledby="disclaimer-heading" className="flex max-w-prose flex-col gap-2 py-8 text-sm text-muted-foreground">
          <h2 id="disclaimer-heading" className="font-medium text-foreground">{copy.site.disclaimer}</h2>
          <p>{copy.footer.disclaimer}</p>
          <p>{copy.footer.walletNotice}</p>
          <p><Badge variant="outline">{copy.site.preview}</Badge></p>
        </section>
      </PageContainer>
    </footer>
  );
}
