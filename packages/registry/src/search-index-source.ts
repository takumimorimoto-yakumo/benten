/**
 * Build-time source of `company-search-index-v1.json`. Tooling and tests only:
 * the browser module `search.ts` reads the generated JSON and never imports
 * this file, the company maps or any snapshot.
 *
 * One entry per company (both maps) and one per product xStock that no company
 * holds. Every value is copied from an allowlisted record: a company slug, a
 * registry ticker, a registry or provider symbol, an English display name
 * and, for a US-listed company, its recorded SEC registrant name (so "NVIDIA
 * CORP" and "Advanced Micro Devices" still find NVIDIA and AMD; candidates
 * carry only slug and ticker, so that spelling is never shown). No alias is
 * generated; names in other locales are not indexed.
 */
import { listCompanies, findCompany } from "./company-read-model.js";
import { productXStockEntries } from "./registry-lookup.js";

export interface CompanySearchEntryV1 {
  /** Company slug to open with `findCompany`, or null for an xStock no company holds. */
  slug: string | null;
  /** Registry ticker to open with `resolveTicker`, or null for a company without an xStock. */
  ticker: string | null;
  /** English names that suggest this entry: the company display name (then its SEC registrant name), or the registry token name. */
  names: string[];
  /** Token symbols that suggest this entry (xStock symbol, provider symbol). */
  symbols: string[];
}

export interface CompanySearchIndexV1 {
  schema_version: "benten.company-search-index.v1";
  entries: CompanySearchEntryV1[];
}

function key(entry: CompanySearchEntryV1): string {
  return entry.slug ?? entry.ticker ?? "";
}

export function buildCompanySearchIndex(): CompanySearchIndexV1 {
  const entries: CompanySearchEntryV1[] = [];
  const heldTickers = new Set<string>();
  for (const item of listCompanies()) {
    const record = findCompany(item.slug)!;
    const tickers: string[] = [];
    const symbols: string[] = [];
    for (const instrument of record.instruments) {
      if (instrument.source === "xstocks_registry") {
        tickers.push(instrument.entry.ticker);
        symbols.push(instrument.entry.symbol);
      } else {
        symbols.push(instrument.entry.symbol);
      }
    }
    if (tickers.length > 1) throw new TypeError("a search entry opens at most one ticker");
    for (const ticker of tickers) heldTickers.add(ticker);
    const registrant = record.sec_registrant_name !== null && record.sec_registrant_name !== record.display_name ? [record.sec_registrant_name] : [];
    entries.push({ slug: record.slug, ticker: tickers[0] ?? null, names: [record.display_name, ...registrant], symbols });
  }
  for (const entry of productXStockEntries) {
    if (heldTickers.has(entry.ticker)) continue;
    entries.push({ slug: null, ticker: entry.ticker, names: [entry.name], symbols: [entry.symbol] });
  }
  entries.sort((left, right) => (key(left) < key(right) ? -1 : key(left) > key(right) ? 1 : 0));
  return { schema_version: "benten.company-search-index.v1", entries };
}
