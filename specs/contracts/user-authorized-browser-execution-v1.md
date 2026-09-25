# User-authorized browser execution v1

Status: **proposed plan-only contract; no runtime, wallet execution, credential or funded proof exists** (2026-09-16).

This contract defines the narrow future purchase profile needed for the Stocklana MVP. It does not change the current repository: today Benten is snapshot/read-only and its no-sign/no-send import rules remain controlling. A later authorized implementation may add the named paths behind `implementation_disabled` after contract review; funded proof is a later activation gate, not a prerequisite for writing and testing feature-off code. No import exception or activation exists in this plan-only turn.

## 1. Authority and scope

The only P0 effect is one exact-input browser purchase:

- one policy-approved spend mint, initially mainnet USDC as a candidate;
- one exact reviewed stock-token mint;
- one selected route and venue;
- one connected wallet account as fee payer, input owner and output owner;
- one explicit user gesture that signs one already reviewed transaction;
- one client-side submission attempt, followed by signature reconciliation, finality and causal holdings verification.

The browser wallet owns consent and signature. No Benten component receives a private key, seed or delegated spending grant. Only the isolated user browser handles signed transaction bytes ephemerally; Benten servers, BFF and connectivity owner never receive them. The BFF and owner never sign, send, relay, store an order, retry a transaction or claim recovery. This profile excludes sell, limit/DCA, autonomous or delegated trading, multi-order state, arbitrary mints, arbitrary RPC URLs, arbitrary routes and remote MCP/ChatGPT/Claude execution.

`plan_accepted`, a quote, an unsigned template and a successful simulation are not purchase readiness. Activation is a strict union: `implementation_disabled` permits only feature-off code/fixtures and no effect; `authorized_smoke` is a non-public, exact-build, one-wallet, one-attempt grant used only by the user at `PX-E0`; `execution_enabled` requires independent review of that smoke and the final release digests. Any missing or stale identity, rights/legal policy, wallet capability, quote economic, transaction audit, expiry or provider evidence returns a disabled typed state.

## 2. Ownership and future paths

Public product-owned paths are proposed as:

```text
packages/acquisition-consumer/src/purchase-execution-v1.ts
packages/acquisition-consumer/src/purchase-policy.v1.json
packages/acquisition-consumer/src/purchase-audit/{decode-message,route-instructions,policy-artifact}.ts
apps/acquisition-bff/src/routes/purchase-context.ts
apps/public-web/src/features/purchase/{machine,audit,wallet-standard,rpc-status,local-receipt}.ts
apps/public-web/src/components/domain/{purchase-review,purchase-status}.tsx
apps/public-web/tests/purchase/**
```

Only `apps/public-web/src/features/purchase/wallet-standard.ts` and the route-local execution modules may import the later reviewed Wallet Standard client packages, transaction deserializer and browser RPC sender. Existing facts, registry, MCP, provider-evidence and quote packages remain unable to import signing or sending surfaces. CI must fail on signer/send imports outside this allowlist and on any private-key, seed, keypair-from-secret, delegate, server relay or provider SDK import in Benten.

The isolated connectivity owner owns exact route policy, provider adapters, coherent quote, owner-sensitive account resolution, transaction construction, simulation as negative evidence, full message audit and `OwnerAuditedPurchaseContextV1`. It does not own a browser session, wallet connection, user gesture, signature, submission, client receipt or holdings UI. Benten consumes only a versioned public-safe wire; it never imports an owner package or SDK.

The existing quote-only BFF remains byte-free. The future purchase operation is a distinct scope and route:

```text
POST /api/acquisition/purchase-context
owner POST /v1/audited-purchase-contexts
```

It reuses the accepted anonymous session, Origin/Host, CSRF, one-use nonce, shared admission and no-store rules, but requires distinct BFF scope `purchase_context:read` and owner service-caller scope `audited_purchase_context:read`. Neither scope reaches facts, admin, provider selection, arbitrary pools, transaction submission or the existing owner-direct individual-caller endpoint. Browser, request headers and body cannot select consumer, provider URL, program, pool, account, fee recipient, referral, tip, RPC URL or policy revision.

## 3. Strict request and response

### 3.1 `PurchaseIntentV1`

The BFF request is strict JSON, at most 2 KiB, with duplicate and unknown fields rejected:

```ts
type PurchaseIntentV1 = {
  schema_version: "1.0";
  output_mint: Base58PublicKey;
  input_raw: CanonicalU64String;
  wallet_address: Base58PublicKey;
};
```

Cluster, genesis, input mint, venue, pool, allowed programs, output Token-2022 policy, slippage and consumer policy are fixed server-side. With six-decimal USDC, the initial policy candidate accepts canonical raw input `1000000`–`10000000` (1–10 USDC) inclusive and fixes slippage at **50 bps**; neither value is a universal market promise, and slippage is not user-editable in P0. The exact pair must pass fresh depth/economics at both bounds before the band is released; the funded smoke remains at most raw `1000000`. Any later band or slippage change is a reviewed policy revision and invalidates old contexts. `wallet_address` is an owner-sensitive construction input, not proof of control, eligibility or consent. The BFF forwards it only for the admitted request and must not log, cache or persist it.

### 3.2 `AuditedPurchaseContextV1`

The BFF response is a closed discriminated union with `context_version:"1.0"`, `artifact_revision`, `status`, `capability:"user_authorized_browser_execution"`, `not_investment_advice`, `data`, and `reasons`. HTTP authentication, admission and syntax errors remain non-200 under the existing nested error wire. Domain outcomes are HTTP 200:

- `execution_context_ready`: every invariant below is proved and unsigned bytes are present;
- `candidate_unverified`: useful evidence exists but at least one readiness invariant is not proved; `unsigned_transaction_base64:null`;
- `unavailable`: no safe context can be produced; bytes and execution data are null;
- `expired`: an in-flight context expired before response; bytes are null.

Branch construction is exact:

| Status | `data` | `reasons` |
| --- | --- | --- |
| `execution_context_ready` | complete `ReadyPurchaseDataV1`; every field required and nonnull | `[]` only |
| `candidate_unverified` | `CandidatePurchaseDataV1` with exact identity/policy/source/economic evidence fields that passed, `unsigned_transaction_base64:null`, `audit_manifest:null`; absent evidence is null, never omitted | one or more unique `PurchaseReasonCode`, ascending lexical order |
| `unavailable` | `null` | one or more unique reason codes, ascending lexical order |
| `expired` | `null` | exactly `["context_expired_in_flight"]` |

`PurchaseReasonCode` is closed to `route_unverified | rights_or_eligibility_unreviewed | wallet_or_account_unsupported | economic_incomplete | fee_unknown | token_extension_unsupported | source_stale | policy_revision_mismatch | transaction_build_failed | transaction_audit_failed | simulation_failed | context_expired_in_flight | provider_unavailable`. New reasons require a schema revision. HTTP `error.code` remains the existing closed transport/auth registry and is not reused as a domain reason.

Owner and BFF have one data contract. The owner request is exactly `{owner_context_version:"1.0",output_mint,input_raw,wallet_address}`; the BFF maps the strict browser request to it and adds no caller-selected route field. The owner response is exactly `{owner_context_version:"1.0",status,capability:"user_authorized_browser_execution",data,reasons}`. The BFF replaces only `owner_context_version` with `context_version:"1.0"` and adds `artifact_revision` plus `not_investment_advice:true`; `status`, `data` and `reasons` are byte-for-byte equal after JCS normalization. Owner nested errors `{owner_context_version:"1.0",error:{code,retryable,correlation_digest}}` map to the existing BFF nested error by changing only the outer version key; raw upstream text is never forwarded.

`ReadyPurchaseDataV1` is the following closed shape; all properties are required and non-null:

```ts
type ReadyPurchaseDataV1 = {
  intent_digest: Sha256Hex; context_digest: Sha256Hex; message_sha256: Sha256Hex;
  consumer_policy_revision: Revision; route_policy_revision: Revision;
  transaction_policy_revision: Revision; decoder_artifact_revision: Revision;
  cluster: "solana:mainnet"; genesis_hash: Base58Hash; venue: "meteora_dlmm"|"jupiter_metis";
  route_id: string; program_id: Base58PublicKey; pool: Base58PublicKey;
  input_mint: Base58PublicKey; output_mint: Base58PublicKey;
  input_token_program: Base58PublicKey; output_token_program: Base58PublicKey;
  wallet_address: Base58PublicKey; fee_payer: Base58PublicKey;
  raw_input: CanonicalU64String; raw_input_debit_ceiling: CanonicalU64String;
  raw_gross_output: CanonicalU64String; raw_net_output: CanonicalU64String;
  raw_min_output: CanonicalU64String; max_slippage_bps: Integer0To100;
  fees: FeeComponentV1[]; economic_completeness: "complete";
  price_impact: {status:"known"; bps:Integer0To10000; basis:"raw_net_output"; source:EvidenceSourceV1};
  independent_price_protection: IndependentPriceProtectionV1 & {status:"within_bound"};
  source_slot: CanonicalU64String; source_clock_unix: CanonicalI64String;
  observed_at: IsoInstant; quote_expires_at: IsoInstant; built_at: IsoInstant;
  recent_blockhash: Base58Hash; last_valid_block_height: CanonicalU64String;
  unsigned_transaction_base64: Base64; transaction_version:"legacy"|"v0";
  audit_manifest: AuditManifestV1; simulation_observation: SimulationObservationV1;
  risk_disclosures: RiskDisclosureCode[];
};
```

`EvidenceSourceV1` is exactly `{kind:"onchain"|"provider"|"independent_benchmark",source_id:string,observed_at:IsoInstant,source_slot:CanonicalU64String|null,digest:Sha256Hex}`. `IndependentPriceProtectionV1` is exactly `{status:"within_bound"|"out_of_bound"|"unknown",pair:{input_mint,output_mint},basis:"raw_net_output_per_raw_input_after_required_fees",source:EvidenceSourceV1|null,benchmark_input_raw:CanonicalU64String|null,benchmark_output_raw:CanonicalU64String|null,route_net_output_raw:CanonicalU64String|null,deviation_bps:Integer0To10000|null,max_deviation_bps:Integer0To10000,policy_revision:Revision}`. Only `within_bound` with matching pair/basis, non-null source/raw values, source age within the route-policy maximum and `deviation_bps <= max_deviation_bps` is ready. Missing/stale/wrong-pair/wrong-basis/out-of-bound evidence produces candidate/unavailable and no bytes. Slippage never substitutes for this test.

`SimulationObservationV1` is exactly `{status:"passed",commitment:"confirmed",observed_slot:CanonicalU64String,units_consumed:CanonicalU64String,logs_sha256:Sha256Hex,accounts_sha256:Sha256Hex,message_sha256:Sha256Hex}` and its message hash must equal the enclosing value. `RiskDisclosureCode` is closed to `tracker_certificate_not_equity | jurisdiction_not_determined_by_wallet | reference_price_not_execution_quote | transaction_may_fail | submission_may_remain_unknown | no_automatic_retry`; the array is duplicate-free and lexically sorted. `FeeComponentV1` and its required seven uniquely keyed kinds are exactly the union in the [unsigned acquisition contract](../unsigned-acquisition-tool-contract.md#4-quote-and-optional-unsigned-context-contract); the property name is always `fees`. No second fee schema is permitted.

Canonical integer strings use raw units; display values and Scaled UI multiplier are presentation-only. No required fee is represented by zero because it is unknown. `context_digest` is SHA-256 over RFC 8785 JCS canonical `ReadyPurchaseDataV1` after removing both `context_digest` itself and `unsigned_transaction_base64`; keys follow JCS, canonical integer strings stay strings, instruction/account arrays preserve message order, and fee rows are sorted by `(kind,mint,status)`. `message_sha256` is SHA-256 of the exact unsigned serialized message bytes decoded from base64, not JSON. `intent_digest` is SHA-256 of JCS canonical strict request plus server-fixed cluster/genesis/input mint/route ID and all three policy revisions. An audit manifest or digest supplied inside the same response provides integrity binding only, not authenticity; the browser independently pins the accepted schema, route-policy and decoder/ABI artifact digests in its reviewed build.

`CandidatePurchaseDataV1` is independent rather than a ready prefix. It has exactly the following required keys: `intent_digest`, `context_digest`, `consumer_policy_revision`, `route_policy_revision`, `transaction_policy_revision`, `decoder_artifact_revision`, `cluster`, `genesis_hash`, `venue`, `route_id`, `program_id`, `pool`, `input_mint`, `output_mint`, `input_token_program`, `output_token_program`, `wallet_address`, `raw_input`, `raw_input_debit_ceiling`, `raw_gross_output`, `raw_net_output`, `raw_min_output`, `max_slippage_bps`, `fees`, `economic_completeness`, `price_impact`, `independent_price_protection`, `source_slot`, `source_clock_unix`, `observed_at`, `quote_expires_at`, `built_at`, `recent_blockhash`, `last_valid_block_height`, `unsigned_transaction_base64`, `message_sha256`, `audit_manifest`, `simulation_observation`, and `risk_disclosures`. `cluster`, `input_mint`, `output_mint`, `wallet_address`, `raw_input`, `max_slippage_bps`, `context_digest`, and `intent_digest` are non-null; every evidence value not proved is explicit null. `fees` is either null or a complete array of strict fee rows (including `unknown` rows); `independent_price_protection` may be `unknown|out_of_bound` with its exact nullable fields. Execution-only values are always null: `recent_blockhash`, `last_valid_block_height`, `unsigned_transaction_base64`, `message_sha256`, `audit_manifest`, and `simulation_observation`. Candidate has no `fee_payer` key at all and makes no account/instruction claim. Its `context_digest` uses JCS over this exact object after removing only `context_digest`. Unknown or extra keys are rejected.

Candidate keeps the same `FeeComponentV1` union; it does not apply the ready-only rule that every required economic fee be known. `economic_completeness` is `null` when `fees:null`, `incomplete` when a required fee or required raw is unknown/null, `partial_ancillary` when only ancillary rows are unknown, and `complete` only when no row is unknown and all debit/gross/net/min raws are proved. Every pair of present raw values must be mutually possible: debit is at least input, and minimum is at most each present net and gross while net is at most gross. Missing evidence is not filled with zero. An unknown output-transfer fee requires net/min to remain null. Fee duplicate identity remains `(kind,mint,source)`; canonical order is `(kind,mint,status,source)`, so equal kind/mint/status rows from distinct sources remain lossless and every known output-transfer row contributes to net validation. Candidate price impact is exactly `{status:"known",bps:Integer0To10000,basis:"raw_net_output",source:EvidenceSourceV1}` or `{status:"unknown",bps:null,basis:"raw_net_output"|null,source:null,reason:string}`; it may also be null. Candidate independent protection uses the exact `IndependentPriceProtectionV1` shape above but only `unknown|out_of_bound`; an `out_of_bound` value requires its source/raw/deviation fields, while `unknown` preserves any structurally valid nullable evidence. Neither candidate union can be promoted to ready. Object-level arrays must be dense JSON arrays whose indices are enumerable own data properties, with no accessor, symbol or named properties. Ordinary objects likewise accept only enumerable own data properties, so strict exact-key validation and capture cannot silently discard hidden fields. Raw ingress still separately rejects malformed JSON.

The implemented F0a pilot knows its one server-fixed route policy identity. Therefore its candidate fixture keeps genesis/venue/route/program/pool/token-program fields non-null and matching that policy; a missing or mismatched route/pair is `unavailable`, not a weaker candidate. This requirement does not turn unobserved economics, price or source evidence into zero or null them when valid evidence exists.

Fixture acceptance is split without weakening the ready gate. `PX-F0a` is the offline non-ready subset and has an explicit manifest pairing owner and BFF files for each `candidate_unverified`, `unavailable` and `expired` case. Each file is complete JSON without ellipses; each parser accepts only its own envelope, rejects the foreign envelope, and the test compares JCS-canonical `{status,data,reasons}` across the pair. Raw ingress separately rejects invalid UTF-8, duplicate keys, excessive nesting and the byte cap before object parsing. Object-only validation must not claim duplicate-key coverage.

`PX-F0b` is the audited ready subset: paired owner/BFF ready-min and ready-max fixtures plus the exact serialized-message fixture and decoder/policy artifact binding. It starts only after `PX-R0/PX-O1` prove the selected route, independent-price protection, decoder/ABI, accounts, fees/hooks, simulation and message. Both ready parsers then reject every unknown/duplicate/missing/nullability/enum/order/role/digest mutation and prove the response and transaction caps. A candidate fixture, documentation or a same-pool price cannot synthesize this evidence. Until `PX-F0b` passes, no ready type/bytes/Buy claim exists. Unavailable remains `{context_version:"1.0",artifact_revision,status:"unavailable",capability:"user_authorized_browser_execution",not_investment_advice:true,data:null,reasons:[<one closed reason>]}` and expired is the same with `status:"expired"` and only `context_expired_in_flight`.

### 3.3 Audit manifest

The ready manifest fully resolves a legacy or v0 message before response. Its exact closed fields are `manifest_version:"1.0"`, `transaction_version`, `instructions`, `resolved_accounts`, `lookup_tables`, `required_signers`, `fee_payer`, `lamport_debit_ceiling`, `compute_unit_limit`, `compute_unit_price_micro_lamports`, `input_effect`, `output_effect`, `ata_effects`, `transfer_hook`, and `allowlist_digest`. Its nested schemas are closed:

- `InstructionV1` is `{index:Integer0To11,program_id:Base58PublicKey,discriminator:LowerHex,data_sha256:Sha256Hex,account_indexes:Integer0To63[]}`; indexes are unique and in message order.
- `ResolvedAccountV1` is `{index:Integer0To63,address:Base58PublicKey,source:"static"|"lookup",lookup_table:Base58PublicKey|null,signer:boolean,writable:boolean,roles:RoleBindingV1[]}`. `RoleBindingV1` is `{role:AccountRoleV1,ordinal:Integer0To63}`. `AccountRoleV1` is closed to `fee_payer|wallet_authority|input_mint|output_mint|input_token_account|output_token_account|pool|reserve_input|reserve_output|oracle|event_authority|bin_array|bitmap_extension|venue_program|optional_account_sentinel|token_program_input|token_program_output|system_program|associated_token_program|compute_budget_program|memo_program|transfer_hook_program|transfer_hook_extra_account|other_readonly_reviewed`; the last value is forbidden for writable or signer accounts.
- `LookupTableV1` is `{address:Base58PublicKey,owner:Base58PublicKey,observed_slot:CanonicalU64String,entries_sha256:Sha256Hex}`.
- `TokenEffectV1` is `{token_account:Base58PublicKey,owner:Base58PublicKey,mint:Base58PublicKey,token_program:Base58PublicKey,direction:"debit"|"credit",raw_ceiling:CanonicalU64String|null,raw_minimum:CanonicalU64String|null}`; input is debit/ceiling only and output is credit/minimum only.
- `AtaEffectV1` is `{address:Base58PublicKey,owner:Base58PublicKey,mint:Base58PublicKey,token_program:Base58PublicKey,action:"existing"|"create_idempotent",rent_lamports_ceiling:CanonicalU64String}`.
- `TransferHookV1` is `null` or `{program_id:Base58PublicKey,authority:Base58PublicKey|null,extra_account_indexes:Integer0To63[],policy_revision:Revision}`. An active hook without this exact reviewed mapping is unavailable.

`instructions`, `resolved_accounts`, `lookup_tables`, `required_signers`, `ata_effects` and hook indexes are arrays whose transaction-significant order is preserved; fee rows alone use their stated canonical sort. Compiled account indexes and addresses are unique, but one row may carry multiple non-duplicate semantic role bindings: the wallet row is both fee payer and wallet authority, one token-program row may bind both input/output program roles, and the executable DLMM program row may bind `venue_program` plus the pinned event-CPI program role. Roles are repeatable across rows only where the selected ABI permits multiplicity: `bin_array` and `transfer_hook_extra_account` use contiguous ordinals from zero; singleton bindings require ordinal zero and bind one compiled row. For selected DLMM swap2, every writable bin array is the program-derived bin-array PDA for the exact pool and decoded bin index, ordered as instruction accounts; the optional bitmap extension occurs at most once, is the program-derived bitmap PDA for that pool, and is writable only when the pinned ABI says so. A pinned-IDL optional-None sentinel, if present, is readonly, binds `optional_account_sentinel`, and must equal the exact venue program address; it is never a caller-selected account. Pool, reserves, mints, token accounts and authority relationships match their PDA/owner/mint derivations. `other_readonly_reviewed` cannot stand in for an ABI-named account. Unknown/duplicate indexes, addresses or bindings, illegal cardinality/ordinal, wrong PDA/pool relation, role substitution or unknown discriminator rejects the response. Thus the 64-row fixture can represent all ABI accounts and aliases without a generic writable escape.

The remaining manifest primitives are exact: `required_signers:Base58PublicKey[]`, `fee_payer:Base58PublicKey`, `lamport_debit_ceiling:CanonicalU64String`, `compute_unit_limit:CanonicalU64String`, `compute_unit_price_micro_lamports:CanonicalU64String`, `input_effect:TokenEffectV1`, `output_effect:TokenEffectV1`, `ata_effects:AtaEffectV1[]`, and `allowlist_digest:Sha256Hex`. The one signer equals `fee_payer`, wallet and intent wallet.

Pilot caps are future constants in the reviewed policy artifact, not caller inputs. Initial recommendations are: the complete serialized transaction (short-vector signature count, one 64-byte signature slot and message) at most Solana's 1,232-byte packet limit; therefore the one-signer message fixture is at most **1,167 bytes**, not 1,232; base64 transaction at most 2 KiB inside a **64 KiB owner/BFF response cap**; at most 12 instructions, 64 resolved accounts and two ALTs; and one required signer equal to the wallet. Durable nonce, address-table mutation, account close, delegate/approve/revoke, referral/tip and arbitrary memo are forbidden. The selected DLMM ABI may require the canonical Memo program as a readonly account, but no memo instruction is permitted. SOL debit is limited to network/priority fee and audited ATA rent. `packages/acquisition-consumer/test/fixtures/purchase-context-ready-max.v1.json` is the required future maximum-shape golden: all capped rows, complete fees/effects/simulation, a 1,167-byte message and a 1,232-byte full unsigned transaction framing. Its 64 unique compiled rows use the exact singletons plus ABI-valid ordinal bin arrays and, only in the reviewed hook variant, hook-extra rows; it contains no duplicate address/index or generic writable role. A separate exact selected-pair fixture uses its actual smaller cardinalities. Acceptance parses both, rejects wrong PDA/ordinal/role aliases, and proves canonical response size `< 65,536` bytes. Exceeding either cap is unavailable, never truncation.

Allowed programs are the exact route-policy set only: System, Compute Budget, Associated Token Account, the required Token or Token-2022 programs, the selected venue program and an explicitly reviewed transfer-hook program if present. A generic executable-program or writable-account allowlist is forbidden. CPI-relevant roles and venue instruction semantics must prove the USDC debit ceiling and stock-mint net minimum, not merely deserialize successfully.

The browser does not trust the manifest's interpretation. The public consumer artifact contains a route-specific, SDK-free instruction decoder and policy artifact generated from the reviewed program/IDL/source revision, with its own integrity digest and golden official/provider parity vectors. It decodes the actual message bytes and independently recomputes roles and bounds. An unknown discriminator, unsupported program revision, absent authoritative ABI/IDL mapping or artifact-digest mismatch blocks signing. Provider SDKs remain server-side and are not browser audit dependencies.

Simulation is negative evidence only. A successful no-send simulation cannot establish wallet consent, final execution, final fees, fill or holdings. A failed, missing or materially different simulation blocks readiness.

## 4. Browser state machine

Every attempt has an opaque `attempt_id`, a monotonically increasing `attempt_generation` for the exact wallet+genesis pair, and one durable `send_phase`. The only forward phases are `pre_sign_reserved -> wallet_prompt_invoked -> signed_persisted -> send_invoked -> signature_known -> confirmed -> finalized -> holdings_verified|holdings_unverified|chain_failed`. `wallet_rejected`, `pre_sign_aborted`, `signed_rejected_unsubmitted`, `submission_unknown`, `reorg_or_dropped` and `corrupt_local_state` are explicit holding/terminal states. Every wallet/RPC promise callback must reacquire the wallet+genesis lock and compare both attempt ID and generation before any write or send; an older callback is fenced and can only be recorded as stale telemetry. No state transition automatically requests, signs or sends another transaction.

At connect and immediately before sign, require the exact Wallet Standard account, mainnet chain and capabilities. The initial compatibility target is the Wallet Standard sign-only feature version `1.0.0`, pinned by package/source digest during `PX-W0`, with only the selected legacy or v0 transaction version; version 1 is rejected in P0 even if a wallet advertises it. The exact official feature identifier stays in the private feasibility receipt until the current broad lexical publication guard is replaced by a reviewed scoped import/AST policy. The wallet/browser acceptance matrix must name every tested combination. P0 requires a capability that returns the signed transaction bytes without submitting them. A wallet exposing only opaque combined sign-and-send is unavailable for this profile because the client cannot prove that the signed message equals the reviewed message or enforce its one-send path. Mobile-safe browsing does not imply mobile-wallet signing support.

Immediately before invoking the wallet, the client:

1. re-hashes the response and unsigned message;
2. fully deserializes and repeats every audit-manifest check locally;
3. verifies connected account, fee payer, signer set, cluster/genesis, mints, raw amount/minimum, fees, programs, accounts, ALT contents, policy revisions, wall-clock expiry and block-height validity;
4. obtains a fresh balance/ATA observation for later causal comparison;
5. atomically increments the persistent generation and writes `pre_sign_reserved` for the exact wallet/chain before opening the wallet;
6. shows one immutable review summary and requires an explicit user gesture.

Changing wallet, amount, slippage, route/policy revision, quote, blockhash, ALT, hook, fee, account meta or expiry invalidates the context and returns to a fresh request/review. A re-quote always requires a new user review and gesture.

After wallet signing, the client deserializes the signed bytes, proves the message hash is unchanged, proves only the expected signature slot is populated and verifies/derives the transaction signature. It rechecks wall-clock and last-valid block height **after the wallet prompt**. Expiry, a new blockhash or any mutation records `signed_rejected_unsubmitted` with `send_invoked:false`; the bytes are discarded and a new context requires a new review. Before network submission it atomically persists signature, audit summary and `signed_persisted`, then atomically advances to `send_invoked` **before** the one RPC call. Either write failure blocks sending. A crash or exception after durable `send_invoked` is `submission_unknown`, even if no acknowledgement was observed. The fixed browser RPC has automatic retry disabled; BFF and owner are never send paths.

## 5. Duplicate prevention, status and receipt

Before signing, the browser acquires one same-origin cross-tab active-attempt lock keyed by exact **wallet + genesis/cluster**, not by amount or intent, and publishes state through `BroadcastChannel`. IndexedDB is authoritative across reload; the process lock is only a concurrency aid. Lack of the lock API or unavailable/blocked/corrupt storage disables purchase. A second tab displays the existing attempt and cannot sign or send.

```ts
type ClientPurchaseReceiptV1 = {
  schema_version: "1.0";
  attempt_id: string;
  attempt_generation: CanonicalU64String;
  send_phase: "pre_sign_reserved"|"wallet_prompt_invoked"|"signed_persisted"|"send_invoked"|"signature_known"|"confirmed"|"finalized";
  send_invoked: boolean;
  intent_digest: Sha256Hex;
  context_digest: Sha256Hex;
  message_sha256: Sha256Hex;
  signature: Base58Signature | null;
  cluster: "solana:mainnet";
  genesis_hash: Base58Hash;
  wallet_address: Base58PublicKey;
  fee_payer: Base58PublicKey;
  input_mint: Base58PublicKey;
  output_mint: Base58PublicKey;
  input_token_account: Base58PublicKey;
  output_token_account: Base58PublicKey;
  raw_input: CanonicalU64String;
  raw_input_debit_ceiling: CanonicalU64String;
  raw_min_output: CanonicalU64String;
  execution_artifact_digest: Sha256Hex;
  audit_summary_digest: Sha256Hex;
  audit_summary: ClientAuditSummaryV1;
  consumer_policy_revision: Revision;
  route_policy_revision: Revision;
  transaction_policy_revision: Revision;
  recent_blockhash: Base58Hash;
  last_valid_block_height: CanonicalU64String;
  quote_expires_at: IsoInstant;
  pre_input_raw: CanonicalU64String;
  pre_output_raw: CanonicalU64String;
  state: "pre_sign_active"|"pre_sign_aborted"|"signed_ready_to_send"|"signed_rejected_unsubmitted"|"submission_unknown"|"confirmed"|"finalized"|"chain_failed"|"reorg_or_dropped"|"holdings_verified"|"holdings_unverified"|"corrupt_local_state";
  created_at: IsoInstant;
  updated_at: IsoInstant;
  observed_slot: CanonicalU64String | null;
  reason: PurchaseReasonCode | null;
};
```

`ClientAuditSummaryV1` is immutable public data sufficient for owner-offline reconciliation: `{message_sha256,decoder_artifact_revision,allowlist_digest,transaction_version,resolved_accounts,lookup_tables,input_effect,output_effect,ata_effects,fees,lamport_debit_ceiling,compute_unit_limit,compute_unit_price_micro_lamports,independent_price_protection,pre_input_raw,pre_output_raw,pre_observed_slot}` using the same closed nested types as §3.3. It contains no signed bytes, secret or provider credential. `audit_summary_digest` is SHA-256 over RFC 8785 JCS of this exact attempt-local summary; tampering invalidates only that receipt. `execution_artifact_digest` is the separate static code/config projection defined in the execution plan and remains equal across two valid contexts from the same build. The receipt binds both digests with intent/context/message.

The following combinations are exhaustive; any other combination is `corrupt_local_state` and cannot send:

| Receipt state | `send_phase` | Signature | `send_invoked` | Reload action |
| --- | --- | --- | --- | --- |
| `pre_sign_active` | `pre_sign_reserved|wallet_prompt_invoked` | null | false | reacquire/fence generation; abandon orphan or await current owned prompt, never send |
| `pre_sign_aborted` | `pre_sign_reserved|wallet_prompt_invoked` | null | false | user acknowledgement may start a fresh generation/review |
| `signed_ready_to_send` | `signed_persisted` | exact derived signature | false | signed bytes were ephemeral and are absent after reload; fence/record rejected-unsubmitted, then require a new context, review and wallet gesture |
| `signed_rejected_unsubmitted` | `signed_persisted` | exact derived signature | false | discard bytes; acknowledgement may start fresh generation/review |
| `submission_unknown` | `send_invoked|signature_known` | exact signature | true | same-signature status lookup only; no send/new intent |
| `confirmed` | `confirmed` | exact signature | true | same-signature finality lookup only |
| `finalized|holdings_verified|holdings_unverified|chain_failed` | `finalized` | exact signature | true | receipt-based finalized reconciliation; unlock only finalized failure or verified holdings |
| `reorg_or_dropped` | `send_invoked|signature_known|confirmed` | exact signature | true | same-signature reconciliation only; remains locked |

An explicit wallet rejection before bytes records `pre_sign_aborted`; a crash while pre-sign is an orphan fenced by the next generation. A receipt-write failure before durable `send_invoked` blocks sending. The original live callback may advance from persisted `signed_ready_to_send` to durable `send_invoked` only while it still holds the ephemeral bytes and, after read-back, revalidates lock, generation and expiry. Reload/crash loses the bytes and can only abandon that unsent signature, then begin a new context/review/wallet gesture; it never reconstructs or resumes a send. A crash on either side of the send marker is distinguishable and stale callbacks cannot cross the generation fence.

Once durable `send_invoked` exists, uncertainty is permanent until a positive finalized outcome for the exact signature and message is observed. `getTransaction:null`, history pruning, a lagging/erroring backend, blockhash expiry, elapsed time, display hiding or a processed/confirmed error never releases the wallet+genesis attempt. `chain_failed` means finalized transaction metadata for the exact signature/message with non-null `meta.err`; only that state or `holdings_verified` releases the active purchase lock. Detectable IndexedDB unavailability, corruption or partial records disable purchase. Complete same-origin storage erasure is indistinguishable from a new browser profile and therefore outside the local exactly-once guarantee; the app must disclose this limit and direct the user to reconcile wallet/explorer history before another purchase, but cannot honestly claim automatic detection. Cross-profile/device exactly-once is not promised.

Once `send_invoked`, any exception, timeout or crash is `submission_unknown`. The client never resends bytes or creates a replacement trade. It polls only the same signature through fixed status/read methods. `confirmed` is provisional. `finalized` requires exact message/signature and finalized metadata; a pre-finality regression is `reorg_or_dropped`, still locked.

`holdings_verified` is reproducible after reload with the owner offline: fetch the finalized transaction for the fixed signature, require its message hash and loaded ALT addresses to match the receipt, resolve token accounts with the stored manifest, and compare transaction-local pre/post balances against the stored effects and ceilings. An existing ATA uses its metadata pre/post row. A newly audited `create_idempotent` ATA may use zero only when the exact created account/mint/owner/program is in both the message and post row. Token-2022 withheld/output fees must equal the stored complete fee rows and the transaction-local net credit; they are not deducted twice. Unrelated later deposits and current wallet balance are never causal proof. Missing metadata/loaded addresses, wrong account/mint/owner/program, output below minimum, or input/lamport/fee/rent beyond stored ceilings is `holdings_unverified`, not success.

Required offline traces are: tombstone-write crash; prompt crash and late callback fencing; wallet rejection; signed-bytes-before-persist crash; post-sign expiry/mutation; receipt-write failure; crash before and after durable `send_invoked`; landed then long-offline/pruned-null; history disabled; lagging RPC; processed/confirmed error followed by fork regression; finalized failure; existing/new ATA; Token-2022 withheld fee; v0 ALT mismatch; unrelated deposit; and excessive fee/rent. Every uncertain send trace produces zero new sign/send operations; only exact finalized failure or verified holdings unlocks.

## 6. Freshness, errors and risk copy

Ready requires both `now < quote_expires_at` and current block height `<= last_valid_block_height` at response, review and immediately before sign. The browser anchors server response time using request-start, response-receive and monotonic elapsed time under the existing conservative RTT freshness rule. Background suspension, missing monotonic state, clock reset, five-second future skew, or insufficient remaining review budget invalidates the context. Expiry never triggers automatic refresh.

HTTP errors preserve the existing nested error contract: 400 strict syntax, 401 session, 403 CSRF/policy/scope, 409 replay/in-flight/context revision, 413 caps, 429 quota, 503 store/owner/provider/policy unavailable and 504 deadline. Domain states never hide transport/auth errors behind HTTP 200. Error bodies and logs contain no wallet address, bytes, signature, provider credential, raw upstream body or private name.

Before the gesture the UI states, in plain language: the instrument's rights and restrictions; reference price versus executable quote; exact spend ceiling and minimum receive; all known fees/rent/network cost plus explicit unknowns; Token-2022 transfer fee/hook/Scaled UI effects; route and expiry; wallet and network; transaction may fail or remain unknown; the fixed browser RPC can observe the user's IP, public address and signature; Benten does not custody funds, guarantee eligibility/value/finality or automatically retry. The DBC base token is never described as an xStock merely because it uses one as quote asset.

## 7. Route, activation and rollback gates

One venue is selected only after a dated, independently reviewed comparison proves the exact pair, route and current integration surface. The direct Meteora DLMM candidate must prove same-cohort quote/build, Token-2022 behavior, transaction construction and full decoded audit. The single alternative may be Jupiter's suitable onchain-router path only if exact route controls, build semantics, provider credential/cost, browser-wallet flow and full decoded audit pass. An RFQ/managed order, provider relay or opaque combined sign-and-send path is not silently substituted. Raydium is not a P0 parallel route.

Plan acceptance authorizes no activation. The future activation record is a closed union stored in the reviewed release configuration, never selected by a browser request:

| State | Exact authority and behavior |
| --- | --- |
| `implementation_disabled` | permits reviewed feature-off code, fixtures and no-effect tests; purchase route and Buy remain unavailable |
| `authorized_smoke` | a non-public, user-local client activation receipt names one `execution_artifact_digest`, genesis, wallet, route/policy revisions, ≤1 USDC and explicit SOL fee/rent ceiling, one attempt, start/expiry and fresh user authority; server configuration names only the artifact/route/policy/time bounds and never stores the wallet; local/preview execution automatically returns to disabled after the attempt or expiry |
| `execution_enabled` | names the same artifact plus accepted smoke/security/runtime-QA receipts and final release digest; public availability still requires all legal/rights/route/operations gates |

The progression is `implementation_disabled -> authorized_smoke -> implementation_disabled -> execution_enabled`; smoke does not directly promote itself. The user personally initiates, reviews, clicks, signs and sends. Agents may prepare software/checklists and inspect public/read-only evidence, but never perform the financial action. A mismatch, failed/unknown smoke, expired grant or unavailable proof returns to disabled. This plan creates none of these runtime records.

Rollback independently disables the purchase route/context endpoint and Buy control while preserving catalog, facts, provider comparison and DBC evidence. Any failed route, wallet, security, legal, cost or funded-smoke gate returns to typed unavailable; quote-only evidence is not relabelled as a purchase-complete MVP.

Primary implementation references rechecked 2026-09-16 are the [Wallet Standard core feature sources](https://github.com/anza-xyz/wallet-standard/tree/master/packages/core/features/src) and Solana's [transaction confirmation guide](https://solana.com/developers/cookbook/transactions/confirmation). The source revision must be pinned at implementation: the rolling default branch may change. A send acknowledgement is not confirmation, a null transaction lookup is not failure, and last-valid block height remains an independent expiry condition.
