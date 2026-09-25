import assert from "node:assert/strict";
import { test } from "node:test";
import { PublicKey } from "@solana/web3.js";
import { resolveAcquisitionRoute } from "./acquisition-pool.js";
import {
  advanceSpendDraftState,
  validateAgentIntentDraft,
  validateSpendPolicyDraft,
} from "./spend-policy-draft.js";

const NOW = 1_800_000_000;
const OWNER = new PublicKey("11111111111111111111111111111111");
// On-curve test address only; no private key or signer exists in this suite.
const AGENT = new PublicKey("4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi");
// Independent Token-2022 ATA fixture for OWNER + NVDAx mint (Solana ATA seeds).
const OUTPUT_ATA = "8ofQtAA2yasfQCDmpX2mc7heqD9qQMRb469dj5sWqAuj";
const configured = resolveAcquisitionRoute({ ticker: "NVDA" });
if (configured.status !== "configured") throw new Error("test route missing");
const route = configured.route;

function policy(): Record<string, unknown> {
  return {
    version: 1,
    cluster: "mainnet-beta",
    ownerPubkey: OWNER.toBase58(),
    agentPubkey: AGENT.toBase58(),
    ticker: "NVDA",
    xstockMint: route.xstockMint,
    usdcMint: route.usdcMint,
    dexProgramId: route.programId,
    poolId: route.poolId,
    outputRecipientPubkey: OUTPUT_ATA,
    maxInputRawPerOrder: "1000000",
    maxInputRawTotal: "5000000",
    minOutputPerInputNumeratorRaw: "1",
    minOutputPerInputDenominatorRaw: "10",
    maxSlippageBps: 100,
    expiresAtUnixSeconds: NOW + 3600,
    nonce: "a".repeat(64),
  };
}

function validPolicy() {
  const result = validateSpendPolicyDraft(policy(), NOW);
  assert.equal(result.status, "draft");
  if (result.status !== "draft") throw new Error("valid fixture rejected");
  return result;
}

function intent(): Record<string, unknown> {
  return {
    version: 1,
    cluster: "mainnet-beta",
    agentPubkey: AGENT.toBase58(),
    policyNonce: "a".repeat(64),
    intentNonce: "b".repeat(64),
    ticker: "NVDA",
    xstockMint: route.xstockMint,
    usdcMint: route.usdcMint,
    dexProgramId: route.programId,
    poolId: route.poolId,
    outputRecipientPubkey: policy().outputRecipientPubkey,
    inputRaw: "1000",
    minOutputRaw: "100",
    quoteObservedAtUnixSeconds: NOW - 5,
    quoteExpiresAtUnixSeconds: NOW + 20,
  };
}

test("valid drafts remain explicitly non-executable and carry no grant state", () => {
  const input = policy();
  const p = validateSpendPolicyDraft(input, NOW);
  assert.equal(p.status, "draft");
  if (p.status !== "draft") return;
  assert.equal(p.capability, "autonomous_unavailable");
  assert.equal("remainingRaw" in p.draft, false);
  assert.notEqual(p.draft, input);
  assert.equal(Object.isFrozen(input), false);
  assert.equal(Object.isFrozen(p.draft), true);
  const i = validateAgentIntentDraft(intent(), p.draft, NOW);
  assert.equal(i.status, "draft");
  if (i.status === "draft") assert.equal(i.capability, "autonomous_unavailable");
});

test("policy rejects unknown authority fields and malformed identity/amount/expiry/price", () => {
  const changes: Array<[string, unknown]> = [
    ["remainingRaw", "5000000"],
    ["status", "active"],
    ["ownerSecretKey", "secret"],
    ["xstockMint", route.xstockMint.toLowerCase()],
    ["ticker", "TSLA"],
    ["dexProgramId", AGENT.toBase58()],
    ["poolId", AGENT.toBase58()],
    ["outputRecipientPubkey", AGENT.toBase58()],
    ["agentPubkey", "Vote111111111111111111111111111111111111111"],
    ["maxInputRawPerOrder", "01"],
    ["maxInputRawPerOrder", "0"],
    ["maxInputRawPerOrder", "18446744073709551616"],
    ["maxInputRawPerOrder", 1000],
    ["maxInputRawTotal", "100"],
    ["minOutputPerInputDenominatorRaw", "0"],
    ["maxSlippageBps", 501],
    ["maxSlippageBps", 0.5],
    ["expiresAtUnixSeconds", NOW],
    ["expiresAtUnixSeconds", NOW + 31 * 86400],
    ["nonce", "A".repeat(64)],
  ];
  for (const [key, value] of changes) {
    const candidate = { ...policy(), [key]: value };
    assert.equal(validateSpendPolicyDraft(candidate, NOW).status, "rejected", key);
  }
});

test("policy parser rejects non-JSON shapes, invalid clocks, and prototype surprises", () => {
  assert.equal(validateSpendPolicyDraft(null, NOW).status, "rejected");
  assert.equal(validateSpendPolicyDraft([], NOW).status, "rejected");
  assert.equal(validateSpendPolicyDraft(policy(), Number.NaN).status, "rejected");
  assert.equal(validateSpendPolicyDraft(Object.create({ ...policy() }), NOW).status, "rejected");
  const withGetter = { ...policy(), get ticker(): string { throw new Error("getter"); } };
  assert.equal(validateSpendPolicyDraft(withGetter, NOW).status, "rejected");
});

test("intent rejects route drift, malformed nonce relation, stale timestamps, and floor-ratio mismatch", () => {
  const p = validPolicy();
  const changes: Array<[string, unknown]> = [
    ["remainingRaw", "1"],
    ["signature", "fake"],
    ["agentPubkey", OWNER.toBase58()],
    ["policyNonce", "b".repeat(64)],
    ["intentNonce", "a".repeat(64)],
    ["poolId", AGENT.toBase58()],
    ["inputRaw", "1000001"],
    ["inputRaw", "1.0"],
    ["minOutputRaw", "99"],
    ["quoteObservedAtUnixSeconds", NOW + 1],
    ["quoteExpiresAtUnixSeconds", NOW],
    ["quoteExpiresAtUnixSeconds", NOW + 61],
  ];
  for (const [key, value] of changes) {
    assert.equal(validateAgentIntentDraft({ ...intent(), [key]: value }, p.draft, NOW).status, "rejected", key);
  }
});

test("draft validation cannot attest quote provenance or globally prevent nonce reuse", () => {
  const p = validPolicy();
  const proposal = intent();
  assert.equal(validateAgentIntentDraft(proposal, p.draft, NOW).status, "draft");
  assert.equal(validateAgentIntentDraft(proposal, p.draft, NOW).status, "draft");
});

test("intent refuses a forged or altered policy even when it has the TypeScript shape", () => {
  const p = validPolicy();
  const forged = { ...p.draft, maxInputRawPerOrder: "18446744073709551616" };
  assert.equal(validateAgentIntentDraft(intent(), forged, NOW).status, "rejected");
  const wrongRoute = { ...p.draft, poolId: AGENT.toBase58() };
  assert.equal(validateAgentIntentDraft(intent(), wrongRoute, NOW).status, "rejected");
});

test("draft state has only an explicit rejection transition; activation and revocation are impossible", () => {
  assert.deepEqual(advanceSpendDraftState("draft", "reject"), { status: "rejected", capability: "autonomous_unavailable" });
  assert.equal(advanceSpendDraftState("draft", "activate"), null);
  assert.equal(advanceSpendDraftState("draft", "revoke"), null);
  assert.equal(advanceSpendDraftState("rejected", "reject"), null);
});
