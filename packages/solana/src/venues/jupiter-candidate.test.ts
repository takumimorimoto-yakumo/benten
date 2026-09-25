import assert from "node:assert/strict";
import { test } from "node:test";
import { dissectJupiterMetisCandidateFixture } from "./jupiter-candidate.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const NVDA = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
const AMM = "F4inHs4RQARpASmvLpj45QjGLdkukeGQrtQ22pimVy2a";

function fixture(): Record<string, unknown> {
  return {
    source: "jupiter_metis_build_fixture",
    inputMint: USDC,
    outputMint: NVDA,
    routePlan: [{
      swapInfo: { ammKey: AMM, label: "Meteora DLMM", inputMint: USDC, outputMint: NVDA },
      bps: 10000,
    }],
  };
}

test("synthetic Metis routePlan is only an untrusted candidate", () => {
  const result = dissectJupiterMetisCandidateFixture(fixture());
  assert.equal(result.status, "candidate_unverified");
  if (result.status !== "candidate_unverified") return;
  assert.equal(result.reason, "program_and_slot_unverified");
  assert.deepEqual(result.claimedAmmKeys, [AMM]);
  assert.equal(result.quoteAvailable, false);
  assert.equal(result.acquisitionReady, false);
  assert.equal(result.observedSlot, null);
  assert.equal("instructions" in result, false);
});

test("Jupiter candidate rejects RFQ, other mints, hidden fields and malformed legs", () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ["RFQ source", { ...fixture(), source: "jupiter_order" }],
    ["wrong input", { ...fixture(), inputMint: NVDA }],
    ["wrong output", { ...fixture(), outputMint: USDC }],
    ["unexpected bytes", { ...fixture(), swapInstruction: { data: "AA==" } }],
    ["no legs", { ...fixture(), routePlan: [] }],
    ["unknown pool", { ...fixture(), routePlan: [{ swapInfo: { ammKey: "bad", label: "X", inputMint: USDC, outputMint: NVDA }, bps: 10000 }] }],
    ["unknown leg field", { ...fixture(), routePlan: [{ swapInfo: { ammKey: AMM, label: "X", inputMint: USDC, outputMint: NVDA, feeMint: USDC }, bps: 10000 }] }],
    ["bad bps", { ...fixture(), routePlan: [{ swapInfo: { ammKey: AMM, label: "X", inputMint: USDC, outputMint: NVDA }, bps: 10001 }] }],
    ["wrong inner input", { ...fixture(), routePlan: [{ swapInfo: { ammKey: AMM, label: "X", inputMint: NVDA, outputMint: NVDA }, bps: 10000 }] }],
    ["wrong inner output", { ...fixture(), routePlan: [{ swapInfo: { ammKey: AMM, label: "X", inputMint: USDC, outputMint: USDC }, bps: 10000 }] }],
    ["multi-leg needs separate graph proof", { ...fixture(), routePlan: [
      { swapInfo: { ammKey: AMM, label: "X", inputMint: USDC, outputMint: NVDA }, bps: 5000 },
      { swapInfo: { ammKey: AMM, label: "X", inputMint: USDC, outputMint: NVDA }, bps: 5000 },
    ] }],
  ];
  for (const [name, input] of cases) {
    assert.deepEqual(dissectJupiterMetisCandidateFixture(input), {
      status: "unavailable", reason: "invalid_candidate_fixture",
    }, name);
  }
});

test("candidate parser catches hostile fixture getters and Proxies", () => {
  const getter = Object.defineProperty({}, "source", {
    enumerable: true, get() { throw new Error("must not run"); },
  });
  const proxy = new Proxy(fixture(), {
    getPrototypeOf() { throw new Error("proxy trap"); },
  });
  for (const input of [getter, proxy]) {
    assert.deepEqual(dissectJupiterMetisCandidateFixture(input), {
      status: "unavailable", reason: "invalid_candidate_fixture",
    });
  }
});
