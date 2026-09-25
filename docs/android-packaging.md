# Android packaging (Solana Seeker, dApp Store): what is needed

Preparation only. Nothing here is built, signed or submitted, and no submission is authorized (app IA section 10). Sources checked 2026-09-24: Solana Mobile docs (`docs.solanamobile.com`: "Build and Sign an APK", "Submit a New App", "dApp Publishing CLI", "solana-mobile webshell", "Local Network Access Permission") and Chrome's Trusted Web Activity docs.

## Wrapper choice: TWA or WebView shell

The IA names a Trusted Web Activity (TWA) built with Bubblewrap. Solana Mobile's current guidance for web apps is different: `solana-mobile webshell` generates an Android **WebView shell**, because browsers are rolling out Local Network Access restrictions that break Mobile Wallet Adapter (MWA) connections from web pages, "including TWA-based wrappers such as Bubblewrap APKs". The shell handles wallet intents natively and needs no Digital Asset Links.

| | TWA (Bubblewrap) | WebView shell (`solana-mobile webshell`) |
| --- | --- | --- |
| Engine | the user's Chrome, same storage as Chrome for the origin | Android WebView inside the app, its own storage |
| URL bar hidden | only after Digital Asset Links verify | always |
| Needs `/.well-known/assetlinks.json` | yes | no |
| MWA wallet connection | page talks to the wallet over the local network; subject to Local Network Access | intents handled by the shell |
| Input | web manifest | web manifest or Bubblewrap `twa-manifest.json` |

Recommendation (for the user decision): the WebView shell for the dApp Store, because the wallet path is the product's purpose on Seeker and Solana Mobile ships it for exactly this case. Device gate AND-W0 (IA section 10) still applies to whichever wrapper is chosen, and the Activity storage copy must match it (WebView storage is not Chrome's).

Separately, Benten's Web app discovers wallets only through the Wallet Standard registry. In Android Chrome an MWA wallet appears there only when the page registers it through `@solana-mobile/wallet-standard-mobile` (v0.5.0 or later for Local Network Access; v0.5.1 or later to detect the shell). `apps/public-web` depends on it (pinned 0.6.0) and registers the MWA wallet on Android only: the app shell tests the user agent and, on Android, loads the registration as a dynamic chunk before it first reads the registry (`app/features/wallet-session/mobile-wallet.ts`). Desktop and iOS browsers never download that chunk. The MWA wallet is then one more Wallet Standard wallet: the purchase rule (sign-and-send on Solana mainnet) decides whether it is offered, and the one approval request still comes only from the purchase island. When a connect finds no wallet app on the device, the wallet menu says so instead of the library's own dialog. Whether a real wallet app completes a purchase this way is still device gate AND-W0.

## What each path needs

**Both**

- A public HTTPS origin serving the manifests and icons (`docs/decisions/pwa-install-surface.md`).
- An Android application id (package name), for example `world.<owner-domain>.benten`. It is permanent: the dApp Store matches later releases by it. Not chosen yet.
- A signing key: one keystore per app (`keytool -genkey -v -keystore <name>.keystore -alias <alias> -keyalg RSA -keysize 2048 -validity 10000`). Every update must be signed with the same key; losing it means the app can never be updated. The keystore and its passwords never enter this repository (check-publishable rejects private keys, and `.env*` files are ignored); where they are kept is an owner decision.
- `versionCode` / `versionName` per release.

**TWA only**

- `/.well-known/assetlinks.json` listing the package name and the SHA-256 fingerprint of the signing certificate (`keytool -list -v -keystore <name>.keystore -alias <alias>`). If the store re-signs, the store's fingerprint goes there too.
- A host route for it: `apps/public-web/ingress/classify.ts` sends unknown paths to 404, and the host serves only prerendered files, so the file needs an explicit static rule. **Not added**: the path stays 404 (a host test asserts it) until the package name and fingerprint exist, so no placeholder can be verified against a wrong app.
- Chrome's TWA quality rules treat a failed asset-link check, an offline navigation without a 200, and a 404/5xx navigation as app crashes. Whether this still ends the session on current Chrome must be checked on a device; if it does, the static-only worker described in the PWA decision is the fix.
- Bubblewrap: `bubblewrap init --manifest=https://<origin>/manifest.webmanifest`, then `bubblewrap build`.

**WebView shell only**

- JDK 17 or newer and the Android SDK (`solana-mobile doctor` checks).
- `pnpm dlx solana-mobile@latest webshell init <dir> --manifest https://<origin>/manifest.webmanifest --application-id <id>`; it creates the keystore when the path does not exist. `webshell build <dir>` writes `app/build/outputs/apk/release/app-release.apk`.
- External links (Solana Explorer, filings, provider sites) open in the system browser; links inside the configured host stay in the shell.

## dApp Store submission

- **Publisher Portal** (`publish.solanamobile.com`): sign up, complete the publisher profile and KYC/KYB verification, and connect a publisher wallet (a browser extension wallet; every later submission of the app needs the same wallet) with about 0.2 SOL for transactions and Arweave (or other storage) upload costs. Creating the app mints its App NFT; each submitted APK mints a release NFT, with several signatures in the publisher wallet.
- **Listing**: name, description, icon, screenshots from the real app, category, privacy policy (IA 8.12), region and financial-content statements, and the issuer's US-person restriction. Read the Publisher Policy and Developer Agreement first; whether a purchase UI for tokenized equities fits the policy is part of that reading.
- **Review**: results come by email from the store within 3 to 5 business days, in submission order; approved apps go live at once.
- **Updates**: the Portal, or the `dapp-store` CLI (`npm install -g @solana-mobile/dapp-store-cli`), which needs the App NFT to exist, a Solana CLI keypair file (`--keypair`) and a Portal API key in `DAPP_STORE_API_KEY`. The Portal matches the APK to the app by package name.

## Open items before any build

1. Wrapper: WebView shell (recommended) or TWA.
2. Package name, keystore owner and storage.
3. Publisher identity and wallet; who signs the store transactions.
4. Device gate AND-W0 on a physical Seeker with the chosen wrapper, using the MWA registration the Web app now ships.
