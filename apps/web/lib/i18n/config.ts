export const LOCALES = ["en", "ja", "ko", "zh-Hans", "zh-Hant"] as const;
export type Locale = typeof LOCALES[number];

export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(value: string | null | undefined): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function localeFromPathname(pathname: string): Locale {
  const segment = pathname.split("/")[1];
  return isLocale(segment) ? segment : DEFAULT_LOCALE;
}

export function localeFromRequestHeader(value: string | null): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function withoutLocalePrefix(pathname: string): string {
  const segments = pathname.split("/");
  if (isLocale(segments[1])) segments.splice(1, 1);
  const result = segments.join("/");
  return result || "/";
}

export function localizedPath(locale: Locale, pathname: string): string | null {
  const bare = withoutLocalePrefix(pathname);
  if (bare === "/" || /^\/stock\/[^/]+$/.test(bare) || /^\/provider\/[^/]+\/[^/]+$/.test(bare) || /^\/company\/[^/]+$/.test(bare)) {
    return locale === DEFAULT_LOCALE ? bare : `/${locale}${bare}`;
  }
  return null;
}
