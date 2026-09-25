import type { ReactNode } from "react";
import { ExternalLink } from "@/components/external-link";
import { NoteLink } from "@/components/note-link";
import { aboutPath, learnPath, legalPath, type PublicWebLocale } from "@/i18n/locales";
import { referenceMessagesFor } from "@/i18n/messages";
import type { PageLinkTarget, PageSection, PageSourceKey, StaticPageCopy } from "@/i18n/pages-messages";
import { pageTextOf, type PageText } from "@/i18n/pages-nav-messages";
import { cn } from "@/lib/utils";
import { STATIC_PAGE_CONFIG } from "./static-page-config";

/** The address of a page another static page links to. */
export function pageTargetPath(locale: PublicWebLocale, target: PageLinkTarget): string {
  switch (target.kind) {
    case "about":
      return aboutPath(locale);
    case "learn":
      return learnPath(locale, target.topic);
    case "legal":
      return legalPath(locale, target.document);
  }
}

/**
 * One text in its element, with its vocabulary marks as `data-vocabulary`
 * (tests read them; app IA section 7). Unmarked text carries no attribute.
 */
function Text({ as: Tag, text, className }: { as: "p" | "li" | "h1" | "h2"; text: PageText; className?: string }) {
  const vocabulary = typeof text === "string" ? undefined : text.vocabulary.join(" ");
  return <Tag className={className} data-vocabulary={vocabulary}>{pageTextOf(text)}</Tag>;
}

/** The issuer documents a section's statements come from, each opening in a new tab. */
function SectionSources({ sources, locale }: { sources: readonly PageSourceKey[]; locale: PublicWebLocale }) {
  const copy = referenceMessagesFor(locale).provider.sources;
  return (
    <div data-static-citations="" className="flex flex-col gap-1 text-sm">
      <h3 className="font-medium">{copy.heading}</h3>
      <ul className="flex flex-col gap-1">
        {sources.map((key) => (
          <li key={key} data-static-citation={key}>
            <ExternalLink href={STATIC_PAGE_CONFIG.sources[key].url} newTabLabel={copy.opensNewTab} className="max-md:inline-flex max-md:min-h-(--touch-target-min) max-md:items-center">
              {STATIC_PAGE_CONFIG.sources[key].title}
            </ExternalLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Section({ section, locale, extra }: { section: PageSection; locale: PublicWebLocale; extra?: ReactNode }) {
  const headingId = `${section.id}-heading`;
  const List = section.ordered ? "ol" : "ul";
  return (
    <section
      id={section.id}
      aria-labelledby={headingId}
      data-static-section={section.id}
      className={cn("flex scroll-mt-(--anchor-scroll-margin) flex-col gap-3", section.quiet && "rounded-lg bg-muted p-4 md:p-5")}
    >
      <h2 id={headingId} className="text-xl font-semibold tracking-tight" data-vocabulary={typeof section.heading === "string" ? undefined : section.heading.vocabulary.join(" ")}>
        {pageTextOf(section.heading)}
      </h2>
      {section.body?.map((text) => <Text key={pageTextOf(text)} as="p" text={text} />)}
      {extra}
      {section.items ? (
        <List className={cn("flex flex-col gap-2 ps-5", section.ordered ? "list-decimal" : "list-disc", "marker:text-muted-foreground")}>
          {section.items.map((text) => <Text key={pageTextOf(text)} as="li" text={text} className="ps-1" />)}
        </List>
      ) : null}
      {section.after?.map((text) => <Text key={pageTextOf(text)} as="p" text={text} className="text-muted-foreground" />)}
      {section.link ? <NoteLink href={pageTargetPath(locale, section.link.target)}>{section.link.label}</NoteLink> : null}
      {section.sources ? <SectionSources sources={section.sources} locale={locale} /> : null}
    </section>
  );
}

export type SiblingPage = { readonly key: string; readonly label: PageText; readonly href: string; readonly current: boolean };

/**
 * The shared frame of About, the learn topics and the legal documents: title,
 * lead and sections in one reading column, and the list of related pages
 * beside it from `md` up. `extra` renders after the sections,
 * for page-owned slots such as About's source link; `sectionExtras` renders
 * a page-owned slot after the body of the section with that id.
 */
export function StaticPageView({ pageKey, copy, locale, siblingsLabel, siblings, extra, sectionExtras }: {
  pageKey: string;
  copy: StaticPageCopy;
  locale: PublicWebLocale;
  siblingsLabel: string;
  siblings: readonly SiblingPage[];
  extra?: ReactNode;
  sectionExtras?: Readonly<Record<string, ReactNode>>;
}) {
  return (
    <div data-static-page={pageKey} className="grid gap-10 md:grid-cols-[minmax(0,1fr)_auto] md:gap-16">
      <article className="flex max-w-prose flex-col gap-8">
        <header className="flex flex-col gap-3">
          <Text as="h1" text={copy.heading} className="text-3xl font-semibold tracking-tight" />
          {copy.lead.map((text) => <Text key={pageTextOf(text)} as="p" text={text} className="text-lg text-muted-foreground" />)}
        </header>
        {copy.sections.map((section) => <Section key={section.id} section={section} locale={locale} extra={sectionExtras?.[section.id]} />)}
        {extra}
      </article>
      {/* Below md the footer carries the same links, so the side list is not repeated there. */}
      <nav aria-labelledby="static-siblings-heading" className="flex flex-col gap-3 max-md:hidden md:sticky md:top-(--anchor-scroll-margin) md:w-56 md:self-start md:border-s md:ps-6">
        <h2 id="static-siblings-heading" className="text-sm font-medium text-muted-foreground">{siblingsLabel}</h2>
        <ul className="flex flex-col gap-1">
          {siblings.map((sibling) => (
            <li key={sibling.key} data-vocabulary={typeof sibling.label === "string" ? undefined : sibling.label.vocabulary.join(" ")}>
              <a
                href={sibling.href}
                aria-current={sibling.current ? "page" : undefined}
                className="inline-flex items-center py-1.5 text-sm underline-offset-4 hover:underline aria-[current=page]:font-semibold aria-[current=page]:no-underline"
              >
                {pageTextOf(sibling.label)}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
