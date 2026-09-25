/**
 * The app IA's vocabulary rule (sections 7.1 and 7.3) applied to About, the
 * learn topics and the legal documents, with its one stated exception.
 *
 * - Unmarked text contains no section 7.1 word, no price word and no buying word.
 * - `data-vocabulary="price"` allows price words; `"purchase"` allows buying
 *   words. Neither allows a section 7.1 word.
 * - `data-vocabulary="negation"` is the exception for sentences these pages
 *   must state, such as "This is not investment advice." or "It is not a
 *   quote". Such a text must contain a negation in its own locale. In the
 *   English source it must also contain a section 7.1 word, so the mark is
 *   used only where it is needed; the other locales carry it on the same
 *   texts (a translation may avoid the word, for example ja for "loss").
 *   The texts that carry it are listed by the tests, so a new exception is
 *   a visible test change.
 *
 * The negation cues are escaped, because only registered catalogs may
 * contain CJK text: ja "masen", "nai", "zu", "naku"; ko "anh", "anib", "ani",
 * "eops"; zh-Hans "bu", "fei", "wu", "meiyou", "gaibu"; zh-Hant the same with
 * traditional forms.
 */
import { LATIN_BUY, LATIN_FORBIDDEN, LATIN_PRICE, LOCALE_BUY, LOCALE_FORBIDDEN, LOCALE_PRICE } from "./app-vocabulary.mjs";
import { DOUBLED_PUNCTUATION } from "./reference-vocabulary.mjs";

export const NEGATION_CUE = {
  en: /\b(?:not|no|never|nothing|cannot)\b/i,
  ja: /\u307e\u305b\u3093|\u306a\u3044|\u305a|\u306a\u304f/u,
  ko: /\uc54a|\uc544\ub2d9|\uc544\ub2c8|\uc5c6/u,
  "zh-Hans": /\u4e0d|\u975e|\u65e0|\u6ca1\u6709|\u6982\u4e0d/u,
  "zh-Hant": /\u4e0d|\u975e|\u7121|\u6c92\u6709|\u6982\u4e0d/u,
};

function found(text, latin, local) {
  const words = [...text.matchAll(new RegExp(latin.source, "gi"))].map((match) => match[0]);
  if (local) words.push(...[...text.matchAll(new RegExp(local.source, "gu"))].map((match) => match[0]));
  return words;
}

export function textOf(html) {
  return html.replace(/<script\b[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

const MARKED = /<(p|li|h1|h2)\b[^>]*\bdata-vocabulary="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g;

/** Every marked text of a page: its marks and its text. */
export function markedTexts(html) {
  return [...html.matchAll(MARKED)].map((match) => ({ marks: match[2].split(" "), text: textOf(match[3]) }));
}

/** Every breach of the rule in one page's HTML; empty when the page follows it. */
export function staticPageVocabularyFindings(html, locale) {
  const findings = [];
  const unmarked = textOf(html.replace(MARKED, " "));
  for (const word of found(unmarked, LATIN_FORBIDDEN, LOCALE_FORBIDDEN[locale])) findings.push(`unmarked 7.1 word "${word}"`);
  for (const word of found(unmarked, LATIN_PRICE, LOCALE_PRICE[locale])) findings.push(`unmarked price word "${word}"`);
  for (const word of found(unmarked, LATIN_BUY, LOCALE_BUY[locale])) findings.push(`unmarked buying word "${word}"`);
  for (const { marks, text } of markedTexts(html)) {
    const negation = marks.includes("negation");
    const forbidden = found(text, LATIN_FORBIDDEN, LOCALE_FORBIDDEN[locale]);
    if (negation) {
      if (locale === "en" && forbidden.length === 0) findings.push(`negation mark without a 7.1 word: "${text}"`);
      if (!NEGATION_CUE[locale].test(text)) findings.push(`negation mark without a negation: "${text}"`);
      continue;
    }
    for (const word of forbidden) findings.push(`7.1 word "${word}" outside a negation: "${text}"`);
    if (!marks.includes("price")) for (const word of found(text, LATIN_PRICE, LOCALE_PRICE[locale])) findings.push(`price word "${word}" without its mark: "${text}"`);
    if (!marks.includes("purchase")) for (const word of found(text, LATIN_BUY, LOCALE_BUY[locale])) findings.push(`buying word "${word}" without its mark: "${text}"`);
  }
  if (DOUBLED_PUNCTUATION.test(textOf(html))) findings.push("doubled punctuation");
  return findings;
}
