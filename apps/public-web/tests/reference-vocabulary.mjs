/**
 * Words a provider instrument or company page must never present inside
 * `<main>`, including in negated form: quote, NAV, price, advice,
 * recommendation, "best", and buying or purchase (design contract section
 * 8.2). Non-Latin terms are escaped because only registered catalogs may
 * contain CJK text:
 * - ja: quote/market level, estimate, net asset value, NAV, price (x3), advice, recommend (x3), best (x2), purchase, buy, fill;
 * - ko: bid/ask, market level, net asset, price, share price, advice (x2), recommend (x2), best (x2), purchase, buy, fill;
 * - zh-Hans / zh-Hant: quote, market level, NAV, price, share price, advice, recommend, best (x2), purchase, buy, fill.
 * The English pattern applies to every locale, because Latin words can appear in any of them.
 */
export const LATIN_FORBIDDEN = /\b(quote|quotes|nav|price|prices|advice|advise|recommend\w*|best|buy|buying|purchase\w*)\b/i;

export const LOCALE_FORBIDDEN = {
  en: null,
  ja: /\u6c17\u914d|\u76f8\u5834|\u898b\u7a4d|\u7d14\u8cc7\u7523|\u57fa\u6e96\u4fa1\u984d|\u4fa1\u683c|\u5024\u6bb5|\u682a\u4fa1|\u52a9\u8a00|\u63a8\u5968|\u304a\u3059\u3059\u3081|\u304a\u52e7\u3081|\u6700\u826f|\u6700\u9069|\u8cfc\u5165|\u8cb7|\u7d04\u5b9a/u,
  ko: /\ud638\uac00|\uc2dc\uc138|\uc21c\uc790\uc0b0|\uac00\uaca9|\uc8fc\uac00|\uc870\uc5b8|\uc790\ubb38|\ucd94\ucc9c|\uad8c\uc7a5|\ucd5c\uace0|\ucd5c\uc120|\uad6c\ub9e4|\ub9e4\uc218|\uccb4\uacb0/u,
  "zh-Hans": /\u62a5\u4ef7|\u884c\u60c5|\u51c0\u503c|\u4ef7\u683c|\u80a1\u4ef7|\u5efa\u8bae|\u63a8\u8350|\u6700\u4f73|\u6700\u597d|\u8d2d\u4e70|\u4e70\u5165|\u6210\u4ea4/u,
  "zh-Hant": /\u5831\u50f9|\u884c\u60c5|\u6de8\u503c|\u50f9\u683c|\u80a1\u50f9|\u5efa\u8b70|\u63a8\u85a6|\u6700\u4f73|\u6700\u597d|\u8cfc\u8cb7|\u8cb7\u5165|\u6210\u4ea4/u,
};

/** Every forbidden match in a text for one locale. */
export function forbiddenMatches(text, locale) {
  const found = [];
  const latin = new RegExp(LATIN_FORBIDDEN.source, "gi");
  for (const match of text.matchAll(latin)) found.push(match[0]);
  const local = LOCALE_FORBIDDEN[locale];
  if (local) for (const match of text.matchAll(new RegExp(local.source, "gu"))) found.push(match[0]);
  return found;
}

/** Doubled sentence punctuation, the ko/ja defect seen in the legacy app: "..", ". .", "\u3002\u3002", "\u3002.", ".\u3002". */
export const DOUBLED_PUNCTUATION = /\.\s*\.|\u3002\s*[\u3002.]|\.\s*\u3002|\uff0e\s*\uff0e/u;
