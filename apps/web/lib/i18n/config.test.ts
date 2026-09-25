import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, LOCALES, localeFromPathname, localeFromRequestHeader, localizedPath, withoutLocalePrefix } from "@/lib/i18n/config";

describe("locale routing", () => {
  it("only accepts the explicit, case-sensitive locale paths", () => {
    expect(LOCALES).toEqual(["en", "ja", "ko", "zh-Hans", "zh-Hant"]);
    expect(localeFromPathname("/ja/stock/NVDA")).toBe("ja");
    expect(localeFromPathname("/zh-Hant")).toBe("zh-Hant");
    expect(localeFromPathname("/ZH-Hans")).toBe(DEFAULT_LOCALE);
    expect(localeFromPathname("/zh")).toBe(DEFAULT_LOCALE);
    expect(localeFromPathname("/stock/NVDA")).toBe(DEFAULT_LOCALE);
  });
  it("does not use a caller-provided locale as a fallback", () => {
    expect(localeFromRequestHeader("ja")).toBe("ja");
    expect(localeFromRequestHeader("ZH-Hans")).toBe(DEFAULT_LOCALE);
    expect(localeFromRequestHeader(null)).toBe(DEFAULT_LOCALE);
  });
  it("maps only public page destinations and retains an English URL", () => {
    expect(withoutLocalePrefix("/ko/stock/NVDA")).toBe("/stock/NVDA");
    expect(localizedPath("ja", "/stock/NVDA")).toBe("/ja/stock/NVDA");
    expect(localizedPath("en", "/ja/stock/NVDA")).toBe("/stock/NVDA");
    expect(localizedPath("ja", "/provider/prestocks/ANDURIL")).toBe("/ja/provider/prestocks/ANDURIL");
    expect(localizedPath("en", "/ko/provider/tessera/tOpenAI")).toBe("/provider/tessera/tOpenAI");
    expect(localizedPath("ko", "/provider/prestocks")).toBeNull();
    expect(localizedPath("ko", "/api/v2/fundamentals")).toBeNull();
    expect(localizedPath("ko", "https://www.sec.gov/Archives")).toBeNull();
  });
});
