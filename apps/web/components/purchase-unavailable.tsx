import type { Locale } from "@/lib/i18n/config";
import { messagesFor } from "@/lib/i18n/messages";

/**
 * Quiet notice in the purchase slot of every stock page except NVDAx. No
 * button and no link to NVDA: a link would steer the investor to one token.
 */
export function PurchaseUnavailable({ symbol, locale }: { symbol: string; locale: Locale }) {
  const copy = messagesFor(locale).purchase.unsupported;
  return (
    <section className="purchase-unavailable" aria-labelledby="purchase-unavailable-heading">
      <h2 className="section__title" id="purchase-unavailable-heading">{copy.heading(symbol)}</h2>
      <p>{copy.body}</p>
    </section>
  );
}
