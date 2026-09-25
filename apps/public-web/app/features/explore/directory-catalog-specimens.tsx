/**
 * Living Catalog specimens for Explore, the companies list and the company
 * page (development only; imported by app/routes/dev-catalog.tsx). Fixture
 * values are placeholders, not registry data.
 */
import type { ReactNode } from "react";
import { CompanyFacts, CompanyPage, CompanyProducts } from "@/features/references/company-page";
import type { CompanyProductView, CompanyView } from "@/features/references/company-view";
import { CompanyRowLink, RowList, TokenRowLink } from "./directory-rows";
import type { CompanyRow, SuggestionLabel, TokenRow } from "./directory-view";
import { ExploreSearch } from "./explore-search";

const MINT = "11111111111111111111111111111111";
const FILING = { form: "10-K", accessionNumber: "0000000000-00-000000", filedAt: "2000-03-31", filingUrl: "https://www.sec.gov/" } as const;

const XSTOCK: CompanyProductView = { key: "xstocks/EXAMPLE", provider: "xstocks", routeKey: "EXAMPLE", symbol: "EXAMPLEx", name: "Example xStock", mint: MINT, ownership: { kind: "xstock" }, buyable: false };
const BUYABLE: CompanyProductView = { ...XSTOCK, key: "xstocks/BUY", routeKey: "BUY", symbol: "BUYx", name: "Buyable xStock", buyable: true };
const PROVIDER: CompanyProductView = {
  key: "prestocks/EXAMPLE", provider: "prestocks", routeKey: "EXAMPLE", symbol: "EXAMPLE", name: "Example PreStocks", mint: MINT, buyable: false,
  ownership: { kind: "provider", instrumentKind: "economic_exposure_instrument", claimOnly: true, equityOwnership: "unknown", votingRights: "unknown" },
};

const LISTED: CompanyView = {
  slug: "example", displayName: "Example", secRegistrant: "EXAMPLE CORP", listingStatus: "us_listed", products: [BUYABLE],
  facts: {
    kind: "verified", ticker: "BUY",
    rows: [
      { name: "revenue", value: 1234, currency: "USD", label: { fiscalYear: 2000, periodEnd: "2000-01-30" }, filing: FILING },
    ],
    sources: [FILING],
  },
  method: { kind: "generated", revision: 1, generatedOn: "2000-01-01", secCik: "0000000000", checkedOn: "2000-01-02", humanReview: "pending" },
};
const PRIVATE: CompanyView = {
  slug: "example-private", displayName: "Example Private", secRegistrant: null, listingStatus: "private", products: [PROVIDER], facts: { kind: "private" },
  method: { kind: "reviewed", revision: 1, reviewedOn: "2000-01-01", providerFetchedOn: "2000-01-01" },
};
const MULTI: CompanyView = { ...PRIVATE, slug: "example-multi", displayName: "Example Multi", products: [XSTOCK, PROVIDER] };

const COMPANY_ROWS: CompanyRow[] = [
  { slug: "example", name: "EXAMPLE CORP", products: [{ symbol: "BUYx", provider: "xstocks" }], buyInBenten: true },
  { slug: "example-private", name: "Example Private", products: [{ symbol: "EXAMPLE", provider: "prestocks" }], buyInBenten: false },
  { slug: "example-long", name: "Example Company With A Very Long Registered Name, Incorporated", products: [{ symbol: "LONGx", provider: "xstocks" }], buyInBenten: false },
];
const TOKEN_ROWS: TokenRow[] = [{ ticker: "FUND", symbol: "FUNDx", name: "Example Fund xStock", buyInBenten: false }];
const LABELS: SuggestionLabel[] = [
  { slug: "example", ticker: null, name: "EXAMPLE CORP", symbol: "BUYx", group: "us-listed", buyInBenten: true },
  { slug: null, ticker: "FUND", name: "Example Fund xStock", symbol: "FUNDx", group: "funds", buyInBenten: false },
];

function Specimen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function DirectoryCatalogSpecimens() {
  const locale = "en";
  return (
    <>
      <Specimen title="Explore search (type to see suggestions; the fixture labels do not match the real index)">
        <ExploreSearch locale={locale} labels={LABELS} />
      </Specimen>
      <Specimen title="Directory rows: company (buyable, provider, long name) and token">
        <RowList>
          {COMPANY_ROWS.map((row) => <li key={row.slug}><CompanyRowLink row={row} locale={locale} /></li>)}
          {TOKEN_ROWS.map((row) => <li key={row.ticker}><TokenRowLink row={row} locale={locale} /></li>)}
        </RowList>
      </Specimen>
      <Specimen title="Company products: one buyable, one compare-only, two with the notice">
        <CompanyProducts view={LISTED} locale={locale} />
        <CompanyProducts view={PRIVATE} locale={locale} />
        <CompanyProducts view={MULTI} locale={locale} />
      </Specimen>
      <Specimen title="Company facts: verified, not verified, private">
        <CompanyFacts facts={LISTED.facts} name={LISTED.displayName} symbol="BUYx" locale={locale} />
        <CompanyFacts facts={{ kind: "not_verified", ticker: "BUY" }} name={LISTED.displayName} symbol="BUYx" locale={locale} />
        <CompanyFacts facts={{ kind: "private" }} name={PRIVATE.displayName} symbol="" locale={locale} />
      </Specimen>
      <Specimen title="Company page (US-listed fixture)">
        <CompanyPage view={LISTED} locale={locale} />
      </Specimen>
    </>
  );
}
