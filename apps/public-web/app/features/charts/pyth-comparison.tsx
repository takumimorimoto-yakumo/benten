/**
 * "On-chain price vs Pyth reference: +x.xx%" on an xStock product page: how
 * far the last on-chain trade price is from the latest Pyth reference price
 * of the underlying share, with both times and the unit they share. It is a
 * difference between two observations, stated as fact; it says nothing
 * about what either will be.
 *
 * The on-chain side is the value for one underlying share of the series'
 * last trade: its price per token divided by the display multiplier in
 * effect at that trade. The page's price file reference carries it, so the
 * comparison does not wait for the daily file. When that multiplier is not
 * known (the token's multiplier history is unavailable), no difference is
 * shown, only a note that says why.
 *
 * Shown only when the product's reviewed Pyth feed prices one underlying
 * share and a Pyth price is shown (live, or with "Last Pyth update").
 * Otherwise nothing: the Pyth block next to it already states why there is
 * no price.
 */
import { priceDisplayState, pythFeedForMint, usePythPrice } from "@/features/pricing";
import { updateTimeText } from "@/features/pricing/price-format";
import type { PythFeedRole } from "@/features/pricing/pyth-feed-index-source";
import { chartsMessagesFor } from "@/i18n/charts-messages";
import { formatSourceDate } from "@/i18n/format";
import type { PublicWebLocale } from "@/i18n/locales";
import { priceHeader, type ChartData, type LatestTrade } from "./chart-data";
import { signedPercentText } from "./chart-format";
import { latestTrade } from "./chart-model";

/** The last trade to compare: from the page's price file reference, or (fixture data) the inline series, whose sample value stands for one share. */
function comparableTrade(data: ChartData): LatestTrade | null {
  if (data.priceFile) return data.priceFile.latest;
  const inline = data.price?.fixture ? latestTrade(data) : null;
  return inline ? { ...inline, per_share: inline.value } : null;
}

/** The Pyth feed role whose price is for one underlying share, the unit the comparison needs. */
const SHARE_BASIS_ROLE = "xstock_underlying_share" satisfies PythFeedRole;

export function PythComparison({ data, company, locale }: { data: ChartData; company: string | null; locale: PublicWebLocale }) {
  const mint = priceHeader(data)?.mint ?? "";
  const found = pythFeedForMint(mint);
  const feed = found?.role === SHARE_BASIS_ROLE ? found : null;
  const { view } = usePythPrice(feed);
  const trade = comparableTrade(data);
  const copy = chartsMessagesFor(locale).delta;
  if (!feed || !trade || !company) return null;
  if (trade.per_share === null) return <p data-chart-pyth-comparison="unavailable" className="max-w-prose text-sm text-muted-foreground">{copy.unavailable}</p>;
  if (view.kind !== "ready") return null;
  const display = priceDisplayState(view.read.result, view.nowMs);
  if (display.kind !== "live" && display.kind !== "stale") return null;
  const pyth = Number(display.price.price);
  if (!(pyth > 0)) return null;
  return (
    <div data-chart-pyth-comparison="" className="flex flex-col gap-0.5">
      <p className="font-medium tabular-nums">{copy.value(signedPercentText((trade.per_share - pyth) / pyth, locale))}</p>
      <p className="max-w-prose text-sm text-muted-foreground">{copy.note(formatSourceDate(trade.date, locale), updateTimeText(display.price.publish_time_unix, locale), company)}</p>
    </div>
  );
}
