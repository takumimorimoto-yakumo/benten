/**
 * The app-level wallet session (app IA sections 3.2 and 3.5): one Wallet
 * Standard connection for the whole app, owned by the app shell so it
 * survives client-side navigation. The header, Holdings and the purchase
 * panel all read and change this one session; the purchase panel no longer
 * owns a connection of its own.
 *
 * The session only detects, connects and disconnects. It never asks a wallet
 * to approve anything: that stays in the purchase island's `approveOnce`.
 *
 * Silent reconnect (app IA section 3.5): the session remembers only the name
 * of the wallet the user last connected in this browser, and forgets it when
 * the user disconnects. Once per page load, when that wallet is detected, it
 * asks it with `reconnectWallet` (`connect({ silent: true })`), which never
 * shows a prompt; the page stays disconnected, with no notice, when the
 * wallet does not return an authorized account.
 * The adapter is `@benten/purchase/wallet-standard`, which carries no Solana
 * SDK, so this module stays in the shell's small static graph.
 */
import type { ConnectionState, WalletOption } from "@benten/purchase/purchase-machine";

export type WalletSessionState = {
  /** `pending` until the Wallet Standard registry has been read once in the browser. */
  readonly detection: "pending" | "done";
  /** Wallets that offer sign-and-send on Solana mainnet (the purchase rule). */
  readonly wallets: readonly WalletOption[];
  /** Names of detected wallets that do not. */
  readonly unsupported: readonly string[];
  readonly connection: ConnectionState;
  /** The outcome of the last connection attempt that did not connect. */
  readonly notice: "rejected" | "failed" | null;
  /** Set by the purchase panel while a purchase must keep its wallet (the panel's own lock rule). */
  readonly disconnectLocked: boolean;
  /** Which flow holds the lock, for its wording (`purchase` when both do); `null` when unlocked. */
  readonly disconnectLockHolder: DisconnectLockHolder | null;
};

/** The flows that may lock Disconnect: the purchase panel and the sale panel. */
export type DisconnectLockHolder = "purchase" | "sale";

export type WalletSessionAdapter = {
  watchWallets(onChange: (wallets: { supported: WalletOption[]; unsupported: string[] }) => void): () => void;
  connectWallet(id: string): Promise<{ kind: "connected"; address: string; name: string } | { kind: "rejected" } | { kind: "failed" }>;
  disconnectWallet(id: string): Promise<void>;
  watchConnectedAccount(id: string, address: string, onGone: () => void): () => void;
  /** Silent reconnect of a remembered wallet; never prompts. Absent: no silent reconnect. */
  reconnectWallet?(id: string): Promise<{ kind: "connected"; address: string; name: string } | { kind: "rejected" } | { kind: "failed" }>;
  /** The remembered wallet (its name only). Absent: nothing is remembered. */
  memory?: WalletMemory;
};

/** Where the name of the last connected wallet is kept. Failures read as "nothing remembered". */
export type WalletMemory = {
  read(): string | null;
  write(walletId: string | null): void;
};

export type WalletSession = {
  getState(): WalletSessionState;
  subscribe(listener: () => void): () => void;
  /** Start reading the wallet registry (browser only). Returns the stop function. */
  start(): () => void;
  /** Ask one detected wallet to connect. Explicit user action only. */
  connect(walletId: string): void;
  /** Disconnect the connected wallet, unless the purchase panel holds the lock. */
  disconnect(): void;
  /**
   * Lock or unlock Disconnect for one holder (the purchase and the sale each
   * hold their own lock); Disconnect stays locked while any holder locks it.
   */
  setDisconnectLocked(locked: boolean, holder?: DisconnectLockHolder): void;
};

export const INITIAL_WALLET_SESSION: WalletSessionState = {
  detection: "pending",
  wallets: [],
  unsupported: [],
  connection: { kind: "disconnected" },
  notice: null,
  disconnectLocked: false,
  disconnectLockHolder: null,
};

export function createWalletSession(adapter: WalletSessionAdapter, initial: WalletSessionState = INITIAL_WALLET_SESSION): WalletSession {
  let state = initial;
  const listeners = new Set<() => void>();
  let stopAccountWatch: (() => void) | null = null;
  /** One silent attempt per session, only for the remembered wallet. */
  let reconnectAttempted = false;

  function set(next: WalletSessionState) {
    if (next === state) return;
    state = next;
    for (const listener of listeners) listener();
  }

  function clearAccountWatch() {
    stopAccountWatch?.();
    stopAccountWatch = null;
  }

  function becomeConnected(walletId: string, outcome: { address: string; name: string }) {
    set({ ...state, notice: null, connection: { kind: "connected", walletId, walletName: outcome.name, address: outcome.address } });
    adapter.memory?.write(walletId);
    clearAccountWatch();
    // The wallet itself removed the account (locked, switched or disconnected): the lock does not apply.
    stopAccountWatch = adapter.watchConnectedAccount(walletId, outcome.address, () => {
      const current = state.connection;
      if (current.kind === "connected" && current.walletId === walletId && current.address === outcome.address) {
        clearAccountWatch();
        set({ ...state, connection: { kind: "disconnected" } });
      }
    });
  }

  function maybeReconnect() {
    if (reconnectAttempted || !adapter.reconnectWallet || state.connection.kind !== "disconnected") return;
    const remembered = adapter.memory?.read() ?? null;
    if (!remembered || !state.wallets.some((wallet) => wallet.id === remembered)) return;
    reconnectAttempted = true;
    void adapter.reconnectWallet(remembered).then(
      (outcome) => {
        // A connect the user started meanwhile, or any other change, wins over the silent attempt.
        if (outcome.kind !== "connected" || state.connection.kind !== "disconnected") return;
        becomeConnected(remembered, outcome);
      },
      () => undefined,
    );
  }

  const lockHolders = new Set<DisconnectLockHolder>();
  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start() {
      const stop = adapter.watchWallets(({ supported, unsupported }) => {
        set({ ...state, detection: "done", wallets: supported, unsupported });
        maybeReconnect();
      });
      return () => {
        stop();
        clearAccountWatch();
      };
    },
    connect(walletId) {
      if (state.connection.kind !== "disconnected" || !state.wallets.some((wallet) => wallet.id === walletId)) return;
      set({ ...state, notice: null, connection: { kind: "connecting", walletId } });
      void adapter.connectWallet(walletId).then(
        (outcome) => {
          // A later disconnect or another attempt supersedes this one.
          if (state.connection.kind !== "connecting" || state.connection.walletId !== walletId) return;
          if (outcome.kind !== "connected") {
            set({ ...state, connection: { kind: "disconnected" }, notice: outcome.kind });
            return;
          }
          becomeConnected(walletId, outcome);
        },
        () => {
          if (state.connection.kind === "connecting" && state.connection.walletId === walletId) set({ ...state, connection: { kind: "disconnected" }, notice: "failed" });
        },
      );
    },
    disconnect() {
      const current = state.connection;
      if (current.kind !== "connected" || state.disconnectLocked) return;
      clearAccountWatch();
      // An explicit disconnect (or Switch wallet) is also "do not reconnect next time".
      adapter.memory?.write(null);
      void adapter.disconnectWallet(current.walletId);
      set({ ...state, connection: { kind: "disconnected" }, notice: null });
    },
    setDisconnectLocked(locked, holder = "purchase") {
      if (locked) lockHolders.add(holder);
      else lockHolders.delete(holder);
      const anyLocked = lockHolders.size > 0;
      const lockHolder: DisconnectLockHolder | null = lockHolders.has("purchase") ? "purchase" : lockHolders.has("sale") ? "sale" : null;
      if (state.disconnectLocked !== anyLocked || state.disconnectLockHolder !== lockHolder) set({ ...state, disconnectLocked: anyLocked, disconnectLockHolder: lockHolder });
    },
  };
}
