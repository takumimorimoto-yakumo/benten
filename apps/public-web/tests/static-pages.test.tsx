import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PRICING_CONFIG } from "../../../packages/pricing/src/config.ts";
import { RATE_LIMIT_WINDOW_MS } from "../../../packages/solana-rpc-relay/src/config.ts";
import { ACTIVITY_CONFIG } from "../app/features/activity/activity-config.ts";
import { tabOf } from "../app/features/navigation/app-tabs.ts";
import { PRICE_DISPLAY_CONFIG } from "../app/features/pricing/price-config.ts";
import { PAGE_FACTS, STATIC_PAGE_CONFIG } from "../app/features/static-pages/static-page-config.ts";
import { PRODUCT_ROUTES, PRODUCT_TICKERS } from "../../../packages/purchase/src/routes-table.ts";

/** The routes table's symbols, in its order: the list About and the xStocks page state. */
const PRODUCT_ROUTE_SYMBOLS = PRODUCT_TICKERS.map((ticker) => PRODUCT_ROUTES[ticker].symbol);
import { pageLabelsFor, staticPagesCopyFor } from "../app/features/static-pages/static-page-copy.ts";
import { AboutPage, LearnPage, LegalPage } from "../app/features/static-pages/static-pages.tsx";
import { portfolioMessagesFor } from "../app/i18n/holdings-messages.ts";
import { LEARN_TOPICS, learnPath, LEGAL_DOCUMENTS, legalPath, localePrefix, pagePath, PUBLIC_WEB_LOCALES, type PublicWebLocale } from "../app/i18n/locales.ts";
import { PURCHASE_NOTICE_COPY } from "../app/i18n/pages-messages.ts";
import { PAGES_NAV_MESSAGES } from "../app/i18n/pages-nav-messages.ts";
import { purchaseMessagesFor } from "../app/i18n/purchase-messages.ts";
import { buildStaticPagePrerenderPaths } from "../app/lib/prerender-paths.server.ts";
import { createStaticPageDocument } from "../app/lib/static-page.server.ts";
import { markedTexts, staticPageVocabularyFindings, textOf } from "./static-pages-vocabulary.mjs";

/** The structure of a catalog; a marked text counts as a text, since marks follow each locale's words. */
function shape(value: unknown): unknown {
  if (typeof value === "function") return `fn/${value.length}`;
  if (Array.isArray(value)) return value.map(shape);
  if (value && typeof value === "object") return "vocabulary" in value ? "string" : Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, shape(nested)]));
  return typeof value;
}

/** Every static page of one locale, rendered as its body (the shell is covered by the app-shell tests). */
function pages(locale: PublicWebLocale): { name: string; html: string }[] {
  return [
    { name: "about", html: renderToStaticMarkup(<AboutPage locale={locale} />) },
    ...LEARN_TOPICS.map((topic) => ({ name: `learn/${topic}`, html: renderToStaticMarkup(<LearnPage locale={locale} topic={topic} />) })),
    ...LEGAL_DOCUMENTS.map((document) => ({ name: `legal/${document}`, html: renderToStaticMarkup(<LegalPage locale={locale} document={document} />) })),
  ];
}

/**
 * The stated exception to the vocabulary rule: the only English sentences
 * that may name a section 7.1 word, each a negation these pages must make.
 */
const ENGLISH_NEGATIONS = [
  // The fixed sentence of app IA section 7.3; the ranking sentence beside it passes without any mark.
  ["about", "This is not investment advice."],
  ["learn/reference-prices", "It is not a quote, not a net asset value and not the price you pay."],
  ["legal/terms", "Not investment advice"],
  ["legal/terms", "Nothing in Benten is investment advice, a recommendation, a valuation or an offer to buy or sell any asset."],
  ["legal/disclaimer", "Benten is an information and tooling service. It does not provide investment advice, recommendations, valuations or forward-looking predictions of any kind, and nothing it presents is an offer, solicitation or endorsement to buy, sell or hold any asset."],
  ["legal/disclaimer", "Benten and its contributors accept no liability for any loss or damage arising from reliance on information provided through this service."],
  ["legal/disclaimer", "This is not investment advice."],
];

describe("static information pages", () => {
  it("has one catalog per locale with an identical structure", () => {
    const english = shape(staticPagesCopyFor("en"));
    const englishNav = shape(PAGES_NAV_MESSAGES.en);
    for (const locale of PUBLIC_WEB_LOCALES) {
      expect(shape(staticPagesCopyFor(locale)), locale).toEqual(english);
      expect(shape(PAGES_NAV_MESSAGES[locale]), locale).toEqual(englishNav);
    }
  });

  it("follows the vocabulary rule on every page in every locale", () => {
    for (const locale of PUBLIC_WEB_LOCALES) {
      for (const { name, html } of pages(locale)) expect(staticPageVocabularyFindings(html, locale), `${locale} ${name}`).toEqual([]);
    }
  });

  it("allows section 7.1 words only in the listed negations, the same number in every locale", () => {
    const negations = (locale: PublicWebLocale) => pages(locale).flatMap(({ name, html }) => markedTexts(html).filter(({ marks }) => marks.includes("negation")).map(({ text }) => [name, text]));
    expect(negations("en")).toEqual(ENGLISH_NEGATIONS);
    for (const locale of PUBLIC_WEB_LOCALES) expect(negations(locale).map(([name]) => name), locale).toEqual(ENGLISH_NEGATIONS.map(([name]) => name));
  });

  it("About states the fixed advice sentence alone, and says it does not rank in its own unmarked sentence", () => {
    for (const locale of PUBLIC_WEB_LOCALES) {
      const about = pages(locale).find(({ name }) => name === "about")!.html;
      const section = /<section id="never"[\s\S]*?<\/section>/.exec(about)![0];
      const items = [...section.matchAll(/<li\b([^>]*)>([\s\S]*?)<\/li>/g)].map((match) => ({ marked: /data-vocabulary=/.test(match[1]), text: textOf(match[2]) }));
      const advice = items.filter((item) => item.marked);
      expect(advice, locale).toEqual([{ marked: true, text: PURCHASE_NOTICE_COPY[locale].notAdvice }]);
      // The ranking sentence is the item before it, with no mark: it passes the rule without the negation exception.
      const ranking = items[items.length - 2]!;
      expect(ranking.marked, locale).toBe(false);
      expect(staticPageVocabularyFindings(`<p>${ranking.text}</p>`, locale), locale).toEqual([]);
    }
  });

  it("repeats the purchase notice's four sentences and the labels other screens own exactly", () => {
    for (const locale of PUBLIC_WEB_LOCALES) {
      const notice = purchaseMessagesFor(locale).notice;
      expect(PURCHASE_NOTICE_COPY[locale], locale).toEqual(notice);
      const disclaimer = pages(locale).find(({ name }) => name === "legal/disclaimer")!.html;
      const section = /<section id="before-you-buy"[\s\S]*?<\/section>/.exec(disclaimer)![0];
      expect(textOf(section)).toContain(notice.heading);
      const items = [...section.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((match) => textOf(match[1]));
      expect(items, locale).toEqual([notice.usPersons, notice.noEligibilityCheck, notice.noAvailabilityGuarantee, notice.notAdvice]);
      const privacy = textOf(pages(locale).find(({ name }) => name === "legal/privacy")!.html);
      const labels = pageLabelsFor(locale);
      expect(labels.clearHistory).toBe(portfolioMessagesFor(locale).activity.clear);
      expect(privacy).toContain(labels.clearHistory);
      expect(privacy).toContain(labels.disconnect);
    }
  });

  it("states configuration values from their owning config modules", () => {
    expect(PAGE_FACTS).toEqual({
      staleAfterSeconds: PRICING_CONFIG.staleAfterSeconds,
      maxDisplayAgeHours: PRICE_DISPLAY_CONFIG.maxDisplayAgeHours,
      maxValueConfidencePercent: String(PRICE_DISPLAY_CONFIG.maxValueConfidenceBps / 100),
      activityMaxRecords: ACTIVITY_CONFIG.maxRecords,
      rateLimitWindowSeconds: RATE_LIMIT_WINDOW_MS / 1000,
      buyableSymbols: PRODUCT_ROUTE_SYMBOLS,
    });
    for (const locale of PUBLIC_WEB_LOCALES) {
      const prices = textOf(pages(locale).find(({ name }) => name === "learn/reference-prices")!.html);
      for (const value of [PAGE_FACTS.staleAfterSeconds, PAGE_FACTS.maxDisplayAgeHours, `${PAGE_FACTS.maxValueConfidencePercent}%`]) expect(prices, locale).toContain(String(value));
      const privacy = textOf(pages(locale).find(({ name }) => name === "legal/privacy")!.html);
      for (const value of [PAGE_FACTS.activityMaxRecords, PAGE_FACTS.rateLimitWindowSeconds]) expect(privacy, locale).toContain(String(value));
    }
  });

  it("links the source repository from About only, and otherwise links outside Benten only to the cited issuer documents", () => {
    const repository = STATIC_PAGE_CONFIG.sourceRepositoryUrl;
    expect(repository).toBe("https://github.com/takumimorimoto-yakumo/benten");
    const cited = new Set(Object.values(STATIC_PAGE_CONFIG.sources).map((source) => source.url));
    for (const locale of PUBLIC_WEB_LOCALES) {
      for (const { name, html } of pages(locale)) {
        const isAbout = name === "about";
        expect(html.includes("data-static-source"), `${locale} ${name}`).toBe(isAbout);
        if (isAbout) expect(html, locale).toContain(`href="${repository}"`);
        const external = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]).filter((href) => !href.startsWith("/"));
        expect(external.filter((href) => !cited.has(href) && !(isAbout && href === repository)), `${locale} ${name}`).toEqual([]);
        // Every cited document opens in a new tab and says so.
        const citedAnchors = (html.match(/<a\b[^>]*href="https:[^"]*"[^>]*>/g) ?? []).filter((anchor) => cited.has(/href="([^"]+)"/.exec(anchor)![1]));
        for (const anchor of citedAnchors) expect(anchor, `${locale} ${name}`).toMatch(/target="_blank"[^>]*rel="noopener noreferrer"|rel="noopener noreferrer"[^>]*target="_blank"/);
      }
    }
  });

  it("cites the issuer's documents under the xStocks statements they support, in every locale", () => {
    for (const locale of PUBLIC_WEB_LOCALES) {
      const html = pages(locale).find(({ name }) => name === "learn/xstocks")!.html;
      const citations = (section: string) => {
        const block = new RegExp(`data-static-section="${section}"[\\s\\S]*?</section>`).exec(html)?.[0] ?? "";
        return [...block.matchAll(/data-static-citation="([^"]+)"[^>]*><a href="([^"]+)"/g)].map((match) => [match[1], match[2]]);
      };
      const url = (key: keyof typeof STATIC_PAGE_CONFIG.sources) => [key, STATIC_PAGE_CONFIG.sources[key].url];
      expect(citations("own"), locale).toEqual([url("xstocks-legal-overview")]);
      expect(citations("restrictions"), locale).toEqual([url("backed-restricted-countries"), url("xstocks-legal-overview")]);
      expect(citations("multiplier"), locale).toEqual([url("xstocks-multipliers")]);
    }
  });

  it("marks the current page in its side list and links every sibling in the same locale", () => {
    for (const locale of PUBLIC_WEB_LOCALES) {
      const learn = renderToStaticMarkup(<LearnPage locale={locale} topic="prestocks" />);
      expect([...learn.matchAll(/<a href="([^"]+)" aria-current="page"/g)].map((match) => match[1])).toEqual([learnPath(locale, "prestocks")]);
      for (const topic of LEARN_TOPICS) expect(learn).toContain(`href="${learnPath(locale, topic)}"`);
      const legal = renderToStaticMarkup(<LegalPage locale={locale} document="privacy" />);
      for (const document of LEGAL_DOCUMENTS) expect(legal).toContain(`href="${legalPath(locale, document)}"`);
    }
  });
});

describe("static page addresses", () => {
  it("prerenders About, four learn topics and three legal documents in every locale", () => {
    const paths = buildStaticPagePrerenderPaths();
    expect(paths).toHaveLength(PUBLIC_WEB_LOCALES.length * 8);
    expect(new Set(paths)).toHaveLength(paths.length);
    for (const path of ["/about", "/learn/xstocks", "/learn/prestocks", "/learn/reference-prices", "/learn/self-custody", "/legal/terms", "/legal/privacy", "/legal/disclaimer", "/ja/about", "/zh-Hant/legal/privacy"]) expect(paths).toContain(path);
    expect(paths.some((path) => path.startsWith("/en/") || path.includes("developers"))).toBe(false);
  });

  it("accepts only a listed topic or document at its canonical path", () => {
    expect(createStaticPageDocument({ pathname: "/learn/xstocks", page: "learn", topic: "xstocks" })).toMatchObject({ locale: "en", canonicalPath: "/learn/xstocks" });
    expect(createStaticPageDocument({ locale: "ko", pathname: "/ko/about", page: "about" })).toMatchObject({ canonicalPath: "/ko/about" });
    expect(() => createStaticPageDocument({ pathname: "/learn/developers", page: "learn", topic: "developers" })).toThrow("unknown topic");
    expect(() => createStaticPageDocument({ pathname: "/legal/cookies", page: "legal", document: "cookies" })).toThrow("unknown document");
    expect(() => createStaticPageDocument({ locale: "en", pathname: "/en/about", page: "about" })).toThrow("noncanonical");
    expect(() => createStaticPageDocument({ locale: "fr", pathname: "/fr/about", page: "about" })).toThrow("unsupported locale");
  });

  it("belongs to Explore, keeps its page across languages, and is where Activity's privacy link points", () => {
    for (const page of [{ kind: "about" }, { kind: "learn", topic: "self-custody" }, { kind: "legal", document: "terms" }] as const) expect(tabOf(page)).toBe("explore");
    expect(pagePath("ja", { kind: "learn", topic: "reference-prices" })).toBe("/ja/learn/reference-prices");
    expect(pagePath("en", { kind: "legal", document: "disclaimer" })).toBe("/legal/disclaimer");
    for (const locale of PUBLIC_WEB_LOCALES) expect(ACTIVITY_CONFIG.privacyPath?.(localePrefix(locale))).toBe(legalPath(locale, "privacy"));
  });
});
