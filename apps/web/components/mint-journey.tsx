"use client";

import { useEffect, useRef, useState } from "react";
import { MintLookupForm } from "@/components/mint-lookup-form";
import { IdentityProofRail } from "@/components/identity-proof-rail";
import { VerifiedFactList } from "@/components/verified-fact-list";
import { DataStateNotice } from "@/components/data-state-notice";
import { McpSetupPanel } from "@/components/mcp-setup-panel";
import { CoverageStrip } from "@/components/coverage-strip";
import type { FinancialResult, FinancialResultData } from "@/lib/public-result";
import type { Locale } from "@/lib/i18n/config";
import { messagesFor } from "@/lib/i18n/messages";

type CoverageCounts = { registry: number; eligible: number; available: number };
function outcomeAnnouncement(data: FinancialResultData, locale: Locale) {
  const copy = messagesFor(locale).states.outcome;
  if (data.found) return copy.found;
  if (data.reason === "no_data") return copy.noData;
  if (data.reason === "not_eligible") return copy.ineligible;
  if (data.reason === "service_unavailable") return copy.service;
  return copy.unable;
}
export function MintJourney({ defaultMint, locale = "en", resolver, coverage }: { defaultMint: string; locale?: Locale; resolver?: (mint: string) => Promise<FinancialResult>; coverage?: CoverageCounts }) {
  const [result, setResult] = useState<FinancialResult | null>(null); const [loading, setLoading] = useState(false);
  const resultHeading = useRef<HTMLHeadingElement>(null); const requestId = useRef(0);
  function clearResult() { setResult(null); }
  function invalidatePendingResult() { requestId.current += 1; setLoading(false); clearResult(); }
  async function resolve(mint: string): Promise<"invalid_input" | "unknown_mint" | null> {
    const activeRequest = ++requestId.current; clearResult(); setLoading(true);
    try {
      const next = resolver ? await resolver(mint) : await fetch(`/api/v2/fundamentals?mint=${encodeURIComponent(mint)}`, { headers: { accept: "application/json" } }).then((response) => response.json() as Promise<FinancialResult>);
      if (activeRequest !== requestId.current) return null; setResult(next);
      return next.data.found || (next.data.reason !== "invalid_input" && next.data.reason !== "unknown_mint") ? null : next.data.reason;
    } catch {
      if (activeRequest === requestId.current) setResult({ schema_version: "2.0", artifact_revision: "", release_profile: "mint_core", disclaimer: "", data: { found: false, reason: "service_unavailable", requested_identifier: null, identity: null, coverage: null, retryable: true } });
      return null;
    } finally { if (activeRequest === requestId.current) setLoading(false); }
  }
  const data = result?.data ?? null;
  useEffect(() => { if (!data) return; const frame = window.requestAnimationFrame(() => resultHeading.current?.focus()); return () => window.cancelAnimationFrame(frame); }, [data]);
  return <section className="journey" aria-busy={loading}>
    <MintLookupForm defaultMint={defaultMint} locale={locale} loading={loading} onResolve={resolve} onInvalid={invalidatePendingResult} onEdit={invalidatePendingResult} />
    {data ? <div className="journey__result"><h2 className="sr-only" tabIndex={-1} ref={resultHeading}>{outcomeAnnouncement(data, locale)}</h2><p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{outcomeAnnouncement(data, locale)}</p>
      {data.found ? <><IdentityProofRail locale={locale} identity={data.identity} verifiedFacts={data.verified_facts} /><div className="journey__lower">{data.verified_facts ? <VerifiedFactList locale={locale} facts={data.verified_facts} limit={3} /> : <DataStateNotice locale={locale} data={data} />}<McpSetupPanel locale={locale} /></div></> : <>{data.identity ? <IdentityProofRail locale={locale} identity={data.identity} verifiedFacts={null} /> : null}<div className="journey__lower"><DataStateNotice locale={locale} data={data} /><McpSetupPanel locale={locale} /></div></>}
    </div> : null}
    {coverage ? <div className="journey__coverage"><CoverageStrip locale={locale} {...coverage} /></div> : null}
    {data?.found && data.verified_facts && data.legacy_snapshot ? <div className="journey__secondary"><DataStateNotice locale={locale} data={data} /></div> : null}
  </section>;
}
