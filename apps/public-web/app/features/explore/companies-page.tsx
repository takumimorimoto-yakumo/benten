import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import { companyMessagesFor } from "@/i18n/company-messages";
import { formatNumber } from "@/i18n/format";
import type { PublicWebLocale } from "@/i18n/locales";
import { DirectoryGroupLinks } from "./directory-group-links";
import { CompanyRowLink, RowList, TokenRowLink } from "./directory-rows";
import { DIRECTORY_GROUPS, directoryLetter, type CompaniesView, type DirectoryGroup } from "./directory-view";

/** A group longer than this gets A-to-Z letter headings. */
export const LETTER_HEADINGS_MIN_ROWS = 20;

export function isDirectoryGroup(value: unknown): value is DirectoryGroup {
  return typeof value === "string" && (DIRECTORY_GROUPS as readonly string[]).includes(value);
}

/**
 * The group the address hash selects (`#private`, `#us-listed`, `#funds`),
 * so a filter survives reload and can be shared. Any other hash, or none,
 * is All. The prerendered document and the first render show All.
 */
function useHashGroup(): DirectoryGroup | null {
  const location = useLocation();
  const [hash, setHash] = useState("");
  useEffect(() => {
    const read = () => setHash(window.location.hash.slice(1));
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [location.hash]);
  return isDirectoryGroup(hash) ? hash : null;
}

/** Rows split under their first letter, in list order. */
export function byLetter<T>(rows: readonly T[], key: (row: T) => string): { letter: string; rows: T[] }[] {
  const groups: { letter: string; rows: T[] }[] = [];
  for (const row of rows) {
    const letter = directoryLetter(key(row));
    const last = groups.at(-1);
    if (last?.letter === letter) last.rows.push(row);
    else groups.push({ letter, rows: [row] });
  }
  return groups;
}

function LetterList<T>({ rows, rowKey, letterKey, render }: { rows: readonly T[]; rowKey: (row: T) => string; letterKey: (row: T) => string; render: (row: T) => ReactNode }) {
  if (rows.length <= LETTER_HEADINGS_MIN_ROWS) return <RowList>{rows.map((row) => <li key={rowKey(row)}>{render(row)}</li>)}</RowList>;
  return (
    <div className="flex flex-col gap-4">
      {byLetter(rows, letterKey).map(({ letter, rows: letterRows }) => (
        <div key={letter} className="flex flex-col gap-2">
          {/* Below md the letter stays under the sticky app header while its rows scroll. */}
          <h3 data-directory-letter={letter} className="bg-background py-1 text-sm font-semibold text-muted-foreground max-md:sticky max-md:top-(--directory-letter-sticky-top) max-md:z-10">{letter}</h3>
          <RowList>{letterRows.map((row) => <li key={rowKey(row)}>{render(row)}</li>)}</RowList>
        </div>
      ))}
    </div>
  );
}

function GroupSection({ group, count, hidden, locale, children }: { group: DirectoryGroup; count: number; hidden: boolean; locale: PublicWebLocale; children: ReactNode }) {
  const copy = companyMessagesFor(locale).groups;
  return (
    <section id={group} aria-labelledby={`${group}-heading`} data-directory-group={group} hidden={hidden} className="flex scroll-mt-(--anchor-scroll-margin) flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h2 id={`${group}-heading`} className="text-xl font-semibold tracking-tight">{copy.heading[group](formatNumber(count, locale))}</h2>
        <p className="text-sm text-muted-foreground">{copy.order}</p>
      </div>
      {children}
    </section>
  );
}

/**
 * Every company and fund (app IA section 4.3): the group filter (hash-backed
 * links, so it works as jump links without JavaScript), then private
 * companies, US-listed companies with the tokens that have no company page,
 * and funds and other xStocks, each A to Z. Rows show no price and are never
 * sorted by anything but name.
 */
export function CompaniesPage({ view, locale }: { view: CompaniesView; locale: PublicWebLocale }) {
  const copy = companyMessagesFor(locale);
  const selected = useHashGroup();
  const counts: Record<DirectoryGroup, number> = { private: view.private.length, "us-listed": view.usListed.length, funds: view.funds.length };
  const shows = (group: DirectoryGroup) => selected === null || selected === group;
  return (
    <div data-companies="" className="flex max-w-(--directory-max-width) flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{copy.companies.heading}</h1>
        <p className="max-w-prose text-muted-foreground">{copy.companies.lead}</p>
      </header>
      <DirectoryGroupLinks counts={counts} selected={selected ?? "all"} label={copy.companies.filter} locale={locale} />
      <GroupSection group="private" count={view.private.length} hidden={!shows("private")} locale={locale}>
        <LetterList rows={view.private} rowKey={(row) => row.slug} letterKey={(row) => row.slug} render={(row) => <CompanyRowLink row={row} locale={locale} />} />
      </GroupSection>
      <GroupSection group="us-listed" count={view.usListed.length} hidden={!shows("us-listed")} locale={locale}>
        <LetterList rows={view.usListed} rowKey={(row) => row.slug} letterKey={(row) => row.slug} render={(row) => <CompanyRowLink row={row} locale={locale} />} />
        {view.unlinked.length > 0 ? (
          <div data-directory-unlinked="" className="flex flex-col gap-2 pt-4">
            <h3 className="font-semibold">{copy.companies.unlinkedHeading(formatNumber(view.unlinked.length, locale))}</h3>
            <p className="max-w-prose text-sm text-muted-foreground">{copy.companies.unlinkedNote}</p>
            <RowList>{view.unlinked.map((row) => <li key={row.ticker}><TokenRowLink row={row} locale={locale} /></li>)}</RowList>
          </div>
        ) : null}
      </GroupSection>
      <GroupSection group="funds" count={view.funds.length} hidden={!shows("funds")} locale={locale}>
        <p className="max-w-prose text-sm text-muted-foreground">{copy.companies.fundsNote}</p>
        <LetterList rows={view.funds} rowKey={(row) => row.ticker} letterKey={(row) => row.name} render={(row) => <TokenRowLink row={row} locale={locale} />} />
      </GroupSection>
    </div>
  );
}
