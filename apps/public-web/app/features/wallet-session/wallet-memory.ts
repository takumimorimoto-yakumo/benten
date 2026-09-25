/**
 * The one remembered fact of the wallet session: the name of the wallet the
 * user last connected in this browser (never an address, account or key).
 * Kept in `localStorage` so a reload can reconnect silently; cleared on
 * Disconnect. Every storage failure (private mode, quota, disabled storage)
 * reads as "nothing remembered", so the page simply stays disconnected.
 */
import type { WalletMemory } from "./wallet-session";

export const WALLET_MEMORY_KEY = "benten.wallet-session.v1";
/** Wallet Standard names are short display names; anything longer is not ours. */
const MAX_WALLET_NAME_LENGTH = 64;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function createWalletMemory(storage: () => StorageLike | null): WalletMemory {
  return {
    read() {
      try {
        const text = storage()?.getItem(WALLET_MEMORY_KEY);
        if (!text) return null;
        const value = JSON.parse(text) as unknown;
        const walletId = value && typeof value === "object" && !Array.isArray(value) ? (value as { walletId?: unknown }).walletId : null;
        return typeof walletId === "string" && walletId.length > 0 && walletId.length <= MAX_WALLET_NAME_LENGTH ? walletId : null;
      } catch {
        return null;
      }
    },
    write(walletId) {
      try {
        const target = storage();
        if (!target) return;
        if (walletId === null) target.removeItem(WALLET_MEMORY_KEY);
        else if (walletId.length <= MAX_WALLET_NAME_LENGTH) target.setItem(WALLET_MEMORY_KEY, JSON.stringify({ walletId }));
      } catch {
        // Not remembered: the next load starts disconnected, which is safe.
      }
    },
  };
}

/** `window.localStorage`, or `null` where reading it throws or there is no window. */
export function browserLocalStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
