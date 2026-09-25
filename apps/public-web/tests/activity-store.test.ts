import { describe, expect, it, vi } from "vitest";
import { encodeBase58 } from "../../../packages/purchase/src/base58.ts";
import { checkPurchase, measureFromMeta } from "../app/features/activity/activity-check.ts";
import { ACTIVITY_CONFIG } from "../app/features/activity/activity-config.ts";
import { createActivityStore, isActivityRecord, type ActivityStorage, type PurchaseAttemptInput } from "../app/features/activity/activity-store.ts";

const key = (seed: number, bytes = 32) => encodeBase58(new Uint8Array(bytes).fill(seed));
const WALLET = key(7);
const OTHER_WALLET = key(8);
const USDC = key(3);
const NVDAX = key(4);
const POOL = key(5);
const SIGNATURE = key(21, 64);

function memory(): ActivityStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return { values, getItem: (name) => values.get(name) ?? null, setItem: (name, value) => void values.set(name, value), removeItem: (name) => void values.delete(name) };
}

function attempt(overrides: Partial<PurchaseAttemptInput> = {}): PurchaseAttemptInput {
  return {
    attemptId: "attempt-0001",
    walletAddress: WALLET,
    genesisHash: ACTIVITY_CONFIG.mainnetGenesisHash,
    routeId: POOL,
    inputMint: USDC,
    outputMint: NVDAX,
    inputRaw: "10000000",
    phase: "opened",
    ...overrides,
  };
}

function storeWith(storage: ActivityStorage | null = memory(), now = () => 1_000) {
  return createActivityStore({ storage: () => storage, now });
}

describe("activity store: the one write", () => {
  it("creates an attempt, then moves it forward with its signature and the measured result", () => {
    const store = storeWith();
    expect(store.record(attempt())).toMatchObject({ ok: true, record: { phase: "opened", signature: null } });
    expect(store.record(attempt({ phase: "sent", signature: SIGNATURE }))).toMatchObject({ ok: true, record: { phase: "sent", signature: SIGNATURE } });
    const done = store.record(attempt({ phase: "finalized", finalizedAt: 2_000, receivedRaw: "4419820", paidRaw: "10000000" }));
    expect(done).toMatchObject({ ok: true, record: { phase: "finalized", signature: SIGNATURE, receivedRaw: "4419820", paidRaw: "10000000" } });
    const list = store.list();
    expect(list.status === "available" && list.records).toHaveLength(1);
  });

  it("never moves backwards, never replaces a final status or a known signature, and never changes identity", () => {
    const store = storeWith();
    store.record(attempt({ phase: "sent", signature: SIGNATURE }));
    expect(store.record(attempt({ phase: "opened" }))).toEqual({ ok: false, reason: "conflict" });
    expect(store.record(attempt({ phase: "sent", signature: key(22, 64) }))).toEqual({ ok: false, reason: "conflict" });
    expect(store.record(attempt({ phase: "sent", inputRaw: "1" }))).toEqual({ ok: false, reason: "conflict" });
    expect(store.record(attempt({ phase: "sent", walletAddress: OTHER_WALLET }))).toEqual({ ok: false, reason: "conflict" });
    store.record(attempt({ phase: "failed" }));
    expect(store.record(attempt({ phase: "finalized" }))).toEqual({ ok: false, reason: "conflict" });
  });

  it("refuses measured amounts before finalized, and anything past sent without a signature", () => {
    const store = storeWith();
    expect(store.record(attempt({ phase: "sent", signature: SIGNATURE, receivedRaw: "1" }))).toEqual({ ok: false, reason: "invalid" });
    expect(store.record(attempt({ phase: "confirmed" }))).toEqual({ ok: false, reason: "invalid" });
  });

  it("withdraws only an opened attempt without a signature, and keeps anything that may have been sent", () => {
    const store = storeWith();
    expect(store.withdraw("attempt-0001", WALLET)).toEqual({ ok: true, removed: false });
    store.record(attempt());
    expect(store.withdraw("attempt-0001", OTHER_WALLET)).toEqual({ ok: true, removed: false });
    expect(store.withdraw("attempt-0001", WALLET)).toEqual({ ok: true, removed: true });
    expect(store.list()).toMatchObject({ status: "available", records: [] });
    for (const later of [attempt({ phase: "outcome_unknown" }), attempt({ phase: "sent", signature: SIGNATURE })]) {
      const other = storeWith();
      other.record(attempt());
      other.record(later);
      expect(other.withdraw("attempt-0001", WALLET)).toEqual({ ok: false, reason: "conflict" });
      expect(other.list()).toMatchObject({ status: "available", records: [{ phase: later.phase }] });
    }
    expect(store.withdraw("bad id", WALLET)).toEqual({ ok: false, reason: "invalid" });
    expect(storeWith(null).withdraw("attempt-0001", WALLET)).toEqual({ ok: false, reason: "storage_unavailable" });
  });

  it("validates every field strictly: base58 widths, raw u64 integers and the attempt id", () => {
    const store = storeWith();
    expect(store.record(attempt({ walletAddress: "not-an-address" }))).toEqual({ ok: false, reason: "invalid" });
    expect(store.record(attempt({ signature: key(21) }))).toEqual({ ok: false, reason: "invalid" });
    expect(store.record(attempt({ inputRaw: "1.5" }))).toEqual({ ok: false, reason: "invalid" });
    expect(store.record(attempt({ inputRaw: "18446744073709551616" }))).toEqual({ ok: false, reason: "invalid" });
    expect(store.record(attempt({ attemptId: "x" }))).toEqual({ ok: false, reason: "invalid" });
    expect(store.record(attempt({ walletAddress: `${WALLET.slice(0, -1)}0` }))).toEqual({ ok: false, reason: "invalid" });
  });

  it("stores records per cluster and account, and lists them newest first", () => {
    const storage = memory();
    let clock = 1_000;
    const store = storeWith(storage, () => clock);
    store.record(attempt());
    clock = 2_000;
    store.record(attempt({ attemptId: "attempt-0002", walletAddress: OTHER_WALLET }));
    const stored = JSON.parse(storage.values.get(ACTIVITY_CONFIG.storageKey)!);
    expect(stored.partitions.map((partition: { walletAddress: string; genesisHash: string }) => [partition.genesisHash, partition.walletAddress]).sort())
      .toEqual([[ACTIVITY_CONFIG.mainnetGenesisHash, OTHER_WALLET], [ACTIVITY_CONFIG.mainnetGenesisHash, WALLET]].sort());
    const list = store.list();
    expect(list.status === "available" && list.records.map((record) => record.id)).toEqual(["attempt-0002", "attempt-0001"]);
  });

  it("keeps only the newest records beyond the cap", () => {
    let clock = 1;
    const store = storeWith(memory(), () => clock);
    for (let index = 0; index < ACTIVITY_CONFIG.maxRecords + 3; index += 1) {
      clock = 1_000 + index;
      store.record(attempt({ attemptId: `attempt-${String(index).padStart(4, "0")}` }));
    }
    const list = store.list();
    expect(list.status === "available" && list.records.length).toBe(ACTIVITY_CONFIG.maxRecords);
    expect(list.status === "available" && list.records.at(-1)?.id).toBe("attempt-0003");
  });

  it("skips tampered records on read instead of showing them", () => {
    const storage = memory();
    const store = storeWith(storage);
    store.record(attempt());
    const stored = JSON.parse(storage.values.get(ACTIVITY_CONFIG.storageKey)!);
    stored.partitions[0].records.push({ ...stored.partitions[0].records[0], id: "attempt-0009", receivedRaw: "5" });
    stored.partitions[0].records.push({ ...stored.partitions[0].records[0], id: "attempt-0010", extra: true });
    storage.values.set(ACTIVITY_CONFIG.storageKey, JSON.stringify(stored));
    const list = store.list();
    expect(list).toMatchObject({ status: "available", skipped: 2 });
    expect(list.status === "available" && list.records.map((record) => record.id)).toEqual(["attempt-0001"]);
    storage.values.set(ACTIVITY_CONFIG.storageKey, "{not json");
    expect(store.list()).toEqual({ status: "available", records: [], skipped: 1 });
    expect(isActivityRecord({})).toBe(false);
  });

  it("reports unavailable storage instead of throwing, and clears only this browser's history", () => {
    expect(storeWith(null).list()).toEqual({ status: "unavailable" });
    expect(storeWith(null).record(attempt())).toEqual({ ok: false, reason: "storage_unavailable" });
    const throwing: ActivityStorage = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => undefined, removeItem: () => undefined };
    expect(storeWith(throwing).list()).toEqual({ status: "unavailable" });
    const full: ActivityStorage = { getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); }, removeItem: () => undefined };
    expect(storeWith(full).record(attempt())).toEqual({ ok: false, reason: "storage_unavailable" });

    const storage = memory();
    const store = storeWith(storage);
    const listener = vi.fn();
    store.subscribe(listener);
    store.record(attempt());
    expect(store.clear()).toBe(true);
    expect(storage.values.has(ACTIVITY_CONFIG.storageKey)).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe("Check again: reads the same signature, never resends", () => {
  const sent = () => {
    const store = storeWith();
    const outcome = store.record(attempt({ phase: "sent", signature: SIGNATURE }));
    if (!outcome.ok) throw new Error("fixture");
    return { store, record: outcome.record };
  };
  const meta = {
    err: null,
    preTokenBalances: [{ accountIndex: 1, mint: USDC, owner: WALLET, uiTokenAmount: { amount: "25000000" } }],
    postTokenBalances: [
      { accountIndex: 1, mint: USDC, owner: WALLET, uiTokenAmount: { amount: "15000000" } },
      { accountIndex: 2, mint: NVDAX, owner: WALLET, uiTokenAmount: { amount: "4419820" } },
      { accountIndex: 3, mint: NVDAX, owner: POOL, uiTokenAmount: { amount: "999" } },
    ],
  };

  it("records a finalized purchase with the amounts measured for the approving wallet", async () => {
    const { store, record } = sent();
    const rpc = vi.fn(async (method: string) => (method === "getSignatureStatuses"
      ? { context: { slot: 1 }, value: [{ confirmationStatus: "finalized", err: null }] }
      : { blockTime: 1_700_000_000, meta }));
    const outcome = await checkPurchase(record, { rpc, write: (input) => store.record(input), now: () => 5_000 });
    expect(outcome).toMatchObject({ kind: "checked", state: "finalized", record: { phase: "finalized", receivedRaw: "4419820", paidRaw: "10000000", finalizedAt: 1_700_000_000_000, lastCheckedAt: 5_000 } });
    expect(rpc.mock.calls.map(([method]) => method)).toEqual(["getSignatureStatuses", "getTransaction"]);
    expect(rpc.mock.calls[0]![1]).toEqual([[SIGNATURE], { searchTransactionHistory: true }]);
    // Version 1 transactions exist on mainnet: the read must accept them (a limit of 0 makes the RPC answer -32015).
    expect(rpc.mock.calls[1]![1]).toEqual([SIGNATURE, { commitment: "finalized", encoding: "base64", maxSupportedTransactionVersion: 1 }]);
  });

  it("keeps the status when Solana has none yet, marks failures, and follows confirmed", async () => {
    for (const [value, state, phase] of [
      [null, "not_found", "sent"],
      [{ confirmationStatus: "confirmed", err: null }, "confirmed", "confirmed"],
      [{ confirmationStatus: "finalized", err: { InstructionError: [2, "Custom"] } }, "failed", "failed"],
    ] as const) {
      const { store, record } = sent();
      const outcome = await checkPurchase(record, { rpc: async () => ({ value: [value] }), write: (input) => store.record(input), now: () => 5_000 });
      expect(outcome, state).toMatchObject({ kind: "checked", state, record: { phase, lastCheckedAt: 5_000 } });
    }
  });

  it("does not check a record without a signature, from another cluster, or already final", async () => {
    const rpc = vi.fn();
    const store = storeWith();
    const opened = store.record(attempt());
    const other = store.record(attempt({ attemptId: "attempt-0002", genesisHash: key(9), phase: "sent", signature: SIGNATURE }));
    if (!opened.ok || !other.ok) throw new Error("fixture");
    expect(await checkPurchase(opened.record, { rpc, write: (input) => store.record(input), now: () => 1 })).toEqual({ kind: "not_checkable", reason: "no_signature" });
    expect(await checkPurchase(other.record, { rpc, write: (input) => store.record(input), now: () => 1 })).toEqual({ kind: "not_checkable", reason: "other_network" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("says busy or unavailable, and changes nothing, when the relay fails", async () => {
    const { HoldingsRpcError } = await import("../../../packages/holdings/src/rpc.ts");
    const { store, record } = sent();
    const busy = await checkPurchase(record, { rpc: async () => { throw new HoldingsRpcError("rate_limited"); }, write: (input) => store.record(input), now: () => 1 });
    expect(busy).toEqual({ kind: "unavailable", reason: "rate_limited" });
    const list = store.list();
    expect(list.status === "available" && list.records[0]).toMatchObject({ phase: "sent", lastCheckedAt: null });
  });

  it("measures only the approving wallet's balances, and refuses malformed amounts", () => {
    expect(measureFromMeta(meta, { walletAddress: WALLET, inputMint: USDC, outputMint: NVDAX })).toEqual({ receivedRaw: "4419820", paidRaw: "10000000" });
    const malformed = { ...meta, postTokenBalances: [{ accountIndex: 2, mint: NVDAX, owner: WALLET, uiTokenAmount: { amount: "1.5" } }] };
    expect(measureFromMeta(malformed, { walletAddress: WALLET, inputMint: USDC, outputMint: NVDAX })).toBeNull();
  });
});
