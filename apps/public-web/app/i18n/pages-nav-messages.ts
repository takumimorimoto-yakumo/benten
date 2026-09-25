/**
 * Titles of the static information pages for every supported locale, as the
 * footer and the pages' side lists show them (every page's shell carries the
 * footer, so this catalog stays small). Registered for non-Latin text in
 * catalog-manifest.json. The pages' own copy is in pages-messages.ts.
 */
import type { LearnTopic, LegalDocument, PublicWebLocale } from "./locales";

/** What a text may contain beyond plain words: a required negation, price words, buying words (app IA section 7). */
export type Vocabulary = "negation" | "price" | "purchase";
export type PageText = string | { readonly text: string; readonly vocabulary: readonly Vocabulary[] };

export const negation = (text: string): PageText => ({ text, vocabulary: ["negation"] });
export const price = (text: string): PageText => ({ text, vocabulary: ["price"] });
export const purchase = (text: string): PageText => ({ text, vocabulary: ["purchase"] });

/** The text of a page text, without its vocabulary marks. */
export function pageTextOf(text: PageText): string {
  return typeof text === "string" ? text : text.text;
}

export type PagesNavCopy = {
  readonly footer: { readonly navLabel: string; readonly label: string; readonly about: string; readonly learn: string; readonly legal: string };
  readonly aside: { readonly learn: string; readonly legal: string };
  readonly topics: Record<LearnTopic, PageText>;
  readonly documents: Record<LegalDocument, string>;
};

const en: PagesNavCopy = {
  footer: { navLabel: "More about Benten", label: "About Benten", about: "About", learn: "Learn", legal: "Legal" },
  aside: { learn: "Learn", legal: "Legal" },
  topics: { xstocks: "What an xStock is", prestocks: "What a PreStocks token is", "reference-prices": price("What a Pyth reference price is"), "self-custody": "Your wallet, your approval" },
  documents: { terms: "Terms of use", privacy: "Privacy", disclaimer: "Disclaimer" },
};

const ja: PagesNavCopy = {
  footer: { navLabel: "Bentenの情報", label: "Bentenについて", about: "概要", learn: "解説", legal: "規約など" },
  aside: { learn: "解説", legal: "規約など" },
  topics: { xstocks: "xStockとは", prestocks: "PreStocksトークンとは", "reference-prices": price("Pyth 参考価格とは"), "self-custody": "ウォレットでの承認" },
  documents: { terms: "利用条件", privacy: "プライバシー", disclaimer: "免責事項" },
};

const ko: PagesNavCopy = {
  footer: { navLabel: "Benten 정보", label: "Benten 소개", about: "소개", learn: "알아보기", legal: "약관 등" },
  aside: { learn: "알아보기", legal: "약관 등" },
  topics: { xstocks: "xStock이란", prestocks: "PreStocks 토큰이란", "reference-prices": price("Pyth 참고 가격이란"), "self-custody": "지갑에서 하는 승인" },
  documents: { terms: "이용 조건", privacy: "개인정보", disclaimer: "면책 조항" },
};

const zhHans: PagesNavCopy = {
  footer: { navLabel: "Benten 信息", label: "关于 Benten", about: "关于", learn: "了解", legal: "条款等" },
  aside: { learn: "了解", legal: "条款等" },
  topics: { xstocks: "什么是 xStock", prestocks: "什么是 PreStocks 代币", "reference-prices": price("什么是 Pyth 参考价格"), "self-custody": "在钱包中批准" },
  documents: { terms: "使用条件", privacy: "隐私", disclaimer: "免责声明" },
};

const zhHant: PagesNavCopy = {
  footer: { navLabel: "Benten 資訊", label: "關於 Benten", about: "關於", learn: "了解", legal: "條款等" },
  aside: { learn: "了解", legal: "條款等" },
  topics: { xstocks: "什麼是 xStock", prestocks: "什麼是 PreStocks 代幣", "reference-prices": price("什麼是 Pyth 參考價格"), "self-custody": "在錢包中核准" },
  documents: { terms: "使用條件", privacy: "隱私", disclaimer: "免責聲明" },
};

export const PAGES_NAV_MESSAGES: Record<PublicWebLocale, PagesNavCopy> = { en, ja, ko, "zh-Hans": zhHans, "zh-Hant": zhHant };

export function pagesNavMessagesFor(locale: PublicWebLocale): PagesNavCopy {
  return PAGES_NAV_MESSAGES[locale];
}
