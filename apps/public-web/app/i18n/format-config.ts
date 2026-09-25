import type { PublicWebLocale } from "./locales";

/**
 * The single place for display-rounding constants (presentation only; the
 * exact values stay in the data and on the evidence pages).
 */
export const FORMAT_CONFIG = {
  /**
   * Significant digits of a short SEC amount on company pages ("$215.9B" in
   * English; the same amount in 100-million units in Japanese). Four keeps a
   * tenth of a billion for amounts in the hundreds of billions; the exact
   * reported amount is on the product's evidence page.
   */
  compactAmountSignificantDigits: 4,
} as const;

/**
 * How a time names its zone, the same in every locale (`timeZoneLabel` in
 * `format.ts`): the zone's letters-only abbreviation where `abbreviationLocale`
 * has one (US zones such as EDT, and UTC), otherwise the offset from UTC
 * ("UTC+9", "UTC+5:30"). `Intl` on its own gives "GMT+9" in English and
 * "JST" in Japanese for the same zone, so the locale never chooses the form.
 */
export const TIME_ZONE_LABEL_CONFIG = {
  abbreviationLocale: "en-US",
  /** A zone name counts as an abbreviation only when it is 2 to 5 capital letters. */
  abbreviationPattern: /^[A-Z]{2,5}$/,
  utcLabel: "UTC",
  /** The prefix `Intl`'s `shortOffset` form writes before an offset. */
  offsetPrefix: "GMT",
} as const;

/**
 * What goes between two whole sentences run together in one paragraph
 * (`joinSentences` in `format.ts`). Japanese and Chinese sentences end in a
 * full-width stop and follow on with no space; English and Korean put one
 * space after the stop.
 */
export const SENTENCE_SEPARATOR = {
  en: " ",
  ja: "",
  ko: " ",
  "zh-Hans": "",
  "zh-Hant": "",
} as const satisfies Record<PublicWebLocale, string>;
