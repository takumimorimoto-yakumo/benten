import { beforeEach, describe, expect, it, vi } from "vitest";
import { PublicKey } from "@solana/web3.js";

import { PURCHASE_CONFIG } from "./config";
import { NVDAX_DECIMALS, PAY_TOKENS, USDC_DECIMALS } from "./route";

const simulateTransaction = vi.fn();
const buildTwoLegExactInSwap = vi.fn();
const buildNvdaxUsdcExactInSwap = vi.fn();

vi.mock("./build-swap", () => ({
  buildNvdaxUsdcExactInSwap: (...args: unknown[]) => buildNvdaxUsdcExactInSwap(...args),
  RoutePoolMismatchError: class RoutePoolMismatchError extends Error {},
}));
vi.mock("./build-two-leg", () => ({
  buildTwoLegExactInSwap: (...args: unknown[]) => buildTwoLegExactInSwap(...args),
  QuoteOverLimitError: class QuoteOverLimitError extends Error {},
  TwoLegRouteMismatchError: class TwoLegRouteMismatchError extends Error {},
}));
vi.mock("./rpc", () => ({
  createRelayConnection: () => ({ connection: { simulateTransaction } }),
  multiplierReading: () => null,
  readPayMint: async () => ({ decimals: PAY_TOKENS.SOL.decimals }),
  readRouteMints: async () => ({ usdc: { decimals: USDC_DECIMALS }, nvdax: { decimals: NVDAX_DECIMALS } }),
  relayFailureOf: () => null,
}));

const { preparePreview } = await import("./preview");

const WALLET = new PublicKey(new Uint8Array(32).fill(3)).toBase58();

function leg(outputRaw: bigint, minimumOutputRaw: bigint, feeRaw = "1", consumedInputRaw = "20000000") {
  return { pool: "pool", consumedInputRaw, outputRaw: outputRaw.toString(), minimumOutputRaw: minimumOutputRaw.toString(), feeRaw, protocolFeeRaw: "0", feeOnInput: true, priceImpactPct: "0", binArrayIndexes: [1n], hasBitmapExtension: false };
}

describe("two-leg preview bounds the reviewed amounts before the audit", () => {
  beforeEach(() => {
    simulateTransaction.mockReset();
    buildTwoLegExactInSwap.mockReset();
  });

  const cases: [string, ReturnType<typeof leg>, ReturnType<typeof leg>, RegExp][] = [
    ["a USDC minimum above the per-transaction limit", leg(PURCHASE_CONFIG.maxUsdcInRaw + 1n, PURCHASE_CONFIG.maxUsdcInRaw + 1n), leg(100n, 99n), /above the per-transaction limit/],
    ["a zero NVDAx minimum", leg(1_000_000n, 990_000n), leg(0n, 0n), /product minimum is not positive/],
    ["a USDC minimum below the slippage floor", leg(1_000_000n, 989_999n), leg(100n, 99n), /USDC minimum is below the slippage/],
    ["an NVDAx minimum below the slippage floor", leg(1_000_000n, 990_000n), leg(1_000n, 989n), /product minimum is below the slippage/],
    // The fee bound (1% of the consumed input): 200001 of 20000000 is just above it.
    ["a first-leg pool fee above the fee limit", leg(1_000_000n, 990_000n, "200001"), leg(100n, 99n), /first leg: the quoted pool fee is above the fee limit/],
    ["a product-leg pool fee above the fee limit", leg(1_000_000n, 990_000n), leg(100n, 99n, "9901", "990000"), /second leg: the quoted pool fee is above the fee limit/],
  ];
  for (const [name, firstLeg, secondLeg, reason] of cases) {
    it(`fails closed on ${name} without simulating`, async () => {
      buildTwoLegExactInSwap.mockResolvedValue({ input: {}, firstLeg, secondLeg, lastValidBlockHeight: 1, transaction: {} });
      const outcome = await preparePreview(WALLET, 20_000_000n, () => 0, "SOL");
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.failure).toBe("routeCheck");
        expect(outcome.details).toMatch(reason);
      }
      expect(simulateTransaction).not.toHaveBeenCalled();
    });
  }
});

describe("USDC preview bounds the quoted pool fee before the audit", () => {
  beforeEach(() => {
    simulateTransaction.mockReset();
    buildNvdaxUsdcExactInSwap.mockReset();
  });

  const quote = (feeRaw: string) => ({ consumedInputRaw: "10000000", outputRaw: "4000000", minimumOutputRaw: "3960000", feeRaw, protocolFeeRaw: "0", feeOnInput: true, priceImpactPct: "0" });

  it("refuses a quoted fee above the fee limit (a 10% pool) without simulating", async () => {
    expect(PURCHASE_CONFIG.maxPoolFeeBps).toBe(100);
    buildNvdaxUsdcExactInSwap.mockResolvedValue({ quote: quote("1000000"), transaction: {}, binArrayIndexes: [1n], pool: { hasBitmapExtension: false }, lastValidBlockHeight: 1 });
    const outcome = await preparePreview(WALLET, 10_000_000n, () => 0, "USDC", "NVDA");
    expect(outcome).toMatchObject({ ok: false, failure: "routeCheck", details: "quote: the quoted pool fee is above the fee limit" });
    expect(simulateTransaction).not.toHaveBeenCalled();
  });

  it("refuses one raw unit above the limit and does not refuse at the limit", async () => {
    buildNvdaxUsdcExactInSwap.mockResolvedValue({ quote: quote("100001"), transaction: {}, binArrayIndexes: [1n], pool: { hasBitmapExtension: false }, lastValidBlockHeight: 1 });
    await expect(preparePreview(WALLET, 10_000_000n, () => 0, "USDC", "NVDA")).resolves.toMatchObject({ failure: "routeCheck", details: /above the fee limit/ });
    // At exactly 1% the fee check passes; the stub transaction then fails later, for another reason.
    buildNvdaxUsdcExactInSwap.mockResolvedValue({ quote: quote("100000"), transaction: { serialize: () => new Uint8Array() }, binArrayIndexes: [1n], pool: { hasBitmapExtension: false }, lastValidBlockHeight: 1 });
    const atLimit = await preparePreview(WALLET, 10_000_000n, () => 0, "USDC", "NVDA");
    expect(atLimit.ok ? null : atLimit.details).not.toMatch(/fee limit/);
  });
});
