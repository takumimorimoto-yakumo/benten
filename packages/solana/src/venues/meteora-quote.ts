/**
 * M3 research-only validation of Meteora DLMM SDK quote claims. The SDK's
 * getBinArrayForSwap() refetches pool state and bin arrays through separate RPC
 * calls without a shared context slot (observed in pinned 1.9.14 source).
 * Consequently this module never returns an observed/ready quote, even when
 * all four synthetic or local read-only size claims are internally coherent.
 * No SDK, wallet, transaction builder, signer or sender is imported here.
 */
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "../index.js";
import type { RouteObservation } from "./route-observation.js";
import { resolveReviewedRoute } from "./route-policy.js";

export const METEORA_RESEARCH_USDC_SIZES = Object.freeze([
  "1000000", "10000000", "50000000", "100000000",
]);

const MAX_U64 = 18_446_744_073_709_551_615n;
const unavailable = { status: "unavailable", reason: "invalid_research_claim" } as const;

interface SizeClaim {
  inputRaw: string;
  claimedOutputRaw: string;
  claimedMinimumOutputRaw: string;
  claimedSdkFeeRaw: string;
  claimedSdkProtocolFeeRaw: string;
  claimedFeeOnInput: boolean;
  claimedPriceImpactPct: string;
  claimedBinArrayIds: string[];
}

export type MeteoraQuoteResearchResult =
  | typeof unavailable
  | {
      status: "candidate_unverified";
      reason: "source_slot_unproven";
      sourceClaim: "meteora_sdk_1_9_14_synthetic_v1" | "meteora_sdk_1_9_14_local_read";
      routePolicyRevision: string;
      identitySlot: number;
      quoteSourceSlot: null;
      sizes: SizeClaim[];
      feeAccountingStatus: "unknown";
      transferFeeStatus: "unknown";
      netOutputRaw: null;
      scaledUiAmountStatus: "unknown_without_same_slot_mint";
      quoteAvailable: false;
      acquisitionReady: false;
    };

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

function arrayValues(value: unknown, minimum: number, maximum: number): unknown[] | null {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) return null;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1 || !keys.includes("length")) return null;
  const copy: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor)) return null;
    copy.push(descriptor.value);
  }
  return copy;
}

function rawU64(value: unknown, allowZero = false): bigint | null {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]{0,19})$/.test(value)) return null;
  const parsed = BigInt(value);
  if (parsed > MAX_U64 || (!allowZero && parsed === 0n)) return null;
  return parsed;
}

function address(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 32 || value.length > 44) return false;
  try { return new PublicKey(value).toBase58() === value; }
  catch { return false; }
}

/** Validate a four-size SDK research projection, never an actual quote context. */
export function assessMeteoraQuoteClaims(identity: unknown, input: unknown): MeteoraQuoteResearchResult {
  try {
    if (!identity || typeof identity !== "object") return unavailable;
    const observed = identity as RouteObservation;
    const reviewed = resolveReviewedRoute({ ticker: "NVDA" }, "meteora_dlmm");
    if (observed.status !== "verified_identity" || reviewed.status !== "configured" ||
        !Number.isSafeInteger(observed.slot) || observed.slot <= 0 ||
        observed.quoteAvailable !== false || observed.acquisitionReady !== false ||
        observed.displayAmountBasis !== "raw_only") return unavailable;
    const route = observed.route;
    for (const key of ["venue", "ticker", "symbol", "xstockMint", "usdcMint", "poolId", "programId",
      "xstockVault", "usdcVault", "policyRevision", "inspectionEnabled", "quoteAvailable", "acquisitionReady"] as const) {
      if (route[key] !== reviewed.route[key]) return unavailable;
    }

    const fixture = exactDataRecord(input, ["source", "quoteSourceSlot", "sdkRouteClaim", "quotes"]);
    if (!fixture || (fixture.source !== "meteora_sdk_1_9_14_synthetic_v1" &&
        fixture.source !== "meteora_sdk_1_9_14_local_read") || fixture.quoteSourceSlot !== null) return unavailable;
    const sdkRoute = exactDataRecord(fixture.sdkRouteClaim, [
      "poolId", "programId", "tokenXMint", "tokenYMint", "reserveX", "reserveY", "tokenXProgram", "tokenYProgram", "swapForY",
    ]);
    if (!sdkRoute || sdkRoute.poolId !== route.poolId || sdkRoute.programId !== route.programId ||
        sdkRoute.tokenXMint !== route.xstockMint ||
        sdkRoute.tokenYMint !== route.usdcMint || sdkRoute.reserveX !== route.xstockVault ||
        sdkRoute.reserveY !== route.usdcVault ||
        sdkRoute.tokenXProgram !== TOKEN_2022_PROGRAM_ID.toBase58() ||
        sdkRoute.tokenYProgram !== TOKEN_PROGRAM_ID.toBase58() || sdkRoute.swapForY !== false) return unavailable;

    const claims = arrayValues(fixture.quotes, 4, 4);
    if (!claims) return unavailable;
    const sizes: SizeClaim[] = [];
    for (let index = 0; index < METEORA_RESEARCH_USDC_SIZES.length; index += 1) {
      const claim = exactDataRecord(claims[index], [
        "inputRaw", "consumedInRaw", "outputRaw", "minimumOutputRaw", "sdkFeeRawClaim",
        "sdkProtocolFeeRawClaim", "feeOnInput", "priceImpactPctClaim", "binArrayIds",
      ]);
      if (!claim || claim.inputRaw !== METEORA_RESEARCH_USDC_SIZES[index] ||
          claim.consumedInRaw !== claim.inputRaw) return unavailable;
      const output = rawU64(claim.outputRaw);
      const minimum = rawU64(claim.minimumOutputRaw);
      const fee = rawU64(claim.sdkFeeRawClaim, true);
      const protocol = rawU64(claim.sdkProtocolFeeRawClaim, true);
      if (output === null || minimum === null || minimum > output || fee === null ||
          protocol === null || protocol > fee || typeof claim.feeOnInput !== "boolean" ||
          typeof claim.priceImpactPctClaim !== "string" ||
          !/^(?:0|[1-9][0-9]?)(?:\.[0-9]{1,18})?$|^100(?:\.0{1,18})?$/.test(claim.priceImpactPctClaim)) return unavailable;
      const bins = arrayValues(claim.binArrayIds, 1, 8);
      if (!bins || !bins.every(address) || new Set(bins).size !== bins.length) return unavailable;
      sizes.push({
        inputRaw: claim.inputRaw,
        claimedOutputRaw: claim.outputRaw,
        claimedMinimumOutputRaw: claim.minimumOutputRaw,
        claimedSdkFeeRaw: claim.sdkFeeRawClaim,
        claimedSdkProtocolFeeRaw: claim.sdkProtocolFeeRawClaim,
        claimedFeeOnInput: claim.feeOnInput,
        claimedPriceImpactPct: claim.priceImpactPctClaim,
        claimedBinArrayIds: bins,
      } as SizeClaim);
    }
    return {
      status: "candidate_unverified",
      reason: "source_slot_unproven",
      sourceClaim: fixture.source,
      routePolicyRevision: route.policyRevision,
      identitySlot: observed.slot,
      quoteSourceSlot: null,
      sizes,
      feeAccountingStatus: "unknown",
      transferFeeStatus: "unknown",
      netOutputRaw: null,
      scaledUiAmountStatus: "unknown_without_same_slot_mint",
      quoteAvailable: false,
      acquisitionReady: false,
    };
  } catch {
    return unavailable;
  }
}
