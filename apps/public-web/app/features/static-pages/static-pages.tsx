import { NoteLink } from "@/components/note-link";
import { LEARN_TOPICS, learnPath, LEGAL_DOCUMENTS, legalPath, type LearnTopic, type LegalDocument, type PublicWebLocale } from "@/i18n/locales";
import { pagesNavMessagesFor } from "@/i18n/pages-nav-messages";
import { McpAddress } from "./mcp-address";
import { STATIC_PAGE_CONFIG } from "./static-page-config";
import { staticPagesCopyFor } from "./static-page-copy";
import { StaticPageView, type SiblingPage } from "./static-page-view";

function learnSiblings(locale: PublicWebLocale, current: LearnTopic | null): SiblingPage[] {
  const nav = pagesNavMessagesFor(locale);
  return LEARN_TOPICS.map((topic) => ({ key: topic, label: nav.topics[topic], href: learnPath(locale, topic), current: topic === current }));
}

/** `/about` (app IA section 4.1): what Benten is, what it never does, its sources, how to connect a chat app and its license. */
export function AboutPage({ locale }: { locale: PublicWebLocale }) {
  const copy = staticPagesCopyFor(locale).about;
  const source = STATIC_PAGE_CONFIG.sourceRepositoryUrl;
  return (
    <StaticPageView
      pageKey="about"
      copy={copy}
      locale={locale}
      siblingsLabel={pagesNavMessagesFor(locale).aside.learn}
      siblings={learnSiblings(locale, null)}
      // The source repository link: absent until STATIC_PAGE_CONFIG.sourceRepositoryUrl is set.
      extra={source ? <NoteLink href={source} data-static-source="">{copy.sourceCode}</NoteLink> : null}
      // The remote MCP endpoint's address, in the section that explains how to add it to a chat app.
      sectionExtras={{ connect: <McpAddress label={copy.mcpAddress} /> }}
    />
  );
}

/** `/learn/{topic}` (app IA section 4.1): a short, factual explainer. */
export function LearnPage({ locale, topic }: { locale: PublicWebLocale; topic: LearnTopic }) {
  return (
    <StaticPageView
      pageKey={`learn-${topic}`}
      copy={staticPagesCopyFor(locale).learn[topic]}
      locale={locale}
      siblingsLabel={pagesNavMessagesFor(locale).aside.learn}
      siblings={learnSiblings(locale, topic)}
    />
  );
}

/** `/legal/{document}` (app IA sections 4.1 and 8.12). */
export function LegalPage({ locale, document }: { locale: PublicWebLocale; document: LegalDocument }) {
  const nav = pagesNavMessagesFor(locale);
  return (
    <StaticPageView
      pageKey={`legal-${document}`}
      copy={staticPagesCopyFor(locale).legal[document]}
      locale={locale}
      siblingsLabel={nav.aside.legal}
      siblings={LEGAL_DOCUMENTS.map((key) => ({ key, label: nav.documents[key], href: legalPath(locale, key), current: key === document }))}
    />
  );
}
