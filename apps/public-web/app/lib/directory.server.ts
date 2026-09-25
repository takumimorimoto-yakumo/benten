/**
 * Build-only projection of Explore and the companies list. Runs in route
 * loaders during prerendering; never reaches the client graph. Every row is
 * copied from an allowlisted record (company map, product registry); nothing
 * is valued or ranked, and every list is A to Z.
 *
 * Each product xStock lands in exactly one place: under the published
 * company that holds it, in the US-listed tokens the generated map could not
 * link to one SEC company, or in funds and other xStocks (no single company).
 */
import { findCompany, listedCompanyMap, productXStockEntries, type XStockEntry } from "@benten/registry";
import { isPurchasableMint } from "@benten/purchase/route";
import {
  EXPLORE_FUND_EXAMPLES,
  EXPLORE_US_LISTED_ROWS,
  type CompaniesView,
  type CompanyRow,
  type DirectoryGroup,
  type ExploreView,
  type SuggestionLabel,
  type TokenRow,
} from "../features/explore/directory-view";
import { publishedCompanies } from "./company.server.js";

function companyRow(slug: string): CompanyRow {
  const record = findCompany(slug);
  if (!record) throw new Error("published company does not resolve");
  const products = record.instruments.map((instrument) => (instrument.source === "xstocks_registry"
    ? { symbol: instrument.entry.symbol, provider: "xstocks" as const }
    : { symbol: instrument.entry.symbol, provider: instrument.entry.provider }));
  const mints = record.instruments.map((instrument) => (instrument.source === "xstocks_registry" ? instrument.entry.mint : instrument.entry.mint_or_contract));
  return { slug: record.slug, name: record.display_name, products, buyInBenten: mints.some(isPurchasableMint) };
}

function tokenRow(entry: XStockEntry): TokenRow {
  return { ticker: entry.ticker, symbol: entry.symbol, name: entry.name, buyInBenten: isPurchasableMint(entry.mint) };
}

/** Case-folded code-point order of the name: alphabetical only. */
function byName(left: TokenRow, right: TokenRow): number {
  const a = left.name.toLowerCase();
  const b = right.name.toLowerCase();
  return a < b ? -1 : a > b ? 1 : 0;
}

function directory() {
  const companies = publishedCompanies();
  const held = new Set<string>();
  for (const company of companies) {
    for (const instrument of findCompany(company.slug)!.instruments) {
      if (instrument.source === "xstocks_registry") held.add(instrument.entry.ticker);
    }
  }
  const unlinkedTickers = new Set(listedCompanyMap.excluded.map((row) => row.ticker));
  const unlinked: TokenRow[] = [];
  const funds: TokenRow[] = [];
  for (const entry of productXStockEntries) {
    if (held.has(entry.ticker)) continue;
    if (unlinkedTickers.has(entry.ticker)) unlinked.push(tokenRow(entry));
    else {
      // A filing-covered token outside every company would be a missing company, not a fund.
      if (entry.fundamentals_available) throw new Error(`filing-covered xStock ${entry.ticker} has no company`);
      funds.push(tokenRow(entry));
    }
  }
  return {
    private: companies.filter((company) => company.listing_status === "private").map((company) => companyRow(company.slug)),
    usListed: companies.filter((company) => company.listing_status === "us_listed").map((company) => companyRow(company.slug)),
    unlinked: unlinked.sort(byName),
    funds: funds.sort(byName),
  };
}

export function createCompaniesView(): CompaniesView {
  return directory();
}

/**
 * Labels for every page a search suggestion can open: each published
 * company by slug, and each token without a company page by ticker. The
 * search index decides what a suggestion opens; a label only names it, and
 * the search island shows no candidate it cannot label (tests check that
 * every index entry has one).
 */
function suggestionLabels(view: CompaniesView): SuggestionLabel[] {
  const company = (group: DirectoryGroup) => (row: CompanyRow): SuggestionLabel => ({
    slug: row.slug, ticker: null, name: row.name, symbol: row.products.map((product) => product.symbol).join(", "), group, buyInBenten: row.buyInBenten,
  });
  const token = (group: DirectoryGroup) => (row: TokenRow): SuggestionLabel => ({ slug: null, ticker: row.ticker, name: row.name, symbol: row.symbol, group, buyInBenten: row.buyInBenten });
  return [...view.private.map(company("private")), ...view.usListed.map(company("us-listed")), ...view.unlinked.map(token("us-listed")), ...view.funds.map(token("funds"))];
}

export function createExploreView(): ExploreView {
  const view = directory();
  const buyable = [...view.private, ...view.usListed].filter((row) => row.buyInBenten);
  const buyableTokens = productXStockEntries.filter((entry) => isPurchasableMint(entry.mint));
  if (buyable.length > 1 || buyableTokens.length > 1) throw new Error("Explore states exactly one buyable token");
  return {
    buyable: buyableTokens[0] ? { symbol: buyableTokens[0].symbol, name: buyableTokens[0].name } : null,
    private: { count: view.private.length, rows: view.private },
    usListed: { count: view.usListed.length, rows: view.usListed.slice(0, EXPLORE_US_LISTED_ROWS) },
    funds: { count: view.funds.length, examples: view.funds.slice(0, EXPLORE_FUND_EXAMPLES).map((row) => row.name) },
    suggestions: suggestionLabels(view),
  };
}
