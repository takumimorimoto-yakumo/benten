/**
 * Registers the Mobile Wallet Adapter wallet (Android only; see
 * `mobile-wallet.ts`). Loaded by a dynamic import, so the MWA library and the
 * Solana SDK it carries stay out of the shell's static graph.
 *
 * Only registration happens here. The MWA wallet is a Wallet Standard wallet
 * like any other: detection, connect and disconnect go through
 * `@benten/purchase/wallet-standard`, and the one wallet approval request
 * still comes only from the purchase island's `approveOnce`.
 */
import { createDefaultAuthorizationCache, createDefaultChainSelector, registerMwa } from "@solana-mobile/wallet-standard-mobile";
import { PURCHASE_CONFIG } from "@benten/purchase/config";
import { MOBILE_WALLET_APP_IDENTITY } from "./mobile-wallet";

export function registerMobileWallet({ origin, onWalletAppMissing }: { origin: string; onWalletAppMissing: () => void }): void {
  registerMwa({
    appIdentity: { name: MOBILE_WALLET_APP_IDENTITY.name, uri: origin, icon: MOBILE_WALLET_APP_IDENTITY.icon },
    // The purchase route's one chain; the default selector returns it.
    chains: [PURCHASE_CONFIG.chain],
    // The library's cache: filled only by a user-started connect, cleared by the wallet's disconnect.
    authorizationCache: createDefaultAuthorizationCache(),
    chainSelector: createDefaultChainSelector(),
    // No wallet app answered: the wallet menu shows its own guidance instead of the library's dialog.
    onWalletNotFound: async () => onWalletAppMissing(),
  });
}
