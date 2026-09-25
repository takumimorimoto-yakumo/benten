import { findCompany, findProviderAsset, resolveTicker } from "@benten/registry";
import { isPublishedCompany } from "./company.server.js";
import { activityPath, companiesPath, companyPath, holdingsPath, isPublicWebLocale, localePrefix, providerPath, type PublicWebLocale } from "../i18n/locales.js";

export type StaticFoundationRoute = "home" | "dossier" | "provider" | "company" | "companies" | "holdings" | "activity";

export type StaticFoundationDocument = {
  readonly kind: "static-foundation-v1";
  readonly locale: PublicWebLocale;
  readonly canonicalPath: string;
  readonly route: StaticFoundationRoute;
  readonly ticker?: string;
  readonly provider?: string;
  readonly providerAssetId?: string;
  readonly slug?: string;
};

type StaticDocumentInput = {
  readonly locale?: string;
  readonly pathname: string;
  readonly route: StaticFoundationRoute;
  readonly ticker?: string;
  readonly provider?: string;
  readonly providerAssetId?: string;
  readonly slug?: string;
};

function assertOnlyIdentity(input: StaticDocumentInput, allowed: readonly (keyof StaticDocumentInput)[]) {
  for (const key of ["ticker", "provider", "providerAssetId", "slug"] as const) {
    if (!allowed.includes(key) && input[key] !== undefined) throw new Error(`static ${input.route} document has an unexpected ${key}`);
  }
}

/**
 * Build-only, non-financial document metadata. It validates the pre-rendered
 * route identity (exact registry, provider-artifact, or company-map lookups
 * only) but deliberately does not expose facts, rights, quotes, or API-shaped
 * data.
 */
export function createStaticFoundationDocument(input: StaticDocumentInput): StaticFoundationDocument {
  const locale = input.locale ?? "en";
  if (!isPublicWebLocale(locale)) throw new Error("static document has an unsupported locale");

  const prefix = localePrefix(locale);
  if (input.route === "home") {
    assertOnlyIdentity(input, []);
    if (input.pathname !== (prefix || "/")) {
      throw new Error("static home document has a noncanonical path");
    }
    return { kind: "static-foundation-v1", route: "home", locale, canonicalPath: prefix || "/" };
  }

  if (input.route === "companies") {
    assertOnlyIdentity(input, []);
    const canonicalPath = companiesPath(locale);
    if (input.pathname !== canonicalPath) throw new Error("static companies document has a noncanonical path");
    return { kind: "static-foundation-v1", route: "companies", locale, canonicalPath };
  }

  if (input.route === "holdings" || input.route === "activity") {
    assertOnlyIdentity(input, []);
    const canonicalPath = input.route === "holdings" ? holdingsPath(locale) : activityPath(locale);
    if (input.pathname !== canonicalPath) throw new Error(`static ${input.route} document has a noncanonical path`);
    return { kind: "static-foundation-v1", route: input.route, locale, canonicalPath };
  }

  if (input.route === "provider") {
    assertOnlyIdentity(input, ["provider", "providerAssetId"]);
    const entry = findProviderAsset(input.provider, input.providerAssetId);
    if (!entry || entry.provider !== input.provider || entry.provider_asset_id !== input.providerAssetId) {
      throw new Error("static provider document has an unreviewed provider instrument");
    }
    const canonicalPath = providerPath(locale, entry.provider, entry.provider_asset_id);
    if (input.pathname !== canonicalPath) throw new Error("static provider document has a noncanonical path");
    return { kind: "static-foundation-v1", route: "provider", locale, canonicalPath, provider: entry.provider, providerAssetId: entry.provider_asset_id };
  }

  if (input.route === "company") {
    assertOnlyIdentity(input, ["slug"]);
    const company = findCompany(input.slug);
    if (!company || company.slug !== input.slug || !isPublishedCompany(company.slug)) {
      throw new Error("static company document has an unmapped or unpublished company");
    }
    const canonicalPath = companyPath(locale, company.slug);
    if (input.pathname !== canonicalPath) throw new Error("static company document has a noncanonical path");
    return { kind: "static-foundation-v1", route: "company", locale, canonicalPath, slug: company.slug };
  }

  assertOnlyIdentity(input, ["ticker"]);
  if (!input.ticker) throw new Error("static dossier document is missing a ticker");
  const asset = resolveTicker(input.ticker);
  if (!asset || asset.ticker !== input.ticker) {
    throw new Error("static dossier document has an unallowlisted ticker");
  }

  const canonicalPath = `${prefix}/stock/${asset.ticker}`;
  if (input.pathname !== canonicalPath) throw new Error("static dossier document has a noncanonical path");
  return { kind: "static-foundation-v1", route: "dossier", locale, canonicalPath, ticker: asset.ticker };
}
