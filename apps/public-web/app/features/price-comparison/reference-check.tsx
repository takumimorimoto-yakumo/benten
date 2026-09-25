/**
 * `PythReferenceCheckLine`: the display hook for the purchase and sale
 * review steps, "checked against the Pyth reference price". Display only.
 *
 * The check itself belongs to the step that shows this line (the sale or
 * purchase flow): it reads the price, decides whether the check passed, and
 * passes the checked price here. This component never reads a price and
 * never decides anything; with no check (`check: null`) it renders nothing,
 * so a step can mount it before its check exists.
 *
 * Every price word is inside `data-term="pyth-reference-price"`.
 */
import { feedName, liveTimeText, priceText, type PythPriceResult } from "@/features/pricing/price-format";
import { comparisonMessagesFor } from "@/i18n/comparison-messages";
import type { PublicWebLocale } from "@/i18n/locales";

/**
 * The fields of a Pyth price this line shows. An `/api/prices` result fits
 * as is; a step that read the price accounts itself (the sale preview)
 * passes the same fields for the update it checked against.
 */
export type CheckedPrice = Pick<Extract<PythPriceResult, { status: "fresh" | "stale" }>, "feed_id" | "pyth_symbol" | "price" | "publish_time" | "publish_time_unix">;

export type PythReferenceCheck = {
  /** The Pyth price the step checked against. */
  readonly price: CheckedPrice;
  /** The step's amount valued at that price, already formatted by the step; omitted when it has none. */
  readonly valueText?: string | null;
};

export function PythReferenceCheckLine({ check, locale, className }: { check: PythReferenceCheck | null; locale: PublicWebLocale; className?: string }) {
  if (!check) return null;
  const copy = comparisonMessagesFor(locale).referenceCheck;
  const { price, valueText } = check;
  return (
    <p data-term="pyth-reference-price" data-pyth-reference-check={price.feed_id} data-pyth-publish-time={price.publish_time} className={className ?? "text-sm text-muted-foreground"}>
      {copy.checked(price.pyth_symbol ? feedName(price.pyth_symbol) : price.feed_id, priceText(price, locale), liveTimeText(price.publish_time_unix, locale))}
      {valueText ? <> {copy.value(valueText)}</> : null}
    </p>
  );
}
