import { describe, expect, it } from "vitest";

import type { PurchaseAction } from "./purchase-machine";
import type { PurchaseRpc, SignatureStatusRead } from "./rpc";
import { nextPollInterval, trackSignature, transactionErrorCode, type PollLimits } from "./tracker";

const LIMITS: PollLimits = { baseMs: 2_000, maxMs: 8_000, timeoutMs: 120_000 };
const SIGNATURE = "sig";

class RateLimited extends Error {}

type Step = SignatureStatusRead | null | "rateLimited" | "unavailable";

function harness(steps: Step[], options: { height?: number; historyStatus?: Step } = {}) {
  let clock = 0;
  const actions: PurchaseAction[] = [];
  const sleeps: number[] = [];
  const calls: string[] = [];
  let index = 0;
  const read = (step: Step): SignatureStatusRead | null => {
    if (step === "rateLimited") throw new RateLimited("429");
    if (step === "unavailable") throw new TypeError("network");
    return step;
  };
  const rpc: PurchaseRpc = {
    async signatureStatus(_signature, searchHistory) {
      calls.push(searchHistory ? "status+history" : "status");
      if (searchHistory) return read(options.historyStatus ?? null);
      const step = steps[Math.min(index, steps.length - 1)];
      index += 1;
      return read(step);
    },
    async blockHeight() {
      calls.push("height");
      return options.height ?? 0;
    },
    async finalizedTransactionMeta() {
      throw new Error("not used");
    },
  };
  const deps = {
    rpc,
    dispatch: (action: PurchaseAction) => actions.push(action),
    now: () => clock,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      clock += ms;
    },
    relayFailureOf: (error: unknown) => (error instanceof RateLimited ? "rateLimited" as const : error instanceof TypeError ? "unavailable" as const : null),
    isCancelled: () => false,
  };
  return { deps, actions, sleeps, calls };
}

const base = { signature: SIGNATURE, lastValidBlockHeight: 100, alreadyConfirmed: false, singleRead: false };
const status = (confirmationStatus: SignatureStatusRead["confirmationStatus"], err: unknown = null): SignatureStatusRead => ({ confirmationStatus, err });

describe("nextPollInterval", () => {
  it("doubles on 429 up to the ceiling and resets otherwise", () => {
    expect(nextPollInterval(2_000, true, LIMITS)).toBe(4_000);
    expect(nextPollInterval(4_000, true, LIMITS)).toBe(8_000);
    expect(nextPollInterval(8_000, true, LIMITS)).toBe(8_000);
    expect(nextPollInterval(8_000, false, LIMITS)).toBe(2_000);
  });
});

describe("trackSignature", () => {
  it("polls every 2 s through confirmed to finalized, then stops", async () => {
    const { deps, actions, sleeps } = harness([status("processed"), status("confirmed"), status("finalized")]);
    await trackSignature(base, deps, LIMITS);
    expect(actions.map((action) => action.type === "statusObserved" ? action.status : action.type)).toEqual(["confirmed", "finalized"]);
    expect(sleeps).toEqual([2_000, 2_000]);
  });

  it("reports an on-chain error as failed", async () => {
    const { deps, actions } = harness([status("confirmed", { InstructionError: [2, { Custom: 6004 }] })]);
    await trackSignature(base, deps, LIMITS);
    expect(actions).toEqual([{ type: "statusFailed", signature: SIGNATURE, errorCode: "{\"InstructionError\":[2,{\"Custom\":6004}]}" }]);
  });

  it("stops at the cap with notFinalized and never sends anything", async () => {
    const { deps, actions, sleeps, calls } = harness([status("processed")]);
    await trackSignature(base, deps, LIMITS);
    expect(actions).toEqual([{ type: "trackingStopped", signature: SIGNATURE, reason: "cap" }]);
    expect(sleeps.reduce((sum, ms) => sum + ms, 0)).toBeLessThanOrEqual(LIMITS.timeoutMs);
    expect(new Set(calls)).toEqual(new Set(["status"]));
  });

  it("backs off on relay 429 and reports a relay stop when the last reads failed", async () => {
    const { deps, actions, sleeps } = harness(["rateLimited"]);
    await trackSignature(base, deps, LIMITS);
    expect(sleeps.slice(0, 4)).toEqual([4_000, 8_000, 8_000, 8_000]);
    expect(actions.at(-1)).toEqual({ type: "trackingStopped", signature: SIGNATURE, reason: "relay" });
  });

  it("keeps the base interval after a network failure", async () => {
    const { deps, sleeps } = harness(["unavailable", status("finalized")]);
    await trackSignature(base, deps, LIMITS);
    expect(sleeps).toEqual([2_000]);
  });

  it("does not call a transaction dropped while the blockhash is still valid", async () => {
    const { deps, actions, calls } = harness([null, status("finalized")], { height: 100 });
    await trackSignature(base, deps, LIMITS);
    expect(actions.map((action) => action.type)).toEqual(["statusObserved"]);
    expect(calls).toEqual(["status", "height", "status"]);
  });

  it("reports dropped only past lastValidBlockHeight and after a history search finds nothing", async () => {
    const dropped = harness([null], { height: 101, historyStatus: null });
    await trackSignature(base, dropped.deps, LIMITS);
    expect(dropped.actions).toEqual([{ type: "droppedDetected", signature: SIGNATURE }]);
    expect(dropped.calls).toEqual(["status", "height", "status+history"]);

    const found = harness([null, status("finalized")], { height: 101, historyStatus: status("confirmed") });
    await trackSignature(base, found.deps, LIMITS);
    expect(found.actions.map((action) => action.type)).not.toContain("droppedDetected");
  });

  it("does one read for Check again and stops again if nothing is final", async () => {
    const { deps, actions, sleeps } = harness([status("processed")]);
    await trackSignature({ ...base, singleRead: true }, deps, LIMITS);
    expect(actions).toEqual([{ type: "trackingStopped", signature: SIGNATURE, reason: "cap" }]);
    expect(sleeps).toEqual([]);
  });

  it("stops without dispatching once cancelled", async () => {
    const { deps, actions } = harness([status("processed")]);
    await trackSignature(base, { ...deps, isCancelled: () => true }, LIMITS);
    expect(actions).toEqual([]);
  });

  it("formats error values compactly", () => {
    expect(transactionErrorCode("AccountNotFound")).toBe("AccountNotFound");
    expect(transactionErrorCode({ InstructionError: [0, "Custom"] })).toBe("{\"InstructionError\":[0,\"Custom\"]}");
  });
});
