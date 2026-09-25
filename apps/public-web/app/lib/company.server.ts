/**
 * Build-only projection from the company maps to one company page. Runs in
 * route loaders during prerendering; never reaches the client graph. No
 * provider reference or supply value is copied, and nothing is ranked.
 */
import {
  companyMap,
  findCompany,
  getAnnualFactSeries,
  listCompanies,
  listedCompanyMap,
  providerAssetsManifest,
  type CompanyInstrument,
  type CompanyListItem,
} from "@benten/registry";
import { isPurchasableMint } from "@benten/purchase/route";
import {
  COMPANY_FACT_SUMMARY,
  type CompanyFactRow,
  type CompanyFactsView,
  type CompanyLinkMethod,
  type CompanyProductView,
  type CompanyView,
} from "../features/references/company-view";
import { utcDatePart } from "../i18n/format.js";
import { annualPointView } from "./dossier.server.js";

/**
 * The companies that get a public page: every private company of the
 * hand-reviewed map, and every US-listed company of the generated map (whose
 * human review is still pending; the page says so). Tokens the generated map
 * could not link to exactly one SEC company (its `excluded` rows) have no
 * company here, so they get no page. Funds and other xStocks are not
 * companies. Prerendering, Explore, the companies list, product-page parents
 * and route validation all read this one list, in slug order.
 */
export function publishedCompanies(): readonly CompanyListItem[] {
  return listCompanies().filter((company) => company.listing_status === "us_listed" || company.map_review === "reviewed");
}

const published = new Set(publishedCompanies().map((company) => company.slug));

export function isPublishedCompany(slug: unknown): boolean {
  return typeof slug === "string" && published.has(slug);
}

export function productKey(instrument: CompanyInstrument): string {
  return instrument.source === "xstocks_registry" ? `xstocks/${instrument.entry.ticker}` : `${instrument.entry.provider}/${instrument.entry.provider_asset_id}`;
}

function productView(instrument: CompanyInstrument): CompanyProductView {
  if (instrument.source === "xstocks_registry") {
    const entry = instrument.entry;
    return {
      key: productKey(instrument),
      provider: "xstocks",
      routeKey: entry.ticker,
      symbol: entry.symbol,
      name: entry.name,
      mint: entry.mint,
      ownership: { kind: "xstock" },
      buyable: isPurchasableMint(entry.mint),
    };
  }
  const entry = instrument.entry;
  return {
    key: productKey(instrument),
    provider: entry.provider,
    routeKey: entry.provider_asset_id,
    symbol: entry.symbol,
    name: entry.display_name,
    mint: entry.mint_or_contract,
    ownership: {
      kind: "provider",
      instrumentKind: entry.rights.instrument_kind,
      claimOnly: entry.rights.status === "provider_claim_only",
      equityOwnership: entry.rights.equity_ownership,
      votingRights: entry.rights.voting_rights,
    },
    buyable: isPurchasableMint(entry.mint_or_contract),
  };
}

/**
 * The first xStock of a US-listed company is the one whose SEC facts the page
 * summarizes: for each summary metric, the newest annual-history point that a
 * filing reports (`verified_reported`), with that filing. A value that no
 * filing reports is never summarized here.
 */
function factsView(listingStatus: "private" | "us_listed", instruments: readonly CompanyInstrument[]): CompanyFactsView {
  if (listingStatus === "private") return { kind: "private" };
  const xstock = instruments.find((instrument) => instrument.source === "xstocks_registry");
  if (!xstock || xstock.source !== "xstocks_registry") throw new Error("a US-listed company needs its xStock");
  const ticker = xstock.entry.ticker;
  const points = getAnnualFactSeries(ticker, { metrics: COMPANY_FACT_SUMMARY, statuses: ["verified_reported"] });
  const rows: CompanyFactRow[] = [];
  for (const name of COMPANY_FACT_SUMMARY) {
    // Fiscal-year ascending, so the last point of a metric is its newest.
    const point = points.filter((candidate) => candidate.metric === name).at(-1);
    if (!point) continue;
    const view = annualPointView(point);
    rows.push({ name, value: view.value, currency: view.currency, label: { fiscalYear: point.fiscal_year, periodEnd: point.period_end }, filing: view.filing });
  }
  if (rows.length === 0) return { kind: "not_verified", ticker };
  const sources = [...new Map(rows.map((row) => [row.filing.accessionNumber, row.filing])).values()];
  return { kind: "verified", ticker, rows, sources };
}

function methodView(slug: string, listingStatus: "private" | "us_listed"): CompanyLinkMethod {
  if (listingStatus === "private") {
    return { kind: "reviewed", revision: companyMap.revision, reviewedOn: companyMap.reviewed_at.slice(0, 10), providerFetchedOn: utcDatePart(providerAssetsManifest.fetched_at) };
  }
  const row = listedCompanyMap.companies.find((company) => company.slug === slug);
  if (!row) throw new Error("a US-listed company page needs its generated map row");
  return {
    kind: "generated",
    revision: listedCompanyMap.revision,
    generatedOn: utcDatePart(listedCompanyMap.generated_at),
    secCik: row.evidence.sec_cik,
    checkedOn: listedCompanyMap.generation.verification.checked_on,
    humanReview: listedCompanyMap.generation.human_review.status,
  };
}

/** Resolve one prerendered slug exactly; unknown, unpublished or noncanonical input throws. */
export function createCompanyView(slug: string): CompanyView {
  const company = findCompany(slug);
  if (!company || company.slug !== slug || !isPublishedCompany(slug)) throw new Error("company view requires an exact published company slug");
  return {
    slug: company.slug,
    displayName: company.display_name,
    secRegistrant: company.sec_registrant_name,
    listingStatus: company.listing_status,
    products: company.instruments.map(productView),
    facts: factsView(company.listing_status, company.instruments),
    method: methodView(company.slug, company.listing_status),
  };
}
