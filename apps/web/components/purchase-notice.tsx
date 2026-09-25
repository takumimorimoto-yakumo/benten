import type { Locale } from "@/lib/i18n/config";
import { messagesFor } from "@/lib/i18n/messages";

/** The four "Before you buy" sentences. Rendered in every panel state, never collapsed or shortened. */
export function PurchaseNotice({ locale }: { locale: Locale }) {
  const notice = messagesFor(locale).purchase.notice;
  return (
    <div className="notice purchase-notice" role="note" aria-labelledby="purchase-notice-heading">
      <h3 className="purchase-notice__heading" id="purchase-notice-heading">{notice.heading}</h3>
      <ul className="purchase-notice__list">
        <li>{notice.usPersons}</li>
        <li>{notice.noEligibilityCheck}</li>
        <li>{notice.noAvailabilityGuarantee}</li>
        <li>{notice.notAdvice}</li>
      </ul>
    </div>
  );
}
