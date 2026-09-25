/**
 * The app IA's vocabulary rule (docs/ui-design/app-ia-v2.md sections 7.1 and
 * 7.3) for Explore, the companies list and the company pages:
 *
 * - the section 7.1 words never appear inside `<main>`, in any locale, in
 *   negated form too (quote, NAV, advice, recommendation, best, top, popular,
 *   trending, undervalued, fair value, target price, signal, profit, loss,
 *   gain, return, performance, "1 NVDAx = ...");
 * - "price" appears only inside `data-term="pyth-reference-price"`,
 *   `data-term="price-impact"`, `data-term="pyth-confidence"` or
 *   `data-term="onchain-trade-price"` (the price and financials chart);
 * - buying words appear only inside `data-cta="buy"` or
 *   `data-term="buy-in-benten"` (the capability tag and line).
 *
 * Non-Latin terms are escaped, because only registered catalogs may contain
 * CJK text. Their meaning, per locale:
 * - ja: quote/market level, estimate, net asset value, NAV, advice, recommend (x3), best (x2), popular, featured stock,
 *   undervalued, fair value, target price, signal, unrealized gain, unrealized loss, gain/loss ratio, rise/fall, return,
 *   investment results, performance; price (x3); purchase, buy.
 * - ko: bid/ask, market level, net asset, advice (x2), recommend (x2), best (x2), popular, undervalued, fair value,
 *   target price, signal (x2), rate of return, gain/loss, performance, return; price, share price; purchase, buy.
 * - zh-Hans / zh-Hant: quote, market level, NAV, advice, recommend, best (x2), popular, undervalued, fair value,
 *   target price, signal (x1 / x2), gain/loss, rate of return, return, performance; price, share price; purchase, buy.
 * Words that SEC fact labels need (for example the "net income" labels, which contain the character for profit) are
 * not listed; performance-sense compounds are.
 *
 * Standard accounting names (statement lines such as Gross profit or Return on equity (ROE), and the statements'
 * own names, such as the Korean name of the income statement, which contains the gain/loss word) are allowed only
 * inside `data-term="accounting-line-item"` elements: `withoutAccountingTerms` removes them before the 7.1 check,
 * and outside them every word stays forbidden.
 */
export const LATIN_FORBIDDEN = /\b(quotes?|nav|net asset value|advice|advise|recommend\w*|best|top|popular|trending|undervalued|fair value|target price|signals?|profits?|loss(?:es)?|gains?|returns?|performance)\b|\b1 NVDAx =/i;
export const LATIN_PRICE = /\bprices?\b/i;
export const LATIN_BUY = /\b(buy|buying|purchase\w*)\b/i;

export const LOCALE_FORBIDDEN = {
  en: null,
  ja: /\u6c17\u914d|\u76f8\u5834|\u898b\u7a4d|\u7d14\u8cc7\u7523|\u57fa\u6e96\u4fa1\u984d|\u52a9\u8a00|\u63a8\u5968|\u304a\u3059\u3059\u3081|\u304a\u52e7\u3081|\u6700\u826f|\u6700\u9069|\u4eba\u6c17|\u6ce8\u76ee\u9298\u67c4|\u5272\u5b89|\u9069\u6b63\u4fa1\u683c|\u76ee\u6a19\u682a\u4fa1|\u30b7\u30b0\u30ca\u30eb|\u542b\u307f\u76ca|\u542b\u307f\u640d|\u640d\u76ca\u7387|\u9a30\u843d|\u30ea\u30bf\u30fc\u30f3|\u904b\u7528\u6210\u7e3e|\u30d1\u30d5\u30a9\u30fc\u30de\u30f3\u30b9/u,
  ko: /\ud638\uac00|\uc2dc\uc138|\uc21c\uc790\uc0b0|\uc870\uc5b8|\uc790\ubb38|\ucd94\ucc9c|\uad8c\uc7a5|\ucd5c\uace0|\ucd5c\uc120|\uc778\uae30|\uc800\ud3c9\uac00|\uc801\uc815\uac00|\ubaa9\ud45c\uac00|\uc2e0\ud638|\uc2dc\uadf8\ub110|\uc218\uc775\ub960|\uc190\uc775|\uc131\uacfc|\uc218\uc775/u,
  "zh-Hans": /\u62a5\u4ef7|\u884c\u60c5|\u51c0\u503c|\u5efa\u8bae|\u63a8\u8350|\u6700\u4f73|\u6700\u597d|\u70ed\u95e8|\u4f4e\u4f30|\u5408\u7406\u4ef7|\u76ee\u6807\u4ef7|\u4fe1\u53f7|\u76c8\u4e8f|\u6536\u76ca\u7387|\u56de\u62a5|\u8868\u73b0/u,
  "zh-Hant": /\u5831\u50f9|\u884c\u60c5|\u6de8\u503c|\u5efa\u8b70|\u63a8\u85a6|\u6700\u4f73|\u6700\u597d|\u71b1\u9580|\u4f4e\u4f30|\u5408\u7406\u50f9|\u76ee\u6a19\u50f9|\u4fe1\u865f|\u8a0a\u865f|\u76c8\u8667|\u6536\u76ca\u7387|\u56de\u5831|\u8868\u73fe/u,
};
export const LOCALE_PRICE = {
  en: null,
  ja: /\u4fa1\u683c|\u5024\u6bb5|\u682a\u4fa1/u,
  ko: /\uac00\uaca9|\uc8fc\uac00/u,
  "zh-Hans": /\u4ef7\u683c|\u80a1\u4ef7/u,
  "zh-Hant": /\u50f9\u683c|\u80a1\u50f9/u,
};
export const LOCALE_BUY = {
  en: null,
  ja: /\u8cfc\u5165|\u8cb7/u,
  ko: /\uad6c\ub9e4|\ub9e4\uc218/u,
  "zh-Hans": /\u8d2d\u4e70|\u4e70\u5165/u,
  "zh-Hant": /\u8cfc\u8cb7|\u8cb7\u5165/u,
};

function matches(text, latin, local) {
  const found = [...text.matchAll(new RegExp(latin.source, "gi"))].map((match) => match[0]);
  if (local) found.push(...[...text.matchAll(new RegExp(local.source, "gu"))].map((match) => match[0]));
  return found;
}

/** Section 7.1 words in a text. */
export function forbiddenWords(text, locale) {
  return matches(text, LATIN_FORBIDDEN, LOCALE_FORBIDDEN[locale]);
}

/** Price and buying words in a text (allowed only inside their marked elements). */
export function markedWords(text, locale) {
  return [...matches(text, LATIN_PRICE, LOCALE_PRICE[locale]), ...matches(text, LATIN_BUY, LOCALE_BUY[locale])];
}

/** Elements whose content may name a price or buying. Each is a leaf-like element without a nested element of its own tag. */
const MARKED = /<(\w+)\b[^>]*\b(?:data-cta="buy"|data-term="(?:buy-in-benten|pyth-reference-price|price-impact|pyth-confidence|onchain-trade-price)")[^>]*>[\s\S]*?<\/\1>/g;

export function withoutMarked(html) {
  return html.replace(MARKED, " ");
}

/** Standard accounting names, the only elements where a 7.1 word may appear (a leaf span of catalog text). */
const ACCOUNTING_TERM = /<span\b[^>]*\bdata-term="accounting-line-item"[^>]*>[^<]*<\/span>/g;

export function withoutAccountingTerms(html) {
  return html.replace(ACCOUNTING_TERM, " ");
}
