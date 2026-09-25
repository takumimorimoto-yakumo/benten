import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDefaultAuthorizationCache, createDefaultChainSelector, LocalSolanaMobileWalletAdapterWallet, SolanaMobileWalletAdapterWalletName } from "@solana-mobile/wallet-standard-mobile";
import { encodeBase58 } from "../../../packages/purchase/src/base58.ts";
import { disconnectWallet, isSupportedWallet, listWallets, reconnectWallet } from "../../../packages/purchase/src/wallet-standard.ts";
import { createMobileWalletRegistrar, isAndroidBrowser, MOBILE_WALLET_APP_IDENTITY, type MobileWalletEnvironment } from "../app/features/wallet-session/mobile-wallet.ts";
import { webManifestFor } from "../app/features/pwa/web-manifest.server.ts";

const ORIGIN = "https://benten.example";
const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";
const SEEKER_CHROME = "Mozilla/5.0 (Linux; Android 15; Seeker) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";
const DESKTOP_CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const MAINNET = "solana:mainnet";

const environment = (userAgent: string): MobileWalletEnvironment => ({ userAgent, origin: ORIGIN });

function registrar() {
  const registerMobileWallet = vi.fn();
  const load = vi.fn(async () => ({ registerMobileWallet }));
  const onWalletAppMissing = vi.fn();
  return { register: createMobileWalletRegistrar(load, onWalletAppMissing), load, registerMobileWallet, onWalletAppMissing };
}

describe("Mobile Wallet Adapter registration", () => {
  it("tells the wallet app the installed app's name and 192px icon", () => {
    const manifest = webManifestFor("en");
    expect(MOBILE_WALLET_APP_IDENTITY.name).toBe(manifest.name);
    expect(manifest.icons.find((icon) => icon.sizes === "192x192")?.src).toBe(MOBILE_WALLET_APP_IDENTITY.icon);
  });

  it("is Android only: other browsers never load the MWA chunk", () => {
    expect(isAndroidBrowser(ANDROID_CHROME)).toBe(true);
    expect(isAndroidBrowser(SEEKER_CHROME)).toBe(true);
    for (const userAgent of [DESKTOP_CHROME, IPHONE_SAFARI]) {
      const { register, load } = registrar();
      expect(isAndroidBrowser(userAgent)).toBe(false);
      expect(register(environment(userAgent))).toBeNull();
      expect(load).not.toHaveBeenCalled();
    }
  });

  it("loads and registers once per page, however often the shell starts", async () => {
    const { register, load, registerMobileWallet, onWalletAppMissing } = registrar();
    const first = register(environment(ANDROID_CHROME));
    const second = register(environment(ANDROID_CHROME));
    expect(first).not.toBeNull();
    expect(second).toBe(first);
    await first;
    await register(environment(ANDROID_CHROME));
    expect(load).toHaveBeenCalledTimes(1);
    expect(registerMobileWallet).toHaveBeenCalledTimes(1);
    expect(registerMobileWallet).toHaveBeenCalledWith({ origin: ORIGIN, onWalletAppMissing });
  });

  it("settles when the chunk cannot load, so the shell still reads the other wallets", async () => {
    const register = createMobileWalletRegistrar(async () => { throw new Error("offline"); }, () => undefined);
    await expect(register(environment(ANDROID_CHROME))).resolves.toBeUndefined();
  });

  it("the MWA wallet passes the purchase rule (sign-and-send on Solana mainnet, connect) before any connect", () => {
    const wallet = new LocalSolanaMobileWalletAdapterWallet({
      appIdentity: { name: MOBILE_WALLET_APP_IDENTITY.name, uri: ORIGIN, icon: MOBILE_WALLET_APP_IDENTITY.icon },
      authorizationCache: createDefaultAuthorizationCache(),
      chains: [MAINNET],
      chainSelector: createDefaultChainSelector(),
      onWalletNotFound: async () => undefined,
    });
    expect(wallet.chains).toEqual([MAINNET]);
    expect(isSupportedWallet(wallet)).toBe(true);
  });
});

describe("the registered MWA wallet in an emulated Android Chrome", () => {
  const storage = new Map<string, string>();
  const ADDRESS = encodeBase58(new Uint8Array(32).fill(9));
  const CACHE_KEY = "SolanaMobileWalletAdapterDefaultAuthorizationCache";

  beforeAll(async () => {
    const page = Object.assign(new EventTarget(), {
      isSecureContext: true,
      location: { origin: ORIGIN },
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => void storage.set(key, value),
        removeItem: (key: string) => void storage.delete(key),
      },
      matchMedia: () => ({ matches: false }),
    });
    vi.stubGlobal("window", page);
    vi.stubGlobal("navigator", { userAgent: ANDROID_CHROME });
    vi.stubGlobal("document", { referrer: "" });
    const { registerMobileWallet } = await import("../app/features/wallet-session/mobile-wallet-registration.ts");
    registerMobileWallet({ origin: ORIGIN, onWalletAppMissing: () => undefined });
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("appears in the wallet list as a supported wallet", () => {
    const { supported, unsupported } = listWallets();
    expect(supported).toEqual([{ id: SolanaMobileWalletAdapterWalletName, name: SolanaMobileWalletAdapterWalletName }]);
    expect(unsupported).toEqual([]);
  });

  it("silent reconnect starts no wallet association when nothing was approved in this browser", async () => {
    storage.clear();
    await expect(reconnectWallet(SolanaMobileWalletAdapterWalletName)).resolves.toEqual({ kind: "failed" });
  });

  it("silent reconnect restores only the approval cached by an earlier connect, and nothing after Disconnect", async () => {
    storage.set(CACHE_KEY, JSON.stringify({
      auth_token: "fixture",
      chain: MAINNET,
      accounts: [{ address: ADDRESS, chains: [MAINNET], features: [] }],
      capabilities: { features: [], supports_sign_and_send_transactions: true },
    }));
    await expect(reconnectWallet(SolanaMobileWalletAdapterWalletName)).resolves.toEqual({ kind: "connected", address: ADDRESS, name: SolanaMobileWalletAdapterWalletName });
    await disconnectWallet(SolanaMobileWalletAdapterWalletName);
    expect(storage.has(CACHE_KEY)).toBe(false);
    await expect(reconnectWallet(SolanaMobileWalletAdapterWalletName)).resolves.toEqual({ kind: "failed" });
  });
});
