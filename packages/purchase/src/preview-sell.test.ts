import { beforeEach, describe, expect, it, vi } from "vitest";
import { PublicKey } from "@solana/web3.js";

import { PURCHASE_CONFIG } from "./config";
import type { ReferencePriceRead } from "./reference-price";
import { NVDAX_DECIMALS, USDC_DECIMALS } from "./route";

const simulateTransaction = vi.fn();
const buildNvdaxSellExactIn = vi.fn();
const readNvdaReferencePrice = vi.fn<() => Promise<ReferencePriceRead>>();
let multiplier: string | null = "1";

vi.mock("./build-sell", () => ({
  buildNvdaxSellExactIn: (...args: unknown[]) => buildNvdaxSellExactIn(...args),
  QuoteOverLimitError: class QuoteOverLimitError extends Error {},
  readSellCap: vi.fn(),
}));
vi.mock("./quote", () => ({
  InvalidSwapInputError: class InvalidSwapInputError extends Error {},
  RoutePoolMismatchError: class RoutePoolMismatchError extends Error {},
}));
vi.mock("./rpc", () => ({
  createRelayConnection: () => ({ connection: { simulateTransaction } }),
  multiplierReading: () => (multiplier === null ? null : { value: multiplier, readAt: 0 }),
  readRouteMints: async () => ({ usdc: { decimals: USDC_DECIMALS }, nvdax: { decimals: NVDAX_DECIMALS } }),
  relayFailureOf: () => null,
}));
vi.mock("./reference-price", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./reference-price")>()),
  readNvdaReferencePrice: () => readNvdaReferencePrice(),
}));

const { prepareSellPreview } = await import("./preview-sell");

const WALLET = new PublicKey(new Uint8Array(32).fill(3)).toBase58();
/** 100 USD a share: at multiplier 1, raw NVDAx N is worth N raw USDC. */
const HUNDRED: ReferencePriceRead = { ok: true, price: { priceRaw: 10_000_000n, exponent: -5, publishTime: 0 } };
const SELL_RAW = 5_000_000n;

function quote(usdcOutRaw: bigint) {
  const minimum = (usdcOutRaw * BigInt(10_000 - PURCHASE_CONFIG.slippageBps)) / 10_000n;
  return {
    input: {},
    quote: { consumedInputRaw: SELL_RAW.toString(), outputRaw: usdcOutRaw.toString(), minimumOutputRaw: minimum.toString(), feeRaw: "1", protocolFeeRaw: "0", feeOnInput: true, priceImpactPct: "0" },
    binArrayIndexes: [4n],
    hasBitmapExtension: false,
    lastValidBlockHeight: 1,
    transaction: { serialize: () => new Uint8Array(0) },
  };
}

async function failureOf(inputMultiplier = "1") {
  const outcome = await prepareSellPreview(WALLET, SELL_RAW, inputMultiplier, () => 0);
  expect(outcome.ok).toBe(false);
  return outcome.ok ? null : outcome;
}

describe("sale preview: the reference price bounds the sale before anything is built or simulated", () => {
  beforeEach(() => {
    simulateTransaction.mockReset();
    buildNvdaxSellExactIn.mockReset();
    readNvdaReferencePrice.mockReset();
    multiplier = "1";
  });

  for (const reason of ["stale", "no_price_account", "malformed_price_account", "not_positive"]) {
    it(`stops the sale when the reference price is ${reason}`, async () => {
      readNvdaReferencePrice.mockResolvedValue({ ok: false, reason });
      const failure = await failureOf();
      expect(failure).toMatchObject({ failure: "referenceUnavailable", details: reason });
      expect(buildNvdaxSellExactIn).not.toHaveBeenCalled();
      expect(simulateTransaction).not.toHaveBeenCalled();
    });
  }

  it("does not treat an unreadable reference price as a pass: a relay failure stops the preview too", async () => {
    readNvdaReferencePrice.mockRejectedValue(new Error("relay HTTP 503"));
    const failure = await failureOf();
    expect(failure?.failure).toBe("simulationFailed");
    expect(buildNvdaxSellExactIn).not.toHaveBeenCalled();
  });

  it("refuses a quote far below the reference value without simulating", async () => {
    readNvdaReferencePrice.mockResolvedValue(HUNDRED);
    buildNvdaxSellExactIn.mockResolvedValue(quote(SELL_RAW / 2n));
    const failure = await failureOf();
    expect(failure?.failure).toBe("routeCheck");
    expect(failure?.details).toMatch(/below the reference value/);
    expect(simulateTransaction).not.toHaveBeenCalled();
  });

  it("refuses a sale worth more than the limit at the reference price, whatever the quote", async () => {
    readNvdaReferencePrice.mockResolvedValue({ ok: true, price: { priceRaw: 10_000_000_000n, exponent: -5, publishTime: 0 } });
    buildNvdaxSellExactIn.mockResolvedValue(quote(SELL_RAW));
    const failure = await failureOf();
    expect(failure?.failure).toBe("routeCheck");
    expect(failure?.details).toMatch(/above the per-sale limit/);
    expect(simulateTransaction).not.toHaveBeenCalled();
  });

  it("fails as changed terms when the multiplier in effect differs from the amount's conversion", async () => {
    readNvdaReferencePrice.mockResolvedValue(HUNDRED);
    multiplier = "1.002";
    const failure = await failureOf("1");
    expect(failure).toMatchObject({ failure: "sellTermsChanged" });
    expect(buildNvdaxSellExactIn).not.toHaveBeenCalled();
  });

  it("stops the sale when the multiplier cannot be read", async () => {
    readNvdaReferencePrice.mockResolvedValue(HUNDRED);
    multiplier = null;
    const failure = await failureOf("1");
    expect(failure).toMatchObject({ failure: "routeCheck" });
    expect(buildNvdaxSellExactIn).not.toHaveBeenCalled();
  });

  it("lets a quote at the reference value reach the wire audit", async () => {
    readNvdaReferencePrice.mockResolvedValue(HUNDRED);
    buildNvdaxSellExactIn.mockResolvedValue(quote(SELL_RAW));
    const failure = await failureOf();
    // The fake transaction's empty bytes fail the audit: the reference checks passed.
    expect(failure).toMatchObject({ failure: "routeCheck", details: "transaction is not a decodable legacy transaction" });
    expect(simulateTransaction).not.toHaveBeenCalled();
  });
});
