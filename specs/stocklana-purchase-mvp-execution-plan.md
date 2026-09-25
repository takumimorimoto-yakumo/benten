# Stocklana purchase-complete MVP execution plan

Status: **implementation-ready plan only; implementation, activation and funded proof are unverified** (2026-09-16).

For deadline scope and priority, the [2026-09-23 submission plan](stocklana-submission-plan-2026-09-23.md) is now the authoritative document. This document is retained as history.

## 0. Precedence and terminal condition

This is the execution SSOT for the user-confirmed purchase-complete MVP. It supersedes only the acquisition priority, browser authority and related dependency/calendar statements in the earlier [selected-tracks plan](stocklana-selected-tracks-implementation-plan.md). That plan remains the SSOT for the Main + Meteora + PreStocks + Tessera evidence lanes, static/provider catalogs, app migration and non-purchase release gates. [User-authorized browser execution v1](contracts/user-authorized-browser-execution-v1.md) is the transaction contract; the [unsigned acquisition contract](unsigned-acquisition-tool-contract.md) remains the owner quote/template and admission basis.

The proposed [mobile investing plan](mobile-investing-implementation-plan.md) adds Portfolio/Activity and a separately gated native-client sequence. It does not broaden this deadline browser purchase, reuse browser acceptance as native acceptance, or add sell/basket execution. Until a native transaction contract and physical-device evidence are accepted, this document remains authoritative for the only planned P0 effect surface.

Plan acceptance is not runtime acceptance. No code, dependency, wallet, key, RPC credential, database, migration, funded account, signature, submission, deployment or contest submission is authorized by this document. Current Benten remains snapshot/read-only and no-sign/no-send.

The MVP is complete only when one investor can, in the real application and on one exact reviewed route:

> discover the exact instrument → understand rights/facts and market state → enter an exact USDC amount → review a fresh complete quote and audited transaction → explicitly sign in the connected browser wallet → submit once from the browser → reconcile the known signature to finality → verify the causal output-token holding.

An external-site link, indicative quote, candidate output, unsigned template, simulation, fake transaction, known signature without finality, or wallet balance without causal transaction evidence does not satisfy the purchase terminal condition.

## 1. Fixed scope and non-goals

| Area | P0 | Explicitly outside P0 |
| --- | --- | --- |
| Investor | Intended primary audience; human-controlled exact-in buy | Advice, ranking, managed account or eligibility guarantee |
| Assets | mainnet USDC candidate and exact NVDAx candidate (the only current intersection of a verified-fact issuer and fixed observed Meteora route), subject to fresh identity/rights/route gates | every catalog asset, PreStocks/Tessera execution, arbitrary token input |
| Route | one selected venue and route | three-venue routing, Raydium, split routes, RFQ/managed order substitution |
| Effect | one user-gesture wallet sign and one direct browser RPC send | server/provider relay, delegated funds, autonomous/agent order, silent retry |
| Order type | market-style exact-in with raw debit ceiling and raw net minimum | sell, exact-out, limit, DCA, recurring, batch or cancel/replace |
| Outcome | known signature, finalized transaction and causal holdings delta | Benten recovery promise, server order ledger, settlement guarantee |
| Sponsor lanes | selected DBC, PreStocks and Tessera evidence remain required independently | assuming their mints are purchasable or DBC-compatible |
| Tools | existing snapshot facts API and local stdio MCP remain; purchase is browser-only | remote MCP/ChatGPT/Claude transaction execution |

The DBC operator workbench is secondary advanced evidence. The investor does not pass through curve configuration to buy the selected existing stock token. A distinct DBC base token never inherits xStock rights from its quote mint.

## 2. Architecture and trust boundary

```text
snapshot facts/catalog ---------------------------> public Web dossier
provider evidence BFF ----------------------------> comparison (read-only)

browser purchase UI
  -> anonymous product session + CSRF + one-use nonce
  -> purchase-context BFF (no wallet key, signature, send or order state)
  -> isolated connectivity owner (route/quote/build/simulate/audit only)
  -> audited unsigned public-safe context
  -> browser repeats full audit
  -> Wallet Standard sign-only feature under explicit user gesture
  -> browser proves signed message unchanged
  -> browser one direct RPC send
  -> browser signature/finality/transaction-meta/holdings reconciliation
```

Benten owns presentation, session/admission, Wallet Standard connection, local transaction audit, user gesture, one-send state machine and client-only receipt. The connectivity owner owns generic route/provider policy, coherent quote, owner-sensitive account resolution, transaction build, no-send simulation and full unsigned audit. It never receives a signed transaction. Benten imports no owner/private package; the owner imports no Web/session package. Private analytics, portfolio, OMS, risk/admin database and internal names are unreachable from both public artifacts.

The existing quote operation remains byte-free. Purchase uses a new operation and scopes defined in the purchase contract. Facts requests strip every acquisition cookie/header and survive purchase-owner/BFF/Redis/RPC failure. No server persists wallet address, signed bytes, signature, order or holdings. Client-local receipt storage is bounded and never uploaded.

### Current versus proposed stack

- **Current:** Next.js facts Web/API, local stdio MCP, snapshot artifacts and read-only Solana helpers; no acquisition route.
- **Previously proposed:** independently built React Router `7.18.3`/Vite Web and Hono `4.13.7` Node API/BFF after `F0-W/F0-A`; app-local typed consumer contracts; shared Redis 7-compatible admission; isolated owner runtime.
- **This plan adds:** a purchase feature package in the proposed Web, a separate BFF purchase-context route and an isolated owner builder/auditor. It does not reopen the stack choice. Versions remain candidates until the existing feasibility nodes prove install/build/runtime/license/lock compatibility.
- **Wallet/RPC dependencies:** choose exact package versions only in `PX-W0` after Wallet Standard capability, browser bundle, CORS/RPC, transaction-version and security verification. No `@latest` or dependency install is authorized by this plan.

### Actual-code gap at the planning base

At Benten `f25c6b3` and owner `d358bd6`, wallet packages/components exist but are not mounted and remain read-only. The current holdings helper loses the raw account identity/basis through `uiAmount:number`, does not aggregate by exact mint safely and reads across up to two query slots; it cannot prove post-trade holdings. The current publication guard is a repository-text lexical deny, not the required AST/import graph with one browser-island exception. Owner C2c accepts injected evidence and is deliberately fixed to candidate/unavailable; no positive runtime assembler, expiry, builder, final audit/simulation or execution reconciliation exists. These are implementation inputs, not capabilities to relabel. `PX-C0/W0/O1/U1` must replace or isolate each gap under tests rather than bypass the present guards.

## 3. Route-selection gate

The working recommendation is **direct Meteora DLMM first**, with one bounded **Jupiter onchain-router alternative** only if Meteora fails by the route checkpoint. It is a hypothesis until the dated research receipts and `PX-R0` tests close.

Meteora wins only if the exact NVDAx/USDC route proves: pinned `@meteora-ag/dlmm` package/source and `swap2` ABI/IDL integrity/license/Node support; coherent Token-2022 quote and build from reviewed state; `partialFill:false`; exact raw minOut/fee/hook/Scaled UI behavior; deterministic decoded transaction; browser-wallet compatibility; and complete program/account/ALT audit. A Memo program account required by the instruction may be read-only under the exact route policy, but an arbitrary Memo instruction is rejected. Active transfer hooks fail P0 unless their program, accounts and semantics receive exact independent review.

The selected SDK builder performs internal ATA reads, compute simulation/estimation and blockhash access. The owner must instrument and record every SDK connection read, reject unexpected calls, then independently refetch/validate the final route, mint, account, ALT and chain context and run a fail-closed final simulation on the actual message. Dynamic-fee wall time must be reconciled against the captured chain Clock; the SDK's compute-estimation catch/fallback to 1,400,000 units is not proof. A quote-only SDK result is insufficient, and post-output-transfer `outAmount`/`minOutAmount` must not have transfer fees deducted twice. The builder call graph also reopens the native `bigint-buffer` advisory boundary: exact lock/integrity, reachable fixed-length decode guards, hostile-data negatives and process-crash containment must pass for a public HTTP worker; the old isolated C2b quote waiver is not inherited.

Jupiter may replace it only if the exact pair proves an onchain-router `/build` result that the client can sign and send directly without provider `/execute` relay; one hop through one reviewed pool; exact `dexes` plus post-build pool/account enforcement because the current schema does not expose legacy `onlyDirectRoutes`/`restrictIntermediateTokens`; no unreviewed RFQ/market-maker leg; current authoritative ABI/CPI decoder and decoded instruction/account/ALT equivalence; exact Token-2022 net-min semantics; provider authentication/cost and timeout behavior; and the same browser audit. Opaque bytes, dynamic route expansion outside policy or inability to bind source/route fails the alternative. Raydium is not started in parallel.

The selected route is frozen in the signed route-policy artifact before UI execution integration. A provider outage never changes venue automatically. If neither candidate passes, Buy is disabled and the purchase-complete claim fails; the read-only sponsor lanes may still be demonstrated honestly but are not relabelled as the requested MVP.

## 4. Requirement traceability

| ID | Requirement | Contract | Future path / owner | Node | Test or evidence | Hard stop / rollback |
| --- | --- | --- | --- | --- | --- | --- |
| PX-01 | exact one-pair P0 | purchase v1 §§1,3 | Benten policy artifact + owner route policy | PX-C0,PX-R0 | wrong mint/cluster/program/pool/route all unavailable | disable Buy; facts stay |
| PX-02 | complete economic review | unsigned §4 + purchase §3 | owner quote/build/audit | PX-O1 | raw debit/gross/net/min, all fee rows, slippage/impact/expiry vectors | unknown required economics emits no bytes |
| PX-03 | audited message | purchase §3.3 | owner auditor + browser audit | PX-O1,PX-U0,PX-U1 | extra signer/program/account/ALT/hook/transfer/tip/referral/mutation negatives | no context or sign |
| PX-04 | wallet user gesture | purchase §4 | browser wallet module only | PX-W0,PX-U1 | capability/account/chain/connect/reject/disconnect/change | disabled or return to fresh context |
| PX-05 | one send/no retry | purchase §§4–5 | browser machine/RPC module | PX-U0,PX-U1,PX-I0 | two tabs, double click, timeout, lost response, refresh | known-signature reconciliation only |
| PX-06 | finality/causal holding | purchase §5 | browser status/local receipt | PX-U0,PX-U1,PX-I0 | confirmed→finalized, failure, reorg/drop, token deltas, current-balance mismatch | never claim complete without causal delta |
| PX-07 | owner/BFF authenticity | unsigned §4 + purchase §§2–3 | owner O2 HTTP + acquisition BFF/admission | PX-O2,PX-B0,PX-B1 | owner auth/scope/caps/deadline/error plus Origin/Host, CSRF, nonce race, shared quota, store down/restore | purchase off/facts up |
| PX-08 | no custody/private state | purchase §§1–2 | both build/import policies | PX-S0 | no key/seed/signed bytes/order DB/private import/env/log | critical/high blocks RC |
| PX-09 | investor-safe UX | purchase §6 + accepted design SSOT | public Web | D1-PX,PX-U1,PX-QA,PX-V0 | independent runtime QA and comprehension of rights, reference vs quote, amount/min/fees/expiry/state/next action | repeat design/QA; never weaken copy |
| PX-10 | actual purchase evidence | purchase §7 | separately authorized smoke owner/user | PX-QA,PX-E0 | exact activation artifact and one ≤1 USDC trade, signature/finality/meta/holding, fee/rent receipt | no authority/funds/QA => not complete |
| PX-11 | sponsor lanes independent | Market/Provider contracts | existing selected-plan owners | existing D3-DBC,D3-P,D3-T | unchanged positive evidence and outage isolation | missing proof returns to claim/RC |
| PX-12 | current boundary cutover | purchase §§1–2 | CLAUDE/import policy later | PX-C0,PX-S0 | old no-sign scan remains until reviewed replacement; allowlist-only exception afterward | no early wallet/send code |

Existing `ME-01..09`, `PA-01..08`, `SEL-*` tests remain normative. Purchase tests use `PX-*`; they do not promote provider/market candidates.

## 5. Canonical execution nodes

Each implementation dispatch records base commits plus SHA-256 of purchase v1, unsigned v1, selected-plan, owner ADR, route-policy artifact and this plan. A digest mismatch stops the node. Paths are exclusive; one writer owns shared files at a time. Every node has its own commit and rollback switch.

| Node / owner | Dependencies | Inputs → outputs | Allowed future paths | Acceptance and abort |
| --- | --- | --- | --- | --- |
| `PX-C0` contract freeze / contract owners | PLAN | reviewed schemas/policy candidates → accepted digests | purchase contract, public types/OpenAPI, owner contract docs | strict fixtures and independent review; high finding stops all purchase code |
| `PX-R0` route decision / owner | PX-C0,C2b/C2c evidence | Meteora and at most one Jupiter evidence set → one selected route policy or unavailable | owner adapter/audit fixtures/evidence only | exact-pair quote+build+audit plus independent benchmark source/pair/raw basis/freshness/bound/fee-adjusted deviation; no winner or price source means Buy disabled |
| `PX-F0a` non-ready fixture core / both owners | PX-C0 | paired candidate/unavailable/expired owner+BFF fixtures → non-ready consumer parity | public contract fixtures; sanitized owner fixtures | own-envelope parsing, JCS outcome equality, raw-ingress negatives, ready rejected; no network/secret |
| `PX-W0` wallet/RPC feasibility / Web owner | PX-C0 | no-funds test wallet/capability/browser matrix → selected client versions/capabilities or unavailable | isolated feasibility test branch only | returned signed bytes from the sign-only feature, post-sign equality, mainnet chain/account, fixed RPC CORS/status methods; no funds/send |
| `PX-O1` owner builder/auditor / owner | PX-R0,PX-F0a | exact intent+cohort → audited unsigned ready/candidate/unavailable | owner contracts/application/selected adapter/tests | full economic+instruction/account/ALT/hook/simulation negatives; no signer/send/private import |
| `PX-F0b` audited ready fixtures / both owners | PX-O1 | selected route/decoder/message evidence → paired ready-min/max plus exact message fixture | public contract fixtures; sanitized owner fixtures | every ready field/role/digest/cap and owner/BFF parity; no evidence means no ready type/bytes |
| `PX-O2` owner purchase HTTP / owner API | PX-O1,OA0 | strict owner DTO → authenticated standalone owner response | owner purchase route, app/index composition, OpenAPI and transport tests named in the owner ADR | purchase scope/auth, caps/deadline/error/redaction, standalone build and private-import isolation; rollback removes route only |
| `PX-B0` fake BFF / Benten | PX-F0a | strict request + fake non-ready owner/test admission → lossless BFF states | acquisition-consumer and BFF purchase route/tests | new scope, caps/deadline, session/nonce/quota/error losslessness; ready remains blocked, no durable-store/auth readiness claim and no bytes in logs/store |
| `PX-B1` integrated BFF / Benten | PX-F0b,PX-O2,PX-B0,SA0,OA0 | real local owner result → browser context | same route/composition tests | non-ready and audited-ready parity, failure isolation, owner token nonreachability, purchase-off/facts-up; no synthetic ready |
| `D1-PX` interaction/design acceptance / design owner | PX-C0,PX-F0a; parallel with PX-R0/O1 | six state groups + non-ready fixtures → accepted visual-direction artifact | design artifacts/spec only | explicit acceptance; ready visual state stays fixture-blocked; no material screen build before it |
| `PX-U0a` non-ready pure browser core / Web owner | PX-F0a,PX-W0 | strict non-ready fixtures + injected storage/time ports → disabled/candidate/unavailable/expired reducers | purchase `machine,local-receipt` pure modules/tests only; no components | no ready/review/sign/send transition can be constructed; no visual/design claim, provider SDK, network or secret |
| `PX-U0` complete pure browser state core / Web owner | PX-U0a,PX-F0b | audited complete fixtures + injected wallet/RPC/storage ports → deterministic ready/audit/receipt reducers | purchase `machine,audit,rpc-status,local-receipt` + pure tests; no components | six groups, cross-tab/tombstone/send/status/holding transitions; F0b absence keeps ready states impossible |
| `PX-U1` accepted browser workspace / Web owner | D1-PX,PX-U0,S0 | accepted design + running RR/Vite shell + pure state core → disabled/fake Purchase Intent route and wallet adapter | `apps/public-web/app/routes/purchase.tsx`, route manifest/root handoff, purchase component/adapter/tests; shared app files have one Web writer | route `/purchase`, state/a11y/5 locales/mobile/200%; supported matrix only; feature off by default |
| `PX-I0` no-funds integration / owners | PX-B1,PX-U1,PX-W0 | local owner/BFF/Web + no-send fixture wallet/RPC → full state-machine evidence | integration tests/evidence only | exact context→signing boundary, no actual send; timeout/reorg/holding fixtures; no behavior gap |
| `PX-S0` independent security / reviewer | PX-O1,PX-B1,PX-U1,PX-I0 | build/SBOM/import/auth/audit evidence → release finding ledger | test/evidence and owner-scoped fixes | critical/high, arbitrary program/account, secret/order persistence or retry blocks release |
| `PX-QA` independent purchase runtime QA / design reviewer | PX-I0,D1-PX | running no-funds app at accepted viewports → independent QA receipt | screenshot/runtime evidence and Web-owner fixes only | six state groups, desktop/390px/200%/keyboard against accepted artifact; independent from Web writer; blocking finding returns to U1/I0 |
| `PX-E0` bounded funded smoke / user + release owners | PX-S0,PX-QA,mobile-plan MOB-S0/V0/H0 when Portfolio/Activity are in P0, legal/rights/route release, explicit fresh authority | user personally initiates, approves, signs and sends ≤1 USDC+measured fees/rent through non-public `authorized_smoke` → one signature/finality/holding receipt, then automatic disable | no code expansion; task-scoped sanitized evidence | post-mobile integration revision only; no inherited smoke, agent click/sign/buy or retry; mismatch/authority/funds failure means not run/not complete |
| `PX-V0` investor journey / product+design | PX-I0 and, for success claim, PX-E0 | target-user sessions → comprehension/action evidence | test/evidence only | users understand rights/reference-vs-quote/cost/min/expiry/status and next action; confusion blocks RC |
| `PX-RC` purchase release claim / product | PX-S0,PX-QA,PX-E0,PX-V0 plus `BASE0,L1,A0b,S0,D3-DBC,D3-P,D3-T,D2,V1,SEC0,VAL0` from the selected plan | one exact revision → demo/evidence/rollback packet | release docs/evidence only | purchase is shown only if actual route and receipt match; otherwise claim fails |

### Implementation approach by capsule

**Owner capsule (`PX-R0/O1/O2`).** Reuse C2a–C2c raw/cohort/economic primitives; do not copy provider math into Benten. Add strict purchase intent and audited-template application ports, one selected adapter composition, an exact policy artifact and sanitized golden messages. Instrument and record every SDK read (including ATA/blockhash/compute simulation), rebuild coherent economics after the last read, resolve ALTs and perform an independent fail-closed final simulation; the SDK's 1.4M-CU fallback is never proof. O2 alone mounts the authenticated owner HTTP operation after O1 passes.

**Consumer capsule (`PX-F0a/F0b/B0/B1`).** F0a freezes only paired non-ready envelopes and lets B0 prove a fail-closed fake transport. F0b adds ready-min/max/message only after O1; it is the dependency for the full browser state core and real integration. Add one contract/client/policy projection and one purchase BFF operation. Reuse the accepted session/Redis control plane but charge the same stable service caller/session/IP/global budgets; a new scope does not multiply quota. Request body is 2 KiB and the owner/BFF purchase response cap is 64 KiB, with the F0b maximum-shape fixture required to stay below 65,536 serialized bytes. The owner deadline is measured and must leave review time inside the quote/blockhash window. Missing store/owner response is a typed HTTP failure, not candidate success.

**Browser capsule (`D1-PX/U1/I0`).** Three route families remain: markets/comparison, exact dossier, then Purchase Intent workspace. The workspace has six fixture-driven state groups: browse/data; wallet/amount prerequisites; fresh/expiring/expired/unavailable context; immutable review/reject/account-or-network change; submit/pending/failed/unknown; finalized transaction/causal holdings. Route/amount changes restart intent. Account/network changes before sign invalidate; after sign, status remains pinned to the original signature/cluster. Detailed visual layout waits for the accepted design artifact; accessibility behavior and domain states are contractual now.

The visual implementation will use reviewed, officially generated shadcn primitives (`Field`, `Label`, `Input`, `Button`, `Card`, `Alert`, `Badge`, `Separator`, `Accordion`, `Skeleton`, responsive `Sheet`) and domain consumers for identity, economics, review, wallet state, transaction state and holdings evidence. They are **not installed today**: CLI availability is not a `components.json`, generated primitive set, or accepted foundation. The [investor UI implementation plan](../docs/ui-design/investor-ui-implementation-plan.md) owns the reproducible foundation/provenance gate, initial informational Home/Dossier implementation-first exception, and fixture mapping from this contract's existing receipt/lock states to user-visible facts and safe next actions. These names do not pre-approve a layout. The purchase workspace still requires its digest-bound interaction/design artifact and explicit human acceptance before `PX-U1`; the implementation then receives independent desktop/mobile runtime QA.

## 6. Authoritative DAG and parallelism

```text
PLAN -> PX-C0
PX-C0 -> {PX-R0,PX-F0a,PX-W0}
{PX-C0,PX-F0a} -> D1-PX
{PX-R0,PX-F0a} -> PX-O1
PX-O1 -> PX-F0b
PX-F0a -> PX-B0
{PX-O1,OA0} -> PX-O2
{PX-F0b,PX-O2,PX-B0,SA0,OA0} -> PX-B1
{PX-F0a,PX-W0} -> PX-U0a
{PX-U0a,PX-F0b} -> PX-U0
{D1-PX,PX-U0,S0} -> PX-U1
{PX-B1,PX-U1,PX-W0} -> PX-I0
{PX-O1,PX-B1,PX-U1,PX-I0} -> PX-S0
{PX-I0,D1-PX} -> PX-QA
{MOB-S0,MOB-V0,MOB-H0} -> PX-E0 [mobile-plan overlay when Portfolio/Activity are in the P0 release]
{PX-S0,PX-QA,LEGAL-ROUTE-RELEASE,EXPLICIT-FUNDED-AUTHORITY} -> PX-E0
{PX-I0,PX-E0} -> PX-V0
{PX-S0,PX-QA,PX-E0,PX-V0,BASE0,L1,A0b,S0,D3-DBC,D3-P,D3-T,D2,V1,SEC0,VAL0} -> PX-RC
```

`D1-PX` and SDK-free `PX-U0a` start as soon as strict non-ready fixtures exist. U0a can model disabled/candidate/unavailable/expired and durable no-resend storage rules, but cannot construct a ready/review/sign/send state. Full `PX-U0` acceptance waits for audited F0b fixtures; material components and route mount wait for accepted design and `S0`. `PX-B0` waits for neither real builder nor durable auth/store and remains non-ready-only. `PX-B1` can accept a real ready response only after both O2 and F0b; it cannot derive ready from B0. `PX-QA` is an independent runtime review after the full no-funds application path and before any smoke. PreStocks/Tessera and DBC do not gate O1. The selected-plan gate list in `PX-RC` excludes selected `R0`, preventing a cycle. Shared app/BFF files have one writer. Only `PX-E0` requires funds and actual effect authority.

### Capacity assumption and partial-failure cuts

This schedule assumes independent owners can run in parallel; elapsed time is not person-hours and the protected 48-hour UX window is an elapsed release phase. Planning estimates, including review/fix buffer, are:

| Lane | Focused effort / phase | Required availability |
| --- | ---: | --- |
| owner route/builder/auditor (`PX-R0/O1`) | 28–36 hours | one owner core writer + independent transaction/security reviewer |
| owner HTTP capsule (`PX-O2`) | 8–12 hours | a separate owner-API writer or a serialized handoff after O1; not counted in O1 |
| BFF/admission (`PX-B0/B1`) | 16–22 hours | one BFF writer; shared admission changes serialized |
| wallet feasibility + pure state (`PX-W0/PX-U0a/PX-U0`) | 14–18 hours | one Web-domain writer; U0a non-ready state starts before design acceptance, ready/audit completion waits for F0b |
| selected informational screens (`U0`) | 20–28 hours | one selected-Web feature writer after `S0` and selected D1; no shared route/root edits |
| accepted purchase feature/integration (`PX-U1/PX-I0`) | 20–28 hours | one purchase-Web feature writer after `S0` and D1-PX; may parallel selected components |
| shared Web mount handoff (selected U0 + `PX-U1` + Portfolio/Activity) | 6–10 hours | exactly one route/root/manifest writer serializes the accepted feature branches; counted here, not in feature rows or S0 |
| Portfolio observation/model/store (`PORT-F0/O0/L0`) | 12–18 hours | one read-only data/storage writer distinct from transaction owner; fixed RPC/import and IndexedDB work cannot be hidden in purchase U0 |
| Portfolio/Activity Web (`WEB-M0/PORT-W0/A0/I0`) | 18–26 hours | one additional feature-Web writer; shared route/root changes serialize through the mount handoff |
| Web/facts migration + owner/BFF control plane (`F0-W/F0-A/S0/A0b/OA0/SA0`) | 32–44 hours | platform/API/auth owners in parallel; purchase integration cannot treat these inherited gates as done |
| selected + purchase design acceptance (`D1`/`D1-PX`) | 10–14 hours + scheduled human acceptance | one coherent artifact may cover both, but each receipt/state scope is explicit; completes before its screen owner |
| selected runtime QA (`V1`) | 6–8 hours | independent designer after selected U0; not purchase QA |
| initial purchase `PX-QA` + protected-window repeat QA | 6–8 hours + reserved 6–10 hours | independent designer after PX-I0; repeat allocation remains Sep 22–24 and is not counted in D1/V1 |
| post-Portfolio mobile security/visual/human gates (`MOB-S0/V0/H0`) | 8–12 hours before funded smoke | independent security/runtime and visual reviewers plus user/product disposition; cannot be inherited from pre-Portfolio PX-QA |
| DBC selected proof | 20–28 hours | dedicated owner lane; cannot be absorbed into purchase route work |
| PreStocks and Tessera proofs | 12–18 hours each | independent adapters may run in parallel |
| security review (`PX-S0`) | 8–12 hours | independent transaction/security reviewer after integration |
| pre-freeze smoke/preliminary journey/release preparation (`PX-E0`, preliminary `PX-V0`) | 6–8 hours before Sep 22 20:00 plus user appointment | release owner and target users; funded action is not agent labor and this is not final validation/RC |
| final investor validation/triage (`PX-V0`) | 2–3 hours on Sep 23 | product/research owner and target users; reserved outside Web implementation and repeat QA |
| final RC/evidence binding (`PX-RC`) | 2–3 hours on Sep 24 | release owner; reserved outside Web implementation and repeat QA |

By Sep 17 12:00 the release owner records named availability for owner-core, owner-HTTP, BFF, selected-Web, purchase-Web, Portfolio-data/storage, Portfolio/Activity-Web, the sole shared mount writer, platform/auth, designer/QA, security and sponsor-adapter lanes plus the user appointment. Minimum viable parallelism is owner core + BFF + platform/auth + sponsor producers + three feature-Web/data lanes + design/pure-state running concurrently, with O2 and the shared mount receiving explicit serialized handoffs; otherwise the elapsed schedule is not credible. If those lanes or reserved repeat-QA hours are unavailable, cut optional breadth immediately: extra amounts/instruments, alternate route implementation, advanced DBC operator fields and nonessential motion/copy variants. Portfolio/Activity are now P0, so missing capacity makes the P0 explicitly unmet or requires a reviewed re-baseline; it is not an optional fixture that may silently join. Do not pretend missing availability is buffer, merge owner/BFF/Web into one unreviewed change, consume the UX window with backend backlog, drop the purchase path, or drop a selected sponsor proof and call the plan complete.

Adding the mandatory Portfolio/Activity scope changes the pre-freeze hypothesis from 222–308 to **262–368 focused hours**: +12–18 producer/model/store, +18–26 feature/integration, +8–12 post-integration review, and +2–4 incremental shared-mount time. Sep 22–24 still separately reserves **6–10 repeat-QA hours**, **2–3 Sep 23 final-validation hours**, and **2–3 Sep 24 RC/evidence hours**, so the overall hypothesis is **272–384 hours**. These are planning assumptions, not observed velocity or a deadline promise; code generation time is zero but review/device/owner occupancy is not. Peak execution needs at least **eleven concurrent named lanes**: owner core, BFF, platform/auth, DBC, PreStocks, Tessera, selected-Web, purchase-Web/pure-state, Portfolio-data/storage, Portfolio/Activity-Web, and design, with QA/security scheduled before smoke. Owner-HTTP begins its separate 8–12-hour handoff as O1 stabilizes; the sole shared-mount writer serializes 6–10 hours across three Web branches. Sep 19 gates owner/O2/BFF/platform foundations, sponsor producers, Portfolio model/RPC/store and accepted mobile design; Sep 20 gates the three Web branches plus mount/no-funds integration; Sep 22 12:00 gates `MOB-S0/V0/H0` before `PX-E0`; Sep 22 20:00 gates smoke/preliminary journey and feature freeze; Sep 23 performs final investor validation/triage; Sep 24 binds `MOBILE-RC`. The post-freeze verification owners and hours do not replace the feature-Web owners' protected 48-hour UI allocation or the independent repeat-QA reserve. If eleven lanes, handoff owners or stated capacity are not committed at the decision checkpoint, the plan is capacity-at-risk and mandatory unmet work is reported rather than moved into the UX window.

## 7. Tests and evidence matrix

| Suite | Required cases |
| --- | --- |
| `PX-CONTRACT` | strict unknown/duplicate/missing/oversize; canonical integers; union one-to-one mapping; owner→BFF digest/parity; wrong status promotion |
| `PX-ROUTE` | wrong genesis/mint/program/pool/vault/authority; unsupported Token-2022 extension/hook; fee schedule boundary; Scaled UI display-only; route/provider revision change |
| `PX-TX` | extra/missing/reordered instruction; duplicate index/address/binding; wallet and token-program role aliases; wrong pool/bin-array/bitmap PDA or ordinal; generic writable escape; opaque data; hidden CPI role; wrong signer/recipient; extra transfer; delegate/close/memo/tip/referral; compute/ALT/caps; wallet mutation |
| `PX-ECON` | raw input/debit/gross/net/min; mixed fee mints; unknown vs known zero vs not-applicable; rent/network/priority; slippage/impact; independent price source absent/stale/wrong-pair/wrong-basis/out-of-bound/fee-difference; expiry and block-height independent; quote/build mismatch |
| `PX-WALLET` | no Wallet Standard, unsupported capability, connect rejection, account/chain mismatch, disconnect, account/network change before and after sign, wallet mutation, multiple signer slots |
| `PX-SEND` | exhaustive state×phase×signature×send marker; generation fencing; tombstone/prompt/signed-persist/send-invoked crash points; signed-persisted reload loses ephemeral bytes and requires new context/review/wallet gesture; wallet reject; post-sign expiry/mutation; write failure; double tabs; detectable IDB corruption/unavailability; full-storage-erase limitation copy; RPC 429/5xx; no automatic retry |
| `PX-CHAIN` | landed then long-offline/pruned/null; history disabled/lagging backend; processed/confirmed error and fork regression; exact finalized failure; existing/new ATA; Token-2022 withheld fee; v0 ALT; unrelated deposit; fee/rent ceiling |
| `PX-BFF` | Origin/Host/CSRF/nonce, concurrent session, shared quotas, rotation/revoke/restore, timeout/cap/error mapping, secret/cookie/wallet/bytes redaction, facts survive outage |
| `PX-BOUNDARY` | public build import graph; only wallet feature imports sign/send; no private owner package, keypair/secret/delegate/provider SDK/server send/order table; artifact/env/string scan |
| `PX-UX` | keyboard/focus/screen reader, 390 px, 200%, 5 locales; risk copy; expiring threshold without noisy announcements; every disabled/error/unknown state states the next safe action |
| `PX-E2E` | two contexts keep static execution digest equal and attempt audit digests distinct; tamper fails receipt; code/config change invalidates evidence; ≤1 USDC authorized smoke; exact signature/finality/meta/holding; feature-off rollback/facts-up |

No test fixture, devnet transaction or simulation is labelled mainnet purchase proof. A real bounded smoke is preserved as a separate evidence class and never replayed automatically.

### Evidence inheritance through the protected UX window

`execution_artifact_digest` is the JCS/SHA-256 projection of immutable SHA-256 digests for the purchase contract/schema, owner builder and O2 transport, route/consumer/transaction policy artifacts, BFF client/route, browser wallet/state/decoder modules, route manifest, dependency-lock subset and fixed RPC configuration, sorted by artifact ID. It excludes intent, wallet, amount, blockhash, source slot, balances, fees, message and every attempt-local field. `audit_summary_digest` separately hashes the receipt's exact JCS attempt summary; the receipt binds both with intent/context/message. The same build with two valid contexts must keep the execution digest equal while audit-summary digests differ. Summary tampering fails that receipt; an execution digest change invalidates security/QA/smoke inheritance. The smoke receipt, PX-QA receipt, video and RC record the static digest.

| Change after smoke | Existing smoke reuse | Required action |
| --- | --- | --- |
| copy, CSS or layout only outside execution modules | allowed only if an independent impact attestation proves the execution digest unchanged | rerun affected accessibility/state screenshots and PX-QA; bind final Web revision plus unchanged execution digest |
| wallet adapter/state/storage/decoder | forbidden | disable purchase; fresh security+PX-QA+fresh user authority and new smoke, or report unmet |
| owner builder/O2 transport, BFF projection/admission, route/transaction policy, ABI/ALT/program set, dependency/RPC config | forbidden | same full revalidation and new smoke requirement |
| release-blocking safety repair whose impact cannot be proven non-execution | forbidden | no deadline exception; disable purchase and report unmet if a new authorized smoke cannot finish safely |

The protected window permits UI defects and release-blocking safety repairs, not evidence laundering. It never assumes the user will fund a second purchase.

## 8. Operations, cost and recovery

No new durable server order store is required. Existing proposed PostgreSQL owner policy/auth and BFF Redis admission remain separate; purchase adds scopes/policy rows only in a later authorized implementation, not a new order schema. Browser IndexedDB may hide finalized failure/success and pre-sign-aborted history after 24 hours. A `send_invoked` unresolved tombstone has no TTL and remains locked until exact finalized failure or verified holdings; pruning/null/expiry cannot unlock it. Server logs and telemetry use correlation/context digests and status/reason/latency only.

Before purchase activation measure per attempt: owner RPC/provider calls and bytes for quote/build/ALT/simulation; BFF/Redis operations; Web/RPC status polls; p50/p95 latency; expiry loss; 429/5xx; provider/API/RPC fixed and unit costs; log/monitoring cost; expected low/base/10× traffic. Recommended product infrastructure cap is **USD 100/month** until a separately reviewed purchase decision; it excludes user trade amount, network/priority fee, ATA rent and potential loss. Unknown provider/RPC/wallet pricing is never zero. No paid plan or purchase is authorized here.

Owner/BFF outage disables context generation. RPC outage after signing preserves `submission_unknown` and known signature locally; it does not invoke another provider or send. Policy/route revision, secret rotation or security incident disables new contexts but does not erase client receipts. Recovery means status lookup for the same signature or a fresh later intent after explicit user review—not replaying the old transaction.

## 9. Calendar and cut rules (JST)

| Deadline | Purchase checkpoint | Stop/cut rule |
| --- | --- | --- |
| Sep 16 23:00 | contract, mini-scope, route comparison rubric and digests reviewed | unresolved high finding blocks implementation |
| Sep 17 12:00 | early user-owned checklist plus named lane availability/handoff calendar and reserved repeat-QA hours: wallet/browser, legal owner, test wallet/caps, RPC/CORS, host/provider account | missing owner/authority/resource/capacity makes the schedule at risk now; optional breadth is cut and unmet mandatory work is not hidden |
| Sep 17 18:00 | `PX-W0` no-funds wallet/RPC feasibility and candidate dependency pins | no returned signed bytes or fixed browser RPC means purchase path unavailable |
| Sep 17 20:00 | `PX-R0` selects direct Meteora or explicitly opens one Jupiter alternative; `PX-F0a` frozen; fixture-driven D1 review starts | no safe candidate stops builder/UI success claim; no Raydium expansion; F0a is not ready evidence |
| Sep 18 12:00 | checklist decisions recorded; D1 purchase visual direction accepted; non-ready `PX-U0a` pure state work already in parallel | unavailable external dependency triggers route/release risk and optional cuts; no accepted design blocks components, not non-ready pure state/owner work; ready state still waits for F0b; actual funded action still needs fresh `PX-E0` authority |
| Sep 19 20:00 | `PX-O1/F0b/O2/B0`, inherited platform gates, sponsor producers and mobile `PORT-F0/O0/L0`, accepted `MOB-D1` pass | any mandatory producer/store/import gap blocks integration; no backend backlog moves into UX window |
| Sep 20 20:00 | `PX-U0/B1/U1/I0` plus required mobile `WEB-M0/PORT-W0/A0/I0` no-funds integration | full state or mobile gap is explicit P0 unmet/re-baseline; optional breadth already cut |
| **Sep 22 12:00** | `PX-S0/PX-QA`, mobile `MOB-S0/V0/H0`, legal/rights/route release and explicit funded-smoke go/no-go | mobile post-integration evidence precedes `PX-E0`; no authority/funds/QA means do not run |
| **Sep 22 20:00** | `PX-E0` smoke plus preliminary `PX-V0` journey/release-preparation evidence, or explicit unmet status; all selected features frozen | this is not final validation/RC; purchase P0 is not cut to call read-only complete |
| Sep 22 20:00–Sep 24 20:00 | protected 48-hour investor UI/UX refinement, journey fixes and reserved 6–10 focused hours of repeat independent QA | **no feature additions or contract expansion**; UI defects and release-blocking safety repairs remain allowed only by their owners; API/security owners do not consume the UI or QA allocation |
| Sep 23 20:00 | final investor validation plus safety/load/cost triage and repeat-test queue (reserved 2–3 hours, separate from repeat QA/Web work) | confusion, false semantics or safety finding is found before final RC |
| **Sep 24 20:00** | final `PX-RC`, exact-revision evidence binding and 90-second demo (reserved 2–3 hours) | only release-blocking fixes; rerun affected audit/QA; no old preliminary evidence is relabelled final |
| **Sep 25 20:00** | evidence packet ready, nine-hour buffer | no feature work; signed-out links/form/deadline rechecked; submit only with authority |
| **Sep 26 05:00** | current official deadline | no planned buffer work |

Cut in order: extra instruments, optional DLMM sizes beyond the one P0 amount band, new provider/venue connections, advanced DBC operator breadth, and nonessential visual flourish. Do not cut the one purchase path, selected sponsor minimum proofs, security/a11y standards or protected UX window and call the result complete. If purchase or a selected proof is missing, return to the claim/RC decision and state the unmet target.

## 10. Demo, activation and remaining unknowns

The 90-second story begins with the investor problem. It shows exact identity/rights, provider comparison, one fresh executable review, explicit wallet approval, known signature/finality/holding, then DBC operator depth and truthful boundaries. PreStocks/Tessera remain clearly read-only comparison instruments. Every screen/video/evidence row binds one revision; failure footage is never narrated as a successful purchase.

Before external activation, independently verify: selected wallet support and terms; exact browser RPC/CORS/rate/cost; provider package/API version and license; exact pair liquidity and transaction form; current Token-2022 extensions/fees/hooks; xStock rights/eligibility copy; route/program deployment identity; owner/BFF isolation; mainnet funded smoke authorization; deployed host/build; and contest link/form facts. A document cannot close these gates.

The jurisdiction/distribution gate must review the exact current NVDAx final terms and intended user location/action. xStocks' legal overview describes a tracker certificate/bearer debt instrument rather than direct equity/voting rights; current public availability and restricted-country pages use different scopes and distributor requirements. They do not establish that Japan or a permissionless secondary-market route is allowed. Do not copy primary mint/redemption KYC or minimums onto secondary trading without scope evidence, and do not treat a technically closed route as legal eligibility. Sources rechecked 2026-09-16: [xStocks legal overview](https://docs.xstocks.fi/docs/product-legal-overview), [xStocks public site](https://xstocks.fi/), and [Backed restricted countries](https://assets.backed.fi/legal-documentation/restricted-countries).

Contest facts rechecked 2026-09-16 remain: structured submission deadline 2026-09-25 20:00 UTC (**Sep 26 05:00 JST**), structured judging deadline 2026-10-09 00:00 UTC without an announcement-date claim, USD 121,000 cash pool, and up to three sponsor-track selections under the common guide. Main + Meteora + PreStocks + Tessera remains the product/track plan; eligibility, stacking and hidden form remain unverified. Sources: [Stocklana](https://hackathons.solana.com/hackathons/stocklana) and [How it works](https://hackathons.solana.com/how-it-works).

If the funded smoke is not authorized or fails, retain the independently useful facts/comparison/DBC surfaces but report that the purchase-complete MVP was not achieved. No fallback may enable an unaudited Buy control.
