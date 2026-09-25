import type { ProviderReferenceKind } from "@benten/registry";
import { formatList } from "@/i18n/format";
import { referenceMessagesFor } from "@/i18n/messages";
import type { PublicWebLocale } from "@/i18n/locales";

/** A provider's rights field: `false` is a stated "no"; anything else is unknown. */
export function rightsValue(value: false | "unknown", locale: PublicWebLocale): string {
  const terms = referenceMessagesFor(locale).terms;
  return value === false ? terms.noValue : terms.unknownValue;
}

/**
 * What kind of reference numbers a provider publishes, and which of their
 * units are unknown. Kinds only: no value is part of this statement.
 */
export function ReferenceSemantics({ kinds, currencyUnknown, asOfUnknown, locale }: {
  kinds: readonly ProviderReferenceKind[];
  currencyUnknown: boolean;
  asOfUnknown: boolean;
  locale: PublicWebLocale;
}) {
  const copy = referenceMessagesFor(locale).company;
  if (kinds.length === 0) return <p className="text-sm">{copy.reference.none}</p>;
  const units = [currencyUnknown ? copy.reference.currencyUnknown : null, asOfUnknown ? copy.reference.asOfUnknown : null]
    .filter((sentence): sentence is string => sentence !== null);
  return (
    <p className="flex flex-col gap-0.5 text-sm">
      <span>{copy.reference.publishes(formatList(kinds.map((kind) => copy.referenceNouns[kind]), locale))}</span>
      {units.length > 0 ? <span className="text-muted-foreground">{units.join(copy.reference.sentenceSeparator)}</span> : null}
    </p>
  );
}
