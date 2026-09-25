import type { PurchaseCopy } from "@/i18n/purchase-messages";

/** The four "Before you buy" sentences. Rendered in every panel state, never collapsed or shortened. */
export function PurchaseNotice({ copy }: { copy: PurchaseCopy["notice"] }) {
  return (
    <div
      role="note"
      aria-labelledby="purchase-notice-heading"
      data-purchase-notice=""
      className="flex flex-col gap-1 rounded-md border-s-(length:--notice-rule-width) border-s-muted-foreground bg-muted px-3 py-2"
    >
      <h3 id="purchase-notice-heading" className="text-sm font-semibold">{copy.heading}</h3>
      <ul className="flex flex-col text-sm leading-normal">
        <li>{copy.usPersons}</li>
        <li>{copy.noEligibilityCheck}</li>
        <li>{copy.noAvailabilityGuarantee}</li>
        <li>{copy.notAdvice}</li>
      </ul>
    </div>
  );
}
