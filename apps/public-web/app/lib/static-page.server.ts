import { aboutPath, isLearnTopic, isLegalDocument, isPublicWebLocale, learnPath, legalPath, type LearnTopic, type LegalDocument, type PublicWebLocale } from "../i18n/locales.js";

export type StaticPageDocument =
  | { readonly kind: "static-page-v1"; readonly locale: PublicWebLocale; readonly canonicalPath: string; readonly page: "about" }
  | { readonly kind: "static-page-v1"; readonly locale: PublicWebLocale; readonly canonicalPath: string; readonly page: "learn"; readonly topic: LearnTopic }
  | { readonly kind: "static-page-v1"; readonly locale: PublicWebLocale; readonly canonicalPath: string; readonly page: "legal"; readonly document: LegalDocument };

type StaticPageInput = { readonly locale?: string; readonly pathname: string } & (
  | { readonly page: "about" }
  | { readonly page: "learn"; readonly topic?: string }
  | { readonly page: "legal"; readonly document?: string }
);

/**
 * Build-only identity of an About, learn or legal document. A topic or
 * document outside the fixed lists, an unsupported locale or a noncanonical
 * path fails the build instead of emitting an ambiguous page.
 */
export function createStaticPageDocument(input: StaticPageInput): StaticPageDocument {
  const locale = input.locale ?? "en";
  if (!isPublicWebLocale(locale)) throw new Error("static page has an unsupported locale");
  const checked = (canonicalPath: string) => {
    if (input.pathname !== canonicalPath) throw new Error(`static ${input.page} page has a noncanonical path`);
    return canonicalPath;
  };
  if (input.page === "about") return { kind: "static-page-v1", locale, page: "about", canonicalPath: checked(aboutPath(locale)) };
  if (input.page === "learn") {
    if (!isLearnTopic(input.topic)) throw new Error("static learn page has an unknown topic");
    return { kind: "static-page-v1", locale, page: "learn", topic: input.topic, canonicalPath: checked(learnPath(locale, input.topic)) };
  }
  if (!isLegalDocument(input.document)) throw new Error("static legal page has an unknown document");
  return { kind: "static-page-v1", locale, page: "legal", document: input.document, canonicalPath: checked(legalPath(locale, input.document)) };
}
