/**
 * Holdings observations kept in memory for this visit only (app IA section
 * 6.4): the last read per wallet address, and whether a read is running.
 * Nothing is persisted. The Holdings page shows exactly one address, the
 * connected one, so an entry for another address is never shown under it.
 */
import type { HoldingsObservation } from "@benten/holdings/read-holdings";

export type HoldingsEntry = {
  readonly observation: HoldingsObservation | null;
  readonly reading: boolean;
};

const EMPTY: HoldingsEntry = { observation: null, reading: false };

export type HoldingsReader = (owner: string) => Promise<HoldingsObservation>;

export type HoldingsStore = {
  entry(address: string): HoldingsEntry;
  subscribe(listener: () => void): () => void;
  /** One explicit read of `address`. A read already running for it is not doubled. */
  refresh(address: string): void;
};

export function createHoldingsStore(read: HoldingsReader): HoldingsStore {
  const entries = new Map<string, HoldingsEntry>();
  const listeners = new Set<() => void>();
  const set = (address: string, entry: HoldingsEntry) => {
    entries.set(address, entry);
    for (const listener of listeners) listener();
  };
  return {
    entry: (address) => entries.get(address) ?? EMPTY,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh(address) {
      const current = entries.get(address) ?? EMPTY;
      if (current.reading) return;
      set(address, { ...current, reading: true });
      void read(address).then(
        (observation) => set(address, { observation, reading: false }),
        // The reader never throws; this only keeps a defect from leaving the page busy.
        () => set(address, { observation: current.observation, reading: false }),
      );
    },
  };
}
