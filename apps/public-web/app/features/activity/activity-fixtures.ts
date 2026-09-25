/**
 * Living Catalog fixtures for the Activity tab (development only; imported
 * by `routes/dev-portfolio-fixture.tsx`). The history lives in memory, not
 * in this browser's storage, and "Check again" answers from the fixture
 * instead of the relay. Signatures, wallets and amounts are placeholders.
 */
import { encodeBase58 } from "@benten/purchase/base58";
import type { ActivityCatalog } from "./activity-catalog";
import type { CheckOutcome } from "./activity-check";
import { ACTIVITY_CONFIG } from "./activity-config";
import { ACTIVITY_FIXTURE_NAMES } from "../../lib/portfolio-fixture-names";
import { createActivityStore, type ActivityStorage, type ActivityStore, type PurchaseAttemptInput } from "./activity-store";

const MINUTE_MS = 60 * 1000;

export { ACTIVITY_FIXTURE_NAMES };

export type ActivityFixtureName = (typeof ACTIVITY_FIXTURE_NAMES)[number];

function memoryStorage(): ActivityStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

const placeholder = (seed: number, bytes = 32) => encodeBase58(new Uint8Array(bytes).fill(seed));

/** A store seeded for one fixture, and the "Check again" answer it uses. */
export function activityFixture(name: ActivityFixtureName, catalog: ActivityCatalog, nowMs: number): {
  store: ActivityStore;
  check: (record: { id: string }) => Promise<CheckOutcome>;
} {
  let clock = nowMs;
  const storage = name === "unavailable" ? null : memoryStorage();
  const store = createActivityStore({ storage: () => storage, now: () => clock });
  const [usdc, nvdax] = [catalog.tokens.find((token) => !token.scaledUi)!, catalog.tokens.find((token) => token.scaledUi)!];
  const base = (seed: number): Omit<PurchaseAttemptInput, "phase"> => ({
    attemptId: `fixture-attempt-${seed}`,
    walletAddress: placeholder(7),
    genesisHash: ACTIVITY_CONFIG.mainnetGenesisHash,
    routeId: catalog.routeId,
    inputMint: usdc.mint,
    outputMint: nvdax.mint,
    inputRaw: "10000000",
    expectedOutputRaw: "4419820",
    minimumOutputRaw: "4375621",
  });
  if (name === "records") {
    const at = (minutesAgo: number) => {
      clock = nowMs - minutesAgo * MINUTE_MS;
    };
    at(95);
    store.record({ ...base(1), phase: "opened" });
    store.record({ ...base(1), phase: "sent", signature: placeholder(21, 64) });
    at(94);
    store.record({ ...base(1), phase: "finalized", signature: placeholder(21, 64), finalizedAt: clock, receivedRaw: "4419820", receivedDisplay: "0.0441982", paidRaw: "10000000" });
    // Paid with SOL and with SKR (two-leg route): their amounts use the pay token's symbol and decimals.
    const sol = catalog.tokens.find((token) => token.symbol === "SOL");
    const skr = catalog.tokens.find((token) => token.symbol === "SKR");
    if (sol) {
      at(60);
      store.record({ ...base(4), inputMint: sol.mint, inputRaw: "50000000", phase: "opened" });
      at(59);
      store.record({ ...base(4), inputMint: sol.mint, inputRaw: "50000000", phase: "finalized", signature: placeholder(24, 64), finalizedAt: clock, receivedRaw: "2575409", receivedDisplay: "0.0257979", paidRaw: "52045000" });
    }
    if (skr) {
      at(30);
      store.record({ ...base(5), inputMint: skr.mint, inputRaw: "200000000", phase: "opened" });
      store.record({ ...base(5), inputMint: skr.mint, inputRaw: "200000000", phase: "sent", signature: placeholder(25, 64) });
    }
    at(12);
    store.record({ ...base(2), phase: "opened" });
    store.record({ ...base(2), phase: "sent", signature: placeholder(22, 64) });
    at(3);
    store.record({ ...base(3), inputRaw: "5000000", phase: "outcome_unknown" });
    clock = nowMs;
  }
  return {
    store,
    async check(record) {
      const current = store.list();
      const found = current.status === "available" ? current.records.find((entry) => entry.id === record.id) : undefined;
      if (!found) return { kind: "unavailable", reason: "unavailable" };
      const written = store.record({
        attemptId: found.id, walletAddress: found.walletAddress, genesisHash: found.genesisHash, routeId: found.routeId,
        inputMint: found.inputMint, outputMint: found.outputMint, inputRaw: found.inputRaw,
        phase: "finalized", finalizedAt: nowMs, receivedRaw: "4401213", paidRaw: found.inputRaw, checkedAt: nowMs,
      });
      return written.ok ? { kind: "checked", state: "finalized", record: written.record } : { kind: "unavailable", reason: "not_saved" };
    },
  };
}
