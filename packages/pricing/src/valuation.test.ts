import { describe, expect, it } from "vitest";
import { SUPPORTED_PRODUCTS } from "@benten/solana/supported-products";

import { FEED_MAP, valuationFeedForMint } from "./feed-map.js";
import { observeFeed, priceResult, type PythPriceResult } from "./prices.js";
import { priceUpdateData } from "./test-fixtures.js";
import { valueHolding, valueHoldings, type ValuationHoldingInput } from "./valuation.js";

const NVDAX_MINT = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
const NVDA_FEED = valuationFeedForMint(NVDAX_MINT)!.feed_id;
const NOW_S = 1_790_237_160;
const NOW = NOW_S * 1000;
const PRESTOCKS_WITH_FEED = FEED_MAP.entries.find((entry) => entry.role === "private_company_index")!.binding.mint;
const PRESTOCKS_WITHOUT_FEED = [...SUPPORTED_PRODUCTS.values()].find((product) => product.kind === "prestocks" && !FEED_MAP.entries.some((entry) => entry.binding.mint === product.mint))!.mint;
const XSTOCK_WITHOUT_FEED = [...SUPPORTED_PRODUCTS.values()].find((product) => product.kind === "xstock" && !valuationFeedForMint(product.mint))!.mint;

function priceAt(feedId: string, price: bigint, exponent: number, publishTime: number): PythPriceResult {
  const entry = FEED_MAP.entries.find((candidate) => candidate.feed_id === feedId)!;
  return priceResult(feedId, observeFeed(entry, [{ owner: FEED_MAP.source.receiver_program, data: priceUpdateData({ feedId, price, exponent, publishTime: BigInt(publishTime) }) }, null], NOW), NOW);
}

const nvdaFresh = new Map([[NVDA_FEED, priceAt(NVDA_FEED, 22_383_505n, -5, NOW_S - 5)]]);

function nvdax(overrides: Partial<ValuationHoldingInput> = {}): ValuationHoldingInput {
  return { mint: NVDAX_MINT, rawAmount: "100041982", decimals: 8, hasScaledUiAmount: true, scaledUiMultiplier: "1.001701196801074", ...overrides };
}

describe("valueHolding", () => {
  it("values an xStock as raw ÷ 10^decimals × multiplier × underlying price, truncated to cents", () => {
    // 1.00041982 × 1.001701196801074 = 1.00212173099751502688668 shares; × 223.83505 = 224.3099...
    expect(valueHolding(nvdax(), nvdaFresh, NOW)).toEqual({
      kind: "pyth_reference_valuation",
      mint: NVDAX_MINT,
      currency: "USD",
      source: "pyth",
      not_quote: true,
      status: "valued",
      value: "224.30",
      share_equivalent: "1.00212173099751502688668",
      unit_basis: "one_underlying_share",
      conversion_basis: "xstock_scaled_ui_amount",
      scaled_ui_multiplier: "1.001701196801074",
      price: { feed_id: NVDA_FEED, price: "223.83505", publish_time: new Date((NOW_S - 5) * 1000).toISOString() },
    });
  });

  it("applies a split multiplier to the value, not to the raw amount", () => {
    const valued = valueHolding(nvdax({ rawAmount: "150000000", scaledUiMultiplier: "10" }), nvdaFresh, NOW);
    expect(valued).toMatchObject({ status: "valued", share_equivalent: "15", value: "3357.52" });
  });

  it.each([
    ["a stale price", () => valueHolding(nvdax(), new Map([[NVDA_FEED, priceAt(NVDA_FEED, 22_383_505n, -5, NOW_S - 600)]]), NOW), "price_stale"],
    ["a price that went stale while held", () => valueHolding(nvdax(), nvdaFresh, NOW + 120_000), "price_stale"],
    ["no price result", () => valueHolding(nvdax(), new Map(), NOW), "price_unavailable"],
    ["a missing multiplier (never taken as 1)", () => valueHolding(nvdax({ scaledUiMultiplier: null }), nvdaFresh, NOW), "multiplier_unavailable"],
    ["a mint without the Scaled UI extension", () => valueHolding(nvdax({ hasScaledUiAmount: false, scaledUiMultiplier: null }), nvdaFresh, NOW), "multiplier_unavailable"],
    ["unknown decimals", () => valueHolding(nvdax({ decimals: null }), nvdaFresh, NOW), "holding_metadata_unavailable"],
    ["a PreStocks instrument with a Pyth index feed", () => valueHolding({ ...nvdax(), mint: PRESTOCKS_WITH_FEED }, nvdaFresh, NOW), "unit_basis_unverified"],
    ["a PreStocks instrument without a feed", () => valueHolding({ ...nvdax(), mint: PRESTOCKS_WITHOUT_FEED }, nvdaFresh, NOW), "no_price_feed"],
    ["an xStock without an underlying feed", () => valueHolding({ ...nvdax(), mint: XSTOCK_WITHOUT_FEED }, nvdaFresh, NOW), "no_price_feed"],
  ])("gives no value for %s", (_name, run, reason) => {
    expect(run()).toMatchObject({ status: "unavailable", value: null, reason });
  });
});

describe("valueHoldings", () => {
  it("gives a total only when every holding is valued and the holdings read was complete", () => {
    const both = [nvdax(), nvdax({ rawAmount: "50000000" })];
    const complete = valueHoldings(both, nvdaFresh, { holdingsComplete: true, nowMs: NOW });
    expect(complete.summary).toEqual({
      kind: "pyth_reference_valuation_summary",
      currency: "USD",
      holdings: 2,
      valued: 2,
      complete: true,
      total: "336.41",
      valued_subtotal: "336.41",
      cost_basis: null,
      profit_loss: null,
      not_quote: true,
    });
    expect(valueHoldings(both, nvdaFresh, { holdingsComplete: false, nowMs: NOW }).summary).toMatchObject({ complete: false, total: null, valued_subtotal: "336.41" });
  });

  it("never presents partial coverage as a total", () => {
    const { valuations, summary } = valueHoldings([nvdax(), { ...nvdax(), mint: PRESTOCKS_WITH_FEED }], nvdaFresh, { holdingsComplete: true, nowMs: NOW });
    expect(valuations.map((valuation) => valuation.status)).toEqual(["valued", "unavailable"]);
    expect(summary).toMatchObject({ holdings: 2, valued: 1, complete: false, total: null, valued_subtotal: "224.30", profit_loss: null });
  });
});
