import { describe, expect, it } from "vitest";
import { FEED_MAP, PRICING_CONFIG } from "@benten/pricing";

import { PURCHASE_CONFIG } from "./config";
import { SALE_FIXTURES } from "./fixtures";
import { referencePriceOf, saleReferenceCheck, saleReferenceFailure, type ReferencePrice } from "./reference-price";
import { NVDA_REFERENCE_FEED, NVDAX_MINT } from "./route";

const NOW_MS = 1_800_000_000_000;
const NOW_S = NOW_MS / 1000;

/** A `PriceUpdateV2` account as the Pyth receiver writes it (fully verified). Synthetic values. */
function priceAccount(price: bigint, exponent: number, publishTime: number, feedId: string = NVDA_REFERENCE_FEED.feedId) {
  const data = new Uint8Array(134);
  const view = new DataView(data.buffer);
  data.set([0x22, 0xf1, 0x23, 0x63, 0x9d, 0x7e, 0xf4, 0xcd], 0);
  data[40] = 1;
  for (let index = 0; index < 32; index += 1) data[41 + index] = Number.parseInt(feedId.slice(index * 2, index * 2 + 2), 16);
  view.setBigInt64(73, price, true);
  view.setBigUint64(81, 1n, true);
  view.setInt32(89, exponent, true);
  view.setBigInt64(93, BigInt(publishTime), true);
  return { owner: NVDA_REFERENCE_FEED.receiverProgram, data };
}

describe("the pinned NVDA/USD reference feed", () => {
  it("is the reviewed feed map's underlying-share feed bound to the NVDAx mint", () => {
    const entry = FEED_MAP.entries.find((candidate) => candidate.role === "xstock_underlying_share" && candidate.binding.mint === NVDAX_MINT.toBase58());
    expect(entry).toBeDefined();
    expect(entry?.pyth_symbol).toBe("Equity.US.NVDA/USD");
    expect(NVDA_REFERENCE_FEED.pythSymbol).toBe(entry?.pyth_symbol);
    expect(entry?.valuation.use).toBe(true);
    expect(NVDA_REFERENCE_FEED.feedId).toBe(entry?.feed_id);
    expect(NVDA_REFERENCE_FEED.priceAccounts).toEqual(entry?.price_accounts);
    expect(NVDA_REFERENCE_FEED.receiverProgram).toBe(FEED_MAP.source.receiver_program);
  });
});

describe("referencePriceOf (fail closed unless fresh)", () => {
  it("reads a fresh price, newest shard first", () => {
    const read = referencePriceOf([priceAccount(1n, -5, NOW_S - 30), priceAccount(22_524_000n, -5, NOW_S - 1)], NOW_MS);
    expect(read).toEqual({ ok: true, price: { priceRaw: 22_524_000n, exponent: -5, publishTime: NOW_S - 1 } });
  });

  it("accepts a price exactly at the stale bound and refuses one a second older", () => {
    expect(referencePriceOf([priceAccount(1n, -5, NOW_S - PRICING_CONFIG.staleAfterSeconds), null], NOW_MS).ok).toBe(true);
    expect(referencePriceOf([priceAccount(1n, -5, NOW_S - PRICING_CONFIG.staleAfterSeconds - 1), null], NOW_MS)).toEqual({ ok: false, reason: "stale" });
  });

  it("refuses missing accounts, another feed, another owner and a non-positive price", () => {
    expect(referencePriceOf([null, null], NOW_MS)).toEqual({ ok: false, reason: "no_price_account" });
    expect(referencePriceOf([priceAccount(1n, -5, NOW_S, "00".repeat(32)), null], NOW_MS)).toEqual({ ok: false, reason: "malformed_price_account" });
    expect(referencePriceOf([{ ...priceAccount(1n, -5, NOW_S), owner: "11111111111111111111111111111111" }, null], NOW_MS)).toEqual({ ok: false, reason: "malformed_price_account" });
    expect(referencePriceOf([priceAccount(0n, -5, NOW_S), null], NOW_MS)).toEqual({ ok: false, reason: "not_positive" });
    expect(referencePriceOf([priceAccount(-1n, -5, NOW_S), null], NOW_MS)).toEqual({ ok: false, reason: "not_positive" });
  });
});

describe("saleReferenceFailure (independent of the pool quote)", () => {
  // 100 USD a share at multiplier 1: raw NVDAx (8 decimals) N is worth exactly N raw USDC (6 decimals) / 1e6 x 1e6 = N micro-USD.
  const HUNDRED: ReferencePrice = { priceRaw: 10_000_000n, exponent: -5, publishTime: NOW_S };
  const limit = PURCHASE_CONFIG.maxUsdcOutRaw;
  const bps = 10_000n;
  const valueCap = (limit * (bps + BigInt(PURCHASE_CONFIG.saleReferenceValueHeadroomBps))) / bps;
  const check = (nvdaxInRaw: bigint, usdcOutRaw: bigint, multiplier = "1", price = HUNDRED) => saleReferenceFailure({ nvdaxInRaw, multiplier, usdcOutRaw, price });

  it("accepts a sale at the reference value", () => {
    expect(check(limit, limit)).toBeNull();
  });

  it("accepts a sale worth exactly the limit plus headroom and refuses one raw unit more", () => {
    expect(check(valueCap, limit)).toBeNull();
    expect(check(valueCap + 1n, limit)).toMatch(/above the per-sale limit/);
  });

  it("refuses a sale worth far more than the limit even when the quote stays within it", () => {
    expect(check(limit * 5n, limit)).toMatch(/above the per-sale limit/);
  });

  it("accepts a quote exactly at the tolerance below the reference value and refuses one raw unit less", () => {
    const floor = (limit * (bps - BigInt(PURCHASE_CONFIG.saleReferenceToleranceBps))) / bps;
    expect(check(limit, floor)).toBeNull();
    expect(check(limit, floor - 1n)).toMatch(/below the reference value/);
  });

  it("refuses an unfavourable quote", () => {
    expect(check(limit, limit / 2n)).toMatch(/below the reference value/);
  });

  it("values the amount through the multiplier: the same raw amount is worth more at a higher multiplier", () => {
    expect(check(limit, limit, "1.02")).toBeNull();
    expect(check(limit, limit, "1.05")).toMatch(/above the per-sale limit/);
  });

  it("fails closed without a usable multiplier", () => {
    expect(check(limit, limit, "0")).toMatch(/reference value unavailable/);
  });

  it("passes the sale measured at the limit on mainnet (2026-09-25)", () => {
    // 4470655 raw NVDAx at multiplier 1.001701196801074 and NVDA/USD 225.24: worth about 10.087 USD, quoted at 10 USDC.
    expect(check(4_470_655n, 10_000_000n, "1.001701196801074", { priceRaw: 22_524_000n, exponent: -5, publishTime: NOW_S })).toBeNull();
  });
});

describe("saleReferenceCheck (the values the review step shows, display only)", () => {
  const input = { nvdaxInRaw: 4_470_655n, multiplier: "1.001701196801074", usdcOutRaw: 10_000_000n, price: { priceRaw: 22_524_000n, exponent: -5, publishTime: NOW_S } };

  it("carries the feed, the exact price, its publish time and the amount's truncated value", () => {
    expect(saleReferenceCheck(input)).toEqual({
      feedId: NVDA_REFERENCE_FEED.feedId,
      pythSymbol: "Equity.US.NVDA/USD",
      price: "225.24",
      publishTime: NOW_S,
      valueUsd: "10.08",
    });
  });

  it("keeps every digit of the price", () => {
    expect(saleReferenceCheck({ ...input, price: { priceRaw: 22_524_123n, exponent: -5, publishTime: NOW_S } })?.price).toBe("225.24123");
    expect(saleReferenceCheck({ ...input, price: { priceRaw: 225n, exponent: 0, publishTime: NOW_S } })?.price).toBe("225");
  });

  it("is null when the amount cannot be valued, and does not change the check's verdict", () => {
    const unvalued = { ...input, multiplier: "0" };
    expect(saleReferenceCheck(unvalued)).toBeNull();
    expect(saleReferenceFailure(unvalued)).toMatch(/reference value unavailable/);
    expect(saleReferenceFailure(input)).toBeNull();
  });
});

describe("the sale review fixture", () => {
  it("carries exactly what saleReferenceCheck derives from its own amounts, and passes the check", () => {
    const { attempt } = SALE_FIXTURES.sellReviewReady.state;
    if (attempt.phase !== "reviewReady") throw new Error("the sale fixture is not in review");
    const { preview } = attempt;
    const shown = preview.saleReference;
    if (!shown || !preview.nvdaxMultiplier) throw new Error("the sale fixture carries no reference");
    const input = {
      nvdaxInRaw: preview.inputRaw,
      multiplier: preview.nvdaxMultiplier.value,
      usdcOutRaw: preview.outputRaw,
      price: { priceRaw: 22_524_000n, exponent: -5, publishTime: shown.publishTime },
    };
    expect(saleReferenceFailure(input)).toBeNull();
    expect(saleReferenceCheck(input)).toEqual(shown);
  });
});
