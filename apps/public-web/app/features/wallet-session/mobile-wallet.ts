/**
 * Mobile Wallet Adapter (MWA) on Android.
 *
 * Android Chrome has no injected wallet: a Solana wallet app answers the page
 * only through MWA, and it appears in the Wallet Standard registry only when
 * the page registers the MWA wallet itself. So on Android, and only there, the
 * app shell registers it once, before it first reads the registry. The MWA
 * wallet is then one more Wallet Standard wallet: the session detects,
 * connects and disconnects it through `@benten/purchase/wallet-standard`
 * exactly like an injected one, and the purchase rule (sign-and-send on
 * Solana mainnet) decides whether it is offered.
 *
 * This module stays in the shell's small static graph: the MWA library pulls
 * a Solana SDK, so it is loaded by a dynamic import of
 * `mobile-wallet-registration.ts` that runs only on Android. Other browsers
 * never download that chunk.
 *
 * Silent reconnect is unchanged: MWA keeps the wallet's authorization in its
 * authorization cache, which only a user-started connect fills and which the
 * wallet's disconnect clears, so `connect({ silent: true })` restores only an
 * approval the user gave in this browser and nothing after Disconnect.
 */

import { APP_NAME, appIconPath } from "@/features/pwa/pwa-config";

/** Where the page runs. Read once from the browser; tests pass their own. */
export type MobileWalletEnvironment = { readonly userAgent: string; readonly origin: string };

/**
 * What the page tells the wallet app about itself (MWA `appIdentity`): the
 * installed app's name and 192px icon from the PWA install surface. The icon
 * is resolved against the origin.
 */
export const MOBILE_WALLET_APP_IDENTITY = { name: APP_NAME, icon: appIconPath("icon-192.png") } as const;

/**
 * Android, by user agent: the same test the MWA library uses for local
 * association. Android Chrome keeps "Android" in its reduced user agent. The
 * library itself declines Android WebViews (a wallet's in-app browser injects
 * its own wallet), except Solana Mobile's web shell.
 */
export function isAndroidBrowser(userAgent: string): boolean {
  return /android/i.test(userAgent);
}

type RegistrationModule = { registerMobileWallet(options: { origin: string; onWalletAppMissing: () => void }): void };

/**
 * Returns the one registration function for a page. It loads and registers
 * MWA at most once, and only on Android; elsewhere it returns `null` so the
 * caller can read the registry at once. A load that fails leaves the page
 * with the wallets it already has.
 */
export function createMobileWalletRegistrar(load: () => Promise<RegistrationModule>, onWalletAppMissing: () => void) {
  let registration: Promise<void> | null = null;
  return function registerMobileWalletOnce(environment: MobileWalletEnvironment): Promise<void> | null {
    if (registration) return registration;
    if (!isAndroidBrowser(environment.userAgent)) return null;
    registration = load()
      .then((module) => module.registerMobileWallet({ origin: environment.origin, onWalletAppMissing }))
      .catch(() => undefined);
    return registration;
  };
}

/**
 * "No wallet app answered" (MWA `onWalletNotFound`): set when a connect found
 * no MWA wallet app on the device, cleared when the user starts the next
 * connect. The wallet menu shows the guidance while it is set; the session's
 * own notice still says the wallet did not connect.
 */
function createFlag() {
  let value = false;
  const listeners = new Set<() => void>();
  const set = (next: boolean) => {
    if (next === value) return;
    value = next;
    for (const listener of listeners) listener();
  };
  return {
    get: () => value,
    set,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const walletAppMissing = createFlag();

/** The browser's registrar: the MWA chunk is imported only when it is used. */
export const registerMobileWallet = createMobileWalletRegistrar(
  () => import("./mobile-wallet-registration"),
  () => walletAppMissing.set(true),
);

/** The current page, or `null` outside a browser (the prerender). */
export function browserEnvironment(): MobileWalletEnvironment | null {
  if (typeof window === "undefined" || typeof navigator === "undefined") return null;
  return { userAgent: navigator.userAgent, origin: window.location.origin };
}
