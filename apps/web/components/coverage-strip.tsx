import Link from "next/link";
import type { Locale } from "@/lib/i18n/config";
import { formatNumberForLocale } from "@/lib/i18n/format";
import { messagesFor } from "@/lib/i18n/messages";

export function CoverageStrip({ registry, eligible, available, locale = "en" }: { registry: number; eligible: number; available: number; locale?: Locale }) {
  const copy = messagesFor(locale).home;
  return <section className="coverage-strip" aria-label={copy.registryHeading}><p>{copy.registryEntries(formatNumberForLocale(registry, locale))}</p><p>{copy.filingEligible(formatNumberForLocale(eligible, locale))}</p><p>{copy.snapshotAvailable(formatNumberForLocale(available, locale))}</p><Link href="#registry">{copy.browseRegistry} <span aria-hidden="true">↓</span></Link></section>;
}
