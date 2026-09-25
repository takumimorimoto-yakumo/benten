import type { AssetIdentityResult, VerifiedFacts } from "@/lib/public-result";
import { StatusMark } from "@/components/status-mark";
import type { Locale } from "@/lib/i18n/config";
import { formatSourceDate } from "@/lib/i18n/format";
import { messagesFor } from "@/lib/i18n/messages";

export function IdentityProofRail({ identity, verifiedFacts, locale = "en" }: { identity: AssetIdentityResult; verifiedFacts: VerifiedFacts | null; locale?: Locale }) {
  const copy = messagesFor(locale).proof;
  const source = verifiedFacts && identity.underlying_company_source_ref ? verifiedFacts.source_refs[identity.underlying_company_source_ref] ?? null : null;
  const sourceFact = source && verifiedFacts ? Object.values(verifiedFacts.facts).find((fact) => fact?.source_ref === source.source_ref) ?? null : null;
  const period = sourceFact && verifiedFacts ? verifiedFacts.periods[sourceFact.period_ref] ?? null : null;
  return <section className="proof-rail" aria-label={copy.label}><div className="proof-rail__connector" aria-hidden="true"><i /><i /><i /></div><div className="proof-step"><p className="eyebrow">{copy.token}</p><p className="proof-step__title">{identity.token_name}</p><p className="proof-step__detail"><span className="mono">{identity.symbol}</span> · {identity.ticker}</p>{identity.issuer_verified ? <StatusMark>{copy.issuerVerified}</StatusMark> : <StatusMark tone="neutral">{copy.issuerUnavailable}</StatusMark>}</div><div className="proof-step"><p className="eyebrow">{copy.underlyingCompany}</p><p className="proof-step__title">{identity.underlying_company ?? copy.noCompany}</p>{identity.underlying_company_source_ref ? <StatusMark>{copy.identityVerified}</StatusMark> : <StatusMark tone="neutral">{copy.noIdentity}</StatusMark>}</div><div className="proof-step"><p className="eyebrow">{copy.filing}</p>{source && period ? <><p className="proof-step__title">{source.form} · <time dateTime={period.period_end}>{formatSourceDate(period.period_end, locale)}</time></p><p className="proof-step__detail">{copy.filed(formatSourceDate(source.filed_at, locale), source.source_authority)}<time className="sr-only" aria-hidden="true" dateTime={source.filed_at}>{source.filed_at}</time></p><a href={source.filing_url} target="_blank" rel="noreferrer">{copy.openFiling(identity.underlying_company ?? identity.ticker, period.fiscal_year, source.form)}<span className="sr-only"> {messagesFor(locale).facts.opensNewTab}</span></a></> : <p className="proof-step__detail">{copy.noFilingContext}</p>}</div></section>;
}
