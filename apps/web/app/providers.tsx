"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";

import "@solana/wallet-adapter-react-ui/styles.css";

const DEFAULT_RPC_URL = "https://api.mainnet-beta.solana.com";
const MAINNET_CHAIN = "solana:mainnet";
const APP_NAME = "Benten";
const APP_ICON = "/favicon.ico";

/**
 * Register Mobile Wallet Adapter with the Wallet Standard.
 *
 * Per the Solana Mobile docs this must run in the browser, never during SSR.
 * `registerMwa` itself also refuses to register without a `window` and
 * without a secure context, so this is belt and braces.
 *
 * Registration is attempted once per page load. The local (Android intent)
 * flow needs no configuration. The remote flow additionally needs a
 * reflector host authority; it is read from a public env var rather than
 * being invented here, and is simply absent when unset.
 */
let mwaRegistered = false;

async function registerMobileWalletAdapter(): Promise<void> {
  if (mwaRegistered || typeof window === "undefined") return;
  mwaRegistered = true;

  const {
    registerMwa,
    createDefaultAuthorizationCache,
    createDefaultChainSelector,
    createDefaultWalletNotFoundHandler,
  } = await import("@solana-mobile/wallet-standard-mobile");

  const remoteHostAuthority = process.env.NEXT_PUBLIC_MWA_REMOTE_HOST_AUTHORITY;

  registerMwa({
    appIdentity: {
      name: APP_NAME,
      uri: window.location.origin,
      icon: APP_ICON,
    },
    authorizationCache: createDefaultAuthorizationCache(),
    chains: [MAINNET_CHAIN],
    chainSelector: createDefaultChainSelector(),
    onWalletNotFound: createDefaultWalletNotFoundHandler(),
    ...(remoteHostAuthority ? { remoteHostAuthority } : {}),
  });
}

export function Providers({ children }: { children: ReactNode }) {
  const endpoint = useMemo(
    () => process.env.NEXT_PUBLIC_SOLANA_RPC_URL || DEFAULT_RPC_URL,
    [],
  );

  useEffect(() => {
    void registerMobileWalletAdapter().catch((error: unknown) => {
      // A failed wallet registration must never take the page down; the rest
      // of the site is fully usable without a wallet.
      console.warn("Mobile Wallet Adapter registration failed", error);
    });
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      {/*
        `wallets={[]}` on purpose: every Wallet Standard wallet (including the
        Mobile Wallet Adapter registered above) is auto-detected.
        `autoConnect={false}` on purpose: Benten never reconnects or prompts a
        wallet without an explicit user action.
      */}
      <WalletProvider wallets={[]} autoConnect={false}>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
