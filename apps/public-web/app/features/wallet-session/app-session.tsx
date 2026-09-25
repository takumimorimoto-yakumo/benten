/**
 * App-shell context: the one wallet session, and the host that keeps the
 * purchase island running once it has been loaded.
 *
 * The provider sits in the root route, above every page, so a client-side
 * navigation never recreates it: the connection, and a purchase being
 * tracked, survive switching tabs and pages. The purchase island is still
 * loaded only by the NVDA page (a dynamic import in `purchase-slot.tsx`); it
 * hands this host its runtime once, and the host keeps that runtime mounted
 * for the rest of the visit. The shell itself never imports the island, so
 * its Solana SDK and DEX code stay out of every other page's graph.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentType, type ReactNode } from "react";
import { connectWallet, disconnectWallet, reconnectWallet, watchConnectedAccount, watchWallets } from "@benten/purchase/wallet-standard";
import type { PublicWebLocale } from "@/i18n/locales";
import { createWalletSession, INITIAL_WALLET_SESSION, type WalletSession, type WalletSessionAdapter, type WalletSessionState } from "./wallet-session";
import { browserLocalStorage, createWalletMemory } from "./wallet-memory";
import { browserEnvironment, registerMobileWallet } from "./mobile-wallet";

export type InstalledPurchase = {
  /** Wallet bridge, previews, tracking and result reads. Renders nothing; mounted once by the shell. */
  readonly Runtime: ComponentType;
  /** The purchase panel, bound to the same purchase state. `flow` renders it as the buy flow (Close and step line). */
  readonly Panel: ComponentType<{ locale: PublicWebLocale; flow?: { readonly leading: ReactNode } }>;
  /** The shell's status line while a sent purchase is tracked (app IA 5.1); renders nothing otherwise. */
  readonly Status: ComponentType<{ locale: PublicWebLocale }>;
  /** Fill an empty amount field with an already-checked link amount; never starts a preview or a wallet request. */
  readonly prefillAmount: (text: string) => boolean;
};

type AppSession = {
  readonly session: WalletSession;
  readonly purchase: InstalledPurchase | null;
  /** Install the purchase island once; later calls keep the first installation and its state. */
  installPurchase(create: () => InstalledPurchase): void;
};

const BROWSER_WALLETS: WalletSessionAdapter = {
  watchWallets,
  connectWallet,
  disconnectWallet,
  watchConnectedAccount,
  // Silent reconnect of the wallet the user connected in this browser before (never a prompt).
  reconnectWallet,
  memory: createWalletMemory(browserLocalStorage),
};

/** Outside the provider (prerender tests, isolated renders): an inert session that never reads the wallet registry. */
const INERT_ADAPTER: WalletSessionAdapter = {
  watchWallets: () => () => undefined,
  connectWallet: async () => ({ kind: "failed" }),
  disconnectWallet: async () => undefined,
  watchConnectedAccount: () => () => undefined,
};

const AppSessionContext = createContext<AppSession>({
  session: createWalletSession(INERT_ADAPTER),
  purchase: null,
  installPurchase: () => undefined,
});

export function AppSessionProvider({ children }: { children: ReactNode }) {
  const [session] = useState(() => createWalletSession(BROWSER_WALLETS));
  // Browser only: the prerender never reads a wallet registry.
  useEffect(() => {
    const environment = browserEnvironment();
    // Android: register the Mobile Wallet Adapter wallet first, so the first read of the registry already lists it.
    const registration = environment ? registerMobileWallet(environment) : null;
    if (!registration) return session.start();
    let active = true;
    let stop: (() => void) | null = null;
    void registration.then(() => {
      if (active) stop = session.start();
    });
    return () => {
      active = false;
      stop?.();
    };
  }, [session]);
  const installed = useRef<InstalledPurchase | null>(null);
  const [purchase, setPurchase] = useState<InstalledPurchase | null>(null);
  const installPurchase = useCallback((create: () => InstalledPurchase) => {
    if (installed.current) return;
    installed.current = create();
    setPurchase(installed.current);
  }, []);
  const value = useMemo(() => ({ session, purchase, installPurchase }), [session, purchase, installPurchase]);
  const Runtime = purchase?.Runtime;
  return (
    <AppSessionContext.Provider value={value}>
      {Runtime ? <Runtime /> : null}
      {children}
    </AppSessionContext.Provider>
  );
}

export function useAppSession(): AppSession {
  return useContext(AppSessionContext);
}

/** The session state, re-rendering on every change. The prerender sees the initial, disconnected state. */
export function useWalletSessionState(): WalletSessionState {
  const { session } = useAppSession();
  return useSyncExternalStore(session.subscribe, session.getState, () => INITIAL_WALLET_SESSION);
}
