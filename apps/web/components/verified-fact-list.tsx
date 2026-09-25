import type { VerifiedFacts } from "@/lib/public-result";
import { displayVerifiedFacts } from "@/lib/verified-facts";
import { StatusMark } from "@/components/status-mark";
import type { Locale } from "@/lib/i18n/config";
import { messagesFor } from "@/lib/i18n/messages";
import { formatCurrencyForLocale, formatSourceDate } from "@/lib/i18n/format";

export function VerifiedFactList({ facts, limit, locale = "en" }: { facts: VerifiedFacts; limit?: number; locale?: Locale }) {
  const entries = displayVerifiedFacts(facts, limit); const copy = messagesFor(locale).facts;
  if (!entries.length) return null;
  return <section className="fact-sheet" aria-labelledby="verified-facts-heading">
    <div className="fact-sheet__heading"><div><p className="eyebrow">{copy.eyebrow}</p><h2 id="verified-facts-heading">{copy.heading}</h2></div><StatusMark>{copy.sourceVerified}</StatusMark></div>
    <div className="fact-list">{entries.map(({ name, fact, period, source }) => {
      const label = copy.factLabels[name]; const periodStart = period.period_start ?? period.period_end; const periodEnd = formatSourceDate(period.period_end, locale);
      return <article className="fact-row" key={name}><div><h3>{label}</h3><p className="fact-row__value" aria-label={`${fact.value} ${fact.currency}, ${copy.scale(fact.scale)}`}>{formatCurrencyForLocale(fact.value, fact.currency, locale)}</p></div>
        <div className="fact-row__metadata"><p>{fact.currency} · {fact.unit} · {copy.scale(fact.scale)} · {period.period_kind}{period.fiscal_year}</p><p>{period.fact_period_type === "duration" ? copy.fromTo(formatSourceDate(periodStart, locale), periodEnd) : copy.asOf(periodEnd)}<time className="sr-only" aria-hidden="true" dateTime={periodStart}>{periodStart}</time><time className="sr-only" aria-hidden="true" dateTime={period.period_end}>{period.period_end}</time> · <span className="mono">{fact.source_concept}</span> · <a href={source.filing_url} target="_blank" rel="noreferrer">{copy.filedLink(source.form, formatSourceDate(source.filed_at, locale))}<time className="sr-only" aria-hidden="true" dateTime={source.filed_at}>{source.filed_at}</time><span className="sr-only"> {label} {copy.opensNewTab}</span></a></p></div>
      </article>;
    })}</div>
  </section>;
}
