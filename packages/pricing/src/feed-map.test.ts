import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { SUPPORTED_PRODUCTS } from "@benten/solana/supported-products";

import feedMapJson from "./pyth-feeds-v1.json" with { type: "json" };
import { FEED_MAP, feedEntry, feedsForMint, validateFeedMap, valuationFeedForMint } from "./feed-map.js";

const NVDAX_MINT = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
const NVDA_FEED = "b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593";

function mutated(change: (copy: any) => void): unknown {
  const copy = structuredClone(feedMapJson);
  change(copy);
  return copy;
}

describe("the bundled Pyth feed map", () => {
  it("loads, validated and frozen", () => {
    expect(FEED_MAP.schema_version).toBe("benten.pyth-feed-map.v1");
    expect(Object.isFrozen(FEED_MAP.entries[0])).toBe(true);
    const roles = FEED_MAP.entries.reduce<Record<string, number>>((counts, entry) => ({ ...counts, [entry.role]: (counts[entry.role] ?? 0) + 1 }), {});
    expect(roles).toEqual({ xstock_underlying_share: 134, xstock_token: 17, private_company_index: 2 });
  });

  it("lists exactly the program-derived price accounts of shards 0 and 1 for every feed", () => {
    const pushOracle = new PublicKey(FEED_MAP.source.push_oracle_program);
    for (const entry of FEED_MAP.entries) {
      const expected = [0, 1].map((shard) => {
        const seed = Buffer.alloc(2);
        seed.writeUInt16LE(shard);
        return { shard, address: PublicKey.findProgramAddressSync([seed, Buffer.from(entry.feed_id, "hex")], pushOracle)[0].toBase58() };
      });
      expect(entry.price_accounts).toEqual(expected);
    }
  });

  it("binds every entry to a supported product by exact mint, never by name", () => {
    for (const entry of FEED_MAP.entries) {
      const product = SUPPORTED_PRODUCTS.get(entry.binding.mint);
      expect(product?.kind).toBe(entry.binding.kind);
      if (entry.role === "xstock_underlying_share" && product?.kind === "xstock") expect(entry.pyth_symbol).toBe(`Equity.US.${product.ticker}/USD`);
    }
    // A same-named listed company is not the private company: Figure AI (PreStocks) has no feed here.
    const figureAi = [...SUPPORTED_PRODUCTS.values()].find((product) => product.kind === "prestocks" && product.providerAssetId === "FIGUREAI");
    if (figureAi) expect(feedsForMint(figureAi.mint)).toEqual([]);
    expect(FEED_MAP.entries.some((entry) => entry.pyth_symbol === "Equity.US.FIGR/USD")).toBe(false);
  });

  it("lets only underlying-share feeds of xStocks value a holding", () => {
    for (const entry of FEED_MAP.entries) {
      expect(entry.valuation.use).toBe(entry.role === "xstock_underlying_share");
    }
    expect(valuationFeedForMint(NVDAX_MINT)?.feed_id).toBe(NVDA_FEED);
    for (const product of SUPPORTED_PRODUCTS.values()) {
      if (product.kind === "prestocks") expect(valuationFeedForMint(product.mint)).toBeUndefined();
    }
  });

  it("looks feeds up by exact lowercase id only", () => {
    expect(feedEntry(NVDA_FEED)?.pyth_symbol).toBe("Equity.US.NVDA/USD");
    expect(feedEntry(NVDA_FEED.toUpperCase())).toBeUndefined();
    expect(feedEntry(`0x${NVDA_FEED}`)).toBeUndefined();
    expect(feedEntry(undefined)).toBeUndefined();
  });

  it.each([
    ["an unknown top-level key", (copy: any) => { copy.extra = 1; }],
    ["an unknown entry key", (copy: any) => { copy.entries[0].note = "x"; }],
    ["an uppercase feed id", (copy: any) => { copy.entries[0].feed_id = copy.entries[0].feed_id.toUpperCase(); }],
    ["a duplicate feed id", (copy: any) => { copy.entries[1].feed_id = copy.entries[0].feed_id; }],
    ["a mint that is not a product (USDC)", (copy: any) => { copy.entries[0].binding.mint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; }],
    ["a ticker that disagrees with the registry", (copy: any) => {
      const entry = copy.entries.find((candidate: any) => candidate.binding.kind === "xstock");
      entry.binding.ticker = "NVDA2";
    }],
    ["an underlying feed with another ticker's symbol", (copy: any) => {
      const entry = copy.entries.find((candidate: any) => candidate.role === "xstock_underlying_share" && candidate.binding.ticker !== "NVDA");
      entry.pyth_symbol = "Equity.US.NVDA/USD";
    }],
    ["valuation on an xStock token feed", (copy: any) => {
      const entry = copy.entries.find((candidate: any) => candidate.role === "xstock_token");
      entry.valuation = { use: true, unit_basis: "one_underlying_share", conversion: "xstock_scaled_ui_amount" };
    }],
    ["valuation on a PreStocks feed", (copy: any) => {
      const entry = copy.entries.find((candidate: any) => candidate.role === "private_company_index");
      entry.valuation = { use: true, unit_basis: "one_underlying_share", conversion: "xstock_scaled_ui_amount" };
    }],
    ["a duplicate price account", (copy: any) => { copy.entries[1].price_accounts[0].address = copy.entries[0].price_accounts[0].address; }],
    ["a non-USD quote", (copy: any) => { copy.entries[0].quote_currency = "EUR"; }],
  ])("rejects %s", (_name, change) => {
    expect(() => validateFeedMap(mutated(change))).toThrow(/invalid Pyth feed map/);
  });
});
