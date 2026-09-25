/**
 * `PythReferencePrice`: one product's Pyth reference price (app IA sections
 * 4.4, 4.5, 6.3 and 7). Used by product pages, company cards and Holdings.
 *
 * Give it the product's exact `mint`, or an xStock's exact registry `ticker`.
 * It finds the reviewed feed for that product and reads the price from the
 * same-origin `/api/prices` after hydration. What it shows:
 *
 *  - live: the price, the absolute time it was published, the feed name,
 *    what the feed prices and the Pyth confidence interval;
 *  - stale: the same, with "Last Pyth update {time}" instead of a live time,
 *    so a closed market does not blank the page; never used for a value;
 *  - too old (beyond `maxDisplayAgeHours`): only the last update time;
 *  - no feed: "No Pyth price feed for this token" (prerendered without a
 *    read when the feed map binds none; after the read when Pyth publishes
 *    no price account on Solana for the bound feed);
 *  - unavailable: "... unavailable right now" with Try again.
 *
 * It never shows 0, a dash as a number or any stand-in value. The whole
 * block carries `data-term="pyth-reference-price"`, the one place the
 * vocabulary rule lets the word "price" appear on a product page.
 *
 * Shell-safe: no Solana SDK, no wallet, no purchase code.
 */
import { useId } from "react";
import { RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/lib/use-hydrated";
import { cn } from "@/lib/utils";
import type { PublicWebLocale } from "@/i18n/locales";
import { productMessagesFor, type ProductCopy } from "@/i18n/product-messages";
import { confidenceText, feedName, liveTimeText, priceText, updateTimeText } from "./price-format";
import { pythFeedForMint, pythFeedForTicker, type PythFeed } from "./pyth-feeds";
import { usePythPrice, type PythPriceView } from "./use-pyth-price";

export type PythReferencePriceProps = ({ readonly mint: string; readonly ticker?: never } | { readonly ticker: string; readonly mint?: never }) & {
  readonly locale: PublicWebLocale;
  /** `lg`: the page's one large figure (product page, company card). `sm`: one compact line (a list row). */
  readonly size?: "lg" | "sm";
  readonly className?: string;
};

/** Resolve the product's feed by exact mint or exact ticker. */
export function resolvePythFeed(props: { readonly mint?: string; readonly ticker?: string }): PythFeed | null {
  if (typeof props.mint === "string") return pythFeedForMint(props.mint);
  if (typeof props.ticker === "string") return pythFeedForTicker(props.ticker);
  return null;
}

type StatusKey = "no-feed" | "loading" | "live" | "stale" | "too-old" | "unavailable";

function statusOf(view: PythPriceView): StatusKey {
  if (view.kind === "noFeed") return "no-feed";
  if (view.kind === "loading") return "loading";
  switch (view.display.kind) {
    case "live": return "live";
    case "stale": return "stale";
    case "tooOld": return "too-old";
    case "noFeed": return "no-feed";
    case "unavailable": return "unavailable";
  }
}

function Time({ unix, children }: { unix: number; children: string }) {
  return <time dateTime={new Date(unix * 1000).toISOString()}>{children}</time>;
}

function Body({ view, copy, locale, size, onRetry, hydrated }: { view: PythPriceView; copy: ProductCopy["price"]; locale: PublicWebLocale; size: "lg" | "sm"; onRetry: () => void; hydrated: boolean }) {
  const large = size === "lg";
  if (view.kind === "noFeed") return <p data-pyth-price-reason="" className="text-sm">{copy.noFeed}</p>;
  if (view.kind === "loading") {
    return (
      <>
        {/* Reserved figure height, so the page does not move when the price arrives. */}
        <span aria-hidden="true" data-pyth-price-reserve="" className={cn("block", large ? "h-(--pyth-price-figure-height)" : "h-(--pyth-price-line-height)")} />
        {hydrated ? <p className="text-sm text-muted-foreground" role="status">{copy.loading}</p> : <noscript><p className="text-sm text-muted-foreground">{copy.needsJavaScript}</p></noscript>}
      </>
    );
  }
  const { display, feed } = view;
  if (display.kind === "noFeed") return <p data-pyth-price-reason="" className="text-sm">{copy.noFeed}</p>;
  if (display.kind === "unavailable") {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p data-pyth-price-reason="" className="text-sm">{copy.unavailable}</p>
        <Button variant="outline" size={large ? "default" : "sm"} className="min-h-(--touch-target-min) md:min-h-0" onClick={onRetry}>
          <RefreshCwIcon aria-hidden="true" />
          {copy.tryAgain}
        </Button>
      </div>
    );
  }
  const price = display.price;
  if (display.kind === "tooOld") {
    return <p data-pyth-price-reason="" className="text-sm">{copy.tooOld(updateTimeText(price.publish_time_unix, locale))}</p>;
  }
  const live = display.kind === "live";
  const when = live ? copy.at(liveTimeText(price.publish_time_unix, locale)) : copy.lastUpdate(updateTimeText(price.publish_time_unix, locale));
  const feedLine = `${copy.feed(feedName(feed.pyth_symbol))}, ${copy.basis[feed.role]}`;
  return (
    <>
      <p className={cn("flex flex-wrap items-baseline gap-x-3 gap-y-0.5", large ? "" : "text-sm")}>
        <span data-pyth-price-value="" className={cn("tabular-nums", large ? "min-w-0 text-3xl leading-tight font-semibold tracking-tight wrap-anywhere" : "font-medium")}>{priceText(price, locale)}</span>
        <span data-pyth-price-time="" className={cn("text-sm", live ? "" : "font-medium")}><Time unix={price.publish_time_unix}>{when}</Time></span>
      </p>
      {live ? null : <p className="text-sm text-muted-foreground">{copy.notLive}</p>}
      <p className="text-sm text-muted-foreground">{feedLine}</p>
      <p className="text-sm text-muted-foreground tabular-nums">{copy.confidence(confidenceText(price, locale))}</p>
    </>
  );
}

export function PythReferencePrice({ locale, size = "lg", className, ...product }: PythReferencePriceProps) {
  const feed = resolvePythFeed(product);
  const { view, retry } = usePythPrice(feed);
  return <PythReferencePriceView view={view} locale={locale} size={size} className={className} onRetry={retry} />;
}

/** The presentational block for one read state; the Living Catalog renders its fixtures through it. */
export function PythReferencePriceView({ view, locale, size = "lg", className, labelHidden = false, onRetry }: {
  view: PythPriceView;
  locale: PublicWebLocale;
  size?: "lg" | "sm";
  className?: string;
  /** Keep the label for assistive technology only, where a visible heading already names the block (a Holdings column). */
  labelHidden?: boolean;
  onRetry: () => void;
}) {
  const hydrated = useHydrated();
  const labelId = useId();
  const copy = productMessagesFor(locale).price;
  const status = statusOf(view);
  const feedId = view.kind === "noFeed" ? undefined : view.feed.feed_id;
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      aria-busy={status === "loading" ? true : undefined}
      data-term="pyth-reference-price"
      data-pyth-price-status={status}
      data-pyth-feed={feedId}
      className={cn("flex min-w-0 flex-col gap-1", className)}
    >
      <p id={labelId} className={labelHidden ? "sr-only" : "text-sm font-medium text-muted-foreground"}>{copy.label}</p>
      <Body view={view} copy={copy} locale={locale} size={size} onRetry={onRetry} hydrated={hydrated} />
    </div>
  );
}
