/**
 * M4 stage-1: inspect claims in a hand-written, sanitized /build-shaped fixture.
 * This does not accept the provider's full response or call Jupiter. In particular
 * instruction bytes, account keys, owner addresses and ALT contents are forbidden.
 * Official shape (accessed 2026-09-14):
 * https://developers.jup.ag/docs/api-reference/swap/build
 */
import { PublicKey } from "@solana/web3.js";
import { dissectJupiterMetisCandidateFixture } from "./jupiter-candidate.js";
import { NVDA_XSTOCK_MINT, USDC_MINT } from "./route-policy.js";

const MAX_U64 = 18_446_744_073_709_551_615n;
const unavailable = { status: "unavailable", reason: "invalid_synthetic_build_fixture" } as const;

export type SyntheticMetisBuildObservation =
  | typeof unavailable
  | {
      status: "candidate_unverified";
      reason: "synthetic_claims_without_source_proof";
      claimedAmmKeys: string[];
      claimedInputRaw: string;
      claimedOutputRaw: string;
      claimedMinOutputRaw: string;
      claimedPriceImpactPct: string;
      claimedSwapProgramId: string;
      slippageEvidence: "synthetic_echo_only";
      thresholdArithmetic: "synthetic_claim_consistency_only";
      feeStatus: "unknown";
      programProof: "unknown";
      sourceSlotProof: "unknown";
      instructionAccountProof: "not_performed";
      observedSlot: null;
      quoteAvailable: false;
      acquisitionReady: false;
    };

/** Copy only own data descriptors: never invoke a fixture getter or trust its prototype. */
function exactDataRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (value === null || typeof value !== "object") return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const names = Reflect.ownKeys(value);
  if (names.length !== keys.length || names.some((name) => typeof name !== "string" || !keys.includes(name))) return null;
  const copy: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) return null;
    copy[key] = descriptor.value;
  }
  return copy;
}

function onlyElement(value: unknown): unknown | null {
  if (!Array.isArray(value) || value.length !== 1) return null;
  const names = Reflect.ownKeys(value);
  if (names.length !== 2 || !names.includes("0") || !names.includes("length")) return null;
  const descriptor = Object.getOwnPropertyDescriptor(value, "0");
  return descriptor && "value" in descriptor ? descriptor.value : null;
}

function rawU64(value: unknown): bigint | null {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,19}$/.test(value)) return null;
  const parsed = BigInt(value);
  return parsed <= MAX_U64 ? parsed : null;
}

function address(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 32 || value.length > 44) return false;
  try { return new PublicKey(value).toBase58() === value; }
  catch { return false; }
}

function count(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max;
}

/** A valid result is still only an untrusted synthetic candidate, never a quote. */
export function inspectSyntheticMetisBuild(input: unknown, expected: unknown): SyntheticMetisBuildObservation {
  try {
    const requested = exactDataRecord(expected, ["inputRaw", "slippageBps"]);
    const build = exactDataRecord(input, [
      "source", "inputMint", "outputMint", "inAmount", "outAmount", "otherAmountThreshold",
      "swapMode", "slippageBps", "priceImpactPct", "routePlan", "instructionProvenance",
    ]);
    if (!requested || !build || build.source !== "jupiter_metis_build_synthetic_v1" ||
        build.inputMint !== USDC_MINT || build.outputMint !== NVDA_XSTOCK_MINT ||
        build.swapMode !== "ExactIn" || !count(requested.slippageBps, 10_000) ||
        requested.slippageBps === 0 || build.slippageBps !== requested.slippageBps) return unavailable;

    const requestedRaw = rawU64(requested.inputRaw);
    const inputRaw = rawU64(build.inAmount);
    const outputRaw = rawU64(build.outAmount);
    const minimumRaw = rawU64(build.otherAmountThreshold);
    if (requestedRaw === null || inputRaw !== requestedRaw || outputRaw === null ||
        minimumRaw === null || minimumRaw > outputRaw ||
        typeof build.priceImpactPct !== "string" ||
        !/^(?:0|0\.[0-9]{1,18}|1(?:\.0{1,18})?)$/.test(build.priceImpactPct)) return unavailable;
    // Static numeric-bps fixture only; RTSE/dynamic slippage is not modelled.
    // This tests internal arithmetic, not a provider response or a price floor.
    const lowestClaimConsistentWithBps = outputRaw * BigInt(10_000 - requested.slippageBps) / 10_000n;
    if (minimumRaw < lowestClaimConsistentWithBps) return unavailable;

    const leg = exactDataRecord(onlyElement(build.routePlan), ["swapInfo", "bps"]);
    const swapInfo = leg && exactDataRecord(leg.swapInfo, [
      "ammKey", "label", "inputMint", "outputMint", "inAmount", "outAmount",
    ]);
    if (!leg || leg.bps !== 10_000 || !swapInfo || swapInfo.inAmount !== build.inAmount ||
        swapInfo.outAmount !== build.outAmount) return unavailable;
    const route = dissectJupiterMetisCandidateFixture({
      source: "jupiter_metis_build_fixture",
      inputMint: build.inputMint,
      outputMint: build.outputMint,
      routePlan: [{
        swapInfo: {
          ammKey: swapInfo.ammKey, label: swapInfo.label,
          inputMint: swapInfo.inputMint, outputMint: swapInfo.outputMint,
        },
        bps: leg.bps,
      }],
    });
    if (route.status !== "candidate_unverified") return unavailable;

    const instructions = exactDataRecord(build.instructionProvenance, [
      "computeBudgetCount", "setupCount", "swapProgramId", "swapAccountCount",
      "cleanupCount", "otherCount", "tipCount", "lookupTableCount",
    ]);
    if (!instructions || !count(instructions.computeBudgetCount, 2) ||
        !count(instructions.setupCount, 4) || !address(instructions.swapProgramId) ||
        !count(instructions.swapAccountCount, 64) || instructions.swapAccountCount === 0 ||
        !count(instructions.cleanupCount, 1) || instructions.otherCount !== 0 ||
        instructions.tipCount !== 0 || instructions.lookupTableCount !== 0) return unavailable;

    return {
      status: "candidate_unverified",
      reason: "synthetic_claims_without_source_proof",
      claimedAmmKeys: route.claimedAmmKeys,
      claimedInputRaw: build.inAmount as string,
      claimedOutputRaw: build.outAmount as string,
      claimedMinOutputRaw: build.otherAmountThreshold as string,
      claimedPriceImpactPct: build.priceImpactPct,
      claimedSwapProgramId: instructions.swapProgramId,
      slippageEvidence: "synthetic_echo_only",
      thresholdArithmetic: "synthetic_claim_consistency_only",
      feeStatus: "unknown",
      programProof: "unknown",
      sourceSlotProof: "unknown",
      instructionAccountProof: "not_performed",
      observedSlot: null,
      quoteAvailable: false,
      acquisitionReady: false,
    };
  } catch {
    return unavailable;
  }
}
