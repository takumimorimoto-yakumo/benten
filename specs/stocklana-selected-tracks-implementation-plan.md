# Stocklana selected-tracks implementation plan

Status: **implementation-ready plan; no implementation or external action is authorized by this document**, updated 2026-09-16.

For deadline scope and priority, the [2026-09-23 submission plan](stocklana-submission-plan-2026-09-23.md) is now the authoritative document. This document is retained as history.

This is the execution-order SSOT for the user-confirmed sponsor selection **Meteora + PreStocks + Tessera**, alongside the main prize. It takes precedence over the broader capability ordering in [Stocklana award strategy](stocklana-award-strategy.md) for the 2026-09-26 deadline. The broader document remains the decision history and future-capability map. The later [purchase-complete MVP plan](stocklana-purchase-mvp-execution-plan.md) supersedes this document only for acquisition priority, browser execution authority, purchase nodes/tests and their calendar/cut rules; this document remains authoritative for selected sponsor evidence, migration and shared release gates. Clawpump, Pyth and Raydium remain future work. Jupiter is only the purchase plan's conditional single-route alternative and is not a parallel sponsor or breadth dependency. Selection does not prove eligibility, stacking, hidden-form availability, acceptance or an award.

The proposed [mobile investing plan](mobile-investing-implementation-plan.md) changes the investor product horizon, not the sponsor proof bar: Portfolio/Activity may present selected evidence, but Meteora DBC, PreStocks and Tessera remain independently required deadline lanes. Native packaging is the first optional cut and cannot substitute for, merge or silently remove those proofs. The DLMM buy remains distinct from DBC award evidence.

Delivery in this turn is plan-only. It changes no code, registry, environment, database, credential, runtime, deployment, provider account, wallet, transaction, submission or public surface.

Planning bases are Benten `17abc1f0ed63c760a5aa59f517327e8fa2ac95ed` and the connectivity owner `e1d9c3c53da1254af1b3b07cb54e25494e2e3325`. Implementation dispatch must record these or a reviewed successor plus SHA-256 digests of Market Evidence v1, Provider Asset Evidence v1, the unsigned acquisition contract and this plan. A digest mismatch stops the node until explicitly reviewed.

## 1. Outcome, users and proof bar

The user-confirmed intended primary audience is investors/researchers who need to distinguish provider-specific instruments tied to one company, understand rights and reference-value semantics, inspect verifiable Solana market evidence, and retain control of any later action. This is product direction, not an observed usage-share claim. The supporting DBC operator flow is a secondary advanced route: it explains whether an xStock can serve as a DBC quote asset, compares two explicit hypothetical configurations, and monitors a reviewed existing DBC market without launching anything. Ordinary investors must not pass through operator configuration to complete the primary journey.

The deadline product must prove these tasks on one revision:

1. Search a reviewed catalog and open a company/instrument dossier.
2. Compare xStocks, PreStocks and Tessera instruments without merging mints, providers, rights, units, source times or value meanings.
3. Show that PreStocks/Tessera provider references are **not** executable quotes, NAV or issuer/company valuation.
4. For a small reviewed xStock pilot, show positive Meteora DBC eligibility/config observation and deterministic A/B scenario diagnostics; show a separate existing-market monitor state.
5. Complete one user-authorized exact-in stock-token purchase under the separate purchase contract. It is P0 for the product/Main story but remains independent of the three sponsor-evidence lanes; PreStocks/Tessera do not become purchasable and DBC evidence does not become the execution route.
6. Preserve existing source-verified facts even when every provider/market service is unavailable.

The product gives evidence and deterministic calculations, never investment advice, a safety score, a recommended curve, eligibility, custody or transaction authority. A newly created DBC base token paired with an xStock does not inherit xStock/equity/issuer/redemption rights. PreStocks and Tessera mints are not assumed DBC-compatible.

The deadline target is now an end-to-end non-custodial investor transaction application: `discover -> compare -> review amount-specific conditions/fees/unknowns -> approve in the user's own wallet -> track submitted/pending/confirmed/failed-or-unknown -> verify resulting holdings`. An external-site handoff alone does not complete it. The current repository still remains no-sign/no-send and never stores a private key; the plan-only authority change does not enable a current Buy control. The purchase plan defines the separately reviewed implementation, legal/route/security and funded-smoke gates that must pass before such a control can exist.

## 2. Fixed current state and proposed topology

### Current, unchanged

- The current public Web is Next-based. Existing facts are a reviewed snapshot projection: 154 xStock identities, 128 legacy rows, and source-verified financial coverage for 3 companies/14 facts. The local stdio MCP exposes facts only.
- Existing Web/API/MCP behavior, the exact xStock registry and the 775-document design baseline remain protected until an authorized cutover.
- Accepted local C2a/C2b/C2c work is no-effect candidate/unavailable evidence. It is not a public quote, ready route or production provider.
- No remote MCP, ChatGPT/Claude app, trading tool, wallet, signer, order, launch or settlement surface exists today or is delivered by this plan-only turn.

### Proposed, still unimplemented

```text
browser
  -> immutable public Web (React Router v7 + Vite candidate)
       -> independent Hono/Node facts API (existing facts semantics only)
       -> dedicated acquisition/evidence BFF
            -> isolated public-safe owner API
                 -> Meteora read adapter
                 -> PreStocks read adapter
                 -> Tessera read adapter

future accepted purchase profile only:
browser purchase workspace -> purchase-context BFF -> isolated audited-template owner
                           -> explicit wallet gesture -> one browser RPC send/status
```

The Web keeps a build-time facts projection and two immutable identity artifacts:

- existing xStock registry revision: generates the current 5 Home + 154 × 5 dossier documents;
- `provider-assets.v1.json`: reviewed PreStocks/Tessera identity allowlist with its own revision.

Provider assets do **not** add xStock routes or change the 775 baseline. OpenAI/Kalshi provide the four-instrument PreStocks/Tessera comparison pilot; they are not required to also have xStock instruments. The reviewed xStock/Meteora pilot is a separate company/market lane. The [investor journey](../docs/ui-design/investor-journey-plan.md) and [UI implementation plan](../docs/ui-design/investor-ui-implementation-plan.md) now phase these proposals against the real static capsule: `/` and localized Homes stay canonical discovery, `/markets` is a future query-preserving 308 alias rather than a second catalog, and provider/company/DBC families remain additive only after their strict artifact and route gates. Their enumerated outputs and `web_release_id` are checked separately:

| Route | Initial data | Explicit refresh | Purpose |
| --- | --- | --- | --- |
| canonical Home plus future `/{locale?}/markets` 308 alias | reviewed provider/xStock slim catalogs | none | one searchable, filterable instrument catalog; no advice/ranking or duplicate catalog |
| `/{locale?}/company/{company_id}` | reviewed identity links and snapshot facts | provider evidence by exact selected ID | provider-distinct company comparison |
| `/{locale?}/market/{provider}/{provider_asset_id}` | reviewed provider identity and last approved evidence state | BFF session POST | rights/reference/chain/market evidence dossier |
| `/{locale?}/dbc/{pool_or_scenario_id}` | reviewed pilot identity or local scenario shell | BFF session POST | DBC eligibility, A/B diagnostics and existing-market monitor |

`locale?` means canonical English has no prefix and the four existing non-English locales retain their prefixes. Exact slugs come only from reviewed artifacts. Unknown/case/encoding variants follow the vNext 404/308 contract. The static manifest records xStock count, provider-asset count, each route list, artifact revisions and generated `.html`/`.data` pairs; release fails on an unreviewed item or missing/extra output. Initial browsing creates no session. The BFF issues the anonymous short-lived product session only after an explicit “Refresh evidence” or amount-specific quote action.

### Trust and ownership

Benten owns public artifacts, consumer schemas, presentation, BFF policy and UI. The isolated public-safe connectivity owner owns provider acquisition, normalization, Meteora math and provider credentials. The browser never receives an owner token. Snapshot facts, provider evidence and market evidence remain separate contracts. Private analysis, databases, OMS/risk/admin state and internal names cannot enter public artifacts, logs, bundles or provider requests.

## 3. Contract set and exact future paths

Existing normative contracts are reused, not redefined:

- [Provider Asset Evidence v1](contracts/provider-asset-evidence-v1.md): strict PreStocks/Tessera identities, raw-response digest, reference/rights/chain semantics and BFF operation.
- [Market Evidence v1](contracts/market-evidence-v1.md): DLMM/DBC identity, observation, scenario and unavailable unions.
- [Unsigned acquisition contract](unsigned-acquisition-tool-contract.md): `__Host-` session, CSRF, one-use nonce, Redis TTL/admission, limits and nested errors.
- [User-authorized browser execution v1](contracts/user-authorized-browser-execution-v1.md): the separately gated purchase intent, audited template, browser audit/sign/send/status/holding and no-retry contract.
- [vNext architecture](vnext-architecture.md): RR7/Vite Web, independent Hono/Node facts API, ingress, release skew and rollback.
- [Multi-venue plan](multi-venue-acquisition-plan.md): owner quote wire, no-sign/no-send, operations and cost equations.

Future read-only public paths:

```text
packages/acquisition-consumer/src/{provider-asset-evidence-v1,market-evidence-v1}.ts
packages/acquisition-consumer/src/provider-assets.v1.json
apps/acquisition-bff/src/routes/{provider-assets,market-evidence}.ts
apps/public-web/app/routes/{markets,company,market,dbc}.tsx
apps/public-web/app/components/domain/{instrument-identity,rights-evidence,reference-value,market-readiness,dbc-diagnostics}.tsx
```

Future owner paths remain those in the internal owner decision: strict contracts/application ports, separate PreStocks/Tessera adapters, and Meteora DLMM/DBC adapters. Provider SDK/HTTP clients never enter public Web/domain packages.

Exact purchase paths and the only permitted wallet/sign/send import boundary are defined in the purchase plan and contract. They are not added to the current build merely by appearing here.

The existing local stdio MCP does not gain provider/quote/purchase tools in this deadline slice. Remote MCP and ChatGPT/Claude app onboarding are deferred. The future purchase BFF may proxy only a strictly audited unsigned template to the browser under the distinct purchase scope; it never receives signed bytes or submits a transaction.

## 4. UI information and interaction requirements

This plan fixes information architecture, states and interaction requirements only. `D1` starts immediately in parallel with backend work and uses strict provider/market fixtures to resolve every investor-facing state; it does not wait for live adapters. A new digest-bound visual direction and explicit acceptance by `ui-ux-designer` still precede material screen code; `web-developer` implements it, then an independent designer performs runtime QA. The accepted `D1 -> U0 -> independent QA` order is unchanged.

Use app-local default shadcn primitives: `Field`, `Label`, `Input`, `Select`, `Table`, `Pagination`, `Badge`, `Skeleton`, `Alert`, `Card`, `Separator`, `Accordion`, `Button` and responsive `Sheet`. Domain components own semantics; primitives never infer status.

1. **Markets** — default A–Z, 20 rows, URL-backed query/provider/asset-kind/evidence-state/page/sort. No private score or recommendation.
2. **Company comparison** — one company heading, then separate instrument cards. Each card shows provider, asset kind, exact mint/contract, rights state, provider reference kind/value/currency/as-of, chain evidence and unknowns. “Same company” never implies same rights or units.
3. **Market dossier** — identity first, then source/rights, provider reference, verified chain/market evidence and action boundary. The primary label is “provider reference,” “auction reference,” or “indicative quote,” never generic “price.”
4. **DBC workbench** — investor read pane for base/quote roles, curve/liquidity/migration flags and unknowns; a secondary advanced operator pane for explicit A/B inputs, deterministic differences and field-level invalid results. The investor route does not require opening the operator pane. A hypothetical scenario and live observation remain tagged and visually distinct.

States are `static_reviewed`, `loading`, `verified_reference|verified_observation|verified_scenario`, `candidate_unverified`, `unavailable`, `stale`, `expired`, `invalid_input`, `partial_outage`. Only a positive producer may create a positive state; a consumer cannot promote it. Facts remain visible during provider/BFF failure.

Exact grid, density and component composition remain for the accepted visual-direction artifact. Mobile must preserve one semantic order: identity → rights/reference → market evidence → action boundary. At 200% zoom and 390px there is no horizontal page scroll. Body text is at least 16px and targets at least 44px. Keyboard order, visible focus, `aria-sort`, live result counts, error focus, locale parity and Back/scroll restoration are acceptance requirements. Expiry is announced only at threshold/expired transitions.

CTA labels are factual: “View source,” “Refresh evidence,” “Compare scenarios,” and “Copy identity.” There is no **current** “Buy,” “Launch,” “Best,” “Safe,” signature or send CTA. A future Buy control exists only inside the accepted purchase workspace after every purchase-plan readiness gate; its disabled states must not imply that the plan itself is a working route.

The minimum provider demo matrix is four reviewed instruments: an OpenAI-linked and a Kalshi-linked PreStocks instrument, and an OpenAI and a Kalshi Tessera T-Token. A slot is included only when the reviewed artifact contains its exact ID and the adapter can return truthful evidence; absence remains unavailable and is not silently replaced or presented as full catalog coverage. The comparison first renders static reviewed cards. The user refreshes one card at a time through a deterministic FIFO queue because the anonymous session allows one in-flight operation and one-use nonces. Cross-tab `409`, lost response and nonce conflict stay on the affected card and are never auto-retried. A timeout or failure preserves other cards' obtained evidence, individual source times and the static catalog.

## 5. Runtime, admission, resilience and cost assumptions

The BFF operations are the exact `POST /api/acquisition/provider-assets` and market-evidence operations defined by their contracts. They share the existing anonymous session, CSRF, one-use nonce, atomic Redis lease/counter model, trusted-ingress IP derivation, server-held owner credential, stable service-caller quota and global circuit. Browser cookie/CSRF/nonce never reach the owner or logs. Facts requests strip acquisition headers. Unknown method/path never falls through to facts or HTML.

Owner and BFF deadlines, response caps and error mappings remain operation-specific contract values; the outer Web budget must exceed the owner budget plus bounded projection overhead and must not trigger an automatic retry. Contract-defined request/auth/admission/transport failures retain their exact HTTP 400/401/403/404/405/409/413/429/5xx mapping and nested error envelope. HTTP 200 `unavailable` is reserved for a successfully processed evidence request whose domain evidence is unavailable; consumers never collapse the two classes. Neither class evicts reviewed static content. Redis loss fails dynamic admission closed while facts and static dossiers remain available. Rollback selects the previous reviewed Web/provider-artifact revision and independently disables provider/market routes; it never routes through the private engine.

Freshness is contract-owned: provider fetch evidence is current through 5 minutes, stale through 24 hours and then expired; DBC public-chain evidence is current through 30 seconds, stale through 5 minutes and then expired. A source up to 5 seconds ahead is tolerated, more is invalid. Null provider as-of is never replaced by fetch time. Unavailable, fixture-scenario and non-live fixture-observation branches have separate exhaustive unions. Browser presentation records request-start and receipt monotonic anchors and advances from `evaluated_at` by the full conservative RTT plus elapsed monotonic time; wall-clock skew cannot extend validity. Missing/reset/non-monotonic anchors or unprovable background continuity force refresh. PA-08 and ME-09 own threshold/RTT/pageshow/skew and ME-07 wrapper tests.

Planning load model for measurement, not an SLO:

| Band | Journeys/day | Dynamic evidence refreshes/journey | DBC observation/scenario calls | Purpose |
| --- | ---: | ---: | ---: | --- |
| low | 20 | 1 | 0–1 | team/demo |
| base | 100 | 2 | 1 | hackathon pilot |
| 10× | 1,000 | 2 | 1 | fail/cost test |

Measure provider/RPC calls, bytes, BFF/Redis operations, p50/p95, 429/5xx, build minutes, CDN requests, logs and fixed plans. Use the multi-venue cost equation; unknown price is recorded as unknown, never zero. Recommend a temporary **USD 100/month aggregate recurring cap** for the pilot only after measured unit prices and explicit purchase authorization. Any required plan exceeding the cap, unpriced mandatory dependency, paid credential or long-term commitment stops activation and returns to user decision. The prize pool is not a budget. This plan purchases nothing.

## 6. Requirements and traceability

| ID | Requirement | Contract | Future path | WP | Required evidence |
| --- | --- | --- | --- | --- | --- |
| ST-01 | Preserve facts and 775 baseline | public-data-v2 + vNext | existing registry; future Web manifest | W0,W8 | exact old parity plus additive-route manifest; provider outage facts-up |
| ST-02 | Reviewed multi-provider catalog | Provider Asset v1 | `packages/acquisition-consumer/**` | W2 | PA-01/02/05; immutable revision, duplicates/unknown rejected, static search |
| ST-03 | PreStocks usable integration | Provider Asset v1 | owner adapter + BFF + company/market route | W3,W6,W8 | PA-01/03/04/06/07/08 + SEL-P-01; positive exact-ID evidence and truthful limits |
| ST-04 | Tessera usable integration | Provider Asset v1 | owner adapter + BFF + company/market route | W4,W6,W8 | PA-01/03/04/06/07/08 + SEL-T-01; OpenAI/Kalshi evidence, auction semantics, rights/extensions |
| ST-05 | Meteora DBC eligibility/observation | Market Evidence v1 | owner Meteora adapter + DBC route | W1,W5,W8 | ME-01/02/03/05/06/07/08/09 + SEL-ME-01; positive observation and honest unknowns |
| ST-06 | DBC A/B diagnostics | Market Evidence v1 | owner domain + DBC route | W1,W5,W8 | ME-04/05/06 + SEL-ME-02; pinned deterministic vectors, invalid results, no ranking |
| ST-07 | Purchase-complete investor P0 | purchase v1 + owner quote/template wire | purchase plan exact owner/BFF/Web paths | purchase `PX-*` nodes | one exact audited purchase through finality and causal holdings; sponsor evidence remains independently required |
| ST-08 | Abuse/privacy isolation | unsigned contract | BFF/admission + owner policy | W6,W9 | PA-06/07, ME-07/08, SEL-SEC-01; race/replay/restart/store-down and import/env/secret scans |
| ST-09 | Accessible investor journey | accepted UI direction + vNext | four public route families | W8,W9 | SEL-UI-01..05; desktop/mobile/5 locale/keyboard/200%/Back, investor comprehension/next-action proof and independent QA |
| ST-10 | Submission truth | official receipt + evidence matrix | packet/video/link receipts | W10 | SEL-RC-01..03; same revision, signed-out links, exact claims/footage, deadline recheck |

## 7. Work-package groups and canonical execution nodes

The W0–W10 headings group related work; they are not a second execution DAG. Executable nodes are exactly those in the registry below, including split `ME-Q0I-O`/`ME-Q0I-S`, `OA0`, `SA0`, provider-specific integrations, post-build reviews and release gates. Each node records base commit and input contract digests. Allowed paths are exclusive; shared files have one writer at a time. Abort means keep or restore the prior reviewed artifact/feature-off state, not delete history.

This node registry is the only dependency data. Later prose explains implementation but does not add edges.

| Node / owner | Depends on | Exact path scope and output | Required test / stop and rollback |
| --- | --- | --- | --- |
| `PLAN` / product | none | reviewed specs/digests | independent plan review; any high finding stops dispatch |
| `W1-DONE` / registry | reviewed public-data contract | current `packages/registry/src/public-read-model.ts` | existing immutable selector/coverage tests stay green |
| `W2-DONE` / facts presenters | W1-DONE | current Web/MCP public-v2 presenters | existing API/MCP differential tests stay green |
| `BASE0` / remediation owner | PLAN | F-01/F-02 truth, F-03 migration disposition, F-06 CI evidence | any reopened high defect blocks R0; no vulnerable legacy rollback claim |
| `L1` / information-copy owner | PLAN | five-locale rights/reference copy approval or suppression | unsupported wording is omitted, not invented |
| `F0-W` / Web feasibility | PLAN | isolated `apps/public-web/**` spike | pinned build/775+additive routes/host graph; failure retains current Web |
| `F0-A` / facts API feasibility | PLAN | isolated `apps/public-api/**` spike | Hono/Node build/direct HTTP parity; failure retains current facts transport |
| `A0a` / copy scanner | F0-W | `packages/public-copy/**`, scanner catalog | five-locale/tamper scan; failure blocks Web build only |
| `S0` / static foundation | F0-W,A0a,W1-DONE | public Web config/routes/release guard/build DTO | SEL-RC-01/404/308/skew; rollback prior Web artifact |
| `A0b` / facts API transport | F0-A,W2-DONE | public API handlers and golden fixtures | all 154 v1/v2/API/MCP parity; rollback prior API independently |
| `D1` / UI designer | PLAN | digest-bound visual direction + explicit acceptance receipt | no accepted receipt means `U0` cannot start |
| `PA-D1` / provider contract | PLAN | existing acquisition-consumer contract/catalog paths | PA-01..08; schema/digest failure blocks provider lanes |
| `PA-P` / PreStocks producer | PA-D1 | owner provider adapter/fixture scope | PA-01..05 + SEL-P-01 producer cases; feature-off PreStocks only |
| `PA-T` / Tessera producer | PA-D1 | owner provider adapter/fixture scope | PA-01..05 + SEL-T-01 producer cases; feature-off Tessera only |
| `PA-Q0L` / provider fake consumer | PA-D1 | acquisition-consumer/BFF fake tests | PA-06/07/08 without network/store claim |
| `D2f` / DBC baseline | PLAN | owner raw fixture/projection scope | ME-01/03/04/06; invalid baseline blocks scenarios only |
| `D2b` / DBC scenarios | D2f | owner SDK-free diagnostics scope | ME-03/04/05/06 + SEL-ME-02 |
| `D2c` / DBC observer | PLAN | owner Meteora observer scope | ME-01..05/07/08 + SEL-ME-01 |
| `ME-Q0L` / DBC fake consumer | PLAN | acquisition-consumer/BFF fake tests | ME-07/08/09 without network/store claim |
| `ME-M7` / owner market transport | PLAN | owner public API scenario/observation routes | ME-01/08/09 direct HTTP; no UI dependency |
| `OA0` / owner auth-policy | PLAN | dedicated owner control-plane paths fixed in private ADR | auth/scope/quota/rotation/revoke/restore tests; no memory fallback |
| `SA0` / BFF shared admission | PLAN | unsigned-contract Redis adapter/runbook/tests | nonce/session/IP/global race/restart/store-down; facts survive |
| `ME-Q0I-O` / DBC observation integration | D2c,ME-Q0L,ME-M7,OA0,SA0 | owner→BFF observation composition | positive observed path + unavailable/freshness; disable DBC observation only |
| `ME-Q0I-S` / DBC scenario integration | D2b,ME-Q0L,ME-M7,OA0,SA0 | owner→BFF scenario composition | valid and provider-config-invalid diagnostics; syntax-invalid 400 |
| `PA-Q0I-P` / PreStocks integration | PA-P,PA-Q0L,OA0,SA0 | owner→BFF exact-ID composition | PA-06..08 + FIFO/partial outage; disable PreStocks only |
| `PA-Q0I-T` / Tessera integration | PA-T,PA-Q0L,OA0,SA0 | owner→BFF exact-ID composition | PA-06..08 + FIFO/partial outage; disable Tessera only |
| `U0` / Web implementation | S0,D1,PA-D1,ME-Q0L,PA-Q0L | accepted-design markets/company/market/DBC routes | SEL-UI-01..04 fake states; rollback route manifest/Web revision. The initial Home/Dossier capsules and their QA/human feedback are partial evidence only; they do not close `U0`, `V1`, or `D2` before the selected provider/DBC consumers exist. |
| `D3-DBC` / DBC browser proof | U0,ME-Q0I-O,ME-Q0I-S | real local DBC investor/operator journey | positive observation+scenario; no advice/authority |
| `D3-P` / PreStocks browser proof | U0,PA-Q0I-P | real local provider journey | positive exact-ID evidence; other cards survive failure |
| `D3-T` / Tessera browser proof | U0,PA-Q0I-T | real local provider journey | positive OpenAI/Kalshi evidence; semantics retained |
| `D2` / human product review | D3-DBC,D3-P,D3-T | browser feedback receipt | confusion/claim issue returns to owning node |
| `V1` / independent UI QA | D3-DBC,D3-P,D3-T | actual screenshots/interactions | accessibility/visual finding blocks RC, not producers |
| `SEC0` / independent security | A0b,S0,OA0,SA0,ME-Q0I-O,ME-Q0I-S,PA-Q0I-P,PA-Q0I-T | import/SBOM/auth/secret/outage evidence | critical/high blocks RC; feature-off per affected lane |
| `VAL0` / user/load/cost | D2,V1 | user outcomes and low/base/10× receipt | SEL-UI-05 plus load/cost evidence; false semantics, investor next-action confusion or unpriced/cap breach blocks activation |
| `R0` / release QA | BASE0,L1,A0b,S0,D3-DBC,D3-P,D3-T,D2,V1,SEC0,VAL0, purchase `PX-RC` | exact-revision local RC/video/link packet | SEL-RC-01..03 plus accepted purchase evidence; no deploy/submit authority |
| `K0` / external activation | R0,mobile-plan `MOBILE-RC`,current authority | hosting/resources/credentials/publish/submit, outside this plan turn | same-revision mobile journey/purchase/sponsor evidence, signed-out live smoke and rollback; absence leaves local RC only |

The historical optional branch `M3-positive -> Q0I -> D3-DLMM -> R0-P1` is superseded. Purchase nodes and their required release edge live only in the purchase plan; its `PX-U1` depends on this registry's `S0`, its `PX-QA` independently gates funded smoke/RC, and its O2/B1 chain owns purchase HTTP integration. This selected sponsor DAG supplies independent `D3-DBC`, `D3-P`, `D3-T` and shared release gates to purchase `PX-RC`.

### W0 — scope freeze plus independent stack feasibility

- **Nodes/owner/deps:** `PLAN` has none; `F0-W` and `F0-A` depend on the relevant vNext contracts, not on provider or Meteora producers.
- **Input/output:** this plan, official receipt, accepted contract digests → selected-track receipt and locked DAG.
- **Allowed paths:** planning docs; future isolated `apps/public-web/**` and `apps/public-api/**` feasibility branches only when implementation is authorized.
- **Approach:** retain RR `7.18.3` candidate, Vite/app-local TypeScript `5.9.3` compatibility spike, Hono `4.13.7` and optional `@hono/node-server 2.1.1` candidates. Prove install/build/runtime/license/lock; do not use `@latest` or change root TS by assumption.
- **Tests:** exact 775 baseline, additive route enumeration, host 404/308/rewrite, no Next/DEX/wallet in new client graph, Hono facts parity.
- **Accept/abort/rollback:** accept only measured independent builds. Failure keeps current app and blocks `U0/R0`, not `D2*`, `ME-*` or `PA-*` contract/producer work.
- **Commit boundary:** Web feasibility, API feasibility and docs are separate commits.

### W1 — Meteora positive no-effect core

- **Nodes/owner/deps:** connectivity owner; `D2f` raw baseline, `D2b` scenario and `D2c` observer. `D2f -> D2b`; `D2c` is independent. All use accepted Market Evidence v1 and C2a–C2c.
- **Input/output:** pinned public-chain/raw fixtures, exact program/config/pool/mints/Clock → DBC eligibility, observation and scenario results.
- **Allowed paths:** future public-safe solana-spot contracts/domain/Meteora adapter/tests/evidence only; no Benten UI/BFF.
- **Approach:** pin observed DLMM `1.9.14` and DBC SDK `1.5.12` only after integrity/license/runtime verification. Capture byte-complete raw config; project raw PoolConfig to exact create parameters; verify derived-field parity. Keep live observation, hypothetical A/B input and composite evaluation separately tagged. Positive DBC proof precedes UI.
- **Tests:** owner/discriminator/PDA/authority/role, same cohort/slot, null account, Token-2022 current+scheduled fee/ScaledUI/extension, u128/Q64/rounding/fee/progress vectors, source/digest tamper, invalid scenario, migrated/unmigrated flag without tradability inference.
- **Accept/abort/rollback:** one reviewed pilot must produce positive eligibility/observation and positive deterministic scenario while remaining not-ready/no-authority. Any missing required binding returns unavailable; no synthetic positive.
- **Commit boundary:** contract/domain, `D2f` fixture/projection, `D2b` scenario, `D2c` observer and evidence receipt independently reviewable.

### W2 — provider catalog and common evidence core

- **Nodes/owner/deps:** `PA-D1`; Benten contract owner + connectivity owner; Provider Asset v1.
- **Input/output:** reviewed provider IDs/raw fixtures → immutable catalog and strict normalized union.
- **Allowed paths:** future provider-assets public package/artifact; owner common provider contracts/application tests.
- **Approach:** lossless lexical JSON-number capture before JS number conversion; JCS digests; exact provider/asset-kind/mint/source/reference/rights binding; live response cannot add catalog entries.
- **Tests:** unknown/repeated keys, exponent/negative/precision/scale, duplicate ID/mint, source-as-of null vs observed-at, currency absent, cross-provider/mint substitution, evidence-ref/digest tamper.
- **Accept/abort/rollback:** accept reviewed artifact plus rollback digest. Terms/redistribution uncertainty blocks release, not static xStock facts.
- **Commit boundary:** common contract/tests before each provider adapter; artifact promotion separate.

### W3 — PreStocks producer

- **Nodes/owner/deps:** `PA-P`; connectivity owner; `PA-D1`.
- **Input/output:** exact reviewed API fixture → PreStocks evidence or typed unavailable.
- **Allowed paths:** future PreStocks read adapter, sanitized fixtures/tests/evidence only.
- **Approach:** preserve provider claim, reference kind, missing timestamp/currency/chain fields and API/UI catalog mismatch. Independently bind contract address/program/decimals when available; no xStocks alias or invented fundamentals.
- **Tests/acceptance:** positive allowlisted ID plus schema/catalog/source/terms/chain negatives; integrated user task must show why the reference is not an executable quote or unconditional redemption. Listing alone fails sponsor acceptance.
- **Abort/rollback/commit:** unapproved reuse or identity ambiguity disables only PreStocks dynamic evidence; `PA-P` adapter and later `PA-Q0I-P` consumer are separate commits.

### W4 — Tessera producer

- **Nodes/owner/deps:** `PA-T`; connectivity owner; `PA-D1`.
- **Input/output:** exact OpenAI/Kalshi fixture → Tessera evidence or typed unavailable.
- **Allowed paths:** future Tessera read adapter, sanitized fixtures/tests/evidence only.
- **Approach:** preserve T-Token loan-participation rights, `auction_reference` meaning, missing source time/currency and distinct Token-2022 extension/hook policy. Do not call PoR asset count NAV.
- **Tests/acceptance:** positive OpenAI or Kalshi evidence, exact mint/program/extensions, wrong underlying/provider/reference negatives, stale/null source handling. User must compare provider-distinct rights/reference evidence; listing alone fails.
- **Abort/rollback/commit:** unsupported hook/rights/reuse disables only Tessera positive state; `PA-T` adapter and later `PA-Q0I-T` consumer are separate.

### W5 — DBC fake consumer

- **Nodes/owner/deps:** `ME-Q0L`; Benten consumer owner; frozen market contract/fixtures only. It does not wait for `D2f/D2b/D2c` completion.
- **Input/output:** frozen owner fixtures → lossless BFF/presentation states.
- **Allowed paths:** future market-evidence consumer/BFF contract tests; no real network or UI.
- **Approach/tests:** fake positive/candidate/unavailable/invalid/stale, exact evidence kind/request binding, byte caps/deadlines, no state promotion or provider math in Benten.
- **Accept/abort/rollback:** every owner field/unknown/reason survives; mismatch blocks integration. Commit consumer contract before transport.

### W6 — real transports and integrated consumers

- **Nodes/owner/deps:** `ME-M7` owner DBC transport is UI-independent. `ME-Q0I-O` depends on `D2c+ME-Q0L+ME-M7+OA0+SA0`; `ME-Q0I-S` substitutes `D2b`. `PA-Q0I-P` and `PA-Q0I-T` each depend on their own producer, `PA-Q0L`, `OA0` and `SA0`. PreStocks and Tessera never gate one another.
- **Input/output:** exact by-ID request → typed evidence through server-held scoped credential.
- **Allowed paths:** future owner HTTP adapters/API and BFF provider routes; Redis adapter only after authorized implementation.
- **Approach:** owner direct auth and BFF service caller are distinct; `provider_asset:read` is not facts/quote authority. Shared session/IP/global quota and atomic nonce/lease apply across acquisition operations.
- **Tests:** fake→real parity; four-instrument static matrix; single-tab FIFO refresh; cross-tab `409` without retry; nonce double-submit/race/lost response, limit/concurrency, restart/failover/store down, timeout/429/5xx/oversize/malformed/partial provider outage, preservation of other cards/source times, secret/cookie/header/log redaction, facts survival.
- **Accept/abort/rollback:** each real local integration is accepted and disabled independently with feature-off/facts-up proof. DBC/provider failure does not disable the other lanes. No persistent user identity, wallet or product/order DB. Commit `ME-M7`, `OA0`, `SA0`, `ME-Q0I-O`, `ME-Q0I-S`, `PA-Q0I-P` and `PA-Q0I-T` separately.

### W7 — purchase profile pointer (superseded execution detail)

- **Authority:** [purchase-complete MVP plan](stocklana-purchase-mvp-execution-plan.md) is the only execution detail and DAG. This document adds no second purchase edge.
- **Sponsor independence:** W1/W3/W4 and their consumers remain separately required. Purchase failure does not turn unavailable sponsor evidence into success, and sponsor evidence cannot substitute for the purchase terminal condition.
- **Rollback:** disable purchase context and Buy while preserving the selected catalog/facts/DBC/provider surfaces; report the unmet product target rather than calling read-only complete.

### W8 — accepted-design Web implementation

- **Nodes/owner/deps:** `D1 -> U0`; `U0` depends on `F0-W`, reviewed catalogs/contracts, accepted `D1`, and fake consumer states (`ME-Q0L`, `PA-Q0L`)—not real provider completion. Dynamic positive browser proof is a later per-lane gate.
- **Input/output:** approved IA/artifacts/contracts → four real-app route families and five-locale copy.
- **Allowed paths:** future public Web routes/components/copy/build manifest only.
- **Approach:** start D1 against strict static/positive/candidate/unavailable/stale/error fixtures while producers and BFFs proceed in parallel; after acceptance, build the static reviewed shell, then explicit dynamic refresh. Default shadcn, app-local domain states, no SDK/RPC/owner secret in browser.
- **Tests:** route enumeration/digest, direct/deep links, URL filters/page/Back/scroll/locale, five locales, mobile/desktop/200%, keyboard/screen reader, stale/partial/error, facts-up/provider-down, no horizontal overflow.
- **Accept/abort/rollback:** explicit user/design acceptance before material build; independent post-build designer QA before RC. Failed design/QA leaves feature off and current site intact.
- **Commit boundary:** primitives/catalog → dossier/comparison → DBC views → dynamic joins.

### W9 — integrated product, security and user validation

- **Nodes/owner/deps:** per-lane `D3` depends only on its own positive producer/integrated consumer plus `U0`; `D2`, `V1`, `SEC0` and `VAL0` follow exactly as the node registry states.
- **Input/output:** local integrated candidate → criterion/evidence ledger and user results.
- **Allowed paths:** test/evidence/docs and task-owned fixes only.
- **Tests:** investor search → comparison → rights/reference/freshness/market-state understanding; every positive/candidate/unavailable/stale/error state leaves the next possible action clear; one DBC investor read; one separate advanced operator A/B/monitor journey; snapshot-only facts during all provider failures; dependency/SBOM/import/env/secret/private-name scans; load bands and cost measures.
- **Accept/abort/rollback:** target investor users can explain provider/rights/reference/freshness/market distinctions without interpreting advice and can state what they can do next in every tested state. Operator success cannot substitute for that investor gate. Critical/high security or false-claim findings block RC. Commit fixes by owner, never a mixed cross-repo commit.

### W10 — RC, demo and packet

- **Owner/deps:** all claimed positive WPs and separate publish/submit authority.
- **Input/output:** one clean revision → 90-second demo, evidence matrix and accessible links.
- **Allowed paths:** submission copy/video/evidence docs only; deployment/submission remain separately authorized.
- **Approach:** 0–15s investor problem/value; 15–40s search, provider comparison and rights/reference/freshness; 40–60s investor market-state understanding; 60–75s secondary Meteora DBC operator depth; 75–85s unavailable/no-authority boundary; 85–90s why Solana. Sponsor integrations substantiate the investor journey rather than becoming unrelated tabs. A failure state is not narrated as successful evidence.
- **Tests:** exact revision in app/video/receipt, signed-out GitHub/live/video access, visible source/slot/digest, link MIME/duration, fresh official deadline/track/form check.
- **Accept/abort/rollback:** inaccessible or unproved lane is removed from claims/footage. Packet ready by Sep 25 20:00 JST; submission itself requires authority.
- **Commit boundary:** code freeze before evidence capture; packet/video docs separate from product commits.

## 8. Authoritative canonical-node DAG and parallelism

```text
PLAN -> {BASE0,L1,F0-W,F0-A,D1,PA-D1,D2f,D2c,ME-Q0L,ME-M7,OA0,SA0}
W1-DONE -> W2-DONE
F0-W -> A0a
{F0-W,A0a,W1-DONE} -> S0
{F0-A,W2-DONE} -> A0b
PA-D1 -> {PA-P,PA-T,PA-Q0L}
D2f -> D2b
{D2c,ME-Q0L,ME-M7,OA0,SA0} -> ME-Q0I-O
{D2b,ME-Q0L,ME-M7,OA0,SA0} -> ME-Q0I-S
{PA-P,PA-Q0L,OA0,SA0} -> PA-Q0I-P
{PA-T,PA-Q0L,OA0,SA0} -> PA-Q0I-T
{S0,D1,PA-D1,ME-Q0L,PA-Q0L} -> U0
{U0,ME-Q0I-O,ME-Q0I-S} -> D3-DBC
{U0,PA-Q0I-P} -> D3-P
{U0,PA-Q0I-T} -> D3-T
{D3-DBC,D3-P,D3-T} -> {D2,V1}
{A0b,S0,OA0,SA0,ME-Q0I-O,ME-Q0I-S,PA-Q0I-P,PA-Q0I-T} -> SEC0
{D2,V1} -> VAL0
{BASE0,L1,A0b,S0,D3-DBC,D3-P,D3-T,D2,V1,SEC0,VAL0} -> R0
{R0,MOBILE-RC} -> K0
PURCHASE-PLAN-PX-RC -> R0 [required product overlay; canonical dependencies live only in purchase plan]
```

`ME-M7` can start from the frozen wire/provider seam and later binds accepted producers; it does not depend on BFF/UI. `ME-Q0L` and `PA-Q0L` use fakes while producers finish. `D2f/D2b` and `D2c` remain separate; `PA-P` and `PA-T` remain separate; fake and real integrations remain separate. Purchase execution is required through the external purchase-plan overlay rather than duplicated here. UI design runs beside non-UI work, but material implementation waits for accepted design. One writer owns each shared contract/artifact/manifest at a time. Clawpump, Pyth and Raydium do not enter this deadline DAG; Jupiter can appear only inside purchase `PX-R0` as a conditional alternative.

## 9. Calendar and cut rules (JST)

| Deadline | Checkpoint | Cut rule |
| --- | --- | --- |
| Sep 16 23:00 | selected plan/contracts/digests reviewed | unresolved high finding blocks implementation |
| Sep 17 20:00 | W0 feasibility receipts; W1/W2 strict fixtures frozen | failed stack keeps current app; invalid fixture blocks only its producer |
| Sep 19 20:00 | W1 positive no-effect DBC; W3/W4 adapter positives | missing provider/DBC positive removes that sponsor claim; unavailable is not success |
| Sep 20 20:00 | W5/W6 fake integration; fixture-driven visual direction accepted; required mobile Portfolio/Activity no-funds integration complete | D1/mobile design run in parallel from plan freeze; missing mobile integration is P0 unmet/re-baseline, not optional fixture work |
| **Sep 22 20:00** | W6 real local integrations, W8 selected screens and post-mobile-integration review/funded-smoke disposition; **feature freeze** | provider outage must leave facts usable; `MOB-S0/V0/H0` must precede funded smoke; no new breadth after this point |
| Sep 22 20:00–Sep 24 20:00 | protected 48-hour investor UI/UX refinement, journey testing, fixes and repeat independent QA; security/API owners close required findings in parallel | UI owner is not reassigned to API/security work; optional breadth cannot consume the window; safety or selected-proof failure still blocks RC |
| Sep 23 20:00 | first investor validation plus security/load/cost results and fix triage | investor confusion, false semantics or safety finding is discovered early enough to fix/retest; optional breadth is cut before protected UX or safety work |
| **Sep 24 20:00** | selected `R0` plus mobile-plan `MOBILE-RC` freeze and exact-revision 90-second video draft | only release-blocking fixes afterward; investor gate and repeat QA must be recorded; `K0` remains blocked without both receipts |
| Sep 25 12:00 | signed-out links and logged-in form/track rehearsal | no hidden-form assumption; recheck eligibility/stacking/deadline |
| **Sep 25 20:00** | packet ready, 9-hour buffer | no feature work; submit only with authority |
| **Sep 26 05:00** | current official deadline | no planned buffer work |

Delay cuts are ordered by the purchase plan: extra instruments and sizes, new connections/venues, then advanced operator features beyond minimum Meteora proof. The one purchase path and selected three sponsor proofs are not silently cut and relabelled complete; if one is missing, return to the claim/RC decision. The protected 48-hour UI/UX window and security/accessibility standards are never used as schedule contingency.

## 10. Selected-plan test registry

Existing PA-01..08 and ME-01..09 remain normative. Selected-plan tests add integration/release proof without weakening them:

| ID | Mechanically verified result |
| SEL-P-01 | Four reviewed OpenAI/Kalshi × PreStocks/Tessera slots resolve only by exact artifact ID; missing slot stays unavailable; FIFO refresh, cross-tab 409/no retry and partial-card preservation pass. |
| SEL-T-01 | Tessera OpenAI/Kalshi identities retain provider, underlying kind, auction-reference semantics, rights and Token-2022 unknown/verified states without price/NAV coercion. |
| SEL-ME-01 | Reviewed DBC pilot produces strict positive observation or an exact unavailable branch; pool/config/base/quote/vault/slot/source and unknowns survive owner→BFF→consumer. |
| SEL-ME-02 | Same pinned raw baseline yields deterministic A/B results and keeps live observation separate. Syntactically/schema-invalid input returns HTTP 400 with no evidence; a syntactically valid scenario whose complete provider config fails validation returns HTTP 200 `verified_scenario` with `validation_status:"invalid"`, `derived:null` and findings—successful diagnostics but never a positive/launch-ready configuration. |
| SEL-SEC-01 | One-in-flight/nonce race, replay, store outage, provider timeout/429/5xx, secret/env/private-import scan and facts-up/provider-off rollback pass for each lane independently. |
| SEL-UI-01 | Markets URL query/provider/kind/state/page/sort, 20-row boundary, Back/scroll/locale and result announcement pass. |
| SEL-UI-02 | Company comparison preserves distinct provider/mint/rights/unit/reference/source time and keeps static/obtained cards during one-card failure. |
| SEL-UI-03 | DBC investor/operator views distinguish live observation, hypothetical scenario, new base rights, migration flag, tradability and action authority. |
| SEL-UI-04 | Five locales, keyboard/focus, mobile 390px, 200% zoom, no page overflow and independent visual QA pass against the accepted artifact. |
| SEL-UI-05 | Investor participants complete search → comparison, correctly explain rights/reference/freshness/market state, and distinguish a disabled purchase state from the separately gated working P0. In the enabled P0 they can explain exact debit/minimum/fees/expiry, wallet approval, pending/unknown/finalized and the next safe action without entering the advanced operator flow. |
| SEL-RC-01 | Static manifest proves unchanged 775 xStock baseline plus exact additive provider/market/DBC routes and both artifact revisions. |
| SEL-RC-02 | Video, app/build receipt and evidence ledger bind one commit/release; no unavailable state is narrated as a positive. |
| SEL-RC-03 | Signed-out links, MIME/duration, current deadline, chosen tracks, form availability/eligibility/stacking unknowns and nine-hour buffer are rechecked. |

## 11. Release, recovery and remaining gates

Release requires: exact contract and artifact digests; positive producer and consumer evidence for every claimed sponsor; independent code/security/UI review; clean builds/tests/scans; facts-survival and rollback rehearsal; measured capacity/cost; approved provider reuse/legal copy; current official/form evidence; and explicit deploy/publish/submit authority. Purchase smoke inheritance follows the purchase plan's `execution_artifact_digest`: copy/layout-only changes need an independent unchanged-digest attestation and repeat QA; wallet, state, decoder, owner, BFF, route/policy, dependency or RPC changes invalidate the old smoke and require fresh user authority or an honest unmet claim.

Rollback units are independent: provider artifact/adapter, market adapter, BFF operation, Web route manifest, Web revision and facts API revision. Disabling a provider or market consumer must not roll back facts. The existing production revision remains the fallback until the new RR/Vite Web and Hono facts API pass their own cutover gates; an unassessed vulnerable Next revision is not a long-term safe rollback.

Still unverified: hidden form and logged-in eligibility, prize stacking, provider redistribution/terms, live provider capacity/pricing, actual host behavior, real user validation, visual acceptance, positive integrated DBC/PreStocks/Tessera consumers, the purchase contract/route/wallet/browser/funded-smoke evidence, public links and deployment. The non-custodial purchase lifecycle is now required by the purchase-plan overlay but remains unimplemented and separately gated. This plan closes none of them by assertion.
