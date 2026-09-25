import type { ReactNode } from "react";
import { NoteLink } from "@/components/note-link";
import { companyMessagesFor } from "@/i18n/company-messages";
import { formatList, formatNumber } from "@/i18n/format";
import { companiesPath, type LearnTopic, type PublicWebLocale } from "@/i18n/locales";
import { LearnLinks } from "@/features/static-pages/learn-links";
import { DirectoryGroupLinks } from "./directory-group-links";
import { CompanyRowLink, RowList } from "./directory-rows";
import type { DirectoryGroup, ExploreView } from "./directory-view";
import { ExploreSearch } from "./explore-search";

/** The terms a newcomer meets first on Explore (app IA section 4.2, "New here?"). */
const EXPLORE_LEARN_TOPICS = ["xstocks", "prestocks", "reference-prices"] as const satisfies readonly LearnTopic[];

/** A group of Explore: heading with its count, the A-to-Z note, then its rows or line. */
function ExploreGroup({ group, count, locale, children }: { group: DirectoryGroup; count: number; locale: PublicWebLocale; children: ReactNode }) {
  const copy = companyMessagesFor(locale).groups;
  return (
    <section aria-labelledby={`explore-${group}-heading`} data-explore-group={group} className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h2 id={`explore-${group}-heading`} className="text-xl font-semibold tracking-tight">{copy.heading[group](formatNumber(count, locale))}</h2>
        {group === "funds" ? null : <p className="text-sm text-muted-foreground">{copy.order}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * Explore (app IA section 4.2): the heading, search, and the one-line
 * statement of what Benten can buy; then private companies (all of them,
 * first because broker apps do not offer them), the first US-listed companies
 * A to Z with a link to the rest, and one line for funds and other xStocks.
 * No row shows a price, and no company is highlighted.
 */
export function ExplorePage({ view, locale }: { view: ExploreView; locale: PublicWebLocale }) {
  const copy = companyMessagesFor(locale);
  const all = companiesPath(locale);
  return (
    <div data-explore="" className="flex flex-col gap-10">
      <section aria-labelledby="explore-heading" className="grid gap-5 lg:grid-cols-(--explore-intro-columns) lg:items-start lg:gap-10">
        <div className="flex min-w-0 flex-col gap-5">
          <h1 id="explore-heading" className="max-w-(--explore-heading-max-width) text-2xl font-semibold tracking-tight text-balance md:text-4xl">{copy.explore.heading}</h1>
          <ExploreSearch locale={locale} labels={view.suggestions} />
        </div>
        <div className="flex min-w-0 flex-col gap-4 lg:pb-1">
          {view.buyable ? (
            <p data-term="buy-in-benten" data-explore-capability="" className="max-w-prose text-muted-foreground">{copy.explore.capability(view.buyable.symbol, view.buyable.name)}</p>
          ) : (
            <p data-explore-capability="" className="max-w-prose text-muted-foreground">{copy.explore.noBuyable}</p>
          )}
          <DirectoryGroupLinks counts={{ private: view.private.count, "us-listed": view.usListed.count, funds: view.funds.count }} selected={null} label={copy.companies.heading} locale={locale} />
          {/* After the group links, so the first mobile screen still reaches the three groups (J1). */}
          <LearnLinks id="explore-learn-heading" topics={EXPLORE_LEARN_TOPICS} locale={locale} />
        </div>
      </section>
      <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
        <ExploreGroup group="private" count={view.private.count} locale={locale}>
          <RowList>{view.private.rows.map((row) => <li key={row.slug}><CompanyRowLink row={row} locale={locale} /></li>)}</RowList>
        </ExploreGroup>
        <ExploreGroup group="us-listed" count={view.usListed.count} locale={locale}>
          <RowList>{view.usListed.rows.map((row) => <li key={row.slug}><CompanyRowLink row={row} locale={locale} /></li>)}</RowList>
          <NoteLink href={`${all}#us-listed`} data-explore-see-all="us-listed">{copy.explore.seeAll(formatNumber(view.usListed.count, locale))}</NoteLink>
        </ExploreGroup>
      </div>
      <ExploreGroup group="funds" count={view.funds.count} locale={locale}>
        <p className="max-w-prose text-muted-foreground">{copy.explore.fundsLine(formatList(view.funds.examples, locale))}</p>
        <NoteLink href={`${all}#funds`} data-explore-see-all="funds">{copy.explore.seeAll(formatNumber(view.funds.count, locale))}</NoteLink>
      </ExploreGroup>
    </div>
  );
}
