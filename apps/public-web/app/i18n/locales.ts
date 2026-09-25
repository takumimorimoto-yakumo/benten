/**
 * Public-Web locale identifiers and canonical path rules. Browser-safe: no
 * registry, snapshot, or server dependency. English is the unprefixed default;
 * `/en` is never a valid path (see ingress/classify.ts).
 */

export const PUBLIC_WEB_LOCALES = ["en", "ja", "ko", "zh-Hans", "zh-Hant"] as const;
export type PublicWebLocale = (typeof PUBLIC_WEB_LOCALES)[number];
export const DEFAULT_LOCALE: PublicWebLocale = "en";

export function isPublicWebLocale(value: unknown): value is PublicWebLocale {
  return typeof value === "string" && (PUBLIC_WEB_LOCALES as readonly string[]).includes(value);
}

export function localePrefix(locale: PublicWebLocale): string {
  return locale === DEFAULT_LOCALE ? "" : `/${locale}`;
}

export function homePath(locale: PublicWebLocale): string {
  return localePrefix(locale) || "/";
}

/** `ticker` must already be an allowlisted canonical registry ticker. */
export function dossierPath(locale: PublicWebLocale, ticker: string): string {
  return `${localePrefix(locale)}/stock/${ticker}`;
}

/** `provider` and `id` must already resolve exactly with the registry's `findProviderAsset`. */
export function providerPath(locale: PublicWebLocale, provider: string, id: string): string {
  return `${localePrefix(locale)}/provider/${provider}/${id}`;
}

/** `slug` must already resolve exactly with the registry's `findCompany`. */
export function companyPath(locale: PublicWebLocale, slug: string): string {
  return `${localePrefix(locale)}/company/${slug}`;
}

/** The list of every company, fund and other xStock (app IA section 4.3). */
export function companiesPath(locale: PublicWebLocale): string {
  return `${localePrefix(locale)}/companies`;
}

/** The Holdings tab root (app shell, section 3.1 of the app IA). */
export function holdingsPath(locale: PublicWebLocale): string {
  return `${localePrefix(locale)}/holdings`;
}

/** The Activity tab root (app shell, section 3.1 of the app IA). */
export function activityPath(locale: PublicWebLocale): string {
  return `${localePrefix(locale)}/activity`;
}

/** An xStock's evidence page (app IA section 4.6). `ticker` must already be allowlisted and canonical. */
export function stockEvidencePath(locale: PublicWebLocale, ticker: string): string {
  return `${dossierPath(locale, ticker)}/evidence`;
}

/** A provider instrument's evidence page (app IA section 4.6). */
export function providerEvidencePath(locale: PublicWebLocale, provider: string, id: string): string {
  return `${providerPath(locale, provider, id)}/evidence`;
}

/** The buy flow of the one product with a route (app IA section 5.1). */
export function buyPath(locale: PublicWebLocale, ticker: string): string {
  return `${dossierPath(locale, ticker)}/buy`;
}

/** A same-page section of this locale's Home, such as the other-provider list. */
export function homeSectionPath(locale: PublicWebLocale, sectionId: string): string {
  return `${homePath(locale)}#${sectionId}`;
}

/** Static information pages (app IA sections 4.1 and 8.12): About, the learn topics and the legal documents. */
export const LEARN_TOPICS = ["xstocks", "prestocks", "reference-prices", "self-custody"] as const;
export type LearnTopic = (typeof LEARN_TOPICS)[number];
export const LEGAL_DOCUMENTS = ["terms", "privacy", "disclaimer"] as const;
export type LegalDocument = (typeof LEGAL_DOCUMENTS)[number];

export function isLearnTopic(value: unknown): value is LearnTopic {
  return typeof value === "string" && (LEARN_TOPICS as readonly string[]).includes(value);
}

export function isLegalDocument(value: unknown): value is LegalDocument {
  return typeof value === "string" && (LEGAL_DOCUMENTS as readonly string[]).includes(value);
}

export function aboutPath(locale: PublicWebLocale): string {
  return `${localePrefix(locale)}/about`;
}

export function learnPath(locale: PublicWebLocale, topic: LearnTopic): string {
  return `${localePrefix(locale)}/learn/${topic}`;
}

export function legalPath(locale: PublicWebLocale, document: LegalDocument): string {
  return `${localePrefix(locale)}/legal/${document}`;
}

/**
 * The public page kinds the shared layout can link between locales. A
 * not-found document has no canonical address of its own, so its language
 * links lead to each locale's Home.
 */
export type PublicPage =
  | { readonly kind: "home" }
  | { readonly kind: "dossier"; readonly ticker: string }
  | { readonly kind: "provider"; readonly provider: string; readonly id: string }
  | { readonly kind: "company"; readonly slug: string }
  | { readonly kind: "companies" }
  | { readonly kind: "holdings" }
  | { readonly kind: "activity" }
  | { readonly kind: "not-found" }
  | { readonly kind: "stock-evidence"; readonly ticker: string }
  | { readonly kind: "provider-evidence"; readonly provider: string; readonly id: string }
  | { readonly kind: "buy"; readonly ticker: string }
  | { readonly kind: "about" }
  | { readonly kind: "learn"; readonly topic: LearnTopic }
  | { readonly kind: "legal"; readonly document: LegalDocument };

export function pagePath(locale: PublicWebLocale, page: PublicPage): string {
  switch (page.kind) {
    case "home":
    case "not-found":
      return homePath(locale);
    case "dossier":
      return dossierPath(locale, page.ticker);
    case "provider":
      return providerPath(locale, page.provider, page.id);
    case "company":
      return companyPath(locale, page.slug);
    case "companies":
      return companiesPath(locale);
    case "holdings":
      return holdingsPath(locale);
    case "activity":
      return activityPath(locale);
    case "stock-evidence":
      return stockEvidencePath(locale, page.ticker);
    case "provider-evidence":
      return providerEvidencePath(locale, page.provider, page.id);
    case "buy":
      return buyPath(locale, page.ticker);
    case "about":
      return aboutPath(locale);
    case "learn":
      return learnPath(locale, page.topic);
    case "legal":
      return legalPath(locale, page.document);
  }
}
