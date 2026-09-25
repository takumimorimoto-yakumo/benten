import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { findCompany, listCompanies, listProviderAssets } from "@benten/registry";

import { CompanyPage } from "@/components/company-page";
import { ProviderPage } from "@/components/provider-page";
import { StockPage } from "@/components/stock-page";
import { groupDecimalString } from "@/lib/provider-presentation";
import { LOCALES, localizedPath, type Locale } from "@/lib/i18n/config";
import { messagesFor } from "@/lib/i18n/messages";
import { middleware } from "@/middleware";

/**
 * Words the company page must never render inside `<main>`, negated or not:
 * quote, NAV, price, advice, recommendation, "best" and buying. The English
 * pattern applies to every locale; each other locale adds its own words. CJK
 * words are written as escapes because the public tree holds no CJK text
 * outside the reviewed message catalog.
 */
const ENGLISH_FORBIDDEN = /\b(quote|quotes|quoted|nav|price|prices|pricing|advice|advise|adviser|recommend\w*|best|buy|buying|purchase\w*)\b/i;
const LOCALE_FORBIDDEN: Record<Exclude<Locale, "en">, readonly string[]> = {
  ja: ["\u6c17\u914d\u5024", "\u6c17\u914d", "\u76f8\u5834", "\u898b\u7a4d", "\u547c\u5024", "\u547c\u3073\u5024", "\u8cb7\u5024", "\u58f2\u5024", "\u57fa\u6e96\u4fa1\u984d", "\u7d14\u8cc7\u7523\u4fa1\u5024", "\u7d14\u8cc7\u7523\u4fa1\u984d", "\u4fa1\u683c", "\u5024\u6bb5", "\u682a\u4fa1", "\u52a9\u8a00", "\u30a2\u30c9\u30d0\u30a4\u30b9", "\u63a8\u5968", "\u63a8\u85a6", "\u304a\u3059\u3059\u3081", "\u304a\u52e7\u3081", "\u304a\u85a6\u3081", "\u6700\u826f", "\u6700\u9069", "\u30d9\u30b9\u30c8", "\u8cfc\u5165", "\u8cb7\u3044", "\u8cb7\u3046", "\u8cb7\u4ed8"],
  ko: ["\ud638\uac00", "\uc2dc\uc138", "\uacac\uc801", "\uc21c\uc790\uc0b0\uac00\uce58", "\uae30\uc900\uac00", "\uac00\uaca9", "\uc870\uc5b8", "\uc790\ubb38", "\uc5b4\ub4dc\ubc14\uc774\uc2a4", "\ucd94\ucc9c", "\uad8c\uc7a5", "\uad8c\uc720", "\ucd5c\uace0", "\ucd5c\uc120", "\ucd5c\uc801", "\ubca0\uc2a4\ud2b8", "\uad6c\ub9e4", "\uad6c\uc785", "\ub9e4\uc218", "\uc0ac\uc138\uc694"],
  "zh-Hans": ["\u62a5\u4ef7", "\u884c\u60c5", "\u4e70\u4ef7", "\u5356\u4ef7", "\u51c0\u503c", "\u4ef7\u683c", "\u80a1\u4ef7", "\u5efa\u8bae", "\u54a8\u8be2", "\u63a8\u8350", "\u6700\u4f73", "\u6700\u597d", "\u6700\u4f18", "\u8d2d\u4e70", "\u4e70\u5165", "\u4e70"],
  "zh-Hant": ["\u5831\u50f9", "\u884c\u60c5", "\u8cb7\u50f9", "\u8ce3\u50f9", "\u6de8\u503c", "\u50f9\u683c", "\u80a1\u50f9", "\u5efa\u8b70", "\u8aee\u8a62", "\u63a8\u85a6", "\u6700\u4f73", "\u6700\u597d", "\u6700\u512a", "\u8cfc\u8cb7", "\u8cb7\u5165", "\u8cb7"],
};

function renderCompany(slug: string, locale: Locale = "en"): string {
  return renderToStaticMarkup(createElement(CompanyPage, { slug, locale }));
}

/** Visible text only: tags removed and the few entities React emits decoded. */
function visibleText(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");
}

function forbiddenMatches(text: string, locale: Locale): string[] {
  const matches: string[] = [];
  const english = text.match(ENGLISH_FORBIDDEN);
  if (english) matches.push(english[0]);
  if (locale !== "en") for (const word of LOCALE_FORBIDDEN[locale]) if (text.includes(word)) matches.push(word);
  return matches;
}

function rowHrefs(html: string): string[] {
  return [...html.matchAll(/<th scope="row"[^>]*><a href="([^"]+)"/g)].map((match) => match[1]);
}

function expectedHrefs(slug: string, locale: Locale): string[] {
  return findCompany(slug)!.instruments.map((instrument) => localizedPath(locale, instrument.source === "xstocks_registry"
    ? `/stock/${instrument.entry.ticker}`
    : `/provider/${instrument.entry.provider}/${instrument.entry.provider_asset_id}`)!);
}

describe("company comparison page", () => {
  it("renders every mapped company with its instruments in map order", () => {
    for (const { slug, instrument_count } of listCompanies()) {
      const hrefs = rowHrefs(renderCompany(slug));
      expect(hrefs).toHaveLength(instrument_count);
      expect(hrefs).toEqual(expectedHrefs(slug, "en"));
    }
  });

  it("renders OpenAI and SpaceX in all five locales, SpaceX with its xStock first", () => {
    for (const locale of LOCALES) {
      for (const slug of ["openai", "spacex"]) {
        const html = renderCompany(slug, locale);
        expect(rowHrefs(html)).toEqual(expectedHrefs(slug, locale));
        expect(html).toContain(messagesFor(locale).company.notice.heading);
        expect(html).toContain(messagesFor(locale).company.instrumentsHeading(findCompany(slug)!.instruments.length));
      }
      expect(rowHrefs(renderCompany("spacex", locale))[0]).toBe(localizedPath(locale, "/stock/SPCX"));
    }
  });

  it("keeps the fixed section order and puts the notice before the list", () => {
    const html = renderCompany("openai");
    const copy = messagesFor("en").company;
    const headings = [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/g)].map((match) => match[1]);
    expect(headings).toEqual([copy.instrumentsHeading(2), copy.sources.heading, copy.method.heading]);
    expect([...html.matchAll(/<h1/g)]).toHaveLength(1);
    expect(html.indexOf(copy.notice.heading)).toBeLessThan(html.indexOf("<table"));
    expect(html.indexOf('class="breadcrumb"')).toBeLessThan(html.indexOf("<h1"));
    expect(html).toContain('href="/#provider-references"');
  });

  it("uses the single-instrument copy for a company with one instrument", () => {
    const html = visibleText(renderCompany("anduril"));
    const copy = messagesFor("en").company;
    expect(html).toContain(copy.lede.single("Anduril"));
    expect(html).toContain(copy.notice.bodySingle);
    expect(html).not.toContain(copy.notice.body);
  });

  it("keeps semantic table roles for the stacked layout", () => {
    const html = renderCompany("spacex");
    expect(html).toContain('<table role="table">');
    expect(html).toContain('<caption class="sr-only">Instruments linked to SpaceX</caption>');
    expect([...html.matchAll(/role="rowheader"/g)]).toHaveLength(3);
    expect([...html.matchAll(/role="columnheader"/g)]).toHaveLength(6);
    expect([...html.matchAll(/<a /g)]).toHaveLength(4);
  });

  it("renders no quote, NAV, price, advice, recommendation, best or buy wording in any locale", () => {
    for (const locale of LOCALES) {
      for (const { slug } of listCompanies()) {
        expect(forbiddenMatches(visibleText(renderCompany(slug, locale)), locale), `${locale} ${slug}`).toEqual([]);
      }
    }
  });

  it("detects forbidden wording, so the vocabulary check is not vacuous", () => {
    expect(forbiddenMatches("not a quote", "en")).toEqual(["quote"]);
    expect(forbiddenMatches("Buy now", "en")).toEqual(["Buy"]);
    for (const locale of LOCALES.filter((value): value is Exclude<Locale, "en"> => value !== "en")) {
      for (const word of LOCALE_FORBIDDEN[locale]) expect(forbiddenMatches(`x${word}x`, locale)).toContain(word);
    }
  });

  it("contains no button, form, input or wallet element", () => {
    for (const locale of LOCALES) {
      for (const { slug } of listCompanies()) {
        const html = renderCompany(slug, locale);
        expect(html).not.toMatch(/<(button|form|input|select|textarea)\b/);
        expect(html).not.toMatch(/wallet/i);
      }
    }
  });

  it("shows no reference or supply value of any mapped entry", () => {
    const catalog = listProviderAssets();
    if (!catalog.found) throw new Error("provider catalog unavailable");
    const values = catalog.items.flatMap((entry) => [
      ...entry.references.map((reference) => reference.value),
      ...(entry.supply_reference ? [entry.supply_reference.value] : []),
    ]);
    expect(values.length).toBeGreaterThan(0);
    for (const { slug } of listCompanies()) {
      const html = renderCompany(slug);
      for (const value of values) {
        expect(html).not.toContain(value);
        expect(html).not.toContain(groupDecimalString(value));
      }
    }
  });

  it("falls through to notFound for an unknown or differently cased slug", () => {
    for (const slug of ["unknown", "OpenAI", "figureai", "open-ai", " openai"]) expect(() => renderCompany(slug)).toThrow();
  });
});

describe("company page routing", () => {
  it("returns 404 for unknown, uppercase, encoded, extra-segment and /en/ company paths", () => {
    for (const path of [
      "/company/unknown", "/company/OpenAI", "/company/open%61i", "/company/figureai", "/company/openai/extra",
      "/company", "/en/company/openai", "/ja/company/OPENAI",
    ]) expect(middleware(new NextRequest(`http://localhost${path}`)).status, path).toBe(404);
  });

  it("accepts every mapped slug in every locale", () => {
    for (const { slug } of listCompanies()) {
      for (const locale of LOCALES) {
        expect(middleware(new NextRequest(`http://localhost${localizedPath(locale, `/company/${slug}`)}`)).status).toBe(200);
      }
    }
  });

  it("localizes company paths for the locale switcher", () => {
    expect(localizedPath("en", "/company/openai")).toBe("/company/openai");
    expect(localizedPath("ja", "/company/openai")).toBe("/ja/company/openai");
    expect(localizedPath("ko", "/zh-Hant/company/spacex")).toBe("/ko/company/spacex");
    expect(localizedPath("ja", "/company/openai/extra")).toBeNull();
  });
});

describe("company page entry points", () => {
  it("links the OPENAI provider page to the OpenAI company page, localized", () => {
    for (const locale of LOCALES) {
      const html = renderToStaticMarkup(createElement(ProviderPage, { provider: "prestocks", id: "OPENAI", locale }));
      expect(html).toContain(`href="${localizedPath(locale, "/company/openai")}"`);
      expect(html).toContain(messagesFor(locale).providers.page.companyPageLink("OpenAI"));
    }
  });

  it("links the SPCX stock page to the SpaceX company page and no other stock page", async () => {
    for (const locale of LOCALES) {
      const html = renderToStaticMarkup(await StockPage({ ticker: "SPCX", locale }));
      expect(html).toContain(`href="${localizedPath(locale, "/company/spacex")}"`);
    }
    const nvda = renderToStaticMarkup(await StockPage({ ticker: "NVDA", locale: "en" }));
    expect(nvda).not.toContain("/company/");
  });
});
