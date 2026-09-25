import { describe, expect, it } from "vitest";

import { PRICING_CONFIG } from "./config.js";
import { isStaleAt, observeFeedAccounts, type FeedAccounts } from "./observe.js";
import { priceUpdateData } from "./test-fixtures.js";

const FEED_ID = "ab".repeat(32);
const RECEIVER = "rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ";
const FEED: FeedAccounts = {
  feedId: FEED_ID,
  priceAccounts: [{ shard: 0, address: "shard0" }, { shard: 1, address: "shard1" }],
  receiverProgram: RECEIVER,
};
const NOW_MS = 1_800_000_000_000;
const NOW_S = BigInt(NOW_MS / 1000);

function account(publishTime: bigint, price = 22_524_000n, owner = RECEIVER, feedId = FEED_ID) {
  return { owner, data: priceUpdateData({ feedId, price, exponent: -5, publishTime }) };
}

describe("isStaleAt", () => {
  it("is fresh exactly at the stale bound and stale one second past it", () => {
    const publish = NOW_MS / 1000 - PRICING_CONFIG.staleAfterSeconds;
    expect(isStaleAt(publish, NOW_MS)).toBe(false);
    expect(isStaleAt(publish - 1, NOW_MS)).toBe(true);
  });
});

describe("observeFeedAccounts", () => {
  it("takes the newest valid shard", () => {
    const observation = observeFeedAccounts(FEED, [account(NOW_S - 100n), account(NOW_S - 5n, 1n)], NOW_MS);
    expect(observation.ok).toBe(true);
    if (observation.ok) {
      expect(observation.shard).toBe(1);
      expect(observation.update.price).toBe(1n);
    }
  });

  it("refuses an account another program owns, another feed id, and a future publish time", () => {
    expect(observeFeedAccounts(FEED, [account(NOW_S, 1n, "someone-else"), null], NOW_MS)).toMatchObject({ ok: false, reason: "malformed_price_account" });
    expect(observeFeedAccounts(FEED, [account(NOW_S, 1n, RECEIVER, "cd".repeat(32)), null], NOW_MS)).toMatchObject({ ok: false, reason: "malformed_price_account" });
    const future = NOW_S + BigInt(PRICING_CONFIG.maxFutureSkewSeconds) + 1n;
    expect(observeFeedAccounts(FEED, [account(future), null], NOW_MS)).toMatchObject({ ok: false, reason: "future_publish_time" });
  });

  it("reports no price account when every shard is absent", () => {
    expect(observeFeedAccounts(FEED, [null, null], NOW_MS)).toMatchObject({ ok: false, reason: "no_price_account" });
  });
});
