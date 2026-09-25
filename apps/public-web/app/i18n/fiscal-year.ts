import { formatPeriodEndMonth } from "./format";
import type { PublicWebLocale } from "./locales";
import { messagesFor, SOURCE_FISCAL_YEAR_MESSAGES } from "./messages";

/**
 * `full`: a label that stands alone (the company page's key figures, the
 * evidence page's year headings, the chart's readout and table).
 * `axis`: the same year under a chart bar, where the full label does not fit.
 */
export type FiscalYearLabelForm = "full" | "axis";

/**
 * The one name of a fiscal year on every page: the month it ends, in the
 * locale's own form ("Year ended Feb 2026" in English, the month followed by the period suffix in Japanese). Issuers number
 * their fiscal years differently (a year ending in Feb 2026 is FY2025 to one
 * issuer and FY2026 to another), so no page shows a fiscal-year number; the
 * data's `fiscal_year` stays an internal key. The month is the period end's
 * own, in UTC, so a year ending on the 1st never shifts to the prior month.
 */
export function fiscalYearLabel(periodEnd: string, locale: PublicWebLocale, form: FiscalYearLabelForm = "full"): string {
  const copy = messagesFor(locale).dossier.verified;
  const month = formatPeriodEndMonth(periodEnd, locale);
  return form === "axis" ? copy.fiscalYearAxis(month) : copy.fiscalYearEnded(month);
}

/**
 * A fiscal year the source names only by its own label and records no period
 * end for (the legacy snapshot's "FY2026"). It cannot be named by the month
 * it ends, so the label is quoted as the source's and the missing period end
 * is stated. `asOf` fits inside a sentence; `value` stands in a table cell.
 */
export function sourceFiscalYearLabel(sourceLabel: string | number, locale: PublicWebLocale, form: "asOf" | "value"): string {
  return SOURCE_FISCAL_YEAR_MESSAGES[locale][form](String(sourceLabel));
}
