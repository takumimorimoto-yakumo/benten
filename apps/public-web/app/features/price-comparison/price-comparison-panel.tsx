/**
 * `PriceComparisonPanel`: on an xStock product page, three observations of
 * the same xStock side by side, with the differences that are facts
 * (`comparison-model.ts`):
 *
 *  1. Pyth `Equity.US.<ticker>/USD`, one underlying share: price, Pyth
 *     confidence interval, publish time, and what Pyth's published schedule
 *     says about the regular session right now;
 *  2. Pyth `Crypto.<ticker>X/USD`, the token itself, where the reviewed feed
 *     map binds one: price, publish time and its schedule (every day, all
 *     hours);
 *  3. the last on-chain trade in Benten's bundled series (USDC for one
 *     underlying share, and per token before the display multiplier).
 *
 * Both Pyth feeds are read from the same-origin `/api/prices` after
 * hydration and read again while shown. Every price word is inside a
 * `data-term="pyth-reference-price"` or `data-term="onchain-trade-price"`
 * element. Nothing here ranks, rates or forecasts; no figure is invented
 * when a read fails.
 *
 * Shell-safe: no Solana SDK, no wallet, no purchase code.
 */
import { RefreshCwIcon } from "lucide-react";
import { PRICING_CONFIG } from "@benten/pricing/config";
import { Button } from "@/components/ui/button";
import type { ChartData } from "@/features/charts/chart-data";
import { signedPercentText } from "@/features/charts/chart-format";
import { comparableTrade } from "@/features/charts/chart-model";
import { confidenceText, feedName, liveTimeText, priceText, updateTimeText } from "@/features/pricing/price-format";
import { SectionCard } from "@/features/product/product-parts";
import { useHydrated } from "@/lib/use-hydrated";
import { cn } from "@/lib/utils";
import { comparisonMessagesFor, type ComparisonCopy } from "@/i18n/comparison-messages";
import { formatSourceDate } from "@/i18n/format";
import type { PublicWebLocale } from "@/i18n/locales";
import { PRICE_COMPARISON_CONFIG } from "./comparison-config";
import { PRICE_COMPARISON_INDEX, PRICE_COMPARISON_SCHEDULES, comparisonEntryForTicker } from "./comparison-index";
import { comparisonFacts, type ComparisonFacts, type FeedFacts, type TradeFacts } from "./comparison-model";
import type { ScheduleSession } from "./pyth-schedule";
import { useComparisonReads } from "./use-comparison-reads";

function usdcText(value: number, locale: PublicWebLocale): string {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: PRICE_COMPARISON_CONFIG.usdcFractionDigits, maximumFractionDigits: PRICE_COMPARISON_CONFIG.usdcFractionDigits }).format(value);
}

function sessionText(session: ScheduleSession, copy: ComparisonCopy["session"], locale: PublicWebLocale): string {
  switch (session.kind) {
    case "always_open": return copy.alwaysOpen;
    case "open": return session.closesAtMs === null ? copy.openNoClose : copy.open(updateTimeText(session.closesAtMs / 1000, locale));
    case "closed": return session.opensAtMs === null ? copy.closedNoOpen : copy.closed(updateTimeText(session.opensAtMs / 1000, locale));
  }
}

function Time({ unix, children }: { unix: number; children: string }) {
  return <time dateTime={new Date(unix * 1000).toISOString()}>{children}</time>;
}

type FeedRowProps = { facts: FeedFacts; label: string; row: "underlying" | "token"; copy: ComparisonCopy; locale: PublicWebLocale; hydrated: boolean; onRetry: () => void };

/** One Pyth feed. A leaf block: no nested `div`, so the vocabulary marker covers all of it. */
function FeedRow({ facts, label, row, copy, locale, hydrated, onRetry }: FeedRowProps) {
  const { display, session } = facts;
  const status = display === null ? "loading" : display.kind;
  const sessionLine = session ? <p className="text-sm text-muted-foreground" data-comparison-session={session.kind}>{sessionText(session, copy.session, locale)}</p> : null;
  let body;
  if (display === null) {
    body = hydrated ? <p className="text-sm text-muted-foreground" role="status">{copy.feed.reading}</p> : <noscript><p className="text-sm text-muted-foreground">{copy.feed.needsJavaScript}</p></noscript>;
  } else if (display.kind === "noFeed") {
    body = <p className="text-sm">{copy.feed.noAccount}</p>;
  } else if (display.kind === "unavailable") {
    body = (
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span>{copy.feed.unavailable}</span>
        <Button variant="outline" size="sm" className="min-h-(--touch-target-min) md:min-h-0" onClick={onRetry}>
          <RefreshCwIcon aria-hidden="true" />
          {copy.feed.tryAgain}
        </Button>
      </p>
    );
  } else if (display.kind === "tooOld") {
    body = <p className="text-sm">{copy.feed.tooOld(updateTimeText(display.price.publish_time_unix, locale))}</p>;
  } else {
    const { price } = display;
    const live = display.kind === "live";
    const when = live ? copy.feed.published(liveTimeText(price.publish_time_unix, locale)) : copy.feed.lastUpdate(updateTimeText(price.publish_time_unix, locale));
    body = (
      <>
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <span data-comparison-value="" className="text-xl leading-tight font-semibold tracking-tight tabular-nums wrap-anywhere">{priceText(price, locale)}</span>
          <span className={cn("text-sm", live ? "" : "font-medium")}><Time unix={price.publish_time_unix}>{when}</Time></span>
        </p>
        <p className="text-sm text-muted-foreground tabular-nums">{copy.feed.confidence(confidenceText(price, locale))}</p>
        {live && session?.kind === "closed" ? <p className="text-sm text-muted-foreground" data-comparison-outside-session="">{copy.session.publishedOutside}</p> : null}
      </>
    );
  }
  return (
    <div data-term="pyth-reference-price" data-comparison-row={row} data-pyth-feed={facts.feed.feed_id} data-pyth-price-status={status} className="flex min-w-0 flex-col gap-1">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      {body}
      {sessionLine}
    </div>
  );
}

function TradeRow({ trade, copy, locale }: { trade: TradeFacts; copy: ComparisonCopy; locale: PublicWebLocale }) {
  return (
    <div data-term="onchain-trade-price" data-comparison-row="trade" className="flex min-w-0 flex-col gap-1">
      <p className="text-sm font-medium text-muted-foreground">{copy.row.trade(formatSourceDate(trade.date, locale))}</p>
      {trade.perShare === null ? (
        <p className="text-sm">{copy.trade.noPerShare}</p>
      ) : (
        <p><span data-comparison-value="" className="text-xl leading-tight font-semibold tracking-tight tabular-nums wrap-anywhere">{copy.trade.perShare(usdcText(trade.perShare, locale))}</span></p>
      )}
      <p className="text-sm text-muted-foreground tabular-nums">{copy.trade.perToken(usdcText(trade.perToken, locale))}</p>
    </div>
  );
}

function Gaps({ facts, copy, locale, symbol }: { facts: ComparisonFacts; copy: ComparisonCopy; locale: PublicWebLocale; symbol: string }) {
  const underlying = feedName(facts.underlying.feed.pyth_symbol);
  const token = facts.token ? feedName(facts.token.feed.pyth_symbol) : null;
  const seconds = String(PRICING_CONFIG.staleAfterSeconds);
  const { tokenGap, tradeGap } = facts;
  let tokenLine = null;
  if (tokenGap.kind === "shown" && token) {
    tokenLine = (
      <>
        <p data-comparison-gap="token" className="font-medium tabular-nums">{copy.tokenGap.value(token, underlying, signedPercentText(tokenGap.ratio, locale))}</p>
        <p className="max-w-prose text-sm text-muted-foreground">{copy.tokenGap.unit}</p>
      </>
    );
  } else if (tokenGap.kind === "notCompared") {
    const text = tokenGap.reason === "tokenNotLive" && token ? copy.tokenGap.tokenNotLive(token, seconds)
      : tokenGap.reason === "underlyingNotLive" ? copy.tokenGap.underlyingNotLive(underlying, seconds)
      : tokenGap.reason === "noTokenFeed" ? copy.tokenGap.noTokenFeed(symbol)
      : null;
    if (text) tokenLine = <p data-comparison-gap="token" data-comparison-not-compared={tokenGap.reason} className="max-w-prose text-sm text-muted-foreground">{text}</p>;
  }
  let tradeLine = null;
  if (tradeGap?.kind === "shown" && facts.trade) {
    tradeLine = (
      <>
        <p data-comparison-gap="trade" className="font-medium tabular-nums">{copy.tradeGap.value(underlying, signedPercentText(tradeGap.ratio, locale))}</p>
        <p className="max-w-prose text-sm text-muted-foreground">{copy.tradeGap.note(formatSourceDate(facts.trade.date, locale), updateTimeText(tradeGap.pythPublishUnix, locale))}</p>
      </>
    );
  } else if (tradeGap?.kind === "notCompared" && tradeGap.reason === "underlyingNotShown") {
    tradeLine = <p data-comparison-gap="trade" data-comparison-not-compared={tradeGap.reason} className="max-w-prose text-sm text-muted-foreground">{copy.tradeGap.underlyingNotShown(underlying)}</p>;
  }
  if (!tokenLine && !tradeLine) return null;
  return (
    <div data-term="pyth-reference-price" data-comparison-gaps="" className="flex flex-col gap-1 border-t pt-3">
      {tokenLine}
      {tradeLine}
    </div>
  );
}

/**
 * The panel from facts already judged (`comparisonFacts`): what the page
 * renders, and what the Living Catalog shows with fixture facts.
 */
export function PriceComparisonView({ facts, symbol, busy, hydrated, onRetry, locale }: { facts: ComparisonFacts; symbol: string; busy: boolean; hydrated: boolean; onRetry: () => void; locale: PublicWebLocale }) {
  const copy = comparisonMessagesFor(locale);
  return (
    <SectionCard id="price-comparison" heading={copy.heading}>
      <p className="max-w-prose text-muted-foreground">{copy.lead(symbol)}</p>
      <div data-price-comparison={facts.ticker} aria-busy={busy ? true : undefined} className="grid gap-4 md:grid-cols-(--price-comparison-columns)">
        <FeedRow facts={facts.underlying} row="underlying" label={copy.row.underlying(feedName(facts.underlying.feed.pyth_symbol))} copy={copy} locale={locale} hydrated={hydrated} onRetry={onRetry} />
        {facts.token ? <FeedRow facts={facts.token} row="token" label={copy.row.token(feedName(facts.token.feed.pyth_symbol))} copy={copy} locale={locale} hydrated={hydrated} onRetry={onRetry} /> : null}
        {facts.trade ? <TradeRow trade={facts.trade} copy={copy} locale={locale} /> : null}
      </div>
      <Gaps facts={facts} copy={copy} locale={locale} symbol={symbol} />
      <p data-term="pyth-reference-price" className="max-w-prose text-xs text-muted-foreground">{copy.sources(formatSourceDate(PRICE_COMPARISON_INDEX.schedule_source.checked_at, locale))}</p>
    </SectionCard>
  );
}

/** The panel for one xStock by its exact registry ticker; nothing for a ticker the comparison index does not list. */
export function PriceComparisonPanel({ ticker, symbol, chart, locale }: { ticker: string; symbol: string; chart: ChartData | null; locale: PublicWebLocale }) {
  const entry = comparisonEntryForTicker(ticker);
  const feedIds = entry ? [entry.underlying.feed_id, ...(entry.token ? [entry.token.feed_id] : [])] : [];
  const { results, nowMs, retry } = useComparisonReads(feedIds);
  const hydrated = useHydrated();
  if (!entry) return null;
  const facts = comparisonFacts({
    entry,
    schedules: PRICE_COMPARISON_SCHEDULES,
    underlyingRead: results.get(entry.underlying.feed_id),
    tokenRead: entry.token ? results.get(entry.token.feed_id) : undefined,
    trade: chart ? comparableTrade(chart) : null,
    nowMs,
  });
  return <PriceComparisonView facts={facts} symbol={symbol} busy={feedIds.some((feedId) => !results.has(feedId))} hydrated={hydrated} onRetry={retry} locale={locale} />;
}
