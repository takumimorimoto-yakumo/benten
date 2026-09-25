/**
 * Offline-only dissection of a single-leg sanitized synthetic projection of
 * Jupiter Metis /build routePlan.swapInfo. This does not accept a live API response,
 * decode instructions, request a quote, or establish route/program identity.
 * Shape reference (accessed 2026-09-14):
 * https://developers.jup.ag/docs/api-reference/swap/build
 */
import { PublicKey } from "@solana/web3.js";
import { NVDA_XSTOCK_MINT, USDC_MINT } from "./route-policy.js";

export type JupiterCandidate =
  | { status: "unavailable"; reason: "invalid_candidate_fixture" }
  | {
      status: "candidate_unverified";
      reason: "program_and_slot_unverified";
      claimedAmmKeys: string[];
      /** Source slot and actual DEX programs cannot be proved from this fixture. */
      observedSlot: null;
      quoteAvailable: false;
      acquisitionReady: false;
    };

function record(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    const actual = Reflect.ownKeys(value);
    return actual.length === keys.length && actual.every((key) =>
      typeof key === "string" && keys.includes(key) &&
      Object.getOwnPropertyDescriptor(value, key) !== undefined &&
      "value" in Object.getOwnPropertyDescriptor(value, key)!
    );
  } catch { return false; }
}

function address(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 32 || value.length > 44) return false;
  try { return new PublicKey(value).toBase58() === value; } catch { return false; }
}

/** Never elevate fixture route claims to a reviewed pool or quote. */
export function dissectJupiterMetisCandidateFixture(input: unknown): JupiterCandidate {
  const unavailable = { status: "unavailable", reason: "invalid_candidate_fixture" } as const;
  try {
  if (!record(input, ["source", "inputMint", "outputMint", "routePlan"]) ||
      input.source !== "jupiter_metis_build_fixture" ||
      input.inputMint !== USDC_MINT || input.outputMint !== NVDA_XSTOCK_MINT ||
      !Array.isArray(input.routePlan) || input.routePlan.length !== 1) {
    return unavailable;
  }
  const ammKeys: string[] = [];
  for (const leg of input.routePlan) {
    if (!record(leg, ["swapInfo", "bps"]) || leg.bps !== 10000 ||
        !record(leg.swapInfo, ["ammKey", "label", "inputMint", "outputMint"])) {
      return unavailable;
    }
    const info = leg.swapInfo;
    if (!address(info.ammKey) || info.inputMint !== USDC_MINT || info.outputMint !== NVDA_XSTOCK_MINT ||
        typeof info.label !== "string" || info.label.length < 1 || info.label.length > 80 ||
        /[\x00-\x1f\x7f]/.test(info.label)) {
      return unavailable;
    }
    ammKeys.push(info.ammKey);
  }
  return {
    status: "candidate_unverified",
    reason: "program_and_slot_unverified",
    claimedAmmKeys: ammKeys,
    observedSlot: null,
    quoteAvailable: false,
    acquisitionReady: false,
  };
  } catch {
    return unavailable;
  }
}
