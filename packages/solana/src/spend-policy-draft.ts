/**
 * Offline draft validation only. This is NOT spending authority.
 * No grant, signer, authenticated quote, transaction builder, RPC call, or
 * send path exists here. A proposed nonce is only format-checked, not globally
 * unique or consumed. Do not export this module from the read-only package root.
 */
import { PublicKey } from "@solana/web3.js";
import { resolveAcquisitionRoute } from "./acquisition-pool.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "./index.js";

const MAX_U64 = (1n << 64n) - 1n;
const MAX_DRAFT_SECONDS = 30 * 86_400;
const MAX_QUOTE_AGE_SECONDS = 30;
const MAX_QUOTE_LIFE_SECONDS = 60;
const MAX_SLIPPAGE_BPS = 500;
const NONCE = /^[0-9a-f]{64}$/;

const POLICY_FIELDS = [
  "version", "cluster", "ownerPubkey", "agentPubkey", "ticker", "xstockMint",
  "usdcMint", "dexProgramId", "poolId", "outputRecipientPubkey",
  "maxInputRawPerOrder", "maxInputRawTotal", "minOutputPerInputNumeratorRaw",
  "minOutputPerInputDenominatorRaw", "maxSlippageBps", "expiresAtUnixSeconds", "nonce",
] as const;
const INTENT_FIELDS = [
  "version", "cluster", "agentPubkey", "policyNonce", "intentNonce", "ticker",
  "xstockMint", "usdcMint", "dexProgramId", "poolId", "outputRecipientPubkey",
  "inputRaw", "minOutputRaw", "quoteObservedAtUnixSeconds", "quoteExpiresAtUnixSeconds",
] as const;

export interface SpendPolicyDraftV1 {
  version: 1;
  cluster: "mainnet-beta";
  ownerPubkey: string;
  agentPubkey: string;
  ticker: string;
  xstockMint: string;
  usdcMint: string;
  dexProgramId: string;
  poolId: string;
  outputRecipientPubkey: string;
  maxInputRawPerOrder: string;
  maxInputRawTotal: string;
  minOutputPerInputNumeratorRaw: string;
  minOutputPerInputDenominatorRaw: string;
  /** Proposed ceiling only; no authenticated quote or slippage execution exists. */
  maxSlippageBps: number;
  expiresAtUnixSeconds: number;
  nonce: string;
}

export interface AgentIntentDraftV1 {
  version: 1;
  cluster: "mainnet-beta";
  agentPubkey: string;
  policyNonce: string;
  intentNonce: string;
  ticker: string;
  xstockMint: string;
  usdcMint: string;
  dexProgramId: string;
  poolId: string;
  outputRecipientPubkey: string;
  inputRaw: string;
  minOutputRaw: string;
  quoteObservedAtUnixSeconds: number;
  quoteExpiresAtUnixSeconds: number;
}

export type DraftRejection =
  | "invalid_shape" | "unknown_field" | "invalid_clock" | "invalid_identity"
  | "invalid_route" | "invalid_amount" | "invalid_limit" | "invalid_expiry"
  | "invalid_nonce" | "invalid_quote" | "policy_mismatch";

export type DraftValidation<T> =
  | { status: "draft"; capability: "autonomous_unavailable"; draft: Readonly<T> }
  | { status: "rejected"; capability: "autonomous_unavailable"; reason: DraftRejection };

function record(input: unknown, fields: readonly string[]): Record<string, unknown> | DraftRejection {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return "invalid_shape";
  if (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null) return "invalid_shape";
  const keys = Reflect.ownKeys(input);
  if (keys.length !== fields.length || keys.some((key) => typeof key !== "string" || !fields.includes(key))) {
    return "unknown_field";
  }
  const snapshot: Record<string, unknown> = {};
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(input, field);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return "invalid_shape";
    snapshot[field] = descriptor.value;
  }
  return snapshot;
}

function rawAmount(value: unknown): bigint | null {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value) || value.length > 20) return null;
  const parsed = BigInt(value);
  return parsed <= MAX_U64 ? parsed : null;
}

function canonicalKey(value: unknown): PublicKey | null {
  if (typeof value !== "string") return null;
  try {
    const key = new PublicKey(value);
    return key.toBase58() === value ? key : null;
  } catch {
    return null;
  }
}

function unixSeconds(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function rejected<T>(reason: DraftRejection): DraftValidation<T> {
  return { status: "rejected", capability: "autonomous_unavailable", reason };
}

/** Validate an untrusted proposal, never an owner-authorized grant. */
export function validateSpendPolicyDraft(input: unknown, nowUnixSeconds: number): DraftValidation<SpendPolicyDraftV1> {
  try {
    if (!unixSeconds(nowUnixSeconds)) return rejected("invalid_clock");
    const value = record(input, POLICY_FIELDS);
    if (typeof value === "string") return rejected(value);
    if (value.version !== 1 || value.cluster !== "mainnet-beta") return rejected("invalid_shape");
    const owner = canonicalKey(value.ownerPubkey);
    const agent = canonicalKey(value.agentPubkey);
    if (!owner || !agent || owner.equals(agent) || !PublicKey.isOnCurve(agent.toBytes())) {
      return rejected("invalid_identity");
    }
    if (typeof value.ticker !== "string") return rejected("invalid_route");
    const resolved = resolveAcquisitionRoute({ ticker: value.ticker });
    if (resolved.status !== "configured" || value.ticker !== resolved.route.ticker ||
      value.xstockMint !== resolved.route.xstockMint || value.usdcMint !== resolved.route.usdcMint ||
      value.dexProgramId !== resolved.route.programId || value.poolId !== resolved.route.poolId) {
      return rejected("invalid_route");
    }
    const expectedRecipient = PublicKey.findProgramAddressSync(
      [owner.toBytes(), TOKEN_2022_PROGRAM_ID.toBytes(), new PublicKey(resolved.route.xstockMint).toBytes()],
      ASSOCIATED_TOKEN_PROGRAM_ID,
    )[0].toBase58();
    if (value.outputRecipientPubkey !== expectedRecipient) return rejected("invalid_identity");
    const perOrder = rawAmount(value.maxInputRawPerOrder);
    const total = rawAmount(value.maxInputRawTotal);
    const numerator = rawAmount(value.minOutputPerInputNumeratorRaw);
    const denominator = rawAmount(value.minOutputPerInputDenominatorRaw);
    if (perOrder === null || total === null || numerator === null || denominator === null) return rejected("invalid_amount");
    if (perOrder > total) return rejected("invalid_limit");
    if (typeof value.maxSlippageBps !== "number" || !Number.isSafeInteger(value.maxSlippageBps) ||
      value.maxSlippageBps < 0 || value.maxSlippageBps > MAX_SLIPPAGE_BPS) return rejected("invalid_limit");
    if (!unixSeconds(value.expiresAtUnixSeconds) || value.expiresAtUnixSeconds <= nowUnixSeconds ||
      value.expiresAtUnixSeconds > nowUnixSeconds + MAX_DRAFT_SECONDS) return rejected("invalid_expiry");
    if (typeof value.nonce !== "string" || !NONCE.test(value.nonce)) return rejected("invalid_nonce");
    return { status: "draft", capability: "autonomous_unavailable", draft: Object.freeze(value as unknown as SpendPolicyDraftV1) };
  } catch {
    return rejected("invalid_shape");
  }
}

/** Check a proposed intent against a draft; no quote or owner attestation, replay prevention, or actual spend cap. */
export function validateAgentIntentDraft(
  input: unknown,
  policy: Readonly<SpendPolicyDraftV1>,
  nowUnixSeconds: number,
): DraftValidation<AgentIntentDraftV1> {
  try {
    if (!unixSeconds(nowUnixSeconds)) return rejected("invalid_clock");
    const validatedPolicy = validateSpendPolicyDraft(policy, nowUnixSeconds);
    if (validatedPolicy.status !== "draft") return rejected("policy_mismatch");
    const draftPolicy = validatedPolicy.draft;
    const value = record(input, INTENT_FIELDS);
    if (typeof value === "string") return rejected(value);
    if (value.version !== 1 || value.cluster !== "mainnet-beta") return rejected("invalid_shape");
    if (value.agentPubkey !== draftPolicy.agentPubkey || value.policyNonce !== draftPolicy.nonce ||
      value.ticker !== draftPolicy.ticker || value.xstockMint !== draftPolicy.xstockMint ||
      value.usdcMint !== draftPolicy.usdcMint || value.dexProgramId !== draftPolicy.dexProgramId ||
      value.poolId !== draftPolicy.poolId || value.outputRecipientPubkey !== draftPolicy.outputRecipientPubkey) {
      return rejected("policy_mismatch");
    }
    if (typeof value.intentNonce !== "string" || !NONCE.test(value.intentNonce) || value.intentNonce === draftPolicy.nonce) {
      return rejected("invalid_nonce");
    }
    const inputRaw = rawAmount(value.inputRaw);
    const minOutputRaw = rawAmount(value.minOutputRaw);
    if (inputRaw === null || minOutputRaw === null) return rejected("invalid_amount");
    if (inputRaw > BigInt(draftPolicy.maxInputRawPerOrder)) return rejected("invalid_limit");
    if (minOutputRaw * BigInt(draftPolicy.minOutputPerInputDenominatorRaw) <
      inputRaw * BigInt(draftPolicy.minOutputPerInputNumeratorRaw)) return rejected("invalid_limit");
    if (!unixSeconds(value.quoteObservedAtUnixSeconds) || !unixSeconds(value.quoteExpiresAtUnixSeconds) ||
      value.quoteObservedAtUnixSeconds > nowUnixSeconds ||
      value.quoteObservedAtUnixSeconds < nowUnixSeconds - MAX_QUOTE_AGE_SECONDS ||
      value.quoteExpiresAtUnixSeconds <= nowUnixSeconds ||
      value.quoteExpiresAtUnixSeconds > nowUnixSeconds + MAX_QUOTE_LIFE_SECONDS ||
      value.quoteExpiresAtUnixSeconds > draftPolicy.expiresAtUnixSeconds) return rejected("invalid_quote");
    return { status: "draft", capability: "autonomous_unavailable", draft: Object.freeze(value as unknown as AgentIntentDraftV1) };
  } catch {
    return rejected("invalid_shape");
  }
}

/** The only state change this offline model permits is rejecting a draft. */
export function advanceSpendDraftState(
  state: unknown,
  event: unknown,
): { status: "rejected"; capability: "autonomous_unavailable" } | null {
  return state === "draft" && event === "reject"
    ? { status: "rejected", capability: "autonomous_unavailable" }
    : null;
}
