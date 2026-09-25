import type { Locale } from "@/lib/i18n/config";
import { messagesFor } from "@/lib/i18n/messages";

export function CoverageBadge({ covered, locale = "en" }: { covered: boolean; locale?: Locale }) {
  const copy = messagesFor(locale).badges;
  return <span className={covered ? "badge badge--covered" : "badge badge--excluded"}>{covered ? copy.financials : copy.noFilings}</span>;
}
