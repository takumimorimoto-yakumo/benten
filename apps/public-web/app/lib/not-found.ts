/**
 * Scoped not-found documents. Browser- and host-safe: no registry, snapshot,
 * or React dependency. The host serves one of these prerendered documents,
 * always with status 404, for a public path it cannot serve; the scope only
 * decides the wording and the way back, never whether a path exists.
 */
import { PUBLIC_WEB_LOCALES, type PublicWebLocale } from "../i18n/locales.js";

export const NOT_FOUND_SCOPES = ["company", "provider", "stock", "page"] as const;
export type NotFoundScope = (typeof NOT_FOUND_SCOPES)[number];

/** Reserved prefix of the prerendered not-found documents; the host never serves it as a page. */
export const NOT_FOUND_DOCUMENT_PREFIX = "/__not-found";

export function isNotFoundScope(value: unknown): value is NotFoundScope {
  return typeof value === "string" && (NOT_FOUND_SCOPES as readonly string[]).includes(value);
}

export function notFoundDocumentPath(locale: PublicWebLocale, scope: NotFoundScope): string {
  return `${NOT_FOUND_DOCUMENT_PREFIX}/${locale}/${scope}`;
}

export function notFoundDocumentPaths(): readonly string[] {
  return PUBLIC_WEB_LOCALES.flatMap((locale) => NOT_FOUND_SCOPES.map((scope) => notFoundDocumentPath(locale, scope)));
}

const SCOPED_SEGMENTS: Readonly<Record<string, NotFoundScope>> = { company: "company", provider: "provider", stock: "stock" };

/**
 * The locale and scope of the not-found document for a raw request target.
 * Only exact, case-sensitive segment names count; anything else is the
 * default-locale generic page. It never decodes, normalizes, or resolves the
 * rest of the path.
 */
export function notFoundDocumentFor(rawTarget: string): { locale: PublicWebLocale; scope: NotFoundScope } {
  const path = typeof rawTarget === "string" ? rawTarget.split(/[?#]/, 1)[0] ?? "" : "";
  const segments = path.startsWith("/") ? path.slice(1).split("/") : [];
  let locale: PublicWebLocale = "en";
  let rest = segments;
  const first = segments[0];
  if (first !== undefined && first !== "en" && (PUBLIC_WEB_LOCALES as readonly string[]).includes(first)) {
    locale = first as PublicWebLocale;
    rest = segments.slice(1);
  }
  const head = rest[0];
  const scope = head !== undefined && Object.hasOwn(SCOPED_SEGMENTS, head) ? SCOPED_SEGMENTS[head]! : "page";
  return { locale, scope };
}
