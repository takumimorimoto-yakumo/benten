import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FEED_MAP } from "@benten/pricing";
import { derivePriceComparisonIndex, type PriceComparisonIndex } from "../app/features/price-comparison/comparison-index-source.ts";
import { PRICE_COMPARISON_INDEX, PRICE_COMPARISON_SCHEDULES, comparisonEntryForTicker } from "../app/features/price-comparison/comparison-index.ts";
import { comparisonFacts } from "../app/features/price-comparison/comparison-model.ts";
import { PriceComparisonPanel, PriceComparisonView } from "../app/features/price-comparison/price-comparison-panel.tsx";
import { parsePythSchedule, scheduleSessionAt } from "../app/features/price-comparison/pyth-schedule.ts";
import { PythReferenceCheckLine } from "../app/features/price-comparison/reference-check.tsx";
import type { PythPriceResult } from "../app/features/pricing/price-format.ts";
import { COMPARISON_MESSAGES } from "../app/i18n/comparison-messages.ts";
import { PUBLIC_WEB_LOCALES } from "../app/i18n/locales.ts";
import { LATIN_FORBIDDEN, LOCALE_FORBIDDEN } from "./app-vocabulary.mjs";

const NVDA_FEED = "b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593";
const NVDAX_FEED = "4244d07890e4610f46bbde67de8f43a4bf8b569eebe904f136b469f148503b7f";
const NVDAX_MINT = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
/** Friday 2026-09-25 10:45 UTC = 06:45 in New York, before the regular session. */
const FRIDAY_PREMARKET = Date.UTC(2026, 8, 25, 10, 45);
const PUBLISHED = Math.floor(FRIDAY_PREMARKET / 1000) - 5;

/** A result in the exact `/api/prices` shape (specimen numbers, not market data). */
function priceResult(overrides: Partial<Record<string, unknown>> = {}): PythPriceResult {
  return {
    kind: "pyth_reference", feed_id: NVDA_FEED, pyth_symbol: "Equity.US.NVDA/USD", role: "xstock_underlying_share", observed_at: new Date(PUBLISHED * 1000 + 2000).toISOString(),
    status: "fresh", price: "200.00000", confidence: "0.04000", exponent: -5, price_raw: "20000000", confidence_raw: "4000", currency: "USD",
    publish_time: new Date(PUBLISHED * 1000).toISOString(), publish_time_unix: PUBLISHED, stale_after_seconds: 60,
    source: { network: "solana-mainnet", program: "rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ", account: "11111111111111111111111111111111", shard: 1, posted_slot: "1", verification: "full" },
    not_quote: true, ...overrides,
  } as PythPriceResult;
}

function tokenResult(overrides: Partial<Record<string, unknown>> = {}): PythPriceResult {
  return priceResult({ feed_id: NVDAX_FEED, pyth_symbol: "Crypto.NVDAX/USD", role: "xstock_token", price: "202.00000", price_raw: "20200000", ...overrides });
}

const nvda = comparisonEntryForTicker("NVDA")!;

describe("price comparison index", () => {
  it("is exactly the derivation from the validated feed map (run tools/write-price-comparison-index.mts after a feed map change)", () => {
    const committed = JSON.parse(readFileSync(new URL("../app/features/price-comparison/comparison-index.json", import.meta.url), "utf8")) as PriceComparisonIndex;
    const bySymbol = new Map(committed.entries.flatMap((entry) => [entry.underlying, ...(entry.token ? [entry.token] : [])]).map((feed) => [`${feed.feed_id} ${feed.pyth_symbol}`, committed.schedules[feed.schedule]!]));
    const derived = derivePriceComparisonIndex({ revision: FEED_MAP.revision, entries: FEED_MAP.entries, scheduleOf: (feedId, symbol) => bySymbol.get(`${feedId} ${symbol}`), scheduleSource: committed.schedule_source });
    expect(committed).toEqual(derived);
  });

  it("binds both Pyth feeds of NVDA, TSLA and SPY by exact ticker from the feed map", () => {
    expect(nvda).toMatchObject({ ticker: "NVDA", mint: NVDAX_MINT, underlying: { feed_id: NVDA_FEED, pyth_symbol: "Equity.US.NVDA/USD" }, token: { feed_id: NVDAX_FEED, pyth_symbol: "Crypto.NVDAX/USD" } });
    for (const ticker of ["TSLA", "SPY"]) {
      const entry = comparisonEntryForTicker(ticker)!;
      expect(entry.underlying.pyth_symbol).toBe(`Equity.US.${ticker}/USD`);
      expect(entry.token?.pyth_symbol).toBe(`Crypto.${ticker}X/USD`);
    }
    expect(comparisonEntryForTicker("nvda")).toBeNull();
    expect(comparisonEntryForTicker("NVDAx")).toBeNull();
    for (const entry of PRICE_COMPARISON_INDEX.entries) {
      const feeds = FEED_MAP.entries.filter((feed) => feed.binding.mint === entry.mint);
      expect(feeds.map((feed) => feed.feed_id)).toContain(entry.underlying.feed_id);
      if (entry.token) expect(feeds.map((feed) => feed.feed_id)).toContain(entry.token.feed_id);
    }
  });

  it("parses every committed Pyth schedule; the token feed is open every day, all hours", () => {
    expect(PRICE_COMPARISON_SCHEDULES.every((schedule) => schedule !== null)).toBe(true);
    expect(scheduleSessionAt(PRICE_COMPARISON_SCHEDULES[nvda.token!.schedule]!, FRIDAY_PREMARKET)).toEqual({ kind: "always_open" });
  });

  it("rejects a feed map entry without a Pyth schedule and two feeds of one role for one mint", () => {
    const [share] = FEED_MAP.entries.filter((feed) => feed.feed_id === NVDA_FEED);
    const source = { checked_at: "2026-09-25" };
    expect(() => derivePriceComparisonIndex({ revision: "r", entries: [share!], scheduleOf: () => undefined, scheduleSource: source })).toThrow(/no Pyth schedule/);
    expect(() => derivePriceComparisonIndex({ revision: "r", entries: [share!, { ...share!, feed_id: "0".repeat(64) }], scheduleOf: () => "UTC;O,O,O,O,O,O,O;", scheduleSource: source })).toThrow(/two xstock_underlying_share/);
  });
});

describe("Pyth market schedule", () => {
  const equity = parsePythSchedule("America/New_York;0930-1600,0930-1600,0930-1600,0930-1600,0930-1600,C,C;1126/C,1127/0930-1300")!;

  it("parses only the documented form", () => {
    expect(equity.timeZone).toBe("America/New_York");
    for (const bad of ["", "America/New_York", "Not/AZone;O,O,O,O,O,O,O;", "America/New_York;O,O,O,O,O,O;", "America/New_York;0930-2500,O,O,O,O,O,O;", "America/New_York;1600-0930,O,O,O,O,O,O;", "America/New_York;O,O,O,O,O,O,O;1126-C"]) {
      expect(parsePythSchedule(bad), bad).toBeNull();
    }
  });

  it("is closed before the regular session and names its opening", () => {
    expect(scheduleSessionAt(equity, FRIDAY_PREMARKET)).toEqual({ kind: "closed", opensAtMs: Date.UTC(2026, 8, 25, 13, 30) });
  });

  it("is open in the session and names its close", () => {
    expect(scheduleSessionAt(equity, Date.UTC(2026, 8, 25, 15, 0))).toEqual({ kind: "open", closesAtMs: Date.UTC(2026, 8, 25, 20, 0) });
  });

  it("is closed over the weekend until Monday's opening", () => {
    expect(scheduleSessionAt(equity, Date.UTC(2026, 8, 26, 15, 0))).toEqual({ kind: "closed", opensAtMs: Date.UTC(2026, 8, 28, 13, 30) });
  });

  it("follows dated exceptions: a holiday, then a short day (New York standard time)", () => {
    expect(scheduleSessionAt(equity, Date.UTC(2026, 10, 26, 16, 0))).toEqual({ kind: "closed", opensAtMs: Date.UTC(2026, 10, 27, 14, 30) });
    expect(scheduleSessionAt(equity, Date.UTC(2026, 10, 27, 15, 0))).toEqual({ kind: "open", closesAtMs: Date.UTC(2026, 10, 27, 18, 0) });
  });
});

describe("price comparison facts", () => {
  const base = { entry: nvda, schedules: PRICE_COMPARISON_SCHEDULES, trade: null, nowMs: FRIDAY_PREMARKET };

  it("states nothing before the first read is judged", () => {
    const facts = comparisonFacts({ ...base, underlyingRead: priceResult(), tokenRead: tokenResult(), nowMs: null });
    expect(facts.underlying).toMatchObject({ display: null, session: null });
    expect(facts.tokenGap).toEqual({ kind: "notCompared", reason: "reading" });
  });

  it("states the token vs underlying difference only when both prices are live", () => {
    const facts = comparisonFacts({ ...base, underlyingRead: priceResult(), tokenRead: tokenResult() });
    expect(facts.tokenGap.kind).toBe("shown");
    expect(facts.tokenGap.kind === "shown" && facts.tokenGap.ratio).toBeCloseTo(0.01, 12);
    expect(facts.underlying.session?.kind).toBe("closed");
    expect(facts.token?.session).toEqual({ kind: "always_open" });
  });

  it("does not compare a token feed whose Solana account was not updated (as observed for Crypto.NVDAX/USD on 2026-09-25)", () => {
    const old = PUBLISHED - 5 * 24 * 3600;
    const facts = comparisonFacts({ ...base, underlyingRead: priceResult(), tokenRead: tokenResult({ status: "stale", publish_time_unix: old, publish_time: new Date(old * 1000).toISOString() }) });
    expect(facts.token?.display?.kind).toBe("tooOld");
    expect(facts.tokenGap).toEqual({ kind: "notCompared", reason: "tokenNotLive" });
    const stale = comparisonFacts({ ...base, underlyingRead: priceResult({ status: "stale" }), tokenRead: tokenResult() });
    expect(stale.tokenGap).toEqual({ kind: "notCompared", reason: "underlyingNotLive" });
  });

  it("compares the last trade's value for one share with the shown underlying price, and nothing without that value", () => {
    const trade = { date: "2026-09-24", value: 201, per_share: 198, source: "onchain" } as never;
    const facts = comparisonFacts({ ...base, underlyingRead: priceResult({ status: "stale" }), tokenRead: null, trade });
    expect(facts.tradeGap).toMatchObject({ kind: "shown", pythPublishUnix: PUBLISHED });
    expect(facts.tradeGap?.kind === "shown" && facts.tradeGap.ratio).toBeCloseTo(-0.01, 12);
    const noShare = comparisonFacts({ ...base, underlyingRead: priceResult(), tokenRead: null, trade: { ...(trade as object), per_share: null } as never });
    expect(noShare.tradeGap).toEqual({ kind: "notCompared", reason: "noPerShare" });
    const unavailable = comparisonFacts({ ...base, underlyingRead: null, tokenRead: null, trade });
    expect(unavailable.tradeGap).toEqual({ kind: "notCompared", reason: "underlyingNotShown" });
  });
});

describe("price comparison panel", () => {
  it("renders the three rows' labels and sources on the server, with no price, session or difference before hydration", () => {
    const html = renderToStaticMarkup(<PriceComparisonPanel ticker="NVDA" symbol="NVDAx" chart={null} locale="en" />);
    expect(html).toContain('data-price-comparison="NVDA"');
    expect(html).toContain(`data-pyth-feed="${NVDA_FEED}"`);
    expect(html).toContain(`data-pyth-feed="${NVDAX_FEED}"`);
    expect(html).not.toContain("data-comparison-session");
    expect(html).not.toContain("data-comparison-gap");
    expect(renderToStaticMarkup(<PriceComparisonPanel ticker="nvda" symbol="NVDAx" chart={null} locale="en" />)).toBe("");
  });

  it("shows prices, sessions and differences inside the price vocabulary elements", () => {
    const old = PUBLISHED - 5 * 24 * 3600;
    const trade = { date: "2026-09-24", value: 201, per_share: 198 } as never;
    const facts = comparisonFacts({ entry: nvda, schedules: PRICE_COMPARISON_SCHEDULES, underlyingRead: priceResult(), tokenRead: tokenResult({ status: "stale", publish_time_unix: old, publish_time: new Date(old * 1000).toISOString() }), trade, nowMs: FRIDAY_PREMARKET });
    const html = renderToStaticMarkup(<PriceComparisonView facts={facts} symbol="NVDAx" busy={false} hydrated onRetry={() => undefined} locale="en" />);
    expect(html).toContain("$200.00");
    expect(html).toContain("Pyth confidence ±$0.04");
    expect(html).toContain('data-comparison-session="closed"');
    expect(html).toContain('data-comparison-session="always_open"');
    expect(html).toContain('data-comparison-outside-session=""');
    expect(html).toContain('data-comparison-not-compared="tokenNotLive"');
    expect(html).toContain('data-comparison-gap="trade"');
    expect(html).toContain("198.00 USDC for one underlying share");
    const outside = html.replace(/<(div|p) data-term="(?:pyth-reference-price|onchain-trade-price)"[\s\S]*?<\/\1>/g, "");
    expect(outside.replace(/<[^>]+>/g, " ")).not.toMatch(/\bprices?\b/i);
    for (const locale of PUBLIC_WEB_LOCALES) {
      const text = renderToStaticMarkup(<PriceComparisonView facts={facts} symbol="NVDAx" busy={false} hydrated onRetry={() => undefined} locale={locale} />).replace(/<[^>]+>/g, " ");
      expect(text, locale).not.toMatch(LATIN_FORBIDDEN);
      const forbidden = LOCALE_FORBIDDEN[locale];
      if (forbidden) expect(text, locale).not.toMatch(forbidden);
    }
  });
});

describe("Pyth reference check line (review step display hook)", () => {
  it("renders nothing without a check, and the checked feed, price and time with one", () => {
    expect(renderToStaticMarkup(<PythReferenceCheckLine check={null} locale="en" />)).toBe("");
    const html = renderToStaticMarkup(<PythReferenceCheckLine check={{ price: priceResult() as Extract<PythPriceResult, { status: "fresh" }>, valueText: "$20.00" }} locale="en" />);
    expect(html).toContain('data-term="pyth-reference-price"');
    expect(html).toContain(`data-pyth-reference-check="${NVDA_FEED}"`);
    expect(html).toContain("Checked against the Pyth reference price NVDA/USD: $200.00");
    expect(html).toContain("Value of this amount at that price: $20.00.");
  });
});

describe("comparison copy", () => {
  const shape = (value: unknown): unknown =>
    typeof value === "function" ? `fn/${value.length}` : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, shape(nested)])) : typeof value;
  const strings = (value: unknown): string[] =>
    typeof value === "string" ? [value]
      : typeof value === "function" ? [String((value as (...args: string[]) => unknown)("A", "B", "C"))]
        : value && typeof value === "object" ? Object.values(value).flatMap(strings) : [];

  it("has one catalog per locale with an identical key structure", () => {
    expect(Object.keys(COMPARISON_MESSAGES)).toEqual([...PUBLIC_WEB_LOCALES]);
    for (const locale of PUBLIC_WEB_LOCALES) expect(shape(COMPARISON_MESSAGES[locale]), locale).toEqual(shape(COMPARISON_MESSAGES.en));
  });

  it("uses no ranking, rating, advice or forecast word in any locale", () => {
    for (const locale of PUBLIC_WEB_LOCALES) {
      const texts = strings(COMPARISON_MESSAGES[locale]);
      expect(texts.filter((text) => LATIN_FORBIDDEN.test(text)), locale).toEqual([]);
      const forbidden = LOCALE_FORBIDDEN[locale];
      if (forbidden) expect(texts.filter((text) => forbidden.test(text)), locale).toEqual([]);
    }
  });
});
