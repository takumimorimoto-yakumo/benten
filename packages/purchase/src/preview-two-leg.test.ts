import { beforeEach, describe, expect, it, vi } from "vitest";
import { PublicKey } from "@solana/web3.js";

import { PURCHASE_CONFIG } from "./config";
import { NVDAX_DECIMALS, PAY_TOKENS, USDC_DECIMALS } from "./route";

const simulateTransaction = vi.fn();
const buildTwoLegExactInSwap = vi.fn();

vi.mock("./build-swap", () => ({
  buildNvdaxUsdcExactInSwap: vi.fn(),
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

function leg(outputRaw: bigint, minimumOutputRaw: bigint) {
  return { pool: "pool", consumedInputRaw: "20000000", outputRaw: outputRaw.toString(), minimumOutputRaw: minimumOutputRaw.toString(), feeRaw: "1", protocolFeeRaw: "0", feeOnInput: true, priceImpactPct: "0", binArrayIndexes: [1n], hasBitmapExtension: false };
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
