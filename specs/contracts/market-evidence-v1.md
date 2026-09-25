# Stock-Quote Market Evidence v1

Status: **proposed plan-only contract**, 2026-09-16. No runtime schema, API, UI, pool, token or transaction is implemented by this document.

## 1. Purpose and ownership

`MarketEvidenceV1` is the public-safe evidence contract for two complementary consumers of one product:

1. an investor/researcher inspects an existing xStock's public facts and DLMM acquisition candidate, and can also inspect the fees, curve progress, liquidity/migration state and rights boundary of a distinct DBC base-token market that uses an xStock as quote asset; and
2. a launchpad/operator checks whether the xStock may be used as a DBC quote asset, compares explicit hypothetical configurations, and monitors an externally identified existing DBC market without launching it.

The reusable connectivity owner produces chain observations and deterministic diagnostics. Benten owns its reviewed xStock identity/fact projection and presentation policy. The existing [unsigned acquisition contract](../unsigned-acquisition-tool-contract.md) remains the sole quote/context, fee, expiry, BFF-session and error-wire SSOT; this contract defines only the additional market-evidence fields and states. Private analysis, a private financial database, provider credentials, wallet material and execution state are forbidden inputs.

PreStocks instruments and Tessera T-Tokens are different provider assets governed by [Provider Asset Evidence v1](provider-asset-evidence-v1.md); neither can be substituted for `SharedXStockIdentityV1`. Clawpump launch-provider discovery and any later effect contract are outside both evidence envelopes until its Meteora request, authority, custody, funding and retry behavior is verified.

## 2. Common strict types

Future JSON/TypeScript schemas use `additionalProperties:false` and reject coercion. `U64` is `^(0|[1-9][0-9]{0,19})$` and must parse within `0..18446744073709551615`. `U128` is `^(0|[1-9][0-9]{0,38})$` and must parse within `0..340282366920938463463374607431768211455`; leading zeroes, exponent notation, JSON numbers and values above that bound are rejected. `Bps` is an integer `0..10000`; `Slot` is an integer `1..9007199254740991`; addresses are base58 strings whose decoded length is 32 bytes and must also pass the owner policy allowlist. Timestamps are UTC RFC 3339. SHA-256 values are 64 lowercase hex characters. Arrays reject duplicate semantic keys.

```text
ObservedMarketEvidenceV1 = {
  schema_version: "market-evidence.v1",
  evidence_id: Sha256,
  evidence_kind:
    | "dlmm_existing_xstock_quote"
    | "dbc_quote_asset_eligibility"
    | "dbc_scenario_comparison"
    | "dbc_existing_market_monitor",
  evidence_state: "candidate_unverified" | "verified_scenario" | "verified_observation",
  shared_xstock_identity: SharedXStockIdentityV1,
  market: DlmmMarketBindingV1 | DbcMarketBindingV1,
  source: FixtureSourceV1 | PublicChainSourceV1 | CompositeSourceV1,
  findings: FindingV1[1..64],
  unknowns: UnknownV1[0..32],
  not_authorization: true
}

UnavailableMarketEvidenceV1 = {
  schema_version: "market-evidence.v1",
  evidence_id: Sha256,
  evidence_kind:
    | "dlmm_existing_xstock_quote"
    | "dbc_quote_asset_eligibility"
    | "dbc_scenario_comparison"
    | "dbc_existing_market_monitor",
  evidence_state: "unavailable",
  request_binding: FailedRequestBindingV1,
  shared_xstock_identity: SharedXStockIdentityV1 | null,
  market: null,
  source: null,
  failure_stage: "input_binding" | "policy" | "account_read" | "cohort_validation" | "calculation",
  findings: FindingV1[1..64],
  unknowns: UnknownV1[1..32],
  not_authorization: true
}

MarketEvidenceV1 = ObservedMarketEvidenceV1 | UnavailableMarketEvidenceV1
```

`FailedRequestBindingV1` is an exact tagged union that contains only caller input already validated syntactically: `{kind:"dbc_eligibility",shared_xstock_mint:Address,program:Address,request_digest:Sha256}`, `{kind:"dbc_scenario",shared_xstock_mint:Address,request_digest:Sha256}`, `{kind:"dbc_observation",shared_xstock_mint:Address,program:Address,config:Address,pool:Address,request_digest:Sha256}`, or `{kind:"dlmm_quote",shared_xstock_mint:Address,request_digest:Sha256}`. The exact evidence-kind mapping is `dbc_quote_asset_eligibility -> dbc_eligibility`, `dbc_scenario_comparison -> dbc_scenario`, `dbc_existing_market_monitor -> dbc_observation`, and `dlmm_existing_xstock_quote -> dlmm_quote`; every other pairing is invalid. It never invents a base mint, slot, account digest or economic value.

`SharedXStockIdentityV1` is exactly:

```text
{
  cluster: "solana-mainnet",
  mint: Address,
  token_program: Address,
  decimals: integer 0..18,
  registry_revision: string 1..128,
  public_identity_digest: Sha256,
  rights_kind: "tracker_certificate" | "unknown",
  current_transfer_fee: FeeBasisV1,
  scheduled_transfer_fee: FeeBasisV1,
  scaled_ui: ScaledUiBasisV1,
  dbc_badge: DbcBadgeV1
}
```

`FeeBasisV1` is the tagged union `{status:"known",basis_points:Bps,maximum_fee_raw:U64,effective_epoch:integer>=0}` or `{status:"unknown",reason_code:FindingCode}` or `{status:"not_applicable"}`. `ScaledUiBasisV1` is `{status:"known",multiplier:string matching ^[0-9]+(\.[0-9]{1,18})?$,effective_timestamp:integer>=0,source_slot:Slot}` or `{status:"unknown",reason_code:FindingCode}`. The multiplier is display-only. `DbcBadgeV1` is `{status:"observed",address:Address,source_slot:Slot,account_digest:Sha256}` or `{status:"absent"}` or `{status:"unknown",reason_code:FindingCode}`. Null is not used inside these unions.

`FindingCode` is limited in v1 to `identity_mismatch`, `role_mismatch`, `source_mismatch`, `issuer_unknown`, `rights_unknown`, `fee_unknown`, `fee_nonzero`, `scaled_ui_unknown`, `badge_unknown`, `badge_absent`, `hook_unknown`, `curve_invalid`, `keeper_unknown`, `migration_not_observed`, `migrated_market_unverified`, `liquidity_unknown`, `stale_observation`, `unsupported_configuration`, `pool_not_found`, `config_missing`, and `incomplete_cohort`. `FindingV1` is exactly `{code:FindingCode,subject_path:string 1..160,status:"met"|"not_met"|"unknown",evidence_refs:Sha256[0..16]}`. `UnknownV1` is exactly `{code:FindingCode,blocks:("quote"|"scenario"|"monitor"|"release")[1..4]}`. Findings never contain a score, rank, safety claim, expected return, `best`, `launch_allowed` or recommendation.

## 3. Market bindings and rights isolation

`DlmmMarketBindingV1` is exactly `{kind:"dlmm",program:Address,pool:Address,input_mint:Address,output_mint:Address,input_role:"spend_asset",output_role:"existing_xstock",route_policy_revision:string 1..128,quote_wire_digest:Sha256}`. `output_mint` must equal `shared_xstock_identity.mint`; `input_mint` must differ. Quote economics live only in the referenced existing quote wire.

`DbcMarketBindingV1` is one of:

```text
{ kind:"dbc_eligibility", program:Address, quote_mint:Address,
  base_mint:null, base_role:"none", quote_role:"xstock_quote_asset" }

{ kind:"dbc_scenario", program:Address, quote_mint:Address,
  base_mint:null, base_role:"hypothetical_non_xstock_base",
  quote_role:"xstock_quote_asset", scenario_pair:ScenarioPairV1,
  results:{scenario_id:string 1..64,provider_config_digest:Sha256,
    validation_status:"valid"|"invalid",
    derived:{migration_sqrt_price_raw:U128,swap_base_amount_raw:U64}|null,
    finding_indices:(integer 0..63)[0..16]}[2] }

{ kind:"dbc_observation", program:Address, config:Address, pool:Address,
  quote_mint:Address, base_mint:Address,
  base_role:"observed_non_xstock_base", quote_role:"xstock_quote_asset",
  base_asset:BaseAssetEvidenceV1,
  economics:DbcObservedEconomicsV1,
  migration_flag:"not_migrated"|"migrated"|"unknown",
  migrated_market:null|{program:Address,pool:Address,evidence_ref:Sha256} }
```

`quote_mint` must equal `shared_xstock_identity.mint`. A DBC base mint must differ and has its own issuer and rights statement. Pairing it with an xStock does **not** give it xStock issuer backing, equity, voting, redemption or tracker-certificate rights. A `migration_flag:"migrated"` without a separately verified migrated-market account requires `migrated_market:null` and finding `migrated_market_unverified`.

The DLMM and DBC bindings cannot share or infer a pool, reverse mint roles, or reuse economics. They may share the same xStock mint identity only. Program, pool/config, counterpart mint, roles, quote/curve values and rights are market-specific.

`BaseAssetEvidenceV1` is exactly `{mint:Address,token_program:Address,decimals:integer 0..18,identity:{status:"observed",account_digest:Sha256}|{status:"unknown",reason_code:FindingCode},issuer:{status:"public_source_verified",label:string 1..120,evidence_refs:Sha256[1..8]}|{status:"unknown",evidence_refs:Sha256[0..8]},rights:{kind:"non_xstock_token",evidence_refs:Sha256[1..8]}|{kind:"unknown",evidence_refs:Sha256[0..8]}}`. Even an observed mint defaults to unknown issuer/rights until public evidence proves them; it never copies `shared_xstock_identity` rights.

`DbcObservedEconomicsV1` is exactly:

```text
{
  config_digest: Sha256,
  sqrt_start_price_raw: U128,
  migration_sqrt_price_raw: U128,
  migration_quote_threshold_raw: U64,
  curve_points: {sqrt_price_raw:U128,liquidity_raw:U128}[1..20],
  pool_fees: {
    base_fee: {cliff_fee_numerator:U64,first_factor:integer 0..65535,
      second_factor:U64,third_factor:U64,
      mode:"linear"|"exponential"|"legacy_rate_limiter"|"unknown"},
    dynamic_fee:
      | {status:"disabled"}
      | {status:"observed_unmodelled",config_digest:Sha256}
      | {status:"unknown",reason_code:FindingCode},
    effective_trade_fee:
      | {status:"known",total_fee_numerator:U64,denominator:"1000000000",
          chain_point:U64,calculation_digest:Sha256}
      | {status:"unknown",reason_code:FindingCode}
  },
  curve_progress:
    | {status:"known",quote_reserve_raw:U64,threshold_quote_raw:U64,
        basis:"current_net_quote_reserve",bps:Bps,rounding:"floor"}
    | {status:"unknown",reason_code:FindingCode},
  liquidity_quote:
    | {status:"known",raw:U64,basis:"pool_quote_vault",account_ref:Sha256}
    | {status:"unknown",reason_code:FindingCode}
}
```

Quote-mint current/scheduled transfer fees remain in `SharedXStockIdentityV1`; DBC pool trading-fee configuration/effective fee remains in `economics.pool_fees`. Neither substitutes for the other. Known curve progress must satisfy `threshold_quote_raw > 0`, `threshold_quote_raw == migration_quote_threshold_raw`, and `bps = floor(min(quote_reserve_raw,threshold_quote_raw) * 10000 / threshold_quote_raw)`: `1/3 -> 3333`, `999999/1000000 -> 9999`, and any numerator at or above `1000000 -> 10000`; threshold zero is invalid. The numerator is the pool's current net quote reserve, which may decrease on a sell; it is not vault balance, cumulative volume, funds raised or a monotonic progress promise. An enabled dynamic fee may be displayed as observed but its effective trade fee stays unknown until same-cohort volatility/time inputs and pinned calculation pass. The consumer displays known fields and explicit unknowns without calculating its own fee, curve, rights or liquidity values.

For `ObservedMarketEvidenceV1`, allowed discriminant combinations are exact: `dlmm_existing_xstock_quote + dlmm + (fixture|public_chain)`; `dbc_quote_asset_eligibility + dbc_eligibility + (fixture|public_chain)`; `dbc_scenario_comparison + dbc_scenario + (fixture|scenario_against_observation)`; and `dbc_existing_market_monitor + dbc_observation + (fixture|public_chain)`. Any observation or eligibility result with fixture source is always `candidate_unverified`; only a complete public-chain source can reach `verified_observation`. Every other observed evidence-kind/market/source combination is ME-01 invalid. `UnavailableMarketEvidenceV1` instead requires `market:null` and `source:null` and matches `evidence_kind` to `request_binding.kind`; it cannot masquerade as observed evidence. Eligibility proves only the quote-mint/badge/extension predicates present in its stated source; it does not imply a pool, base token or launch.

`ScenarioPairV1` is exactly `{source:"operator_input",provider_schema_revision:"meteora-dbc-f552f20-aa1595c",baseline_config_digest:Sha256,left:DbcScenarioV1,right:DbcScenarioV1}` with distinct IDs. `baseline_config_digest` selects exactly `packages/solana-spot/src/fixtures/dbc/baselines/<digest>.json`; lookup by label or latest file is forbidden. That fixture contains `{schema_version,provider_schema_revision,program_commit,sdk_commit,source_kind:"reviewed_public_config",source:{config,slot,account_digest,raw_account_base64:string 1..4096},decoded_pool_config,create_config_params,projection_map}`. `decoded_pool_config` is a complete strict transcription of every pinned `PoolConfig` field, including all 20 curve entries and padding/tombstone bytes. `create_config_params` is the separate exact SDK validator input projected from that account; unused zero curve entries are excluded there rather than being misrepresented as operator points. `projection_map` identifies every copied, converted and provider-derived field and its rounding rule. No raw field is omitted, zeroed or defaulted. A baseline is selectable only after one same-cohort config account decodes and re-encodes byte-identically, its projected create params pass the pinned validator, and rebuilding those params reproduces every mapped/derived economic field under the pinned SDK; otherwise D2b returns unavailable.

`DbcScenarioV1` is exactly `{scenario_id:string 1..64,base_decimals:integer 0..18,quote_decimals:integer 0..18,migration_quote_threshold_raw:U64,fee_mode:"baseline_only",sqrt_start_price_raw:U128,curve_points:{sqrt_price_raw:U128,liquidity_raw:U128}[2..4]}`. The only override mapping is: `migration_quote_threshold_raw -> createConfigParams.migrationQuoteThreshold`, `sqrt_start_price_raw -> createConfigParams.sqrtStartPrice`, and each supplied curve point in order -> `createConfigParams.curve[i].{sqrtPrice,liquidity}`. `migration_sqrt_price` and `swap_base_amount` are provider-derived outputs, never independent operator overrides; a valid result returns both under `results[].derived` and they must equal the pinned create-config derivation. All remaining create parameters and decoded raw fields, including the complete pool fee configuration, base decimals (`token_decimal`), quote decimals from the verified quote mint, unused raw curve entries and padding, remain baseline-bound. Supplied decimals must equal those two baseline/observed values. v1 does not override fee fields or dynamic-fee parameters; `fee_mode:"baseline_only"` makes that limitation explicit. The owner validates the complete post-override create params, derives a full result through the pinned SDK, checks every `projection_map` invariant and records its JCS digest. An invalid result has `derived:null`. Output compares only explicit inputs and deterministic validation/findings—never projected profit or a recommended scenario.

DBC Q64.64 sqrt price direction is **quote-token decimal-adjusted nominal units per one base-token decimal-adjusted nominal unit**. For positive decimal price `p`, `sqrt_raw = floor(sqrt(p / 10^(base_decimals-quote_decimals)) * 2^64)`; the inverse display is `(sqrt_raw^2 / 2^128) * 10^(base_decimals-quote_decimals)`. This conversion does **not** include the Token-2022 Scaled UI multiplier; a consumer applies the separately bound `shared_xstock_identity.scaled_ui` once for presentation and never folds it into Q64 price. Both conversions use arbitrary-precision decimal/integer arithmetic and floor only at the stated Q64 conversion; JavaScript `number` is forbidden. A pinned parity vector is `p="4", base_decimals=9, quote_decimals=6 -> sqrt_raw="1166674533742703176"`; swapping the decimal exponent, applying the Scaled UI multiplier inside `p`, or accepting `1166674533742703176` as a JSON number is negative. The [pinned SDK conversion](https://github.com/MeteoraAg/dynamic-bonding-curve-sdk/blob/aa1595c29a0457b23a80cfcf9843a04603954858/packages/dynamic-bonding-curve/src/helpers/common.ts) is the parity oracle, while independent integer/rational checks detect direction and rounding drift.

For fee display, `base_fee_bps` is never reconstructed from one field unless the baseline uses a constant linear schedule: `starting_bps == ending_bps`, `number_of_periods == total_duration == 0`, dynamic fee disabled. Only then the pinned mapping is `cliff_fee_numerator = base_fee_bps * 1_000_000_000 / 10_000`, `first_factor=second_factor=third_factor=0`, mode `linear`; `100 bps -> 10000000`. Other schedules expose the four raw base-fee fields and mode without a scalar bps label. Fee charged on an included raw amount uses ceiling: amount `1` at `100 bps` yields fee `1`, not zero. Collect-fee mode, protocol/referral split, migration fee and dynamic fee stay separate baseline fields and are never inferred from this scalar.

## 4. Source/provenance and positive states

- `FixtureSourceV1` is exactly `{kind:"fixture",fixture_digest:Sha256,provider_source_revision:string 1..128}`. It supports `candidate_unverified` or `verified_scenario`, never `verified_observation`.
- `PublicChainSourceV1` is exactly `{kind:"public_chain",context_slot:Slot,observed_at:timestamp,ordered_accounts_digest:Sha256,account_roles:{role:string 1..64,address:Address,digest:Sha256,present:boolean}[1..100]}`. It may support a structurally complete `candidate_unverified`; it supports `verified_observation` only when every required source/identity/role/program-mint relation, freshness and monitor predicate passes and no `unknowns[].blocks` contains `"monitor"`. An issuer, rights, keeper or effective-fee unknown may remain explicit when it blocks only `quote`, `scenario` or `release`; it does not erase a successfully verified structural observation.
- `CompositeSourceV1` is exactly `{kind:"scenario_against_observation",scenario:FixtureSourceV1,observation:PublicChainSourceV1}`. It means hypothetical inputs were evaluated against an observed market baseline. Scenario fields remain labelled hypothetical; observed fields remain immutable and are never overwritten. It may yield `verified_scenario`, not a launch or execution state.

Freshness uses the owner service's UTC clock after the final cohort is validated, with `age = evaluated_at - source.observed_at`. A public-chain observation can be returned as current `verified_observation` only for `-5 seconds <= age <= 30 seconds`; `age < -5 seconds` is invalid. The Web state is `current` for that same closed interval, `stale` for `30 seconds < age <= 5 minutes`, and `expired` for `age > 5 minutes`. Stale/expired immutable values remain historical but cannot close sponsor-positive proof. A fixture-only scenario uses `fixture_scenario_not_time_bound` while its baseline/config/schema digests match. A fixture DLMM/DBC observation uses `fixture_observation_non_live`; it can wrap `candidate_unverified` only and never becomes current, verified or sponsor-positive. `scenario_against_observation` inherits the observation window. An unavailable response has no source and uses `no_source`, never an invented time.

Before dispatch the browser stores monotonic `request_started`; at response receipt it stores monotonic `received`, BFF `evaluated_at` and local wall time. Set `rtt = received - request_started` and use the conservative upper bound `estimated_server_now_upper = evaluated_at + rtt + (monotonic_now - received)`. The full non-negative RTT is charged even though it may include pre-evaluation time, so delivery delay cannot extend current/stale/expired boundaries. Initial local-wall difference is compared with `evaluated_at + rtt`; above 30 seconds marks the wall clock untrusted but never changes the monotonic validity calculation. Missing, negative, reset or non-monotonic anchors force `refresh_required`. On pageshow/visibility regain, recompute with the same anchors; if the runtime cannot prove monotonic continuity across the background interval, force `refresh_required`. This rule does not apply a time window to either fixture branch. Production tuning may reduce these limits after measurement but cannot increase them for the deadline release without contract review.

`verified_scenario` means deterministic validation completed against the pinned product/provider schema and all reported inputs are explicit; an individual result may validly be `validation_status:"invalid"` with deterministic field findings. It requires no `unknowns[].blocks` containing `"scenario"`, but it does not mean viable, safe, recommended or launchable. `verified_observation` means a read-only cohort was structurally verified at the stated slot under the monitor rule above; it does not mean acquisition-ready, liquid, fairly priced or executable. `candidate_unverified` is retained for C2c and incomplete evidence. `unavailable` is required for malformed, stale, mismatched or operation-blocking unknown inputs.

Canonicalization is UTF-8 [JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785) with no insignificant whitespace. `evidence_id` is lowercase SHA-256 of the canonical complete response with the `evidence_id` member omitted. `request_digest` hashes the validated request body by the same rule. `baseline_config_digest` hashes the entire strict baseline fixture JSON; `provider_config_digest` hashes the complete derived post-override provider-config projection named by `projection_map`; `config_digest` in an observation hashes the decoded complete `PoolConfig` JSON, while each account digest hashes raw account bytes. These domains are not interchangeable, and array order is preserved.

DBC curve completion, off-chain keeper eligibility and existence of a migrated DAMM v2 market are independent findings. DLMM is not a DBC graduation venue. Facts and deterministic validation are off-chain computations over reviewed public artifacts or public-chain observations; Solana is essential because the identities, token programs, accounts and market targets being evaluated are on-chain.

### Failure construction and response examples

The following cases are normative:

| Case | Response |
| --- | --- |
| Syntactically malformed/unknown scenario field or invalid `U128` | HTTP 400 existing nested `ErrorV1`; no `MarketEvidenceV1` body |
| Owner policy rejects program/config/pool/xStock | HTTP 403 existing nested `ErrorV1`; no evidence body |
| RPC timeout before a cohort exists | HTTP 504 existing nested `ErrorV1`; no invented slot/source/market |
| Exact pool absent or config account absent | HTTP 200 `UnavailableMarketEvidenceV1`, `request_binding.kind:"dbc_observation"`, `market:null`, `source:null`, stage `account_read`, finding `pool_not_found` or `config_missing` |
| Partial/mixed cohort | HTTP 200 unavailable branch, stage `cohort_validation`, finding `incomplete_cohort`; partial account values are not returned |
| Valid scenario whose complete provider config fails validation | HTTP 200 observed branch with `verified_scenario`, the matching result `validation_status:"invalid"`, and field findings; this is a successful diagnostic, not launch approval |

A complete `dbc_existing_market_monitor + verified_observation` response necessarily carries: shared xStock mint/program/decimals/rights and quote-transfer-fee/Scaled-UI basis; DBC program/config/pool and distinct base-mint identity/issuer/rights; complete config sqrt/curve/migration values; distinct DBC base/dynamic/effective trading-fee state; curve-progress numerator/denominator/rounding; liquidity raw/basis; migration flag and separately verified-or-null migrated market; one ordered cohort source with all account digests; and explicit findings/unknowns. The investor/operator projection maps these paths directly. If any mandatory structural value is unavailable the response is candidate/unavailable rather than having the consumer derive or invent it.

The following is the complete schema fixture used by ME-07. It intentionally uses `candidate_unverified` plus `source.kind:"fixture"`; its economics and repeated digit digests are synthetic and **must not** be cited as an observation of the named public pool. It proves only that one response can drive every selected display/export field while keeping issuer, rights, effective fee and migrated-market proof unknown.

```json
{"schema_version":"market-evidence.v1","evidence_id":"86f113e34073c9e0d491f3a8f993fa12d36b152c9377eb1d689a917dd382ed1e","evidence_kind":"dbc_existing_market_monitor","evidence_state":"candidate_unverified","shared_xstock_identity":{"cluster":"solana-mainnet","mint":"Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh","token_program":"TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb","decimals":8,"registry_revision":"fixture-registry-v1","public_identity_digest":"1111111111111111111111111111111111111111111111111111111111111111","rights_kind":"tracker_certificate","current_transfer_fee":{"status":"known","basis_points":0,"maximum_fee_raw":"0","effective_epoch":1},"scheduled_transfer_fee":{"status":"known","basis_points":0,"maximum_fee_raw":"0","effective_epoch":2},"scaled_ui":{"status":"known","multiplier":"1.001701196801074","effective_timestamp":1789000200,"source_slot":447289820},"dbc_badge":{"status":"observed","address":"mfacWnGh1Kn5ttHMMaNZhRZbCjvGrDQyDyZgqaR9vBM","source_slot":447289820,"account_digest":"2222222222222222222222222222222222222222222222222222222222222222"}},"market":{"kind":"dbc_observation","program":"dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN","config":"9kNiExsJQLnweRVM3KKKRdUETFh9sJaRHmbCoHzCAG2x","pool":"DdetkWKRyY1jTTyWdT2HCEhXQyF8y2c5PJz9sh8s7pdF","quote_mint":"Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh","base_mint":"7XmaUUj2PQw2sQvPKkomKUQXFNtqzMo2DURHhrk7rnN2","base_role":"observed_non_xstock_base","quote_role":"xstock_quote_asset","base_asset":{"mint":"7XmaUUj2PQw2sQvPKkomKUQXFNtqzMo2DURHhrk7rnN2","token_program":"TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA","decimals":9,"identity":{"status":"observed","account_digest":"3333333333333333333333333333333333333333333333333333333333333333"},"issuer":{"status":"unknown","evidence_refs":[]},"rights":{"kind":"unknown","evidence_refs":[]}},"economics":{"config_digest":"4444444444444444444444444444444444444444444444444444444444444444","sqrt_start_price_raw":"1166674533742703176","migration_sqrt_price_raw":"1844674407370955161","migration_quote_threshold_raw":"1000000","curve_points":[{"sqrt_price_raw":"1844674407370955161","liquidity_raw":"1000000000000"}],"pool_fees":{"base_fee":{"cliff_fee_numerator":"10000000","first_factor":0,"second_factor":"0","third_factor":"0","mode":"linear"},"dynamic_fee":{"status":"disabled"},"effective_trade_fee":{"status":"unknown","reason_code":"fee_unknown"}},"curve_progress":{"status":"known","quote_reserve_raw":"500000","threshold_quote_raw":"1000000","basis":"current_net_quote_reserve","bps":5000,"rounding":"floor"},"liquidity_quote":{"status":"known","raw":"500000","basis":"pool_quote_vault","account_ref":"5555555555555555555555555555555555555555555555555555555555555555"}},"migration_flag":"migrated","migrated_market":null},"source":{"kind":"fixture","fixture_digest":"6666666666666666666666666666666666666666666666666666666666666666","provider_source_revision":"synthetic-contract-vector-v1"},"findings":[{"code":"fee_unknown","subject_path":"market.economics.pool_fees.effective_trade_fee","status":"unknown","evidence_refs":["6666666666666666666666666666666666666666666666666666666666666666"]},{"code":"migrated_market_unverified","subject_path":"market.migrated_market","status":"unknown","evidence_refs":["6666666666666666666666666666666666666666666666666666666666666666"]},{"code":"issuer_unknown","subject_path":"market.base_asset.issuer","status":"unknown","evidence_refs":[]},{"code":"rights_unknown","subject_path":"market.base_asset.rights","status":"unknown","evidence_refs":[]}],"unknowns":[{"code":"fee_unknown","blocks":["release"]},{"code":"migrated_market_unverified","blocks":["release"]},{"code":"issuer_unknown","blocks":["release"]},{"code":"rights_unknown","blocks":["release"]}],"not_authorization":true}
```

The fixture is consumed without field inference:

| Product item | Exact contract path | Producer / proof |
| --- | --- | --- |
| Shared xStock identity, rights boundary, transfer fee and Scaled UI | `shared_xstock_identity.{mint,token_program,decimals,rights_kind,current_transfer_fee,scheduled_transfer_fee,scaled_ui}` | D2c observer; ME-02/04/07 |
| Distinct DBC base identity, issuer and rights | `market.base_asset` | D2c observer; ME-02/05/07 |
| Observed config, curve and migration threshold | `market.economics.{config_digest,sqrt_start_price_raw,migration_sqrt_price_raw,migration_quote_threshold_raw,curve_points}` | D2c observer independently; ME-03/05/06 |
| DBC base/dynamic/effective trading fee | `market.economics.pool_fees` | D2c observer; ME-05/07 |
| Current reserve progress and liquidity observation | `market.economics.{curve_progress,liquidity_quote}` | D2c observer; ME-05/07 |
| Migration state and separately proved migrated market | `market.{migration_flag,migrated_market}` | D2c observer; ME-05/07 |
| Hypothetical scenario inputs and provider-derived outputs | `market.scenario_pair` and `market.results` | D2f baseline → D2b scenario validator; ME-03/06 |
| Cohort provenance or explicit absence | `source`, `findings`, `unknowns`; unavailable branch `request_binding/failure_stage` | D2c/ME-M7; ME-03/07/08 |

## 5. Planned transport delta and paths

The owner adds no second auth/error model, but these operations do **not** inherit the quote-only permission implicitly. A future individual caller token needs `market_evidence:scenario` for offline comparison and `market_evidence:read` for public-chain observation. The Benten service credential may carry those two read/no-effect scopes plus `quote:read` only after its consumer-policy revision fixes the permitted DBC program/config/pool and xStock mint; it still cannot request unsigned contexts. These operations share the existing stable-caller owner ceilings—they do not receive a second quota bucket—while Benten's finer session/IP/global admission limits still apply before its owner call. Future calls reuse the existing nested error wire. The BFF retains its five-second hard deadline and no-retry rule; the stricter operation deadlines below leave time for validation and lossless mapping rather than extending that deadline.

| Operation | Exact request delta | Response / retry |
| --- | --- | --- |
| `POST /v1/market-evidence/dbc-scenarios` | `{schema_version:"market-evidence.v1",shared_xstock_mint,scenario_pair}`; **4 KiB** owner body; no network | `MarketEvidenceV1` kind `dbc_scenario_comparison`; 500 ms deterministic deadline; no retry |
| `POST /v1/market-evidence/dbc-observations` | `{schema_version:"market-evidence.v1",shared_xstock_mint,program,config,pool}`; **4 KiB** owner body; all addresses owner-policy allowlisted | kind `dbc_existing_market_monitor`; one bounded same-cohort public read; **2.5-second owner deadline**; no automatic retry or provider switch |
| Benten `POST /api/acquisition/market-evidence` | same product-session/CSRF/nonce contract as quote BFF; exact tagged union below; endpoint-specific **4 KiB** body limit | lossless public projection plus freshness wrapper; oversize is 413; no owner token, provider text or bytes; `Cache-Control:no-store` |

The BFF request is exactly one of these two `additionalProperties:false` branches:

```text
{context_version:"2.0",operation:"dbc_scenario",shared_xstock_mint:Address,
 scenario_pair:ScenarioPairV1}

{context_version:"2.0",operation:"dbc_observation",shared_xstock_mint:Address,
 program:Address,config:Address,pool:Address}
```

`dbc_scenario` maps losslessly to owner `/v1/market-evidence/dbc-scenarios` by changing only `context_version` to owner `schema_version:"market-evidence.v1"` and omitting `operation`; `dbc_observation` maps equivalently to `/v1/market-evidence/dbc-observations`. Missing/unknown operation, keys from the other branch, both branches, repeated keys, or a missing required field returns the existing nested HTTP 400 error before owner admission. Only exact POST is allowed; GET/PUT/PATCH/DELETE return 405, unknown acquisition paths 404, and byte 4097 returns 413 before JSON parsing. ME-09 golden fixtures cover both request mappings, each malformed cross-branch shape, exact 4096/4097 boundaries, and owner/BFF response preservation. The BFF success body is exactly `{context_version:"2.0",evidence:MarketEvidenceV1,freshness:MarketFreshnessV1}` and cannot alter `evidence_state`. `MarketFreshnessV1` is exactly one of `{basis:"public_chain_observed_at",evaluated_at:timestamp,valid_until:timestamp,state:"current"|"stale"|"expired"}`, where `valid_until = source.observed_at + 30 seconds`; `{basis:"fixture_scenario_not_time_bound",evaluated_at:timestamp,valid_until:null,state:"not_time_bound"}`; `{basis:"fixture_observation_non_live",evaluated_at:timestamp,valid_until:null,state:"candidate_non_live"}`; or `{basis:"no_source",evaluated_at:timestamp,valid_until:null,state:"unavailable"}`. No branch fabricates `source.observed_at`.

The mapping is total and one-to-one over every allowed evidence/source/state combination:

| Evidence/source | Allowed evidence state | Freshness branch |
| --- | --- | --- |
| DLMM observation, DBC eligibility or DBC observation + `fixture` | `candidate_unverified` only | `fixture_observation_non_live` / `candidate_non_live` |
| DBC scenario + `fixture` | `candidate_unverified` or `verified_scenario` | `fixture_scenario_not_time_bound` / `not_time_bound` |
| DLMM observation, DBC eligibility or DBC observation + `public_chain` | `candidate_unverified` or, where permitted, `verified_observation` | `public_chain_observed_at`; state derives only from age |
| DBC scenario + `scenario_against_observation` | `candidate_unverified` or `verified_scenario` | `public_chain_observed_at` inherited from `observation` |
| Any unavailable branch with `source:null` | `unavailable` only | `no_source` / `unavailable` |

The ME-07 wrapper golden parses the complete canonical JSON fixture in §3 as `evidence` without changing any member, then pairs it with the exact JSON freshness member `{"basis":"fixture_observation_non_live","evaluated_at":"2030-01-01T00:00:00.000Z","valid_until":null,"state":"candidate_non_live"}` under outer `context_version:"2.0"`. The test JCS-serializes the complete constructed response and compares its checked-in digest. The timestamp is only the synthetic wrapper evaluation time; it is not inserted into the evidence source and cannot be labelled current. ME-09 must reject every cross-row branch/state substitution.

Existing `400/401/403/409/429/503/504` mappings and quotas remain defined by the unsigned acquisition contract. Ingress selects the body parser/limit by the exact route before parsing: existing quote routes retain their 2 KiB cap, while only exact `POST /api/acquisition/market-evidence` receives the 4 KiB cap; unknown acquisition paths and method mismatches do not inherit it. Missing runtime URL/config is typed unavailable, never mock success.

Future owner paths follow the current package layout:

```text
packages/solana-spot/src/contracts/market-evidence-v1.ts
packages/solana-spot/src/domain/dbc-quote-asset-eligibility.ts
packages/solana-spot/src/domain/dbc-scenario-diagnostics.ts
packages/solana-spot/src/fixtures/dbc/baselines/<digest>.json
packages/solana-spot/src/venues/meteora/observe-dbc-market.ts
tests/solana-spot/{market-evidence,dbc-eligibility,dbc-scenario,dbc-monitor}.test.ts

packages/acquisition-consumer/src/market-evidence-v1.ts
apps/acquisition-bff/src/routes/market-evidence.ts
apps/public-web/app/routes/market-readiness/**
```

The owner contract/domain remains SDK-free; the venue adapter owns provider decoding. Benten maps the owner DTO without importing provider SDK/math or private modules. Initial BFF tests use a fake owner and the existing session/admission port.

## 6. Required tests and stop gates

| Test | Required negative or evidence | Stop condition |
| --- | --- | --- |
| ME-01 strict shape | unknown key, unsafe number/raw, malformed address/time/digest, duplicate semantic key, invalid union combination; max-shape two-scenario/four-point canonical request is at most 4 KiB, byte 4097 is 413, and the same size remains 413 on quote/unknown routes | Any coercion, unknown-field acceptance or route-to-limit confusion blocks implementation. |
| ME-02 identity/role binding | swap DLMM input/output; attach DBC base as xStock; mismatch DBC quote and shared identity; reuse pool across bindings | Any role or rights inheritance blocks consumer use. |
| ME-03 source separation | relabel fixture as public-chain; mix slots/accounts; attach live address/value to hypothetical scenario; overwrite observed value in composite | Any source-kind promotion blocks evidence. |
| ME-04 Token-2022 | missing current/scheduled fee, Scaled UI basis/effective time, badge/hook unknown | A missing required union/value is invalid. A tagged unknown is preserved; if it blocks `monitor`, observation is unavailable, while a `quote`/`release`-only unknown may coexist with structural `verified_observation` and still blocks that later operation. |
| ME-05 DBC states | independently exercise curve-complete, keeper unknown/not-met, migration flag and actual migrated-market absence; quote-transfer fee and DBC trading fee never collapse; base issuer/rights unknown remains visible | No combined ready boolean, recommendation, inherited xStock right or launch guarantee is allowed. |
| ME-06 positive bounded states | exact baseline lookup and byte-identical re-encode; Q64 vector `4/9/6 -> 1166674533742703176`; scenario override map and JCS digests; valid deterministic A/B fixture → verified scenario; valid complete same-cohort market → verified observation | Any defaulted provider field, float, direction/rounding drift or digest instability blocks scenario evidence. Success labels remain no-effect and never promote C2c or quote execution readiness. |
| ME-07 lossless consumer/boundary | one complete owner observation → investor/operator projection covering base rights, transfer fee, DBC fee, curve/progress/liquidity/migration and every unknown; no private analysis/database, provider secret, wallet/sign/send/order/LP/token-create import/field | Any consumer-side economic derivation, loss, secret or prohibited reachability blocks BFF/UI. Existing facts remain available. |
| ME-08 failure union | pool absent, config absent, RPC timeout, partial cohort and malformed scenario each match the response table; unavailable has null market/source and no invented base/slot/value | Any impossible-to-construct unavailable branch or HTTP/evidence ambiguity blocks transport. |
| ME-09 BFF dispatch/freshness | exact scenario/observation tagged bodies map to one owner route; cross-branch/missing/unknown/repeated fields, method/path and 4096/4097 bytes; total freshness mapping including the ME-07 wrapper; 0/2/5-second RTT at 29/30/31 seconds and 5 minutes, +5/+6-second future skew, pageshow/background continuity, missing/reset/negative monotonic anchors and browser wall skew | Any ambiguous dispatch, retry, evidence-state promotion, fixture-to-live promotion or validity extension blocks consumer integration. |

A later effect-bearing launch contract requires a separate owner decision, legal/product review, wallet/funds authority and independent review; it cannot extend this envelope with an optional flag.
