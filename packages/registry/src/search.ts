/**
 * Browser-safe company and ticker suggestions (`@benten/registry/search`).
 *
 * It imports only the small generated `company-search-index-v1.json` (no
 * company map, provider artifact or financial snapshot) and returns candidates
 * as `{ slug, ticker }` and nothing else.
 *
 * Prefix and substring matching exist here to suggest candidates only. A
 * candidate is never an authorization: the caller opens the one it picked
 * through the existing exact lookups, `findCompany(slug)` or
 * `resolveTicker(ticker)`, and never builds a path from the typed text. The
 * returned values always come from the index, never from the query.
 *
 * Matching folds case, full-width and half-width forms (Unicode NFKC) and
 * punctuation and whitespace runs. Names are the English names the registry
 * and SEC use, in every locale; no alias or translated name is indexed.
 */
import indexJson from "./company-search-index-v1.json" with { type: "json" };

export interface SearchCandidate {
  readonly slug: string | null;
  readonly ticker: string | null;
}

export interface SearchOptions {
  /** Most candidates to return (1 to 20, default 8). */
  limit?: number;
}

/** Longest query read, after normalization; longer input is cut, never widened. */
export const SEARCH_QUERY_MAX_LENGTH = 64;
export const SEARCH_DEFAULT_LIMIT = 8;
export const SEARCH_MAX_LIMIT = 20;

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TICKER = /^[A-Z0-9.-]{1,16}$/;
const PRINTABLE_ASCII = /^[ -~]{1,160}$/;

/** Fold case, width and separators so "ＮＶＤＡ", " nvda " and "N.V.D.A" compare alike where intended. */
export function normalizeSearchText(input: string): string {
  return input.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function compact(text: string): string {
  return text.replaceAll(" ", "");
}

interface IndexedEntry {
  candidate: SearchCandidate;
  order: string;
  codes: string[];
  names: string[];
  words: string[];
}

function loadIndex(input: unknown): readonly IndexedEntry[] {
  const record = input as { schema_version?: unknown; entries?: unknown };
  if (!record || record.schema_version !== "benten.company-search-index.v1" || !Array.isArray(record.entries)) {
    throw new TypeError("invalid company search index");
  }
  const seen = new Set<string>();
  return Object.freeze(record.entries.map((raw) => {
    const entry = raw as { slug?: unknown; ticker?: unknown; names?: unknown; symbols?: unknown };
    const slug = entry.slug === null ? null : typeof entry.slug === "string" && SLUG.test(entry.slug) ? entry.slug : undefined;
    const ticker = entry.ticker === null ? null : typeof entry.ticker === "string" && TICKER.test(entry.ticker) ? entry.ticker : undefined;
    const strings = (value: unknown) => Array.isArray(value) && value.every((item) => typeof item === "string" && PRINTABLE_ASCII.test(item));
    if (slug === undefined || ticker === undefined || (slug === null && ticker === null)
      || !strings(entry.names) || !strings(entry.symbols) || Object.keys(entry).length !== 4) {
      throw new TypeError("invalid company search index entry");
    }
    const identity = `${slug ?? ""}\u0000${ticker ?? ""}`;
    if (seen.has(identity)) throw new TypeError("duplicate company search index entry");
    seen.add(identity);
    const names = (entry.names as string[]).map(normalizeSearchText).filter(Boolean);
    return {
      candidate: Object.freeze({ slug, ticker }),
      order: slug ?? ticker!,
      codes: [ticker, ...(entry.symbols as string[])].filter((code): code is string => code !== null).map(normalizeSearchText),
      names,
      words: names.flatMap((name) => name.split(" ")),
    };
  }));
}

const INDEX = loadIndex(indexJson);

/** Lower is closer; `undefined` means no match. */
function tier(entry: IndexedEntry, query: string, packed: string): number | undefined {
  if (entry.codes.includes(query)) return 0;
  if (entry.names.includes(query)) return 1;
  if (entry.codes.some((code) => code.startsWith(query))) return 2;
  if (entry.names.some((name) => name.startsWith(query))) return 3;
  if (entry.words.some((word) => word.startsWith(query))) return 4;
  if (packed.length >= 2 && [...entry.codes, ...entry.names].some((text) => compact(text).includes(packed))) return 5;
  return undefined;
}

/**
 * Suggest up to `limit` candidates for untrusted input, closest first, ties
 * in slug-or-ticker order (alphabetical, never by any value). Non-string or
 * empty input returns no candidate.
 */
export function searchCandidates(input: unknown, options: SearchOptions = {}): readonly SearchCandidate[] {
  if (typeof input !== "string") return [];
  const limit = options.limit ?? SEARCH_DEFAULT_LIMIT;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > SEARCH_MAX_LIMIT) throw new TypeError("invalid search limit");
  const query = normalizeSearchText(input.slice(0, SEARCH_QUERY_MAX_LENGTH * 4)).slice(0, SEARCH_QUERY_MAX_LENGTH).trim();
  if (query === "") return [];
  const packed = compact(query);
  return INDEX
    .map((entry) => ({ entry, rank: tier(entry, query, packed) }))
    .filter((match): match is { entry: IndexedEntry; rank: number } => match.rank !== undefined)
    .sort((left, right) => left.rank - right.rank
      || (left.entry.order < right.entry.order ? -1 : left.entry.order > right.entry.order ? 1 : 0))
    .slice(0, limit)
    .map(({ entry }) => entry.candidate);
}
