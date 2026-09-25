/**
 * Build-only URL enumeration for the future static Web app.
 *
 * The React Router config must pass the successful, reviewed public registry
 * result into this helper during prerendering. This module deliberately has no
 * browser, HTTP, API-runtime, wallet, RPC, or financial-snapshot dependency.
 */

import { aboutPath, activityPath, companiesPath, holdingsPath, LEARN_TOPICS, learnPath, LEGAL_DOCUMENTS, legalPath, localePrefix, PUBLIC_WEB_LOCALES } from "../i18n/locales.js";
import { SELL_ROUTE } from "@benten/purchase/routes-table";

export { PUBLIC_WEB_LOCALES, type PublicWebLocale } from "../i18n/locales.js";

type PublicCatalog = {
  found: boolean;
  items: ReadonlyArray<{ identity: { ticker: string } }>;
};

const CANONICAL_TICKER = /^[A-Z0-9.-]{1,16}$/;

function isCanonicalTicker(ticker: string): boolean {
  return CANONICAL_TICKER.test(ticker) && ticker.trim() === ticker;
}

/**
 * Derive the complete finite document set from the validated public catalog.
 * It fails rather than emitting a partial or ambiguous static site.
 */
export function buildPublicWebPrerenderPaths(catalog: PublicCatalog): readonly string[] {
  if (!catalog.found) throw new Error("public catalog is unavailable for static Web prerendering");

  const tickers = catalog.items.map(({ identity }) => identity.ticker).sort();
  const uniqueTickers = new Set<string>();
  for (const ticker of tickers) {
    if (!isCanonicalTicker(ticker)) throw new Error(`public catalog has a noncanonical ticker: ${ticker}`);
    if (uniqueTickers.has(ticker)) throw new Error(`public catalog has a duplicate ticker: ${ticker}`);
    uniqueTickers.add(ticker);
  }

  return PUBLIC_WEB_LOCALES.flatMap((locale) => {
    const prefix = localePrefix(locale);
    return [prefix || "/", ...tickers.map((ticker) => `${prefix}/stock/${ticker}`)];
  });
}

type ProviderCatalog =
  | { found: false }
  | { found: true; items: ReadonlyArray<{ provider: string; provider_asset_id: string }> };
type CompanyList = ReadonlyArray<{ slug: string }>;

const CANONICAL_PROVIDER = /^[a-z]+$/;
const CANONICAL_PROVIDER_ASSET_ID = /^[A-Za-z0-9]{1,32}$/;
const CANONICAL_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Every locale's provider instrument and company page, from the reviewed
 * provider artifact and company map. Identifiers are used exactly as the
 * artifacts store them; one that could not be a single safe path segment, or
 * a duplicate, fails the build instead of emitting an ambiguous URL.
 */
export function buildReferencePrerenderPaths(providers: ProviderCatalog, companies: CompanyList): readonly string[] {
  if (!providers.found) throw new Error("provider catalog is unavailable for static Web prerendering");
  const providerPaths = new Set<string>();
  for (const { provider, provider_asset_id: id } of providers.items) {
    if (!CANONICAL_PROVIDER.test(provider) || !CANONICAL_PROVIDER_ASSET_ID.test(id)) {
      throw new Error(`provider catalog has a noncanonical identifier: ${provider}/${id}`);
    }
    const path = `/provider/${provider}/${id}`;
    if (providerPaths.has(path)) throw new Error(`provider catalog has a duplicate instrument: ${provider}/${id}`);
    providerPaths.add(path);
  }
  const companyPaths = new Set<string>();
  for (const { slug } of companies) {
    if (!CANONICAL_SLUG.test(slug)) throw new Error(`company map has a noncanonical slug: ${slug}`);
    const path = `/company/${slug}`;
    if (companyPaths.has(path)) throw new Error(`company map has a duplicate slug: ${slug}`);
    companyPaths.add(path);
  }
  const suffixes = [...providerPaths, ...companyPaths];
  return PUBLIC_WEB_LOCALES.flatMap((locale) => suffixes.map((suffix) => `${localePrefix(locale)}${suffix}`));
}

/**
 * The app shell's tab pages (Holdings, Activity) in every locale. They hold
 * no registry data: the prerendered documents are their not-connected and
 * empty states, and the browser fills them in after hydration.
 */
export function buildAppShellPrerenderPaths(): readonly string[] {
  return PUBLIC_WEB_LOCALES.flatMap((locale) => [holdingsPath(locale), activityPath(locale)]);
}

/** The companies list (app IA section 4.3) in every locale. */
export function buildDirectoryPrerenderPaths(): readonly string[] {
  return PUBLIC_WEB_LOCALES.map((locale) => companiesPath(locale));
}

/**
 * Product subpages in every locale (app IA sections 4.6 and 5.1): an
 * evidence page for every xStock and provider instrument, and the buy flow
 * frame for the products that have a route (and the sell flow frame for the
 * one sale route). `buyableTickers` must come from
 * the exact mint comparison against the pinned route constant.
 */
export function buildProductSubpagePrerenderPaths(catalog: PublicCatalog, providers: ProviderCatalog, buyableTickers: readonly string[]): readonly string[] {
  if (!catalog.found) throw new Error("public catalog is unavailable for static Web prerendering");
  if (!providers.found) throw new Error("provider catalog is unavailable for static Web prerendering");
  const tickers = new Set(catalog.items.map(({ identity }) => identity.ticker));
  for (const ticker of buyableTickers) if (!tickers.has(ticker)) throw new Error(`buy flow for a ticker outside the catalog: ${ticker}`);
  const suffixes = [
    ...[...tickers].sort().map((ticker) => `/stock/${ticker}/evidence`),
    ...providers.items.map(({ provider, provider_asset_id: id }) => `/provider/${provider}/${id}/evidence`),
    ...[...buyableTickers].sort().map((ticker) => `/stock/${ticker}/buy`),
    // Selling is NVDAx only: one sell flow frame, and only while its product is buyable.
    ...buyableTickers.filter((ticker) => ticker === SELL_ROUTE.ticker).map((ticker) => `/stock/${ticker}/sell`),
  ];
  return PUBLIC_WEB_LOCALES.flatMap((locale) => suffixes.map((suffix) => `${localePrefix(locale)}${suffix}`));
}

/** The static information pages in every locale: About, each learn topic and each legal document. */
export function buildStaticPagePrerenderPaths(): readonly string[] {
  return PUBLIC_WEB_LOCALES.flatMap((locale) => [
    aboutPath(locale),
    ...LEARN_TOPICS.map((topic) => learnPath(locale, topic)),
    ...LEGAL_DOCUMENTS.map((document) => legalPath(locale, document)),
  ]);
}
