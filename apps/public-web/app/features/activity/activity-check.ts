/**
 * "Check again" for one Activity record (app IA section 5.4): the one safe
 * next action. With the record's own signature it reads
 * `getSignatureStatuses` (with transaction-history search) and, once the
 * transaction is finalized, `getTransaction` for its token balances. It
 * never resends, never rebuilds and never asks the wallet for anything; the
 * only write is the record update through `recordPurchaseAttempt`.
 *
 * Reads go through the same-origin read-only relay with the SDK-free
 * transport of `@benten/holdings`, so this tab carries no Solana SDK.
 */
import { PURCHASE_CONFIG } from "@benten/purchase/config";
import { SOLANA_RPC_RELAY_PATH } from "@benten/solana-rpc-relay/config";
import { HoldingsRpcError, createRelayRpc, type HoldingsRpc } from "@benten/holdings/rpc";
import { ACTIVITY_CONFIG } from "./activity-config";
import { isFinalPhase, type ActivityPhase, type ActivityRecord, type PurchaseAttemptInput, type RecordOutcome } from "./activity-store";

/** One check of one record; `state` is what Solana said, `record` what is now stored. */
export type CheckOutcome =
  | { readonly kind: "checked"; readonly state: "finalized" | "failed" | "confirmed" | "not_found" | "finalized_unreadable"; readonly record: ActivityRecord }
  | { readonly kind: "not_checkable"; readonly reason: "no_signature" | "other_network" | "already_final" }
  | { readonly kind: "unavailable"; readonly reason: "rate_limited" | "unavailable" | "not_saved" };

/** The deadline of one check (both reads together). */
const CHECK_DEADLINE_MS = 8_000;

type TokenBalance = { owner?: unknown; mint?: unknown; uiTokenAmount?: { amount?: unknown } | null };
const RAW = /^\d+$/;

function sumFor(entries: unknown, owner: string, mint: string): bigint | null {
  if (!Array.isArray(entries)) return null;
  let total = 0n;
  for (const entry of entries as TokenBalance[]) {
    if (!entry || entry.owner !== owner || entry.mint !== mint) continue;
    const amount = entry.uiTokenAmount?.amount;
    if (typeof amount !== "string" || !RAW.test(amount)) return null;
    total += BigInt(amount);
  }
  return total;
}

/** Received (output) and paid (input) raw amounts of `owner`, from a finalized transaction's meta. */
export function measureFromMeta(meta: unknown, record: Pick<ActivityRecord, "walletAddress" | "inputMint" | "outputMint">): { receivedRaw: string; paidRaw: string } | null {
  const value = meta as { preTokenBalances?: unknown; postTokenBalances?: unknown } | null;
  if (!value) return null;
  const outBefore = sumFor(value.preTokenBalances, record.walletAddress, record.outputMint);
  const outAfter = sumFor(value.postTokenBalances, record.walletAddress, record.outputMint);
  const inBefore = sumFor(value.preTokenBalances, record.walletAddress, record.inputMint);
  const inAfter = sumFor(value.postTokenBalances, record.walletAddress, record.inputMint);
  if (outBefore === null || outAfter === null || inBefore === null || inAfter === null) return null;
  const received = outAfter - outBefore;
  const paid = inBefore - inAfter;
  return received >= 0n && paid >= 0n ? { receivedRaw: received.toString(), paidRaw: paid.toString() } : null;
}

type StatusValue = { confirmationStatus?: unknown; err?: unknown } | null;

function baseInput(record: ActivityRecord, phase: ActivityPhase, checkedAt: number): PurchaseAttemptInput {
  return {
    attemptId: record.id,
    walletAddress: record.walletAddress,
    genesisHash: record.genesisHash,
    routeId: record.routeId,
    inputMint: record.inputMint,
    outputMint: record.outputMint,
    inputRaw: record.inputRaw,
    phase,
    checkedAt,
  };
}

export type CheckDependencies = {
  readonly rpc: HoldingsRpc;
  readonly write: (input: PurchaseAttemptInput) => RecordOutcome;
  readonly now: () => number;
};

function saved(outcome: RecordOutcome, state: Extract<CheckOutcome, { kind: "checked" }>["state"]): CheckOutcome {
  return outcome.ok ? { kind: "checked", state, record: outcome.record } : { kind: "unavailable", reason: "not_saved" };
}

/** Check one record once. Never throws. */
export async function checkPurchase(record: ActivityRecord, dependencies: CheckDependencies): Promise<CheckOutcome> {
  if (!record.signature) return { kind: "not_checkable", reason: "no_signature" };
  if (record.genesisHash !== ACTIVITY_CONFIG.mainnetGenesisHash) return { kind: "not_checkable", reason: "other_network" };
  if (isFinalPhase(record.phase) && !(record.phase === "finalized" && record.receivedRaw === null)) return { kind: "not_checkable", reason: "already_final" };
  const { rpc, write, now } = dependencies;
  try {
    const statuses = await rpc("getSignatureStatuses", [[record.signature], { searchTransactionHistory: true }]);
    const value = (statuses as { value?: unknown } | null)?.value;
    if (!Array.isArray(value) || value.length !== 1) return { kind: "unavailable", reason: "unavailable" };
    const status = value[0] as StatusValue;
    const checkedAt = now();
    if (status === null) {
      // Not seen (yet): the stored status stays; only the check time is recorded.
      return saved(write(baseInput(record, record.phase, checkedAt)), "not_found");
    }
    if (status.err !== null && status.err !== undefined) return saved(write(baseInput(record, "failed", checkedAt)), "failed");
    if (status.confirmationStatus !== "finalized") {
      const phase: ActivityPhase = record.phase === "not_finalized" ? "not_finalized" : "confirmed";
      return saved(write(baseInput(record, status.confirmationStatus === "confirmed" ? phase : record.phase, checkedAt)), "confirmed");
    }
    // Same read as the purchase flow's result: base64 (the message is never decoded; only `meta` is used)
    // up to the configured version, since version 1 transactions exist and a lower limit makes the RPC answer -32015.
    const transaction = await rpc("getTransaction", [record.signature, { commitment: "finalized", encoding: "base64", maxSupportedTransactionVersion: PURCHASE_CONFIG.maxSupportedTransactionVersion }]);
    const meta = (transaction as { meta?: { err?: unknown } | null; blockTime?: unknown } | null)?.meta ?? null;
    if (meta && meta.err !== null && meta.err !== undefined) return saved(write(baseInput(record, "failed", now())), "failed");
    const blockTime = (transaction as { blockTime?: unknown } | null)?.blockTime;
    const finalizedAt = typeof blockTime === "number" && Number.isSafeInteger(blockTime) && blockTime > 0 ? blockTime * 1000 : now();
    const measured = meta ? measureFromMeta(meta, record) : null;
    const input: PurchaseAttemptInput = { ...baseInput(record, "finalized", now()), finalizedAt, ...(measured ?? {}) };
    return saved(write(input), measured ? "finalized" : "finalized_unreadable");
  } catch (error) {
    return { kind: "unavailable", reason: error instanceof HoldingsRpcError && error.reason === "rate_limited" ? "rate_limited" : "unavailable" };
  }
}

/** The browser check through the relay, under one overall deadline. */
export async function checkPurchaseThroughRelay(record: ActivityRecord, write: CheckDependencies["write"]): Promise<CheckOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_DEADLINE_MS);
  try {
    const rpc = createRelayRpc({ url: `${window.location.origin}${SOLANA_RPC_RELAY_PATH}`, signal: controller.signal });
    return await checkPurchase(record, { rpc, write, now: Date.now });
  } finally {
    clearTimeout(timer);
  }
}
