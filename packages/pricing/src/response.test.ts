import { describe, expect, it } from "vitest";

import { FEED_MAP, feedEntry } from "./feed-map.js";
import { observeFeed, priceResult } from "./prices.js";
import { PRICES_DISCLAIMER, parsePricesResponse } from "./response.js";
import { priceUpdateData } from "./test-fixtures.js";

const NVDA_FEED = "b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593";
const NOW_S = 1_790_237_160;
const fresh = priceResult(NVDA_FEED, observeFeed(feedEntry(NVDA_FEED)!, [{ owner: FEED_MAP.source.receiver_program, data: priceUpdateData({ feedId: NVDA_FEED, price: 1n, exponent: -5, publishTime: BigInt(NOW_S) }) }, null], NOW_S * 1000), NOW_S * 1000);
const missing = priceResult(NVDA_FEED, observeFeed(feedEntry(NVDA_FEED)!, [null, null], NOW_S * 1000), NOW_S * 1000);

function body(prices: unknown[]) {
  return JSON.parse(JSON.stringify({ prices, feed_map_revision: FEED_MAP.revision, disclaimer: PRICES_DISCLAIMER }));
}

describe("parsePricesResponse", () => {
  it("accepts fresh and unavailable results for exactly the requested feeds", () => {
    expect(parsePricesResponse(body([fresh]), [NVDA_FEED])?.prices[0]).toEqual(fresh);
    expect(parsePricesResponse(body([missing]), [NVDA_FEED])?.prices[0]).toEqual(missing);
  });

  it.each([
    ["an extra top-level key", () => ({ ...body([fresh]), extra: 1 })],
    ["an extra price key", () => body([{ ...fresh, value: 1 }])],
    ["a value on an unavailable result", () => body([{ ...missing, price: "1" }])],
    ["an unknown reason", () => body([{ ...missing, reason: "nope" }])],
    ["a floating-point price", () => body([{ ...fresh, price: 1.5 }])],
    ["a feed that was not requested", () => body([{ ...fresh, feed_id: "0".repeat(64) }])],
    ["a missing result", () => body([])],
    ["a quote flag removed", () => body([{ ...fresh, not_quote: false }])],
  ])("rejects %s", (_name, make) => {
    expect(parsePricesResponse(make(), [NVDA_FEED])).toBeNull();
  });
});
