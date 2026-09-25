import { InfoIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { messagesFor } from "@/i18n/messages";
import type { PublicWebLocale } from "@/i18n/locales";
import type { DossierView } from "./dossier-view";

/**
 * States what financial coverage is absent and why. Rendered only when the
 * token is outside filing coverage or has no financial row at all.
 */
export function CoverageNotice({ view, locale }: { view: DossierView; locale: PublicWebLocale }) {
  const copy = messagesFor(locale).dossier;
  if (!view.coverage.filingEligible) {
    const reason = view.coverage.exclusion ?? "unspecified";
    return (
      <Alert role="note">
        <InfoIcon aria-hidden="true" />
        <AlertTitle><h2>{copy.exclusion.heading}</h2></AlertTitle>
        <AlertDescription>
          <p><strong className="font-medium text-foreground">{copy.exclusion.labels[reason]}.</strong> {copy.exclusion.explanations[reason]}</p>
        </AlertDescription>
      </Alert>
    );
  }
  if (!view.verified && !view.legacy) {
    return (
      <Alert role="note">
        <InfoIcon aria-hidden="true" />
        <AlertTitle><h2>{copy.noData.heading}</h2></AlertTitle>
        <AlertDescription><p>{copy.noData.body(view.identity.ticker)}</p></AlertDescription>
      </Alert>
    );
  }
  return null;
}
