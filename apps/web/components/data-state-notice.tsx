import type { FinancialResultData, LegacySnapshot } from "@/lib/public-result";
import { exclusionReasonExplanation, exclusionReasonLabel } from "@/lib/exclusion-reason";
import type { Locale } from "@/lib/i18n/config";
import { formatLegacyNumber } from "@/lib/i18n/format";
import { messagesFor } from "@/lib/i18n/messages";

function LegacyFacts({ snapshot, locale }: { snapshot: LegacySnapshot; locale: Locale }) {
  const copy = messagesFor(locale);
  const entries = Object.entries(snapshot.values).filter(([key, value]) => value !== null && !["company_name", "metrics_fiscal_year"].includes(key)).slice(0, 4);
  return <details className="legacy-sheet"><summary>{copy.states.legacyTitle}<span>{copy.states.unverified}</span></summary><div><p>{copy.states.legacyExplanation}</p><p className="legacy-sheet__meta">{copy.states.legacyAsOf(snapshot.legacy_as_of, snapshot.observed_period.fiscal_year)}</p><dl>{entries.map(([key, value]) => <div key={key}><dt>{key in copy.legacy.fields ? copy.legacy.fields[key as keyof typeof copy.legacy.fields] : key.replaceAll("_", " ")}</dt><dd>{typeof value === "number" ? formatLegacyNumber(value, locale) : value}</dd></div>)}</dl></div></details>;
}

export function DataStateNotice({ data, locale = "en" }: { data: FinancialResultData; locale?: Locale }) {
  const copy = messagesFor(locale);
  if (data.found) return data.legacy_snapshot ? <LegacyFacts snapshot={data.legacy_snapshot} locale={locale} /> : null;
  if (data.reason === "no_data") return <section className="data-notice"><h2>{copy.states.noDataHeading}</h2><p>{copy.states.noData(data.identity?.ticker ?? copy.proof.token)}</p></section>;
  if (data.reason === "not_eligible") return <section className="data-notice"><h2>{copy.states.ineligibleHeading}</h2><p><strong>{exclusionReasonLabel(data.coverage?.exclusion_reason ?? null, locale)}.</strong> {exclusionReasonExplanation(data.coverage?.exclusion_reason ?? null, locale)}</p></section>;
  if (data.reason === "unknown_mint") return <section className="data-notice"><h2>{copy.states.unknownHeading}</h2><p>{copy.states.unknown}</p></section>;
  if (data.reason === "service_unavailable") return <section className="data-notice"><h2>{copy.states.serviceHeading}</h2><p>{copy.states.service}</p></section>;
  return <section className="data-notice"><h2>{copy.states.invalidHeading}</h2><p>{copy.states.invalid}</p></section>;
}
