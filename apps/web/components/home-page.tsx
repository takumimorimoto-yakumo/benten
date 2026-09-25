import Link from "next/link";
import { getCoverageState, xstocks, type ExclusionReason } from "@benten/registry";
import { CoverageBadge } from "@/components/CoverageBadge";
import { MintJourney } from "@/components/mint-journey";
import { ProviderReferencesSection } from "@/components/provider-references-section";
import { exclusionReasonLabel } from "@/lib/exclusion-reason";
import { formatNumberForLocale } from "@/lib/i18n/format";
import { localizedPath, type Locale } from "@/lib/i18n/config";
import { messagesFor } from "@/lib/i18n/messages";

const NVDA_MINT = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
const sortedXStocks = [...xstocks].sort((a, b) => a.ticker.localeCompare(b.ticker, "en"));

function exclusionBreakdown(): Array<{ reason: ExclusionReason; count: number }> {
  const counts = new Map<ExclusionReason, number>();
  for (const entry of xstocks) {
    const coverage = getCoverageState(entry);
    if (coverage.filing_eligibility === "not_eligible") counts.set(entry.exclusion_reason, (counts.get(entry.exclusion_reason) ?? 0) + 1);
  }
  return [...counts.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
}

export function HomePage({ locale }: { locale: Locale }) {
  const copy = messagesFor(locale);
  const coverage = xstocks.map((entry) => getCoverageState(entry));
  const eligible = coverage.filter((state) => state.filing_eligibility === "eligible").length;
  const available = coverage.filter((state) => state.snapshot_status === "available").length;
  const breakdown = exclusionBreakdown();

  return <>
    <section className="hero" aria-labelledby="homepage-heading">
      <div className="hero__copy"><p className="eyebrow">{copy.home.eyebrow}</p><h1 id="homepage-heading">{copy.home.heading}</h1><p>{copy.home.supporting}</p><p className="hero__reassurance">{copy.home.reassurance}</p></div>
      <MintJourney locale={locale} defaultMint={NVDA_MINT} coverage={{ registry: xstocks.length, eligible, available }} />
    </section>
    <section className="registry-section" id="registry" aria-labelledby="registry-heading">
      <div className="section-heading"><div><p className="eyebrow">{copy.navigation.registry}</p><h2 id="registry-heading">{copy.home.registryHeading}</h2></div><p>{copy.home.registryDescription}</p></div>
      <div className="table-scroll"><table><thead><tr><th scope="col">{copy.home.ticker}</th><th scope="col">{copy.home.name}</th><th scope="col">{copy.home.token}</th><th scope="col">{copy.home.filingEligibility}</th><th scope="col">{copy.home.snapshot}</th></tr></thead><tbody>{sortedXStocks.map((entry) => {
        const state = getCoverageState(entry);
        return <tr key={entry.mint}><td className="cell--tight"><Link href={`${localizedPath(locale, `/stock/${entry.ticker}`)!}`}>{entry.ticker}</Link></td><td>{entry.name}</td><td className="mono">{entry.symbol}</td><td><CoverageBadge locale={locale} covered={state.filing_eligibility === "eligible"} /></td><td>{state.snapshot_status === "available" ? copy.home.available : copy.home.noCurrentRow}</td></tr>;
      })}</tbody></table></div>
      <div className="exclusion-summary"><h3>{copy.home.structuralExclusions}</h3><ul>{breakdown.map(({ reason, count }) => <li key={reason ?? "unspecified"}>{formatNumberForLocale(count, locale)} {exclusionReasonLabel(reason, locale)}</li>)}</ul></div>
    </section>
    <ProviderReferencesSection locale={locale} />
  </>;
}
