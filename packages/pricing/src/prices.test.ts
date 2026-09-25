import { describe, expect, it, vi } from "vitest";

import { PRICING_CONFIG } from "./config.js";
import { FEED_MAP, feedEntry } from "./feed-map.js";
import { decodePriceUpdate } from "./price-update.js";
import { PriceRpcError, isFresh, observeFeed, observeFeeds, priceResult } from "./prices.js";
import { priceUpdateData } from "./test-fixtures.js";

const NVDA_FEED = "b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593";
const TSLA_FEED = FEED_MAP.entries.find((entry) => entry.pyth_symbol === "Equity.US.TSLA/USD")!.feed_id;
const RECEIVER = FEED_MAP.source.receiver_program;
const NOW_S = 1_790_237_160;
const NOW = NOW_S * 1000;
const nvda = feedEntry(NVDA_FEED)!;

function account(publishTime: number, overrides: Partial<Parameters<typeof priceUpdateData>[0]> = {}, owner = RECEIVER) {
  return { owner, data: priceUpdateData({ feedId: NVDA_FEED, price: 22_383_505n, confidence: 4_495n, exponent: -5, publishTime: BigInt(publishTime), postedSlot: 449_969_455n, ...overrides }) };
}

describe("decodePriceUpdate", () => {
  it("decodes a fully verified update", () => {
    expect(decodePriceUpdate(account(NOW_S).data)).toEqual({
      feedId: NVDA_FEED, price: 22_383_505n, confidence: 4_495n, exponent: -5, publishTime: BigInt(NOW_S), postedSlot: 449_969_455n,
    });
  });

  it.each([
    ["a partially verified update", priceUpdateData({ feedId: NVDA_FEED, price: 1n, exponent: -5, publishTime: 1n, verification: 0 })],
    ["another discriminator", (() => { const data = account(NOW_S).data; data[0] = 0; return data; })()],
    ["short data", account(NOW_S).data.subarray(0, 132)],
    ["an absurd exponent", priceUpdateData({ feedId: NVDA_FEED, price: 1n, exponent: -40, publishTime: 1n })],
  ])("rejects %s", (_name, data) => {
    expect(decodePriceUpdate(data)).toBeNull();
  });
});

describe("observeFeed and priceResult", () => {
  it("picks the newest valid shard and reports an exact decimal price", () => {
    const observation = observeFeed(nvda, [account(NOW_S - 3000), account(NOW_S - 3)], NOW);
    const result = priceResult(NVDA_FEED, observation, NOW);
    expect(result).toEqual({
      kind: "pyth_reference",
      feed_id: NVDA_FEED,
      pyth_symbol: "Equity.US.NVDA/USD",
      role: "xstock_underlying_share",
      observed_at: new Date(NOW).toISOString(),
      status: "fresh",
      price: "223.83505",
      confidence: "0.04495",
      exponent: -5,
      price_raw: "22383505",
      confidence_raw: "4495",
      currency: "USD",
      publish_time: new Date((NOW_S - 3) * 1000).toISOString(),
      publish_time_unix: NOW_S - 3,
      stale_after_seconds: PRICING_CONFIG.staleAfterSeconds,
      source: { network: "solana-mainnet", program: RECEIVER, account: nvda.price_accounts[1]!.address, shard: 1, posted_slot: "449969455", verification: "full" },
      not_quote: true,
    });
  });

  it("marks a price older than the threshold stale but still shows its time", () => {
    const edge = priceResult(NVDA_FEED, observeFeed(nvda, [account(NOW_S - PRICING_CONFIG.staleAfterSeconds), null], NOW), NOW);
    expect(edge.status).toBe("fresh");
    const stale = priceResult(NVDA_FEED, observeFeed(nvda, [account(NOW_S - PRICING_CONFIG.staleAfterSeconds - 1), null], NOW), NOW);
    expect(stale).toMatchObject({ status: "stale", publish_time_unix: NOW_S - PRICING_CONFIG.staleAfterSeconds - 1 });
    expect(isFresh(edge, NOW + 2000)).toBe(false);
  });

  it.each([
    ["no account", [null, null], "no_price_account"],
    ["an account owned by another program", [account(NOW_S, {}, "11111111111111111111111111111111"), null], "malformed_price_account"],
    ["another feed's update", [account(NOW_S, { feedId: TSLA_FEED }), null], "malformed_price_account"],
    ["a publish time in the future", [account(NOW_S + PRICING_CONFIG.maxFutureSkewSeconds + 5), null], "future_publish_time"],
  ])("gives no value for %s", (_name, accounts, reason) => {
    const result = priceResult(NVDA_FEED, observeFeed(nvda, accounts as never, NOW), NOW);
    expect(result).toEqual({ kind: "pyth_reference", feed_id: NVDA_FEED, pyth_symbol: "Equity.US.NVDA/USD", role: "xstock_underlying_share", observed_at: new Date(NOW).toISOString(), status: "unavailable", reason });
  });

  it("never prices a feed outside the map", () => {
    expect(priceResult("0".repeat(64), null, NOW)).toMatchObject({ status: "unavailable", reason: "not_in_feed_map", pyth_symbol: null });
  });
});

describe("observeFeeds", () => {
  it("reads every listed account of every feed in one call and splits them back per feed", async () => {
    const tsla = feedEntry(TSLA_FEED)!;
    const rpc = vi.fn(async (addresses: string[]) => addresses.map((address) => (address === tsla.price_accounts[0]!.address
      ? { owner: RECEIVER, data: priceUpdateData({ feedId: TSLA_FEED, price: 4_000_000n, exponent: -4, publishTime: BigInt(NOW_S) }) }
      : null)));
    const observations = await observeFeeds([NVDA_FEED, TSLA_FEED], rpc, () => NOW);
    expect(rpc).toHaveBeenCalledWith([...nvda.price_accounts, ...tsla.price_accounts].map((ref) => ref.address));
    expect(observations.get(NVDA_FEED)).toMatchObject({ ok: false, reason: "no_price_account" });
    expect(priceResult(TSLA_FEED, observations.get(TSLA_FEED)!, NOW)).toMatchObject({ status: "fresh", price: "400", source: { shard: 0 } });
  });

  it("turns a transport failure into the same closed reason for every feed", async () => {
    const observations = await observeFeeds([NVDA_FEED, TSLA_FEED], async () => { throw new PriceRpcError("upstream_timeout"); }, () => NOW);
    expect([...observations.values()].map((observation) => observation.ok ? "ok" : observation.reason)).toEqual(["upstream_timeout", "upstream_timeout"]);
    const short = await observeFeeds([NVDA_FEED], async () => [null], () => NOW);
    expect(short.get(NVDA_FEED)).toMatchObject({ ok: false, reason: "upstream_unavailable" });
  });

  it("refuses feed ids outside the map before any read", async () => {
    const rpc = vi.fn(async () => []);
    await expect(observeFeeds(["0".repeat(64)], rpc, () => NOW)).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
});
