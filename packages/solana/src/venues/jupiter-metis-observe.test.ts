import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectSyntheticMetisBuild } from "./jupiter-metis-observe.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const NVDA = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
const AMM = "F4inHs4RQARpASmvLpj45QjGLdkukeGQrtQ22pimVy2a";
const PROGRAM = "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo";
const expected = { inputRaw: "1000000", slippageBps: 50 };

function fixture(): Record<string, unknown> {
  return {
    source: "jupiter_metis_build_synthetic_v1",
    inputMint: USDC,
    outputMint: NVDA,
    inAmount: "1000000",
    outAmount: "200000",
    otherAmountThreshold: "199000",
    swapMode: "ExactIn",
    slippageBps: 50,
    priceImpactPct: "0.001",
    routePlan: [{
      swapInfo: {
        ammKey: AMM, label: "Synthetic DLMM", inputMint: USDC, outputMint: NVDA,
        inAmount: "1000000", outAmount: "200000",
      },
      bps: 10000,
    }],
    instructionProvenance: {
      computeBudgetCount: 1, setupCount: 1, swapProgramId: PROGRAM,
      swapAccountCount: 16, cleanupCount: 0, otherCount: 0, tipCount: 0, lookupTableCount: 0,
    },
  };
}

test("size-bound synthetic /build claims remain an untrusted candidate", () => {
  const result = inspectSyntheticMetisBuild(fixture(), expected);
  assert.deepEqual(result, {
    status: "candidate_unverified",
    reason: "synthetic_claims_without_source_proof",
    claimedAmmKeys: [AMM],
    claimedInputRaw: "1000000",
    claimedOutputRaw: "200000",
    claimedMinOutputRaw: "199000",
    claimedPriceImpactPct: "0.001",
    claimedSwapProgramId: PROGRAM,
    slippageEvidence: "synthetic_echo_only",
    thresholdArithmetic: "synthetic_claim_consistency_only",
    feeStatus: "unknown",
    programProof: "unknown",
    sourceSlotProof: "unknown",
    instructionAccountProof: "not_performed",
    observedSlot: null,
    quoteAvailable: false,
    acquisitionReady: false,
  });
  assert.equal("transaction" in result, false);
});

test("rejects invalid amount, slippage echo, threshold and oversized claims", () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ["wrong requested amount", { ...fixture(), inAmount: "2000000" }],
    ["wrong leg amount", { ...fixture(), routePlan: [{ swapInfo: { ...((fixture().routePlan as Record<string, unknown>[])[0].swapInfo as object), inAmount: "999999" }, bps: 10000 }] }],
    ["zero out", { ...fixture(), outAmount: "0" }],
    ["negative out", { ...fixture(), outAmount: "-1" }],
    ["fractional out", { ...fixture(), outAmount: "1.5" }],
    ["leading zero", { ...fixture(), outAmount: "0200000" }],
    ["u64 overflow", { ...fixture(), outAmount: "18446744073709551616" }],
    ["threshold zero", { ...fixture(), otherAmountThreshold: "0" }],
    ["threshold below synthetic 50bps floor", { ...fixture(), otherAmountThreshold: "190000" }],
    ["threshold exceeds out", { ...fixture(), otherAmountThreshold: "200001" }],
    ["wrong slippage echo", { ...fixture(), slippageBps: 51 }],
    ["bad impact", { ...fixture(), priceImpactPct: "NaN" }],
    ["oversized impact", { ...fixture(), priceImpactPct: `0.${"1".repeat(200)}` }],
  ];
  for (const [name, input] of cases) {
    assert.deepEqual(inspectSyntheticMetisBuild(input, expected), {
      status: "unavailable", reason: "invalid_synthetic_build_fixture",
    }, name);
  }
});

test("rejects raw provider fields, RFQ, multileg and unreviewed instruction effects", () => {
  const first = fixture();
  const claims = first.instructionProvenance as Record<string, unknown>;
  const cases: Array<[string, Record<string, unknown>]> = [
    ["RFQ", { ...fixture(), source: "jupiter_order" }],
    ["raw instruction bytes", { ...fixture(), swapInstruction: { data: "AA==" } }],
    ["owner", { ...fixture(), taker: PROGRAM }],
    ["ALT contents", { ...fixture(), addressesByLookupTableAddress: { [PROGRAM]: [AMM] } }],
    ["multileg", { ...fixture(), routePlan: [...(fixture().routePlan as object[]), ...(fixture().routePlan as object[])] }],
    ["wrong route", { ...fixture(), routePlan: [{ swapInfo: { ...((fixture().routePlan as Record<string, unknown>[])[0].swapInfo as object), outputMint: USDC }, bps: 10000 }] }],
    ["tip", { ...fixture(), instructionProvenance: { ...claims, tipCount: 1 } }],
    ["other effect", { ...fixture(), instructionProvenance: { ...claims, otherCount: 1 } }],
    ["ALT count", { ...fixture(), instructionProvenance: { ...claims, lookupTableCount: 1 } }],
    ["invalid program", { ...fixture(), instructionProvenance: { ...claims, swapProgramId: "not-a-program" } }],
    ["instruction accounts", { ...fixture(), instructionProvenance: { ...claims, accountKeys: [AMM] } }],
  ];
  for (const [name, input] of cases) {
    assert.deepEqual(inspectSyntheticMetisBuild(input, expected), {
      status: "unavailable", reason: "invalid_synthetic_build_fixture",
    }, name);
  }
});

test("unknown fields, hostile getters, proxies and malformed expected size fail closed", () => {
  const getter = Object.defineProperty(fixture(), "inAmount", {
    enumerable: true, get() { throw new Error("must not run"); },
  });
  const proxy = new Proxy(fixture(), { ownKeys() { throw new Error("proxy trap"); } });
  for (const input of [getter, proxy, { ...fixture(), unknown: true }, null]) {
    assert.deepEqual(inspectSyntheticMetisBuild(input, expected), {
      status: "unavailable", reason: "invalid_synthetic_build_fixture",
    });
  }
  assert.deepEqual(inspectSyntheticMetisBuild(fixture(), { inputRaw: "01", slippageBps: 50 }), {
    status: "unavailable", reason: "invalid_synthetic_build_fixture",
  });
});
