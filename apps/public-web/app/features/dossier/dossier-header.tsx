import { Badge } from "@/components/ui/badge";
import { messagesFor } from "@/i18n/messages";
import type { PublicWebLocale } from "@/i18n/locales";
import type { DossierView } from "./dossier-view";

function CoverageBadge({ view, locale }: { view: DossierView; locale: PublicWebLocale }) {
  const copy = messagesFor(locale).dossier.coverage;
  if (!view.coverage.filingEligible) return <Badge variant="outline">{copy.noCoverage}</Badge>;
  if (view.coverage.sourceStatus === "source_verified") return <Badge>{copy.sourceVerified}</Badge>;
  if (view.coverage.sourceStatus === "legacy_snapshot") return <Badge variant="secondary">{copy.legacyOnly}</Badge>;
  return <Badge variant="outline">{copy.noData}</Badge>;
}

export function DossierHeader({ view, locale }: { view: DossierView; locale: PublicWebLocale }) {
  const copy = messagesFor(locale).dossier;
  const { identity } = view;
  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <h1 className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-3xl font-semibold tracking-tight">
          <span>{identity.ticker}</span>
          <span className="text-lg font-normal text-muted-foreground">{identity.tokenName}</span>
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-mono">{identity.symbol}</Badge>
          <CoverageBadge view={view} locale={locale} />
        </div>
        {identity.underlyingCompany ? (
          <p className="text-sm">
            <span className="text-muted-foreground">{copy.underlyingCompany}: </span>
            {identity.underlyingCompany}
          </p>
        ) : null}
      </div>
    </header>
  );
}
