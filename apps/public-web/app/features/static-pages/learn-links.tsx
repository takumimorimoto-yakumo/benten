import { NoteLink } from "@/components/note-link";
import type { ProductProvider } from "@/features/references/company-view";
import { learnPath, type LearnTopic, type PublicWebLocale } from "@/i18n/locales";
import { pagesNavMessagesFor, pageTextOf, type PageText } from "@/i18n/pages-nav-messages";

/** The learn topic that explains what a provider's product gives the holder (app IA section 4.1). */
export const PROVIDER_LEARN_TOPIC = { xstocks: "xstocks", prestocks: "prestocks" } as const satisfies Record<ProductProvider, LearnTopic>;

/**
 * A topic title that names the Pyth reference price is the fixed term of app
 * IA section 7.2, so it carries that term's mark (section 7.3).
 */
function vocabularyMark(title: PageText): Readonly<Record<`data-${string}`, string>> {
  return typeof title !== "string" && title.vocabulary.includes("price") ? { "data-term": "pyth-reference-price" } : {};
}

/** One link to a learn topic, labelled with the topic's title from the footer catalog. */
export function LearnLink({ topic, locale }: { topic: LearnTopic; locale: PublicWebLocale }) {
  const title = pagesNavMessagesFor(locale).topics[topic];
  return <NoteLink href={learnPath(locale, topic)} data-learn-link={topic} {...vocabularyMark(title)}>{pageTextOf(title)}</NoteLink>;
}

/** A labelled list of learn topics (Explore's "New here?" links, app IA section 4.2). */
export function LearnLinks({ id, topics, locale }: { id: string; topics: readonly LearnTopic[]; locale: PublicWebLocale }) {
  return (
    <nav aria-labelledby={id} data-learn-links="" className="flex flex-col gap-1">
      <h2 id={id} className="text-sm font-medium">{pagesNavMessagesFor(locale).aside.learn}</h2>
      <ul className="flex flex-col md:gap-1">
        {topics.map((topic) => <li key={topic}><LearnLink topic={topic} locale={locale} /></li>)}
      </ul>
    </nav>
  );
}
