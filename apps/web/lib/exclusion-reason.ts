import type { ExclusionReason } from "@benten/registry";
import type { Locale } from "@/lib/i18n/config";
import { messagesFor } from "@/lib/i18n/messages";

export function exclusionReasonLabel(reason: ExclusionReason, locale: Locale = "en"): string {
  const copy = messagesFor(locale).exclusions;
  return reason ? copy[reason] : copy.unspecified;
}

export function exclusionReasonExplanation(reason: ExclusionReason, locale: Locale = "en"): string {
  const copy = messagesFor(locale).exclusions.explanations;
  return reason ? copy[reason] : copy.unspecified;
}
