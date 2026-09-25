import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { SearchIcon } from "lucide-react";
import { searchCandidates, type SearchCandidate } from "@benten/registry/search";
import { NoteLink } from "@/components/note-link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { navigateInApp } from "@/features/navigation/client-navigation";
import { companyMessagesFor } from "@/i18n/company-messages";
import { formatNumber } from "@/i18n/format";
import { companiesPath, companyPath, dossierPath, type PublicWebLocale } from "@/i18n/locales";
import { cn } from "@/lib/utils";
import { BuyInBentenTag } from "./directory-rows";
import type { SuggestionLabel } from "./directory-view";

/** Most suggestions shown at once (app IA section 4.2). */
export const EXPLORE_SUGGESTION_LIMIT = 6;

/** Longest echo of unmatched input shown back to the reader. */
const ECHO_MAX_LENGTH = 64;

/**
 * Characters typed (trimmed) before an empty suggestion list is stated as
 * "no match" while typing: one character still matches too little to say so.
 */
export const EXPLORE_NO_MATCH_MIN_LENGTH = 2;

/** Whether the typed text is long enough, and matched nothing, to say so in place of the suggestions. */
export function typedNoMatch(query: string, suggestionCount: number): boolean {
  return suggestionCount === 0 && [...query.trim()].length >= EXPLORE_NO_MATCH_MIN_LENGTH;
}

export type LabelIndex = { readonly bySlug: ReadonlyMap<string, SuggestionLabel>; readonly byTicker: ReadonlyMap<string, SuggestionLabel> };

export function indexLabels(labels: readonly SuggestionLabel[]): LabelIndex {
  return {
    bySlug: new Map(labels.filter((label) => label.slug !== null).map((label) => [label.slug!, label])),
    byTicker: new Map(labels.filter((label) => label.slug === null && label.ticker !== null).map((label) => [label.ticker!, label])),
  };
}

/**
 * The label of one search candidate. A candidate with a slug opens that
 * company page; one without opens its token page. A candidate this page
 * cannot label is not shown, so a suggestion never opens a missing page.
 */
export function labelFor(candidate: SearchCandidate, index: LabelIndex): SuggestionLabel | undefined {
  if (candidate.slug !== null) return index.bySlug.get(candidate.slug);
  return candidate.ticker === null ? undefined : index.byTicker.get(candidate.ticker);
}

/** The page a suggestion opens, from the index's exact slug or ticker; never from the typed text. */
export function suggestionPath(locale: PublicWebLocale, label: SuggestionLabel): string {
  return label.slug !== null ? companyPath(locale, label.slug) : dossierPath(locale, label.ticker!);
}

export function suggestionsFor(query: string, index: LabelIndex): SuggestionLabel[] {
  return searchCandidates(query, { limit: EXPLORE_SUGGESTION_LIMIT })
    .map((candidate) => labelFor(candidate, index))
    .filter((label): label is SuggestionLabel => label !== undefined);
}

/** What Enter does with the current suggestions (app IA section 4.2). */
export function submitOutcome(query: string, suggestions: readonly SuggestionLabel[], active: number):
  | { kind: "open"; label: SuggestionLabel } | { kind: "none" } | { kind: "no-match" } | { kind: "choose" } {
  if (active >= 0 && active < suggestions.length) return { kind: "open", label: suggestions[active]! };
  if (query.trim() === "") return { kind: "none" };
  if (suggestions.length === 1) return { kind: "open", label: suggestions[0]! };
  return suggestions.length === 0 ? { kind: "no-match" } : { kind: "choose" };
}

/** Arrow-key movement through the field (-1) and the suggestions, wrapping at both ends. */
export function nextActive(current: number, step: 1 | -1, count: number): number {
  const size = count + 1;
  return ((current + 1 + step + size) % size) - 1;
}

function echoOf(input: string): string {
  const characters = [...input.trim()];
  return characters.length > ECHO_MAX_LENGTH ? `${characters.slice(0, ECHO_MAX_LENGTH).join("")}…` : characters.join("");
}

/**
 * Explore's search (app IA section 4.2): suggestions from the build-time
 * search index while typing, opened only by the entry's own slug or ticker.
 * Enter opens the highlighted suggestion, or the only one; with none it says
 * so and links to every company; with several it asks to choose. Without
 * JavaScript the field is a plain form that opens the companies list. Opening
 * is a client-side navigation, so the app shell and wallet session stay.
 */
export function ExploreSearch({ locale, labels }: { locale: PublicWebLocale; labels: readonly SuggestionLabel[] }) {
  const copy = companyMessagesFor(locale);
  const search = copy.explore.search;
  const index = useMemo(() => indexLabels(labels), [labels]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // The attempt number remounts the notice, so repeating a failed search announces it again.
  const [notice, setNotice] = useState<{ kind: "no-match"; echo: string; attempt: number } | { kind: "choose"; attempt: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const listId = `${id}-suggestions`;
  const noticeId = `${id}-notice`;
  const suggestions = useMemo(() => suggestionsFor(query, index), [query, index]);
  const expanded = open && suggestions.length > 0;
  // While typing, an empty list with enough text says "no match" where the suggestions would be.
  // It does not depend on focus, so the link to every company stays until it is used.
  const noMatchEcho = notice?.kind === "no-match" ? notice.echo : typedNoMatch(query, suggestions.length) ? echoOf(query) : null;
  const describedBy = noMatchEcho !== null || notice ? noticeId : undefined;

  // Text typed before hydration stays and gets its suggestions.
  useEffect(() => {
    const typed = inputRef.current?.value ?? "";
    if (typed !== "") {
      setQuery(typed);
      setOpen(true);
    }
  }, []);

  function openSuggestion(label: SuggestionLabel) {
    setOpen(false);
    navigateInApp(suggestionPath(locale, label));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const outcome = submitOutcome(query, suggestions, expanded ? active : -1);
    const attempt = (notice?.attempt ?? 0) + 1;
    if (outcome.kind === "open") openSuggestion(outcome.label);
    else if (outcome.kind === "no-match") setNotice({ kind: "no-match", echo: echoOf(query), attempt });
    else if (outcome.kind === "choose") {
      setOpen(true);
      setNotice({ kind: "choose", attempt });
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (suggestions.length === 0) return;
      event.preventDefault();
      setOpen(true);
      setActive((current) => nextActive(current, event.key === "ArrowDown" ? 1 : -1, suggestions.length));
    } else if (event.key === "Escape" && expanded) {
      event.preventDefault();
      setOpen(false);
      setActive(-1);
    }
  }

  const announcement = !expanded ? "" : suggestions.length === 1 ? search.single : search.count(formatNumber(suggestions.length, locale));
  return (
    <div className="flex max-w-(--explore-search-max-width) flex-col gap-2">
      <form role="search" method="get" action={companiesPath(locale)} onSubmit={onSubmit} noValidate className="flex flex-col gap-2">
        <label htmlFor={`${id}-input`} className="text-sm font-medium">{search.label}</label>
        <div className="relative">
          <SearchIcon aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={`${id}-input`}
            ref={inputRef}
            name="q"
            type="search"
            role="combobox"
            aria-expanded={expanded}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={expanded && active >= 0 ? `${id}-option-${active}` : undefined}
            aria-describedby={describedBy}
            value={query}
            placeholder={search.placeholder}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
              setActive(-1);
              setNotice(null);
            }}
            onKeyDown={onKeyDown}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="go"
            className="h-12 border-(--control-border) ps-10 text-base md:text-base"
          />
        </div>
      </form>
      <ul id={listId} role="listbox" aria-label={search.listLabel} hidden={!expanded} className="divide-y overflow-hidden rounded-lg border bg-background">
        {expanded ? suggestions.map((label, position) => (
          <li
            key={label.slug ?? label.ticker}
            id={`${id}-option-${position}`}
            role="option"
            aria-selected={position === active}
            data-suggestion={label.slug ?? label.ticker ?? ""}
            // Keep focus in the field, so the list does not close before the choice lands.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => openSuggestion(label)}
            className={cn("flex min-h-(--touch-target-min) cursor-pointer items-center justify-between gap-x-4 gap-y-1 px-4 py-2 hover:bg-muted max-sm:flex-wrap", position === active && "bg-muted")}
          >
            <span className="min-w-0 font-medium break-words">{label.name}</span>
            <span className="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
              {label.buyInBenten ? <BuyInBentenTag locale={locale} /> : null}
              <span className="text-foreground">{label.symbol}</span>
              <span>{copy.groups.name[label.group]}</span>
            </span>
          </li>
        )) : null}
      </ul>
      <p className="sr-only" aria-live="polite">{announcement}</p>
      <noscript><p className="text-sm text-muted-foreground">{search.noScript}</p></noscript>
      {noMatchEcho !== null ? (
        <Alert key={notice?.kind === "no-match" ? notice.attempt : 0} id={noticeId} role="status" data-explore-search-result="no-match">
          <AlertDescription>
            <p className="wrap-anywhere">{search.noMatch(noMatchEcho)}</p>
            <NoteLink href={companiesPath(locale)} data-explore-search-browse="">{search.seeAll}</NoteLink>
          </AlertDescription>
        </Alert>
      ) : null}
      {notice?.kind === "choose" ? (
        <p key={notice.attempt} id={noticeId} role="status" className="text-sm text-muted-foreground" data-explore-search-result="choose">{search.chooseOne(formatNumber(suggestions.length, locale))}</p>
      ) : null}
    </div>
  );
}
