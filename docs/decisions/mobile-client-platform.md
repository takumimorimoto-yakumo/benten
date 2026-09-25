---
id: mobile-client-platform
title: Use mobile Web for the deadline and validate separate SwiftUI and Compose clients next
date: 2026-09-17
status: decided
tags: [mobile, ios, android, web, wallet, portfolio]
repos: [benten]
plan_start: 2026-09-17
plan_end: 2026-09-17
---

# Mobile client platform decision

## Decision in one page

The user-confirmed sequence is:

1. keep the existing React Router/Vite mobile Web application as the required Stocklana delivery surface;
2. preserve the one-intent browser purchase contract and selected Main + Meteora + PreStocks + Tessera evidence plan through the Sep 26 deadline;
3. begin bounded, no-funds native feasibility in parallel, without calling either platform supported;
4. use **Swift + SwiftUI** for a future iOS client and **Kotlin + Jetpack Compose** for a future Android client if their separate wallet-return, receipt-recovery, accessibility, legal/distribution and physical-device gates pass;
5. share versioned public wire schemas, byte-level golden fixtures, state vectors and policy outcomes across clients, not UI code or a TypeScript runtime bridge.

Mobile Web is the required hackathon surface; native clients are the next-stage direction rather than an additional deadline deliverable. The exact iOS/Android toolchains, wallets, supported devices and distribution paths remain unverified feasibility gates. This decision does not create an iOS/Android target, install a dependency, connect a wallet, submit to a store or change the current no-sign/no-send repository state. Any later proposal to make a native binary part of the deadline would require a new decision and reviewed re-baseline; it may not silently take time from the Web purchase proof, selected sponsor proofs or protected UX window.

“Mobile-first” describes the investor journey and acceptance conditions. “Mobile Web”, “PWA”, “iOS app” and “Android app” are different packages with different security and distribution evidence. None is a synonym for the others.

## Context and fixed constraints

The desired product is a self-custody investor application: research an exact instrument, set the investor's own amount and allocation target, review executable conditions, approve one purchase in the investor's wallet, reconcile finality and the resulting holding, then review a timestamped portfolio. Sell and multi-leg continuation follow only after separate proofs. Issuing a new product, pooling other people's money, discretionary management, robo-advice and delegated spending authority are different products and remain outside this plan.

The code-generation, migration and human-learning costs of native implementations are intentionally assigned zero weight by the user. Runtime correctness, wallet capability, device lifecycle, accessibility, test coverage, store policy, legal scope, operations and external fees are not zeroed.

Current facts remain:

- the implemented public capsule is React Router/Vite; it is not a native application and is not yet an accepted investor UI;
- shadcn applies only to Web. A native client uses its platform's standard SwiftUI or Compose controls and must not embed shadcn DOM or copy its generated CSS;
- the purchase plan proves at most one exact stock mint, one spend mint and one selected venue; it does not prove a portfolio of purchasable instruments;
- the browser execution contract is browser-specific. Its acceptance cannot be copied to iOS or Android;
- Benten servers and the reusable connectivity owner do not hold keys, sign, send, retain signed bytes or operate a server order ledger;
- the selected sponsor lanes remain Main + Meteora DBC + PreStocks + Tessera. The DLMM purchase route is not DBC award proof, and PreStocks/Tessera instruments are not presumed purchasable.

## Alternatives

| Option | What it proves well | Material unresolved risks | Decision |
| --- | --- | --- | --- |
| React Router/Vite responsive Web | URL-accessible common read surface; current routing/static foundation; keyboard and Web accessibility; distribution does not depend on app-store review | mobile wallet compatibility, browser storage erasure, callback lifecycle and installability still need proof | **required deadline surface** |
| Installable PWA | home-screen shell and bounded offline read experience if separately implemented | does not prove native wallet return, background behavior, secure receipt durability or store acceptance | later Web enhancement, not native evidence |
| Swift + SwiftUI | platform-native navigation, scene lifecycle, Dynamic Type, VoiceOver and app storage APIs | exact Solana wallet handoff/sign-only return, callback authenticity, cold-start recovery and distribution are unproved | **recommended iOS candidate** |
| Kotlin + Jetpack Compose | platform-native lifecycle, predictive Back, TalkBack and Android wallet-adapter feasibility | exact wallet feature/version, process recreation, callback replay and device coverage are unproved | **recommended Android candidate** |
| React Native / Expo | one JavaScript-oriented presentation/runtime layer | code-sharing labor savings are not scored; adds JS-runtime/native-module/binding and wallet-module compatibility boundaries without eliminating native QA | not selected; retain only if a native capability spike disproves the platform clients |
| Capacitor | wraps more Web code in an app package | code-sharing labor savings are not scored, while WebView wallet/deep-link/storage/lifecycle behavior remains a new native boundary | not selected |
| Kotlin Multiplatform or another shared native core | can centralize selected pure logic and reduce semantic drift | no measured safety/performance advantage for the current wallet/receipt boundary; could obscure which platform lifecycle owns a failure | not selected now; reconsider only for a measured pure-domain need after conformance fixtures exist |

SwiftUI and Compose are selected as candidates because they make platform lifecycle and accessibility explicit, not because this plan has measured superior performance or safety. Code sharing still has quality value where one source prevents semantic drift: reusable backend capability, versioned wire contracts, generated schemas and golden state vectors stay common. Wallet callbacks, receipt durability and UI lifecycle remain separately implemented and accepted. Official [SwiftUI](https://developer.apple.com/documentation/swiftui/) and [Compose](https://developer.android.com/develop/ui/compose/first) documentation establishes the platform UI foundations; it does not prove this application's wallet, transaction, performance or security behavior.

## Wallet and transaction boundary

Each client independently implements the same semantic sequence:

`facts/identity -> audited context -> immutable review -> external wallet gesture -> returned signed message validation -> one client submission -> signature reconciliation -> causal holding`

The shared public contract supplies closed DTOs and expected outcomes. Platform code owns its wallet session, local lifecycle and presentation. No client accepts another client's runtime evidence.

### iOS feasibility

The current Solana Mobile iOS guide states that Mobile Wallet Adapter is not supported on iOS. A wallet-specific deep-link sign-only flow is therefore only a candidate. The current Phantom documentation indicates a sign-transaction flow can return signed transaction data without the wallet submitting it, but callback scheme, callback authenticity, application identity, cold start, replay, account/network change and full message equality must pass on physical devices. HTTPS callback behavior must not be assumed to return to a native app. A wallet-specific integration is not generalized into “iOS wallets supported.”

### Android feasibility

[Mobile Wallet Adapter Kotlin](https://docs.solanamobile.com/get-started/kotlin/installation) artifacts are candidates only after an exact pin, provenance and capability spike. A quickstart using wallet-side sign-and-send is incompatible with Benten's audit-after-sign and one-direct-send design. P0 requires an independently proven sign-only result, exact returned message equality, signature derivation, durable pre-send state and one direct client submission. If the selected wallet cannot provide that behavior, Android purchase stays unavailable even if read-only Portfolio ships.

### Common hard stops

- returned transaction/message differs from the reviewed bytes;
- opaque wallet-side send prevents Benten from recording the known signature before its one send;
- callback lacks bound attempt generation, app identity, account, cluster and anti-replay validation;
- the exact account/network changes between context, review and wallet return;
- the transaction is expired, policy/ABI digest changed or any required amount/fee/minimum is unknown;
- a native package would require a server signer, relay, signed-byte upload, reusable spending permission or silent retry.

These stops disable native purchase; they do not weaken the shared contract or switch to a different execution API.

## Receipt, privacy and cross-client behavior

The native receipt contains public onchain facts, but the receipt itself is **private local state** because it also binds a wallet, amount, target, attempt and recovery history. It is not a private key or a recommendation. The proposed physical stores are:

- iOS: app-sandbox SQLite receipt store with an integrity key held in Keychain and excluded from ordinary shared containers/backups until restore semantics are reviewed;
- Android: app-sandbox Room/SQLite receipt store with an integrity key held by Android Keystore and backup/restore explicitly disabled until migration tests pass.

Exact minimum OS, SQLite/Room wrapper and key-accessibility classes are pinned only in the platform feasibility capsules. Target allocation is private local planning state in a separate namespace from attempt receipts. Logs, analytics, crash reports and support exports redact wallet, target, amount, message, signature and receipt details unless an explicit public-safe projection is approved.

An accepted receipt state is clone/freeze/canonicalization tested against the same public state vectors, but the physical implementation and migrations receive separate native tests. Before wallet handoff the durable record binds the reviewed context and attempt generation. Signed bytes remain ephemeral. Only a branch that durably proves `send_invoked=false` before the send marker may fence a signed-but-unsent attempt and require a new context/review/gesture. If the durable marker was written or its write/send ordering cannot be proved after a crash, the attempt stays locked as unknown and performs read-only reconciliation; it never assumes “unsent.” After send invocation, only read-only reconciliation of the exact known signature is allowed. Full app deletion, storage loss, another device or an unbound Web profile cannot prove absence of a prior transaction.

Local Web and native locks cannot provide global exactly-once behavior across devices. Deadline P0 therefore supports only one active execution surface per released build and displays the limitation before enabling another surface. It never claims a server-enforced global lock. A later cross-client attempt service would require a new privacy/security contract and explicit authority because it introduces server-side attempt state; it is not inferred by this decision.

## Portfolio boundary

P0 Portfolio is not an order-management system. It consists of:

- exact connected account and cluster;
- exact holdings with raw/display basis and observation slot/time;
- reference/valuation kind, source, currency, coverage and `as of`, or explicit unknown/stale;
- a local user-authored allocation target labelled as the user's plan, not a recommendation;
- drift only over sufficiently known values;
- an entry into one exact supported purchase intent.

Unknown value is not zero. Incomplete price coverage cannot produce a total, performance or target percentage that appears complete. Missing acquisition cost cannot produce profit/loss. An unsupported target may remain in the user's plan but has no purchase control. One supported route cannot be described as a completed multi-asset portfolio.

Sell is a separate P1 contract. It does not reverse a buy quote, reuse buy minimum/fee assumptions, or assume liquidity. Every sell route, transfer extension, approval, receipt, causal balance and legal condition must be independently demonstrated.

## Distribution and release

The deadline Web route remains subject to issuer/legal/region rules. Native packaging does not bypass them. Apple review requirements, including the financial and minimum-functionality sections of the [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), are external release gates rather than an estimated review-duration problem. Android distribution, privacy disclosures, signing identities, wallet availability and region rules receive the same source-backed review before any store claim.

No store account, bundle identifier, signing certificate, application link, universal link, upload or review submission is authorized by this ADR. A local simulator build is not distribution evidence; a TestFlight/internal-test or store build is not a public launch.

## Consequences and reversal

Positive consequences:

- deadline work remains concentrated on the already planned Web investor proof;
- native clients can use platform-native lifecycle/accessibility without forcing Web conventions into them;
- schema/state parity is testable without sharing unsafe wallet/runtime code;
- portfolio, purchase and sponsor proofs retain distinct completion bars.

Costs that remain even when code generation is free include two independent wallet integrations, two persistence/migration implementations, physical devices, accessibility/runtime QA, store/legal review, CI/signing operations, RPC/provider usage and ongoing security updates. Unknown cost is recorded as unknown, not zero; no purchase is authorized here.

Reverse this recommendation before native implementation if physical-device feasibility shows that the required sign-only/audit/one-send model is unavailable on a platform, or if a selected distribution route cannot meet legal/privacy/review gates. Reversal returns that platform to read-only or does not ship it; it does not relax transaction safety or substitute a Web wrapper without its own acceptance.
