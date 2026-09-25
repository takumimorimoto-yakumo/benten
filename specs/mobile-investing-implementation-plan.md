# Benten mobile investing implementation plan

Status: **proposed plan; no mobile UI, PWA, native target, wallet support, portfolio runtime, sell route, dependency, store package or release has been implemented or accepted** (2026-09-17).

Product precedence: the user has accepted [agent-first investing](../docs/decisions/agent-first-investing.md) as Benten's product center and the [Web-deadline then native sequence](../docs/decisions/mobile-client-platform.md). This plan remains the broader portfolio/platform delivery proposal; it does not yet specify or authorize the AI orchestration. Older screen acceptance cannot be reused as acceptance of the agent-first journey.

## 0. One-page handoff

### Product direction

Benten should become a self-custody investing application for the investor who wants to **research → set their own amount/allocation → buy → reconcile the holding → review a portfolio → later sell/review**. Portfolio means the investor's exact wallet holdings plus a source- and time-labelled valuation basis and the investor's own target allocation. It does not mean a Benten-issued basket, managed fund, recommendation engine, custody, discretionary trading or pooled third-party capital.

The deadline MVP remains deliberately narrow:

- mobile-first Explore and exact Dossier without wallet gating;
- connected-account holdings and a private user-authored target allocation;
- one exact supported xStock purchase, reviewed and approved one intent at a time;
- Activity with one-send recovery, finality and causal holding evidence;
- truthful unknown/stale/unsupported states;
- separate positive Main, Meteora DBC, PreStocks and Tessera evidence on the same revision.

Sell, automatic rebalance, batch/basket execution, multi-venue routing, all-symbol purchase support, advice/ranking and new product issuance are not P0. Sell is P1 and needs its own quote, fees, minimum, Token-2022, wallet and receipt proof. With one proven route, unsupported target positions remain planned/uninvested; Benten never says the portfolio is complete or offers one-click portfolio purchase.

### Platform sequence

The user-confirmed sequence keeps the existing React Router/Vite mobile Web app as the deadline surface with official default shadcn Web primitives after its existing gates, then validates future **SwiftUI iOS** and **Compose Android** clients. Code generation, migration and developer-learning cost are ignored as directed; the consistency value of common contracts/fixtures remains, and platform wallet lifecycle, persistence, accessibility, legal/store review, operations and physical-device testing are not ignored. Native is a confirmed next-stage direction, not a confirmed compatible implementation or deadline deliverable.

Native and Web share public-safe wire schemas, canonical fixtures and state vectors. They do not share UI code, wallet runtime evidence or acceptance. shadcn is Web-only. iOS/Android use native standard components and each independently proves callback authenticity, returned-message audit, one-send, receipt persistence/recovery, app restart, storage loss, accessibility and real-wallet behavior.

### Delivery order and stop rule

The only executable dependency registry is §8. In summary: freeze shared semantics, implement Web Portfolio/Activity beside the existing purchase/sponsor work, and keep iOS/Android feasibility and transaction adapters as independent later gates. Do not maintain a second summary DAG.

`MOBILE-RC` does not wait for native packaging unless the user makes native delivery mandatory and an amended, reviewed schedule explicitly adds it. Native work stops at feasibility when it threatens the Sep 22 feature freeze, Sep 22–24 protected Web UX window, Sep 25 20:00 packet or selected sponsor proofs. Failure of a native wallet gate produces a read-only candidate or no native release; it never weakens the transaction contract.

### Deadline truth

The official structured deadline was rechecked on 2026-09-17 as **2026-09-25 20:00 UTC / Sep 26 05:00 JST**. The public page still contains conflicting older timeline/judging prose, so form, deadline and track selection are rechecked before submission. Cash pool and selected sponsor scope remain USD 121,000 total, Main plus Meteora DBC (USD 5,000), PreStocks (USD 5,000) and Tessera (USD 6,000), without an eligibility or award claim.

## 1. Authority, precedence and current state

This document is the implementation SSOT for the mobile-first portfolio expansion and native-client sequence. It does not replace these narrower authorities:

- [investor journey IA](../docs/ui-design/investor-journey-plan.md) for current Explore/Dossier/Purchase information semantics;
- [investor UI implementation plan](../docs/ui-design/investor-ui-implementation-plan.md) for the current React Router/Vite/shadcn informational build;
- [purchase-complete MVP plan](stocklana-purchase-mvp-execution-plan.md) and [browser execution contract](contracts/user-authorized-browser-execution-v1.md) for browser transaction behavior;
- [selected-tracks plan](stocklana-selected-tracks-implementation-plan.md) for Main + Meteora DBC + PreStocks + Tessera evidence and release gates;
- [mobile platform ADR](../docs/decisions/mobile-client-platform.md) for the user-confirmed Web-deadline/native-next sequence.
- [agent-first investing ADR](../docs/decisions/agent-first-investing.md) for the accepted product center and the boundary between AI drafts, deterministic validation and user authority.

Where this plan adds Portfolio/Activity or native clients, it adds subcapsules and separate evidence. It does not relabel existing `PX-*`, `UI-*`, `D3-*`, `R0` or sponsor nodes complete. Current repository truth remains snapshot/read-only and no-sign/no-send. This plan authorizes no implementation or external action.

Classification:

| Kind | Statement |
| --- | --- |
| User-confirmed | The product direction is an investor-first mobile app that ultimately supports research, investor-chosen allocation, actual purchase, portfolio review and later sale/review. |
| User-confirmed | Code generation, migration and human learning effort do not decide the platform. |
| User-confirmed | Mobile Web stays required for the current deadline; SwiftUI/Compose are the later native direction and remain separately gated by feasibility and evidence. |
| User-confirmed | The product center is the investor's own evidence-bound agent: source-linked AI draft, deterministic validation, explicit wallet authorization, deterministic result/holding reconciliation and change-since-last-review. |
| Current fact | The public Web capsule exists, but the investor UI, purchase route, Portfolio and native targets are unimplemented. |
| Current fact | No reviewed model/tool runtime or agent-first UI exists; current public API/MCP/UI remain facts-only and snapshot/read-only. |
| Current fact | The selected contest scope remains Main + Meteora DBC + PreStocks + Tessera; exact eligibility/stacking/form behavior is unverified. |
| Unverified | Exact supported iOS/Android wallet, wallet version, callback scheme, store/distribution path, minimum OS, native RPC/CORS equivalent, legal region and real-device behavior. |

## 2. Product scope and cut lines

| Phase | Must demonstrate | Does not demonstrate |
| --- | --- | --- |
| Deadline P0 | mobile Web Explore/Dossier; read-only connected holdings; truthful target-allocation draft; one exact buy if all purchase gates pass; Activity/recovery; selected sponsor evidence | native package, PWA installation, sell, basket, all target legs purchasable, advice |
| Native feasibility | exact wallet feature/callback; shared-fixture conformance; receipt persistence/relaunch; platform accessibility on physical device without funds | activated purchase, store acceptance, cross-client exactly-once, production readiness |
| Native MVP | independently accepted Explore/Portfolio/Activity and one exact buy on a named platform/device/wallet matrix | the other platform, Web parity, multi-leg execution, sell |
| P1 | next-leg planning and separately proven sell; clearer history | one approval for multiple spends, auto retry/rebalance, managed portfolio |
| Later separate product review | bounded multi-intent queue or new instrument issuance | discretionary management or other people's funds without a new legal/authority architecture |

PreStocks and Tessera remain read-only comparison/provider evidence unless an exact independent execution contract later proves otherwise. DBC scenario/market proof stays an advanced/operator sponsor lane; investors need not traverse it. The selected DLMM buy does not satisfy DBC originality/curve/monitor proof.

## 3. Target journey and information model

Primary navigation recommendation:

1. **Explore** — anonymous catalog and exact evidence;
2. **Portfolio** — exact connected account, observed holdings, value coverage and user target;
3. **Activity** — local attempt receipts and the only safe next action.

Purchase is a task workspace entered from an exact supported Dossier or one supported target gap; it is not a permanent navigation tab. Anonymous first visit starts in Explore. A returning account may start in Portfolio only after the exact account+genesis context is restored. A deep-linked Dossier never requires a wallet.

Portfolio separates:

- company facts;
- provider/issuer/instrument rights;
- mint, token program, decimals and display transformation;
- reference or auction value;
- executable route/quote/liquidity/fees/expiry;
- wallet holding and observation slot/time;
- the user's local allocation target.

The valuation DTO must carry `kind`, source, currency, observed/source-as-of values, coverage and stale/unknown reason. A reference or auction value is not an executable quote. Partial coverage cannot produce an apparently complete total. Missing cost basis means no profit/loss. Scaled UI changes display interpretation but not raw token ownership; fixtures must preserve raw/display basis.

Target allocation is private, local and user-authored. It may contain unsupported instruments, but only exact supported instruments get a Purchase action. Percent/amount validation never becomes advice. A changed account or network cannot inherit another account's target or receipt without an explicit reviewed migration.

## 4. Architecture and future paths

No path below is created by this plan.

```text
apps/public-web/                         # existing Web delivery; shadcn applies here only
  app/routes/{portfolio,locale-portfolio}.tsx
  app/routes/{activity,locale-activity}.tsx
  app/features/portfolio-client/
    account-connection.ts               # read-only public account/genesis facade
    fixed-rpc.ts                         # fixed allowlist and bounded raw requests
    observation.ts                      # strict raw holdings producer
    token-account-decoder.ts            # SDK-free SPL/Token-2022 decode
    portfolio-store.ts                  # private IndexedDB drafts/observations
    portfolio-state.ts
    target-allocation.ts
  app/features/activity-client/
    receipt-projection.ts               # read-only view of accepted purchase receipt
  tests/fixtures/mobile-journey/
  tests/portfolio-{rpc,decoder,store,routes}.test.ts

apps/ios/                                # future SwiftUI target; absent today
  app/{explore,portfolio,activity,purchase,contracts,persistence,wallet}/
  tests/unit/
  tests/ui/

apps/android/                            # future Compose target; absent today
  app/src/main/kotlin/com/benten/mobile/{explore,portfolio,activity,purchase,contracts,persistence,wallet}/
  app/src/test/
  app/src/androidTest/

packages/acquisition-consumer/           # future package already named by prior plans; absent today
  src/
    mobile-client-profile-v1.ts          # planned profile/schema, no runtime import
    portfolio-evidence-v1.ts             # planned exact holdings/valuation evidence
    native-admission-v1.ts               # planned native transport/auth result
  fixtures/mobile-conformance/           # canonical wire/state vectors after MOB-C0
```

This previously planned package is not a current dependency. `MOB-C0` first reconciles its creation/owner with the existing contract plans; do not claim it exists or create a second schema package for native clients. Native code consumes a versioned generated/exported artifact plus fixture digest; it does not import TypeScript/private packages. Generation must reject unknown/duplicate keys before typed decoding, preserve raw integers without floating conversion, enforce Base58/length/enums and reproduce JCS/digest vectors. Codable/Kotlin serialization success alone is insufficient.

Dependency direction:

```text
public contract/artifact -> platform strict decoder -> pure domain state -> platform UI
owner/BFF -> authenticated public response -> platform decoder
platform wallet/session/receipt -> platform-only boundary
```

The reusable connectivity owner remains outside Benten and owns route/provider policy, unsigned construction/audit and read-only evidence. Public Benten docs name only that generic responsibility, not private paths. Benten owns UI, session/admission consumer, local wallet execution client and receipt. Servers do not receive signed bytes, private allocation, wallet secrets or order state.

### Web holdings producer and read-only wallet island

`PORT-O0` owns one browser-only read path; it does not use the existing lossy `uiAmount:number` holdings helper and does not widen the purchase wallet island. `account-connection.ts` may import only reviewed account-connect/account-change capabilities through a facade that returns `{account_base58,chain}`. AST/import-graph checks reject transaction-signing/submission features, keypair/seed/delegate code, provider SDKs and private packages from every `portfolio-client` module. Connection is a user gesture and identifies a public account; it is not spending permission. Account/chain change aborts the active read, clears in-memory results and selects a distinct local namespace. It never deletes another namespace or changes an active purchase receipt.

The fixed RPC URL/genesis is release configuration, never query, wallet or remote input. One explicit refresh has a five-second overall `AbortController` deadline, no automatic retry/failover and at most two HTTP POSTs:

1. one JSON-RPC batch containing `getGenesisHash` and exactly two `getTokenAccountsByOwner` requests, one for SPL Token program `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` and one for Token-2022 program `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`, `confirmed` commitment and canonical base64 account data; maximum response 2 MiB and 256 accounts per program;
2. after strict decode and intersection with the reviewed public mint allowlist, one batch containing `getMultipleAccounts` for at most 64 exact mint accounts plus `getAccountInfo` for Clock sysvar `SysvarC1ock11111111111111111111111111111111`, with `minContextSlot` equal to the holdings slot; maximum response 512 KiB.

No other RPC method, program, account, encoding, commitment, URL, retry or pagination is permitted. Both token-account results must report the same context slot or the observation is `cohort_mismatch`. Mint and Clock results must report one equal metadata slot not earlier than the holdings slot. Their two slots remain separately labelled; they are never called one atomic snapshot. More accounts/mints, oversized/partial/duplicate/missing batch IDs, noncanonical base64, owner/program/layout/TLV mismatch, malformed raw integer, unsupported extension, abort/timeout/429/5xx or a genesis/account change returns a closed unavailable/partial reason and preserves the last observation only as visibly stale. The user may explicitly request a new refresh; no response triggers one.

The SDK-free decoder validates each account's outer program owner, token-account state, exact wallet owner, mint, raw `u64` amount and complete Token-2022 TLV boundaries. It aggregates raw integers by exact mint without floating conversion and records account IDs and the holdings slot. Mint/Clock decoding binds decimals, Scaled UI schedule and relevant extension state at the metadata slot. Unknown/frozen/delegated/withheld/hook states remain explicit; they are not silently converted into spendable value. Tokens outside the reviewed registry are counted as outside coverage, not imported or assigned a price.

`PortfolioObservationV1` is a strict tagged result: `available` requires the exact wallet/genesis, raw accounts, both slots, mint metadata and coverage counters; `partial` may show decoded quantity but forbids complete total/drift; `unavailable` has null data and a closed reason. Unknown fields, duplicate JSON keys, future slots beyond the clock tolerance, non-monotonic explicit refresh, stale account callback, and any source/digest mismatch fail closed. Valuation joins only a reviewed build/provider artifact whose mint, currency, unit basis, conversion basis and source time match §6; there is no direct market-price RPC and no fallback zero.

### Web private store and dynamic routes

`PORT-L0` proposes one app-local IndexedDB database `benten_mobile_private_v1`, with object stores `portfolio_drafts` and `portfolio_observations`. Purchase attempt receipts remain in the separately reviewed purchase receipt adapter; Activity receives only its strict read projection and never copies or migrates receipt authority. Keys are `[schema_version,genesis_hash,wallet_keyed_digest]`; the keyed digest uses a non-exportable per-profile WebCrypto HMAC key stored as an IndexedDB `CryptoKey`. Values bind contract/build digest and use clone→strict-validate→freeze before use. Migration is copy/validate/atomic-swap, retains the old record until success, and has no memory/localStorage/cookie fallback. Blocked/unavailable/quota/corrupt/key-loss/version-newer states disable target editing and purchase while preserving static facts. Complete same-origin storage erase remains undetectable and cannot authorize a new transaction.

`/portfolio`, `/{ja|ko|zh-Hans|zh-Hant}/portfolio`, `/activity` and their four localized forms are ten prerendered **empty shells** added only after `PORT-*` acceptance; `/en` stays invalid. They contain no account/private data, use `noindex`, and may be statically cached. Wallet/holding/target/receipt data never enters path, query, loader HTML, a Benten/owner log or build artifact. Dynamic RPC reads use `cache: "no-store"`; IndexedDB remains local. The selected external RPC necessarily receives the public wallet address/account references and can observe the user's IP. Before connection, the UI names that reviewed RPC and links its current retention/privacy policy; Benten does not promise that the external provider keeps no logs. Target allocation and activity receipt are never sent to the RPC. Unsupported locale/path is 404, known canonical rules stay intact, locale switching changes copy only, and Back retains local state without serializing it. The computed document baseline becomes 785 only when these ten shells are accepted; route-count success is not UI or data acceptance.

### Native admission is a separate contract

The Web cookie/Origin/CSRF proof is not copied into a binary. A static API secret in an iOS/Android package is never accepted. `NAT-A0` proposes a platform-bound admission profile: an app installation creates a non-exportable device key; an approved Apple/Google app-attestation assertion and server nonce register only its public key; short-lived scoped tokens are proof-of-possession-bound to that key; nonce, clock, per-consumer/global quota, revoke/rotation and restore rules use the existing control-plane principles. Wallet identity, allocation, order and signature are not stored in that credential record. Unsupported attestation or restore fails dynamic Portfolio/purchase closed while bundled public facts remain readable.

This is a candidate design, not an implemented capability. `NAT-A0` must define exact Apple/Google APIs and versions, server physical schema/functions, TTL, privacy/retention, anonymous-user recovery, device migration and negative fixtures before either native client calls the owner/BFF. If that expansion is not accepted, native remains offline-fixture/read-only and cannot claim purchase support.

## 5. Platform-specific security profile

### 5.1 Web

The existing browser purchase contract remains normative. PWA installation, service worker caching and offline shell are disabled until their cache/version/receipt behavior is reviewed. A PWA launched outside the original browser and a wallet in-app browser may have different origins/storage. Early feasibility must prove the exact attempt begins and returns to the same storage boundary; it cannot assume state transfer.

### 5.2 iOS

Candidate UI: SwiftUI. Candidate wallet flow: a named wallet's sign-only deep link only if it returns auditable signed transaction bytes. Solana Mobile Wallet Adapter is not assumed on iOS. The spike binds attempt nonce/generation, callback/application identity, account, genesis, exact context/message digest, expiry and one callback. A deep-link session encryption key is not a wallet signing key and is never evidence of transaction authorization.

Proposed receipt: app-sandbox SQLite with strict migrations and an integrity key in Keychain. Signed bytes are memory-only. Scene disconnect, cold start, callback replay, app reinstall, backup/restore, key loss and device transfer each have explicit fail-closed tests.

Toolchain candidates are Xcode 26.6 with its Swift 6.3 toolchain and an iOS 17 deployment-floor spike. They are official-source/local-host compatibility inputs only: Xcode is not installed and iOS 17 is not the promised support floor. `IOS-F0` records separately (a) build/deployment floor, (b) OS/device/wallet combinations actually tested, and (c) the security-supported public release range. An old buildable OS is not automatically advertised or activated.

### 5.3 Android

Candidate UI: Jetpack Compose. Candidate wallet flow: exact pinned Mobile Wallet Adapter sign-only capability, not a quickstart's sign-and-send behavior. Current artifact versions observed by feasibility research are inputs, not accepted pins: `clientlib-ktx 2.0.3`, `web3-solana 0.2.5`, `rpc-core 0.2.7`, `multimult 0.2.3`. `AND-F0` verifies primary provenance, dependency tree, license, feature response and physical-wallet behavior before adopting any.

Current-source comparison candidates are MWA tag `2.2.0` at commit `25296e124c5fdc30dc89f1ac0622b8cffefc5c8e`, AGP `9.2.1`, Kotlin `2.4.10`, Gradle `9.7.0`, compile/target 37 and Compose BOM `2026.08.00`. They are not a compatible accepted set. Exact JDK/Android Studio and AGP compatibility remain unverified and stop the spike rather than being guessed. API 24 is a library/build floor observation, not the application's public support promise. `AND-F0` separately records build floor, physically tested OS/device/wallet matrix and security-supported release range.

Proposed receipt: Room/SQLite with strict migrations and an integrity key in Android Keystore. Process death, task recreation, predictive Back, duplicate callbacks, backup/restore, key invalidation and device transfer are fail-closed tests.

### 5.4 Cross-client and cross-device limitation

One local attempt lock cannot prevent a second device/profile/client from starting another user-approved purchase. No server order ledger or wallet synchronization is added to P0. Therefore:

- only one execution surface is released for the P0 route at a time;
- a platform transition requires an explicit reconciliation screen and acknowledgement;
- unresolved/unknown on any known client pauses the next planned leg;
- complete storage erasure or an unknown other device is disclosed as outside the exactly-once guarantee;
- a future global attempt service is a separate privacy/security contract, not a small implementation detail.

## 6. Contract, local data and fixtures

`MOB-C0` defines a public `MobileReleaseProfileV1` that references, never weakens, the existing purchase and provider contracts. It contains no wallet, allocation, amount, signature, receipt, nonce or attempt state. Required fields include:

- client kind/version/build digest and contract fixture digest;
- platform/OS/device class and named wallet/version support matrix;
- supported genesis/cluster and exact route/policy revisions;
- receipt schema/migration revision and storage capability classification;
- callback mechanism and anti-replay capability classification, never a live nonce;
- wallet capability and supported transaction version;
- explicit execution release state: `implementation_disabled`, `no_funds_candidate`, `authorized_smoke`, or `execution_enabled`, without implying activation from the profile alone;
- portfolio coverage and valuation semantics.

Private local data is a different closed union and is never returned by a capability/profile endpoint:

```text
PortfolioDraftV1
  schema_version = 1
  contract_digest: sha256
  wallet_binding: { genesis_hash, account_base58 }
  revision: u64 decimal string
  updated_at: RFC3339 UTC
  allocation_basis = "user_target_bps"
  entries[1..3]: { instrument_identity, allocation_bps integer 0..10000 }
  unallocated_bps: integer 0..10000
  invariant: sum(entries.allocation_bps) + unallocated_bps = 10000

PortfolioObservationV1
  schema_version = 1; status = available | partial | unavailable
  request_id + release/rpc/registry/decoder revisions
  wallet_binding + genesis_hash
  request_started_at/response_received_at + Clock-derived chain_unix_timestamp
  holdings_slot + metadata_slot (canonical u64 strings; never one false cohort)
  coverage: decoded/allowlisted/unreviewed/overflow counts
  holdings[0..64]: exact mint + token_program + sorted account ids,
                   raw amount canonical u64 string, decimals,
                   display amount decimal string or null,
                   extension/display/spendability basis
  valuations: kind, price decimal string, currency, unit_basis,
              source/source_as_of/observed_at, conversion_basis or null,
              stale/unknown reason
  partial requires data + one closed reason; unavailable requires data=null
  reason = account_changed | genesis_mismatch | cohort_mismatch |
           response_too_large | account_limit | mint_limit |
           malformed_rpc | malformed_account | unsupported_extension |
           timeout | rate_limited | upstream_unavailable |
           valuation_unavailable | storage_unavailable

NativeAttemptReceiptV1
  existing purchase receipt semantics + platform/build/fixture digest,
  local attempt generation, callback replay state and send-marker ordering
```

All arrays are dense and sorted by exact mint/account bytes before digesting; amounts are base-10 canonical integer strings and valuations are normalized decimal strings, never JSON floating numbers. `request_id` is local random correlation only and is not an idempotency/order key. `observed_at` for transport is response receipt time while chain time is decoded from the exact Clock payload; neither substitutes for provider `source_as_of`. Available/partial data carries response-body digests for both POSTs and the RPC policy revision. Status/reason, fields and nullability are a closed union; unknown enum/key, duplicate raw JSON key, missing batch ID or body/digest mismatch rejects the whole observation.

The P0 draft contains at most three reviewed instrument identities and no free-form token address. Its on-disk namespace is keyed by schema version, genesis and an app-keyed digest of the wallet account; it is not a URL, analytics or server key. A changed account/genesis opens a different namespace. Migration is copy-validate-atomically-swap with the prior record retained until new validation passes; unknown version, integrity failure or missing device key disables target/execution without deleting the evidence. Clear/export is a later explicit privacy operation, not silent expiry.

A holding is valued only when the price's `unit_basis` exactly matches that holding's raw/display token basis or an explicit reviewed conversion binds them. An underlying share price, xStock display token, raw mint unit, Scaled UI multiplier and auction reference are never silently interchangeable. Unit mismatch, stale corporate-action basis, unknown currency/conversion, partial coverage or missing source time shows quantity with valuation unavailable. Cost basis absent means profit/loss absent.

Required canonical fixture groups:

| Group | Vectors |
| --- | --- |
| `MOB-WIRE` | unknown/duplicate/sparse/hidden keys, invalid UTF-8, depth/size, raw u64/u128 boundary, Base58, enum/null, JCS/digest parity |
| `MOB-PORT` | empty/single/multiple holding, duplicate accounts, Token-2022 fee/Scaled UI/hook, stale/partial price, unit-basis mismatch, stale corporate-action basis, unknown currency/source time, no cost basis |
| `MOB-TARGET` | local target valid/over/under 100, unsupported instrument, unknown valuation, account switch, storage corrupt/erased |
| `MOB-WALLET` | cancel/reject, wrong account/network, altered message, replayed callback, cold start, long delay/expiry, unsupported feature/version |
| `MOB-RECEIPT` | pre-sign orphan, live signed callback, signed-not-sent restart, send-invoked unknown, finalized failure, reorg/drop, holdings-unverified/verified |
| `MOB-MULTI` | Web/native concurrent intent warning, unknown leg pauses next, distinct intent generations, no shared-storage assumption |
| `MOB-A11Y` | Web 390 px/200%/keyboard; iOS Dynamic Type/VoiceOver; Android font/display scale/TalkBack; safe areas and hardware keyboard |

Passing Web vectors proves the contract vector, not native decoding, persistence, wallet or UI. Each native client runs the same vectors plus platform mutations and records its own build/fixture digest.

## 7. Work packages

Every implementation WP records base commit, contract/artifact digests, allowed paths, exact pins, tests, evidence and rollback before editing.

| Node | Owner / allowed scope | Dependencies | Output and acceptance | Tests / commit boundary | Abort / rollback / authority |
| --- | --- | --- | --- | --- | --- |
| `MOB-D0` scope decision | product/architecture docs | this plan + user answer | records the accepted `web_required_native_next` sequence; any native-deadline proposal requires a new reviewed re-baseline; no ambiguous “mobile” | link/status review; one docs commit | this decision creates no native target or runtime; docs only |
| `MOB-C0` conformance profile | contract owner; planned public contract/fixtures only | `MOB-D0`, purchase/provider contracts | one versioned profile, closed schemas, canonical vectors, cross-platform digest runner spec | `MOB-01,02`; schema+fixture commit | divergence stops all clients; no runtime |
| `NAT-A0` native admission contract | control-plane/BFF contract owners; public contract + private physical-model ADR | `MOB-C0`; platform attestation primary evidence | exact per-install key/attestation/token/scopes/quota/revoke/restore model and fake transport; stores no wallet/order | replay/rotation/restore/quota/privacy fakes; contract/ADR then implementation separately | unknown or failed attestation keeps native dynamic calls off; no binary secret/fallback |
| `MOB-D1` Portfolio/Activity design | design owner; mobile journey/visual artifact only | `MOB-C0,UI-H1`; exact state fixtures | accepted mobile IA/interaction/visual artifact for Portfolio/Activity at 390 px/desktop/200% before material screens | `MOB-03,04,06,09,10`; design evidence only | unresolved hierarchy/state returns to design; no build authority |
| `WEB-M0` mobile shared shell | Web shared-file owner; public-Web route manifest/shell/copy only | `MOB-C0,UI-S0,MOB-D1` | adds the ten empty route shells and navigation using accepted official Web foundation; no wallet/data behavior | route/static/locale/import/cache tests; one serialized shell/manifest commit | withhold new shells; current 775 baseline remains |
| `PORT-F0` holdings/valuation feasibility | public consumer + platform pure domain | `MOB-C0`, exact read contracts | raw/display account aggregation, slot/time, partial valuation, local target model | `MOB-03,04,08`; pure model+fixtures commit | unknown source/basis disables total/drift; no RPC activation |
| `PORT-O0` Web holdings observation | Web read-only data owner; `apps/public-web/app/features/portfolio-client/{account-connection,fixed-rpc,observation,token-account-decoder}.ts` | `MOB-C0,PORT-F0,UI-F0` | fixed two-request producer and strict `PortfolioObservationV1`; no sign/send import | `MOB-02,03,07,08`; raw/slot/cap/abort/account-change/import negative tests | typed partial/unavailable; last observation stale; no fallback helper/RPC |
| `PORT-L0` Web private store | Web storage owner; `portfolio-client/{portfolio-store,target-allocation}.ts` | `MOB-C0,PORT-F0,UI-F0` | IndexedDB schema/key/migration for draft/observations and read-only purchase-receipt projection | `MOB-04,06,07`; quota/corrupt/erase/key/account/migration tests; isolated store commit | storage failure disables target/purchase; no memory/server fallback |
| `PORT-W0` read-only Portfolio | Web UI owner; Portfolio domain/route only | `WEB-M0,PORT-F0,PORT-O0,PORT-L0,MOB-D1` | connected exact-account holdings, target, truthful unknown/stale; no order control | `MOB-03,04,10`; route/domain+tests commit | Portfolio remains unavailable; Explore survives |
| `PORT-I0` purchase integration | purchase Web owner | `PORT-W0`, existing `PX-U1/PX-QA` | one supported target gap enters one exact Purchase Intent; verified causal holding returns | `MOB-03,06,08`; isolated purchase integration commit | no positive purchase evidence means no CTA |
| `PORT-A0` Activity | receipt UI owner; Activity route/read projection only | `WEB-M0,PORT-L0,MOB-D1,PX-U0` | exact local attempt fact/sole next action; no server history claim | `MOB-06,07,10`; receipt projection/UI+tests commit | storage unavailable disables execution; read-only facts remain |
| `MOB-S0` post-integration security/runtime | independent security/runtime owners; evidence + scoped fixes by original owner | `PORT-I0,PORT-A0,PORT-O0,PORT-L0` | import/storage/RPC/privacy/one-send and execution-artifact impact verdict; one named-wallet, named-RPC positive read on the integrated revision with signing/submission counters zero | `MOB-02..08,11`; raw/slot/digest-bound runtime receipt plus independent ledger, no self-approval | fixture-only evidence, high/critical or digest ambiguity disables holdings/purchase and blocks smoke |
| `MOB-V0` post-integration visual/accessibility | independent design reviewer; evidence only | `PORT-I0,PORT-A0,MOB-D1` | real Portfolio/Activity/Purchase journeys at desktop/390 px/200%/keyboard and degraded states | `MOB-03,04,06,09,10`; screenshot/interaction ledger | blocking finding returns to owning screen and repeats S0 if behavior changes |
| `MOB-H0` investor acceptance | user/product owner | `MOB-S0,MOB-V0` | explicit disposition of real Explore→Portfolio→Purchase→Activity journey | task-comprehension and next-action receipt; no inference | rejection returns to design/build and re-runs affected reviews |
| `IOS-F0` iOS feasibility | future iOS owner; `apps/ios/**` only after authorization | `MOB-C0`; named wallet evidence | pins Swift/Xcode/iOS/wallet/callback/store choices; compile/test discovery; separates build floor/tested matrix/supported range; no-funds physical callback matrix | `MOB-01,05,09`; toolchain evidence before target commit | unsupported sign-only/callback means read-only/no iOS app; no store action |
| `IOS-R0` iOS receipt/domain | iOS owner | `IOS-F0,NAT-A0,PORT-F0` | strict decoder, SQLite/Keychain receipt, migration/restart/erase tests, portfolio pure state | `MOB-02,03,04,06`; domain/store+tests commit | corruption/key loss fail closed; delete candidate unit |
| `IOS-U0` iOS UI | iOS owner + accepted design | `IOS-R0`, design acceptance | native Explore/Portfolio/Activity; purchase unavailable until transaction proof | `MOB-03,09`; accepted design then UI+tests commit | feature flag off/remove app target; no shared Web UI |
| `IOS-T0` iOS transaction adapter | iOS transaction/security owner; `apps/ios/app/{purchase,contracts,wallet,persistence}` | `IOS-R0,NAT-A0,PX-O1`, accepted owner unsigned fixtures | strict message/ALT/program/account/signature audit, wallet return, atomic marker and fake one-send; no funds/network in the initial unit | `MOB-05,06,08`; isolated adapter+hostile tests commit | opaque/mutated/unsupported result keeps execution unavailable; delete isolated adapter |
| `IOS-QA` iOS purchase QA | independent security/design/runtime owners | `IOS-U0,IOS-T0`, legal gate | named device/OS/wallet no-funds suite; later separately authorized funded smoke | `MOB-05,06,08,09,12`; evidence only | any mutation/replay/unknown retry disables purchase |
| `AND-F0` Android feasibility | future Android owner; `apps/android/**` after authorization | `MOB-C0`; primary MWA evidence | exact JDK/Gradle/Kotlin/Compose/adapter pins, dependency/security/test discovery, separates build floor/tested matrix/supported range; no-funds physical matrix | `MOB-01,05,09`; toolchain evidence before target commit | missing compatible toolchain or sign-only/return proof means read-only/no Android app |
| `AND-R0` Android receipt/domain | Android owner | `AND-F0,NAT-A0,PORT-F0` | strict decoder, Room/Keystore receipt, process/migration/erase tests | `MOB-02,03,04,06`; domain/store+tests commit | fail closed/delete candidate unit |
| `AND-U0` Android UI | Android owner + accepted design | `AND-R0`, design acceptance | native Explore/Portfolio/Activity; purchase unavailable until proof | `MOB-03,09`; accepted design then UI+tests commit | feature off; no Web wrapper substitution |
| `AND-T0` Android transaction adapter | Android transaction/security owner; `apps/android/app/src/main/kotlin/com/benten/mobile/{purchase,contracts,wallet,persistence}` | `AND-R0,NAT-A0,PX-O1`, accepted owner unsigned fixtures | strict message/ALT/program/account/signature audit, wallet return, atomic marker and fake one-send; no funds/network in the initial unit | `MOB-05,06,08`; isolated adapter+hostile tests commit | opaque/mutated/unsupported result keeps execution unavailable; delete isolated adapter |
| `AND-QA` Android purchase QA | independent owners | `AND-U0,AND-T0`, legal gate | named device/OS/wallet no-funds suite; later authorized funded smoke | `MOB-05,06,08,09,12`; evidence only | any mismatch/replay/unknown retry disables purchase |
| `LEGAL-N` product/legal review | product/legal owner | exact instrument, regions, distribution model | written scope for Web/iOS/Android and issuer/product terms | source-scope/date review; evidence only | not legal advice; unknown blocks public Buy/store claim |
| `DIST-N` distribution readiness | release owner | platform QA + legal/privacy | bundle/app IDs, signing, privacy, store policy, monitoring/runbook evidence | `MOB-12`; signed-package/review receipts separate | no credentials/upload without separate authority |
| `NATIVE-GO` activation decision | independent reviewers + user | platform-specific all gates | one named platform/client matrix approved or explicitly unavailable | exact-revision evidence review; decision receipt only | does not activate; implementation/release remain separate |
| `MOBILE-RC` mobile product evidence aggregation | existing release QA owner; evidence only | `MOB-H0,MOB-S0,MOB-V0`, existing `PX-RC` and selected-plan `R0` | binds mobile journey, selected proofs, funded purchase evidence and execution artifact to the same revision; closes no upstream node | `MOB-03,04,06,10,11`; exact-revision evidence only | any unmet dependency removes the claim and blocks K0; no deploy/submit authority |

The WPs are subcapsules, not a second contest release graph. `MOBILE-RC` still uses the existing purchase `PX-RC` and selected-track `R0` requirements. Native completion never substitutes for a missing DBC/PreStocks/Tessera proof.

## 8. Executable dependency registry

```text
MOB-D0 -> MOB-C0
MOB-C0 -> {PORT-F0,NAT-A0,IOS-F0,AND-F0}
{MOB-C0,UI-H1} -> MOB-D1
{MOB-C0,UI-S0,MOB-D1} -> WEB-M0
{MOB-C0,PORT-F0,UI-F0} -> {PORT-O0,PORT-L0}
{WEB-M0,PORT-F0,PORT-O0,PORT-L0,MOB-D1} -> PORT-W0
{WEB-M0,PORT-L0,MOB-D1,PX-U0} -> PORT-A0
{PORT-W0,PX-U1,PX-QA} -> PORT-I0
{PORT-I0,PORT-A0,PORT-O0,PORT-L0} -> MOB-S0
{PORT-I0,PORT-A0,MOB-D1} -> MOB-V0
{MOB-S0,MOB-V0} -> MOB-H0
{MOB-S0,MOB-V0,MOB-H0} -> PX-E0
{MOB-C0,NAT-A0,IOS-F0,PORT-F0} -> IOS-R0
{IOS-R0,IOS-DESIGN-ACCEPTED} -> IOS-U0
{IOS-R0,NAT-A0,PX-O1} -> IOS-T0
{IOS-U0,IOS-T0,LEGAL-N,IOS-SECURITY-ACCEPTED} -> IOS-QA
{MOB-C0,NAT-A0,AND-F0,PORT-F0} -> AND-R0
{AND-R0,AND-DESIGN-ACCEPTED} -> AND-U0
{AND-R0,NAT-A0,PX-O1} -> AND-T0
{AND-U0,AND-T0,LEGAL-N,AND-SECURITY-ACCEPTED} -> AND-QA
{MOB-S0,MOB-V0,MOB-H0,PX-RC,SELECTED-R0} -> MOBILE-RC
{IOS-QA,AND-QA,LEGAL-N} -> DIST-N
{IOS-QA,AND-QA,DIST-N} -> NATIVE-GO
```

`UI-F0`, `UI-S0` and `UI-H1` reference the investor UI plan. `PX-O1`, `PX-U0`, `PX-U1`, `PX-QA`, `PX-E0` and `PX-RC` reference the purchase plan; `SELECTED-R0` references the selected-plan canonical `R0`. `IOS/AND-DESIGN-ACCEPTED` and security acceptance are evidence predicates, not fabricated canonical node IDs. A platform may be accepted independently in a later amended graph; the conjunctive `NATIVE-GO` above represents the stated two-native-client long-term target, not permission to hold back an independently useful platform forever. Changing that release topology requires a reviewed amendment.

No edge runs from native feasibility into `MOBILE-RC`. Shared contract changes after Web purchase evidence invalidate affected Web/native evidence; native-only UI changes do not inherit Web security acceptance. `PORT-I0` is a no-funds fixture/integration result. Its post-integration `MOB-S0/V0/H0` gates precede the first `PX-E0` funded smoke, so an earlier purchase smoke is never inherited after Portfolio/Activity change the execution artifact. `MOBILE-RC` follows the resulting `PX-RC` and selected `R0`; the selected-plan overlay makes it a prerequisite of `K0` without creating an `R0` cycle.

## 9. Test and evidence registry

| ID | Requirement | Test/evidence | Hard stop |
| --- | --- | --- | --- |
| `MOB-01` truthful platform scope | exact client/build/OS/wallet matrix and ADR state | ambiguous “mobile supported” claim |
| `MOB-02` strict shared semantics | `MOB-WIRE` on Web/Swift/Kotlin with digest parity and hostile mutations | unknown/duplicate key, integer or canonicalization divergence |
| `MOB-03` portfolio truth | exact account/mint aggregation, raw/display basis, source/as-of/partial coverage, no false total/P&L | unknown becomes zero or incomplete total appears complete |
| `MOB-04` user target privacy | local namespace, account binding, no URL/log/server sync, corrupt/erase behavior | target presented as advice or leaked |
| `MOB-05` wallet callback | named wallet physical test for account/genesis/message/nonce/generation/expiry/replay/cold start | unauthenticated/replayed/altered callback |
| `MOB-06` one send and recovery | rapid taps, duplicate callback, process death, signed-not-sent, known-signature unknown, reorg/finality/holding | auto resend or resumed ephemeral signed bytes |
| `MOB-07` cross-client honesty | Web/native parallel-attempt negative and storage-boundary copy | global exactly-once claim or silent second leg |
| `MOB-08` Token-2022 | transfer fees, hooks, Scaled UI, raw/net/min, epoch/Clock, ATA/rent on each platform | browser evidence reused without native proof |
| `MOB-09` native accessibility | physical VoiceOver/Dynamic Type and TalkBack/font-scale/safe-area/keyboard tests | clipped amount/status/source or unreachable sole action |
| `MOB-10` Web mobile quality | 390 px, Japanese 200%, keyboard, wallet-browser/storage spike | responsive screenshot treated as native/PWA proof |
| `MOB-11` selected sponsor continuity | DBC, PreStocks, Tessera proof matrix and same-revision demo | mobile work cuts a mandatory proof but still claims completion |
| `MOB-12` distribution/legal | exact terms, privacy, region, signing/store checklist and source dates | packaging or closed route presented as legal eligibility |

Runtime evidence records exact source revision, contract/artifact digests, app build, device/OS, wallet/version, genesis, RPC configuration, fixture digest, observation time and reviewer. Logs must prove redaction and bounded retention. Metrics may include anonymous availability/latency and state-transition counts only after a privacy review; no wallet, target, amount, signature, transaction message or private analysis enters telemetry.

## 10. Schedule and capacity

The contest plan keeps these fixed boundaries:

| JST checkpoint | Required state | Native disposition |
| --- | --- | --- |
| Sep 17 | `MOB-D0` decision recorded; ADR/plan and no-funds evidence reviewed | Web is the deadline surface; native is the accepted next-stage direction but no target is created |
| Sep 18 12:00 | `MOB-C0` plus `PORT-F0` requirements frozen; Portfolio/Activity design accepted; RPC/store/wallet-import and native unknowns enumerated | unresolved model/design stops screen composition; no purchase claim |
| Sep 19 20:00 | `PORT-O0/L0` offline fixtures and `WEB-M0` route shell pass; named eleven-lane capacity decision recorded | producer/store/import failure makes deadline P0 at risk; do not consume sponsor/UX capacity silently |
| Sep 20 20:00 | required `PORT-W0/A0/I0` no-funds integration passes on the accepted shell and existing purchase fixtures | this is mandatory P0, not “may join”; failure is recorded unmet/re-baselined, not deferred into the protected window |
| Sep 22 12:00 | independent `MOB-S0/V0` and explicit `MOB-H0` disposition pass on the integrated revision before `PX-E0` | failed/digest-changing integration disables purchase and blocks funded smoke |
| **Sep 22 20:00** | resulting `PX-E0` preliminary evidence or explicit unmet status; existing feature freeze | no new platform, dependency, route, schema or state |
| Sep 22 20:00–Sep 24 20:00 | protected Web investor UX and repeat QA; Sep 23 validation/triage | native code does not consume Web UI/QA capacity; native defects do not expand Web contracts |
| **Sep 24 20:00** | `MOBILE-RC` exact-revision Web RC/video evidence | native appears only as future plan/no-funds evidence unless separately complete and accepted |
| **Sep 25 20:00** | packet freeze, nine-hour buffer | no store upload or late packaging |
| **Sep 26 05:00** | current official deadline | no planned buffer work |

Code-generation effort is zero in estimates, but owner/reviewer/device time is not. The purchase plan's revised hypothesis explicitly adds 40–60 pre-freeze focused hours for required Portfolio observation/storage, Portfolio/Activity Web, post-integration review and incremental shared mount, for 262–368 pre-freeze and 272–384 overall. It requires eleven named peak lanes and treats missing capacity as P0 unmet/re-baseline, not optional work. Before implementing native work, capacity separately records iOS wallet/lifecycle/security, Android wallet/lifecycle/security, shared conformance, native design, physical-device accessibility, legal/privacy and independent review; none is charged to the protected Web window. A single person cannot be double-counted in concurrent platform lanes. No schedule promise is made until named availability and hardware/wallet access are recorded.

Cut order when capacity or proof slips:

1. native packaging and distribution;
2. PWA install/offline enhancements;
3. portfolio visualization beyond a labelled list;
4. more than one purchase-supported instrument;
5. P1 continuation and all sell work;
6. additional operator presentation.

Never cut exact identity/rights/value semantics, one-intent review, fees/minimum/expiry, one-send/unknown recovery, causal holding, selected three sponsor proofs, mobile readability/accessibility for the claimed surface, independent review or the protected Web UX window. Missing purchase proof yields a truthful read-only release/unmet target, not simulated success.

## 11. Cost, operations and external authority

Monthly operating recommendation remains within the existing proposed USD 100 cap for the deadline workload, but no price is treated as zero and no purchase is authorized. Native planning separately estimates:

- Apple/Google developer accounts and signing operations;
- physical iPhone/Android test access and named wallets;
- CI/macOS runner and artifact retention;
- RPC/provider traffic and rate limits;
- crash/security monitoring after privacy review;
- legal/privacy/store review and ongoing wallet/OS support.

The cap is a proposal, not evidence that all native/store costs fit. Exceeding it requires a reviewed workload/cost amendment. Unknown pricing remains unknown.

External authority gates remain explicit:

- the user personally approves/signs/sends any later funded smoke;
- agents may prepare code/checklists and inspect public receipts, not click a buy or hold keys;
- bundle identifiers, signing credentials, associated domains, store accounts, uploads, public release, deployment and contest submission need separate current authorization;
- a funded native smoke uses a separately approved amount/SOL ceiling and named wallet/device/route, then returns to feature-off until evidence review.

## 12. Rollback and completion

Each client is independently feature-off. Rollback disables its purchase capability and leaves sourced Explore/Dossier/Portfolio facts available when safe. It never switches to an opaque wallet send, another venue or another client automatically. Contract/fixture mismatch disables dynamic portfolio/purchase while bundled facts remain.

Plan completion means these documents and mappings are reviewed. It is not implementation completion. A client can claim purchase support only after its exact contract, route, wallet, persistence, physical-device, security, legal and user-funded evidence passes on the released revision. A native build can claim store availability only after the exact signed package is publicly available in the named channel and rechecked; local build or upload is insufficient.

## 13. Requirement-to-work traceability

| Requirement | Normative source | Future module | Node | Evidence | Stop/rollback |
| --- | --- | --- | --- | --- | --- |
| investor-first mobile journey | IA + this §§2–3 | Web/native Explore/Portfolio/Activity | `MOB-D1,WEB-M0,PORT-W0/A0,IOS-U0,AND-U0` | scenario fixtures + `MOB-S0/V0/H0` | no wallet-first gate or operator detour |
| exact read-only holdings | this §§4,6 | Web Portfolio client island | `PORT-F0/O0` | fixed RPC/raw/cohort/cap/account-change/import tests | typed partial/unavailable; no lossy helper |
| self-custody exact buy | purchase contract/plan | platform purchase boundary | `PORT-I0,MOB-S0/V0/H0,IOS-QA,AND-QA` | post-integration platform wallet/message/one-send/receipt tests | purchase unavailable; no inherited smoke |
| private target allocation | this §§3–6 | platform local target store | `PORT-F0/L0/W0,IOS-R0,AND-R0` | privacy/account/storage/migration mutation tests | target feature off |
| truthful portfolio valuation | provider/market evidence contracts | portfolio pure domain | `PORT-F0/O0` | partial/stale/unit/corporate-action/currency vectors | omit total/drift/P&L |
| cross-platform semantic parity | `MOB-C0` | generated schema + golden fixtures | all client nodes | strict decoder/JCS/digest parity | reject build/release |
| selected-track continuity | selected plan | existing sponsor modules | existing `D3-DBC,D3-P,D3-T,R0` | selected test registry | remove claim, not proof |
| native distribution | ADR + external policy | future platform packaging | `LEGAL-N,DIST-N,NATIVE-GO` | exact package/source/review receipt | no upload/release claim |
| sell/review evolution | future sell contract | future per-platform sell workspace | P1 only | independent quote/message/receipt/holding proof | no Sell control |
