import assert from "node:assert/strict";
import { test } from "node:test";
import { PublicKey } from "@solana/web3.js";
import { assessMeteoraQuoteClaims, METEORA_RESEARCH_USDC_SIZES } from "./meteora-quote.js";
import { resolveReviewedRoute } from "./route-policy.js";

const BIN = new PublicKey(Uint8Array.from(Array(32).fill(3))).toBase58();
const X_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const U_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

function identity() {
  const resolved = resolveReviewedRoute({ ticker: "NVDA" }, "meteora_dlmm");
  if (resolved.status !== "configured") throw new Error("missing fixture route");
  return {
    status: "verified_identity" as const,
    route: resolved.route,
    slot: 100,
    xstockVaultRaw: "100000000",
    usdcVaultRaw: "1000000000",
    quoteAvailable: false as const,
    acquisitionReady: false as const,
    displayAmountBasis: "raw_only" as const,
  };
}

function fixture(): Record<string, unknown> {
  const route = identity().route;
  return {
    source: "meteora_sdk_1_9_14_synthetic_v1",
    quoteSourceSlot: null,
    sdkRouteClaim: {
      poolId: route.poolId,
      programId: route.programId,
      tokenXMint: route.xstockMint,
      tokenYMint: route.usdcMint,
      reserveX: route.xstockVault,
      reserveY: route.usdcVault,
      tokenXProgram: X_PROGRAM,
      tokenYProgram: U_PROGRAM,
      swapForY: false,
    },
    quotes: METEORA_RESEARCH_USDC_SIZES.map((inputRaw, index) => ({
      inputRaw,
      consumedInRaw: inputRaw,
      outputRaw: String((index + 1) * 100000),
      minimumOutputRaw: String((index + 1) * 99000),
      sdkFeeRawClaim: String(index + 1),
      sdkProtocolFeeRawClaim: "0",
      feeOnInput: true,
      priceImpactPctClaim: "0.1",
      binArrayIds: [BIN],
    })),
  };
}

test("four exact size claims remain source-slot-unproven research only", () => {
  assert.deepEqual(METEORA_RESEARCH_USDC_SIZES, ["1000000", "10000000", "50000000", "100000000"]);
  const result = assessMeteoraQuoteClaims(identity(), fixture());
  assert.equal(result.status, "candidate_unverified");
  if (result.status !== "candidate_unverified") return;
  assert.equal(result.reason, "source_slot_unproven");
  assert.equal(result.identitySlot, 100);
  assert.equal(result.quoteSourceSlot, null);
  assert.equal(result.routePolicyRevision, identity().route.policyRevision);
  assert.equal(result.sizes.length, 4);
  assert.deepEqual(result.sizes.map((size) => size.inputRaw), METEORA_RESEARCH_USDC_SIZES);
  assert.equal(result.sizes[0].claimedOutputRaw, "100000");
  assert.deepEqual(result.sizes[0].claimedBinArrayIds, [BIN]);
  assert.equal(result.feeAccountingStatus, "unknown");
  assert.equal(result.transferFeeStatus, "unknown");
  assert.equal(result.netOutputRaw, null);
  assert.equal(result.scaledUiAmountStatus, "unknown_without_same_slot_mint");
  assert.equal(result.quoteAvailable, false);
  assert.equal(result.acquisitionReady, false);
});

test("wrong identity, revision, pool, mints or token programs fail closed", () => {
  const route = identity();
  const badIdentity = { ...route, route: { ...route.route, poolId: BIN } };
  const badRevision = { ...route, route: { ...route.route, policyRevision: "old" } };
  const claims = fixture();
  const sdkRoute = claims.sdkRouteClaim as Record<string, unknown>;
  const cases: Array<[string, unknown, unknown]> = [
    ["identity missing", { status: "unavailable", reason: "wrong_cluster" }, claims],
    ["wrong identity pool", badIdentity, claims],
    ["stale revision", badRevision, claims],
    ["wrong sdk pool", route, { ...claims, sdkRouteClaim: { ...sdkRoute, poolId: BIN } }],
    ["wrong sdk program", route, { ...claims, sdkRouteClaim: { ...sdkRoute, programId: BIN } }],
    ["wrong swap direction", route, { ...claims, sdkRouteClaim: { ...sdkRoute, swapForY: true } }],
    ["wrong sdk mint", route, { ...claims, sdkRouteClaim: { ...sdkRoute, tokenXMint: route.route.usdcMint } }],
    ["wrong token program", route, { ...claims, sdkRouteClaim: { ...sdkRoute, tokenXProgram: U_PROGRAM } }],
  ];
  for (const [name, observed, input] of cases) {
    assert.deepEqual(assessMeteoraQuoteClaims(observed, input), {
      status: "unavailable", reason: "invalid_research_claim",
    }, name);
  }
});

test("missing size, partial fill, bad raw amounts, fee or bin claims fail closed", () => {
  const base = fixture();
  const quotes = base.quotes as Record<string, unknown>[];
  const replaceFirst = (patch: Record<string, unknown>) => ({ ...base, quotes: [{ ...quotes[0], ...patch }, ...quotes.slice(1)] });
  const cases: Array<[string, Record<string, unknown>]> = [
    ["missing size", { ...base, quotes: quotes.slice(0, 3) }],
    ["reordered sizes", { ...base, quotes: [...quotes].reverse() }],
    ["partial fill", replaceFirst({ consumedInRaw: "999999" })],
    ["zero output", replaceFirst({ outputRaw: "0" })],
    ["fractional output", replaceFirst({ outputRaw: "1.5" })],
    ["overflow output", replaceFirst({ outputRaw: "18446744073709551616" })],
    ["minimum exceeds output", replaceFirst({ minimumOutputRaw: "100001" })],
    ["protocol exceeds total fee", replaceFirst({ sdkProtocolFeeRawClaim: "2" })],
    ["no bin", replaceFirst({ binArrayIds: [] })],
    ["duplicate bin", replaceFirst({ binArrayIds: [BIN, BIN] })],
    ["bad impact", replaceFirst({ priceImpactPctClaim: "NaN" })],
    ["source slot falsely asserted", { ...base, quoteSourceSlot: 100 }],
  ];
  for (const [name, claims] of cases) {
    assert.deepEqual(assessMeteoraQuoteClaims(identity(), claims), {
      status: "unavailable", reason: "invalid_research_claim",
    }, name);
  }
});

test("raw owner/transaction, unknown fields and hostile objects never become observations", () => {
  const getter = Object.defineProperty(fixture(), "quotes", {
    enumerable: true, get() { throw new Error("must not run"); },
  });
  const proxy = new Proxy(fixture(), { ownKeys() { throw new Error("proxy trap"); } });
  const cases = [
    getter, proxy, null,
    { ...fixture(), owner: BIN },
    { ...fixture(), transaction: "AA==" },
    { ...fixture(), sdkRouteClaim: { ...(fixture().sdkRouteClaim as object), extra: true } },
  ];
  for (const claims of cases) {
    assert.deepEqual(assessMeteoraQuoteClaims(identity(), claims), {
      status: "unavailable", reason: "invalid_research_claim",
    });
  }
});
