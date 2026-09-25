import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FEED_MAP, parsePricesResponse } from "@benten/pricing";
import { createPriceClient } from "../app/features/pricing/price-client.ts";
import { confidenceText, feedName, isLivePrice, priceDisplayState, priceForValue, priceText, roundDecimal, type PythPriceResult } from "../app/features/pricing/price-format.ts";
import { PRICE_DISPLAY_CONFIG } from "../app/features/pricing/price-config.ts";
import { derivePythFeedIndex } from "../app/features/pricing/pyth-feed-index-source.ts";
import { hasPythFeed, pythFeedForMint, pythFeedForTicker, valuationFeedForMint } from "../app/features/pricing/pyth-feeds.ts";
import { PythReferencePrice } from "../app/features/pricing/pyth-reference-price.tsx";
import { PUBLIC_WEB_LOCALES } from "../app/i18n/locales.ts";
import { PRODUCT_MESSAGES } from "../app/i18n/product-messages.ts";

const NVDA_FEED = "b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593";
const NVDAX_MINT = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
const OPENAI_MINT = "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF";
const PUBLISHED = 1_790_000_000;

/** A result in the exact `/api/prices` shape (specimen numbers, not market data). */
function priceResult(overrides: Partial<Record<string, unknown>> = {}): PythPriceResult {
  return {
    kind: "pyth_reference", feed_id: NVDA_FEED, pyth_symbol: "Equity.US.NVDA/USD", role: "xstock_underlying_share", observed_at: new Date(PUBLISHED * 1000 + 2000).toISOString(),
    status: "fresh", price: "182.40512", confidence: "0.04321", exponent: -5, price_raw: "18240512", confidence_raw: "4321", currency: "USD",
    publish_time: new Date(PUBLISHED * 1000).toISOString(), publish_time_unix: PUBLISHED, stale_after_seconds: 60,
    source: { network: "solana-mainnet", program: "rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ", account: "11111111111111111111111111111111", shard: 0, posted_slot: "1", verification: "full" },
    not_quote: true, ...overrides,
  } as PythPriceResult;
}

describe("Pyth feed index", () => {
  it("is exactly the derivation from the validated feed map (run tools/write-pyth-feed-index.mts after a feed map change)", () => {
    const committed = JSON.parse(readFileSync(new URL("../app/features/pricing/pyth-feed-index.json", import.meta.url), "utf8"));
    expect(committed).toEqual(derivePythFeedIndex(FEED_MAP.revision, FEED_MAP.entries));
  });

  it("finds a product's feed by exact mint or exact ticker only, preferring the underlying share", () => {
    expect(pythFeedForMint(NVDAX_MINT)).toMatchObject({ feed_id: NVDA_FEED, role: "xstock_underlying_share", ticker: "NVDA" });
    expect(pythFeedForTicker("NVDA")?.feed_id).toBe(NVDA_FEED);
    expect(pythFeedForTicker("nvda")).toBeNull();
    expect(pythFeedForTicker("NVDAx")).toBeNull();
    expect(pythFeedForMint(NVDAX_MINT.toLowerCase())).toBeNull();
    expect(pythFeedForMint(OPENAI_MINT)).toMatchObject({ role: "private_company_index", ticker: null });
  });

  it("marks the feed that may value a holding, which is always the one shown", () => {
    expect(valuationFeedForMint(NVDAX_MINT)?.feed_id).toBe(NVDA_FEED);
    expect(valuationFeedForMint(OPENAI_MINT)).toBeNull();
    expect(hasPythFeed(OPENAI_MINT)).toBe(true);
    for (const entry of FEED_MAP.entries.filter((feed) => feed.valuation.use)) expect(valuationFeedForMint(entry.binding.mint)?.feed_id).toBe(entry.feed_id);
    const [share] = FEED_MAP.entries.filter((feed) => feed.valuation.use);
    const token = { ...share!, feed_id: "0".repeat(64), role: "xstock_token" as const, valuation: { use: true } };
    expect(() => derivePythFeedIndex("r", [share!, token])).toThrow(/not the feed shown/);
  });
});

describe("Pyth reference price display rules", () => {
  const now = (seconds: number) => (PUBLISHED + seconds) * 1000;

  it("is live inside the price's stale window, stale after it, and not shown after the display cap", () => {
    expect(priceDisplayState(priceResult(), now(10)).kind).toBe("live");
    expect(priceDisplayState(priceResult(), now(61)).kind).toBe("stale");
    expect(priceDisplayState(priceResult({ status: "stale" }), now(10)).kind).toBe("stale");
    const weekend = 65 * 3600;
    expect(priceDisplayState(priceResult({ status: "stale" }), now(weekend)).kind).toBe("stale");
    expect(priceDisplayState(priceResult({ status: "stale" }), now(PRICE_DISPLAY_CONFIG.maxDisplayAgeHours * 3600 + 1)).kind).toBe("tooOld");
  });

  it("uses only a live price for a value", () => {
    expect(isLivePrice(priceResult(), now(10))).toBe(true);
    expect(isLivePrice(priceResult(), now(61))).toBe(false);
    expect(isLivePrice(null, now(0))).toBe(false);
  });

  it("uses a price for a value only when it is live and its confidence is within the limit", () => {
    expect(priceForValue(priceResult(), now(10))).toMatchObject({ usable: true });
    expect(priceForValue(priceResult(), now(61))).toEqual({ usable: false, reason: "stale" });
    expect(priceForValue(priceResult({ status: "stale" }), now(PRICE_DISPLAY_CONFIG.maxDisplayAgeHours * 3600 + 1))).toEqual({ usable: false, reason: "too_old" });
    expect(priceForValue(null, now(0))).toEqual({ usable: false, reason: "unavailable" });
    expect(priceForValue(priceResult({ status: "unavailable", reason: "no_price_account" }), now(0))).toEqual({ usable: false, reason: "no_feed" });
    const limit = (18240512n * BigInt(PRICE_DISPLAY_CONFIG.maxValueConfidenceBps)) / 10_000n;
    expect(priceForValue(priceResult({ confidence_raw: String(limit) }), now(10))).toMatchObject({ usable: true });
    expect(priceForValue(priceResult({ confidence_raw: String(limit + 1n) }), now(10))).toEqual({ usable: false, reason: "confidence_too_wide" });
  });

  it("never shows a zero, negative or unreadable price", () => {
    expect(priceDisplayState(priceResult({ price: "0", price_raw: "0" }), now(1)).kind).toBe("unavailable");
    expect(priceDisplayState(priceResult({ price: "-1.5", price_raw: "-150000" }), now(1)).kind).toBe("unavailable");
    expect(priceDisplayState({ kind: "pyth_reference", feed_id: NVDA_FEED, pyth_symbol: null, role: null, observed_at: "", status: "unavailable", reason: "upstream_timeout" } as PythPriceResult, now(1)).kind).toBe("unavailable");
    expect(priceDisplayState(null, now(1)).kind).toBe("unavailable");
    // No price account on Solana: nothing to try again, so it reads as no feed.
    expect(priceDisplayState({ kind: "pyth_reference", feed_id: NVDA_FEED, pyth_symbol: null, role: null, observed_at: "", status: "unavailable", reason: "no_price_account" } as PythPriceResult, now(1)).kind).toBe("noFeed");
  });

  it("rounds the figure to cents, the confidence up and never to zero", () => {
    expect(roundDecimal("182.405", 2, "halfUp")).toBe("182.41");
    expect(roundDecimal("182.40499", 2, "halfUp")).toBe("182.40");
    expect(roundDecimal("0.001", 2, "up")).toBe("0.01");
    expect(roundDecimal("7", 2, "halfUp")).toBe("7.00");
    const price = priceResult() as Extract<PythPriceResult, { status: "fresh" }>;
    expect(priceText(price, "en")).toBe("$182.41");
    expect(confidenceText(price, "en")).toBe("$0.05");
    expect(confidenceText({ ...price, confidence: "0" }, "en")).toBe("$0.01");
    expect(priceText({ ...price, price: "0.0123456" }, "en")).toBe("$0.012346");
    expect(priceText({ ...price, price: "1234567.891" }, "en")).toBe("$1,234,567.89");
    expect(feedName("Equity.US.NVDA/USD")).toBe("NVDA/USD");
    expect(feedName("Equity.Index.OPENAI/USD")).toBe("OPENAI/USD");
  });
});

describe("same-origin price client", () => {
  function response(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }
  const OTHER_FEED = FEED_MAP.entries.find((entry) => entry.feed_id !== NVDA_FEED)!.feed_id;

  it("batches the reads of one task into one same-origin request and parses it strictly", async () => {
    const calls: string[] = [];
    const client = createPriceClient({
      fetchImpl: async (input) => {
        calls.push(input);
        const feeds = new URL(input, "https://benten.invalid").searchParams.getAll("feed");
        return response({ prices: feeds.map((feed) => priceResult({ feed_id: feed })), feed_map_revision: FEED_MAP.revision, disclaimer: "x" });
      },
    });
    const [first, second] = await Promise.all([client.read(NVDA_FEED), client.read(OTHER_FEED)]);
    expect(calls).toEqual([`/api/prices?feed=${NVDA_FEED}&feed=${OTHER_FEED}`]);
    expect(first.result?.feed_id).toBe(NVDA_FEED);
    expect(second.result?.feed_id).toBe(OTHER_FEED);
    // Within the cache time the same feed is not read again.
    await client.read(NVDA_FEED);
    expect(calls).toHaveLength(1);
    await client.read(NVDA_FEED, { force: true });
    expect(calls).toHaveLength(2);
  });

  it("makes every feed of a failed call unavailable instead of guessing", async () => {
    for (const fetchImpl of [
      async () => response({ error: { code: "rate_limited" } }, 429),
      async () => response({ prices: [], feed_map_revision: "x", disclaimer: "x" }),
      async () => response({ prices: [priceResult({ feed_id: OTHER_FEED })], feed_map_revision: "x", disclaimer: "x" }),
      async () => { throw new TypeError("network"); },
    ]) {
      const read = await createPriceClient({ fetchImpl }).read(NVDA_FEED);
      expect(read.result).toBeNull();
    }
    // The strict parser is the pricing package's own.
    expect(parsePricesResponse({ prices: [priceResult({ extra: 1 })], feed_map_revision: "x", disclaimer: "x" }, [NVDA_FEED])).toBeNull();
  });
});

describe("PythReferencePrice rendering", () => {
  it("has the same copy keys in every locale and keeps the fixed term", () => {
    const keys = Object.keys(PRODUCT_MESSAGES.en.price).sort();
    for (const locale of PUBLIC_WEB_LOCALES) expect(Object.keys(PRODUCT_MESSAGES[locale].price).sort(), locale).toEqual(keys);
    expect(PRODUCT_MESSAGES.en.price.label).toBe("Pyth reference price");
    expect(PRODUCT_MESSAGES.en.price.noFeed).toBe("No Pyth price feed for this token");
    expect(PRODUCT_MESSAGES.en.price.unavailable).toBe("Pyth reference price unavailable right now");
  });

  it("prerenders the no-feed statement for a product the feed map does not bind, and a reserved, value-free block otherwise", () => {
    const none = renderToStaticMarkup(<PythReferencePrice mint="11111111111111111111111111111111" locale="en" />);
    expect(none).toContain('data-pyth-price-status="no-feed"');
    expect(none).toContain("No Pyth price feed for this token");
    const loading = renderToStaticMarkup(<PythReferencePrice ticker="NVDA" locale="ja" />);
    expect(loading).toContain('data-pyth-price-status="loading"');
    expect(loading).toContain('data-term="pyth-reference-price"');
    expect(loading).toContain(PRODUCT_MESSAGES.ja.price.label);
    expect(loading).toContain("<noscript>");
    expect(loading).not.toMatch(/\$|\d+\.\d{2}/);
  });
});
