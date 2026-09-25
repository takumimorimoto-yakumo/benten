import { describe, expect, it } from "vitest";
import { formatCompactCurrency, formatExactCurrency, formatNumber, formatPeriodEndMonth, formatScalar } from "../app/i18n/format.ts";
import { fiscalYearLabel } from "../app/i18n/fiscal-year.ts";
import { dossierPath, homePath, PUBLIC_WEB_LOCALES } from "../app/i18n/locales.ts";
import { LOCALE_LABELS, MESSAGES, REFERENCE_MESSAGES } from "../app/i18n/messages.ts";

function shape(value: unknown): unknown {
  if (typeof value === "function") return `fn/${value.length}`;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, shape(nested)]));
  return typeof value;
}

describe("public-Web i18n", () => {
  it("has one catalog per locale with an identical key structure", () => {
    expect(Object.keys(MESSAGES)).toEqual([...PUBLIC_WEB_LOCALES]);
    expect(Object.keys(LOCALE_LABELS)).toEqual([...PUBLIC_WEB_LOCALES]);
    const english = shape(MESSAGES.en);
    for (const locale of PUBLIC_WEB_LOCALES) expect(shape(MESSAGES[locale])).toEqual(english);
  });

  it("says yes or no in words, never as a raw true or false", () => {
    for (const locale of PUBLIC_WEB_LOCALES) {
      const { yes, no } = MESSAGES[locale].dossier.registry;
      expect(yes, locale).not.toBe(no);
      for (const word of [yes, no]) expect(word, locale).not.toMatch(/^(true|false)$/i);
    }
    expect([MESSAGES.en.dossier.registry.yes, MESSAGES.en.dossier.registry.no]).toEqual(["Yes", "No"]);
  });

  it("keeps the canonical path contract: English unprefixed, never /en", () => {
    expect(homePath("en")).toBe("/");
    expect(homePath("ja")).toBe("/ja");
    expect(dossierPath("en", "NVDA")).toBe("/stock/NVDA");
    expect(dossierPath("zh-Hant", "BRK.B")).toBe("/zh-Hant/stock/BRK.B");
  });

  it("never groups identifiers and shows exact reported amounts", () => {
    expect(formatNumber(2026, "en", "identifier")).toBe("2026");
    expect(formatScalar(2026, "ja", "identifier")).toBe("2026");
    expect(formatNumber(2026, "en")).toBe("2,026");
    expect(formatScalar(null, "en")).toBe("—");
    expect(formatExactCurrency(215938000000, "USD", "en").replace(/\s/g, " ")).toBe("USD 215,938,000,000");
    // Company pages: short, in each locale's own units, to the configured significant digits; identifiers stay ungrouped.
    expect(formatCompactCurrency(215938000000, "USD", "en")).toBe("$215.9B");
    expect(formatCompactCurrency(215938000000, "USD", "ja")).toBe("$2159\u5104");
    expect(formatCompactCurrency(215938000000, "USD", "ko")).toBe("$2159\uc5b5");
    expect(formatCompactCurrency(215938000000, "USD", "zh-Hans")).toBe("$2159\u4ebf");
    expect(formatCompactCurrency(-3848152000, "USD", "en")).toBe("-$3.848B");
    expect(formatCompactCurrency(Number.NaN, "USD", "en")).toBe("—");
  });

  it("names a fiscal year only by the month it ends, in every locale", () => {
    // Home Depot's year ending 2026-02-01 is its own FY2025; the page names it by its end month alone.
    expect(Object.fromEntries(PUBLIC_WEB_LOCALES.map((locale) => [locale, fiscalYearLabel("2026-02-01", locale)]))).toEqual({
      en: "Year ended Feb 2026",
      ja: "2026\u5e742\u6708\u671f",
      ko: "2026\ub144 2\uc6d4 \uacb0\uc0b0",
      "zh-Hans": "\u622a\u81f32026\u5e742\u6708\u7684\u8d22\u5e74",
      "zh-Hant": "\u622a\u81f32026\u5e742\u6708\u7684\u8ca1\u5e74",
    });
    // The chart axis form: the month (Japanese keeps its own short year name).
    expect(Object.fromEntries(PUBLIC_WEB_LOCALES.map((locale) => [locale, fiscalYearLabel("2026-01-25", locale, "axis")]))).toEqual({
      en: "Jan 2026",
      ja: "2026\u5e741\u6708\u671f",
      ko: "2026\ub144 1\uc6d4",
      "zh-Hans": "2026\u5e741\u6708",
      "zh-Hant": "2026\u5e741\u6708",
    });
    for (const locale of PUBLIC_WEB_LOCALES) {
      for (const form of ["full", "axis"] as const) expect(fiscalYearLabel("2025-12-31", locale, form), `${locale} ${form}`).not.toMatch(/FY/);
    }
    // The month is the period end's own, in UTC: a year ending on the 1st never shifts to the prior month.
    expect(formatPeriodEndMonth("2026-02-01", "en")).toBe("Feb 2026");
    expect(fiscalYearLabel("2025-12-31", "en")).toBe("Year ended Dec 2025");
    // A malformed date is shown as given, never reinterpreted.
    expect(formatPeriodEndMonth("2026-02-30", "en")).toBe("2026-02-30");
  });

  it("calls a provider the provider in Chinese, keeping the issuer word only for the xStocks issuer", () => {
    // U+53D1 U+884C U+65B9 (zh-Hans) and U+767C U+884C U+65B9 (zh-Hant): "issuer".
    const issuer = /\u53d1\u884c\u65b9|\u767c\u884c\u65b9/u;
    const strings = (value: unknown): string[] =>
      typeof value === "string" ? [value]
        : typeof value === "function" ? [String((value as (...args: string[]) => unknown)("A", "B", "C"))]
          : value && typeof value === "object" ? Object.values(value).flatMap(strings) : [];
    for (const locale of ["zh-Hans", "zh-Hant"] as const) {
      expect(strings(REFERENCE_MESSAGES[locale]).filter((text) => issuer.test(text)), locale).toEqual([]);
      const { providers } = MESSAGES[locale].home;
      expect(strings({ providers }).filter((text) => issuer.test(text)), locale).toEqual([]);
      expect(issuer.test(MESSAGES[locale].dossier.registry.issuer), locale).toBe(true);
    }
    expect(REFERENCE_MESSAGES.en.terms.unknownCodes.execution_quote_unavailable).toBe("Provider publishes no execution terms");
  });
});

describe("time zone label", () => {
  const JAN_2026 = Date.UTC(2026, 0, 15, 0, 37, 5);
  const withZone = <T,>(zone: string, run: () => T): T => {
    const previous = process.env.TZ;
    process.env.TZ = zone;
    try {
      return run();
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  };

  it("names the zone by abbreviation where one exists, otherwise by its UTC offset", async () => {
    const { timeZoneLabel } = await import("../app/i18n/format.ts");
    expect(withZone("Asia/Tokyo", () => timeZoneLabel(JAN_2026))).toBe("UTC+9");
    expect(withZone("Asia/Kolkata", () => timeZoneLabel(JAN_2026))).toBe("UTC+5:30");
    expect(withZone("America/New_York", () => timeZoneLabel(JAN_2026))).toBe("EST");
    expect(withZone("UTC", () => timeZoneLabel(JAN_2026))).toBe("UTC");
    expect(withZone("Africa/Abidjan", () => timeZoneLabel(JAN_2026))).toBe("UTC");
  });

  it("ends every locale's time with the same zone label", async () => {
    const { formatTimeWithZone } = await import("../app/i18n/format.ts");
    const times = withZone("Asia/Tokyo", () => PUBLIC_WEB_LOCALES.map((locale) => formatTimeWithZone(JAN_2026, locale, { hour: "2-digit", minute: "2-digit" })));
    for (const time of times) expect(time).toMatch(/ UTC\+9$/);
    expect(times.join(" ")).not.toMatch(/GMT|JST/);
  });
});

describe("aligned compact amounts", () => {
  it("keeps the same significant digits for every figure in a table", async () => {
    const { formatCompactCurrencyAligned } = await import("../app/i18n/format.ts");
    expect([5.01e9, 9.714e9, 614e6, 130.5e9].map((value) => formatCompactCurrencyAligned(value, "USD", "en"))).toEqual(["$5.010B", "$9.714B", "$614.0M", "$130.5B"]);
    expect(formatCompactCurrencyAligned(Number.NaN, "USD", "en")).toBe("—");
  });
});

describe("sentences run together", () => {
  it("puts the locale's space between whole sentences: one in English and Korean, none in Japanese and Chinese", async () => {
    const { joinSentences } = await import("../app/i18n/format.ts");
    const { SENTENCE_SEPARATOR } = await import("../app/i18n/format-config.ts");
    expect(Object.keys(SENTENCE_SEPARATOR)).toEqual([...PUBLIC_WEB_LOCALES]);
    expect(joinSentences(["One.", "Two."], "en")).toBe("One. Two.");
    expect(joinSentences(["A.", "B."], "ko")).toBe("A. B.");
    // "\u3002" is the ideographic full stop.
    for (const locale of ["ja", "zh-Hans", "zh-Hant"] as const) expect(joinSentences(["A\u3002", "B\u3002"], locale)).toBe("A\u3002B\u3002");
    expect(joinSentences(["Only."], "ja")).toBe("Only.");
  });
});
