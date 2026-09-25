# Provider Asset Evidence v1

Status: **proposed plan-only contract**, 2026-09-16. No provider adapter, public route, registry entry, credential, wallet or transaction is implemented by this document.

Implementation note, 2026-09-23: the static `provider-assets` artifact of §4, its registry read model and a single read-only MCP tool subset were implemented for the hackathon revision and are described in [the static integration plan](../provider-assets-static-integration-plan.md). The owner `GET /v1/provider-assets/{provider}/{provider_asset_id}`, the acquisition BFF, the session/CSRF/nonce admission and the whole `ProviderFreshnessV1` runtime remain unimplemented, and every published entry stays `candidate_unverified`. `underlying_kind` gains `"spacex"` because the provider's public catalog lists tSpaceX alongside tOpenAI and tKalshi; silently dropping a catalog entry would violate the no-silent-catalog rule of §5 PA-07. The implemented artifact entry is a superset of the §4 identity fields: it adds `evidence_state`, `rights`, `references`, `unknowns`, `external_url`, `not_quote`, `not_authorization` and an optional `supply_reference` that is a provider-reported outstanding-supply figure outside the `ProviderReferenceV1` union, never a price, a currency amount or a valuation. In this static catalog, an unknown's `blocks` denotes what that unknown blocks on the path to `verified_reference` — promotion — while static browsing of `candidate_unverified` entries remains available on every implemented surface.

## 1. Purpose and boundary

This contract lets one investor-facing product compare public evidence about distinct instruments associated with a company without treating them as the same asset. It covers the current xStocks catalog plus separately sourced PreStocks and Tessera T-Token references. It does not merge provider registries, infer issuer backing, or turn a provider reference value into an executable quote, audited NAV or company valuation.

Benten owns the public consumer and presentation policy. A future reusable provider adapter owns acquisition, normalization and source-specific validation. Public company facts remain an approved projection with their own contract; no private analysis asset or private database is an input. [Market Evidence v1](market-evidence-v1.md) remains the Meteora DLMM/DBC market contract. Clawpump launch discovery/effects are not represented here because its Meteora request, authority, custody and retry contract is not yet verified.

## 2. Strict envelope

Schemas reject unknown fields and coercion. Addresses are base58-decoded 32-byte Solana addresses. SHA-256 is 64 lowercase hex. Contract decimal values are canonical strings matching `^(0|[1-9][0-9]*)(\.[0-9]+)?$`, with at most 38 integer and 18 fractional digits. Provider APIs may encode a value as a JSON number, so the adapter captures and hashes the raw response bytes, tokenizes numeric lexemes with a lossless JSON parser **before** any JavaScript `number` conversion, and accepts only nonnegative non-exponent lexemes. It removes trailing fractional zeroes and a trailing dot (`812.790 -> "812.79"`, `0.0 -> "0"`) without rounding; exponent, sign, overflow, excess scale, `NaN`/infinity or a value that arrived only as an already-rounded binary float makes the field unknown/unavailable. Timestamps are UTC RFC 3339. Arrays reject duplicate `(provider,provider_asset_id)` and duplicate mint identities.

```text
ProviderAssetEvidenceV1 = AvailableProviderAssetEvidenceV1 | UnavailableProviderAssetEvidenceV1

AvailableProviderAssetEvidenceV1 = {
  schema_version: "provider-asset-evidence.v1",
  evidence_id: Sha256,
  evidence_state: "candidate_unverified" | "verified_reference",
  request_binding: {provider:"xstocks"|"prestocks"|"tessera",provider_asset_id:string 1..128,request_digest:Sha256},
  asset: XStockAssetV1 | PreStockAssetV1 | TesseraTokenAssetV1,
  company_binding: CompanyBindingV1,
  rights: RightsEvidenceV1,
  references: ProviderReferenceV1[0..8],
  chain: ChainIdentityV1 | null,
  source: ProviderSourceV1,
  unknowns: ProviderUnknownV1[0..32],
  not_quote: true,
  not_authorization: true
}

UnavailableProviderAssetEvidenceV1 = {
  schema_version: "provider-asset-evidence.v1",
  evidence_id: Sha256,
  evidence_state: "unavailable",
  request_binding: {provider:"xstocks"|"prestocks"|"tessera",provider_asset_id:string 1..128,request_digest:Sha256},
  asset: null,
  company_binding: null,
  rights: null,
  references: [],
  chain: null,
  source: null,
  failure_stage: "provider_read" | "shape_validation" | "identity_binding" | "rights_review" | "chain_validation" | "publication_policy",
  unknowns: ProviderUnknownV1[1..32],
  not_quote: true,
  not_authorization: true
}
```

The available asset union is exact:

```text
XStockAssetV1 = {
  asset_kind:"xstock_tracker_certificate", provider:"xstocks",
  provider_asset_id:string 1..128, symbol:string 1..32,
  display_name:string 1..160, mint:Address
}

PreStockAssetV1 = {
  asset_kind:"prestock_provider_instrument", provider:"prestocks",
  provider_asset_id:string 1..128, symbol:string 1..32,
  display_name:string 1..160, contract_address:Address
}

TesseraTokenAssetV1 = {
  asset_kind:"tessera_t_token", provider:"tessera",
  provider_asset_id:string 1..128, symbol:string 1..32,
  display_name:string 1..160, underlying_kind:"openai"|"kalshi"|"spacex",
  mint:Address
}
```

`CompanyBindingV1` is `{company_id:string 1..128,company_name:string 1..160,binding_status:"public_source_verified"|"provider_claim_only"|"unknown",evidence_refs:Sha256[0..8]}`. A shared `company_id` permits side-by-side navigation only. It does not establish fungibility, equivalent issuer, rights, redemption, price basis or market.

`RightsEvidenceV1` is `{status:"public_source_verified"|"provider_terms_observed"|"provider_claim_only"|"unknown",instrument_kind:"tracker_certificate"|"economic_exposure_instrument"|"loan_participation_token"|"unknown",equity_ownership:false|"unknown",voting_rights:false|"unknown",redemption_kind:"provider_terms"|"conditional"|"none"|"unknown",restrictions:string[0..16],evidence_refs:Sha256[0..8]}`. `equity_ownership:false` is allowed only when reviewed public/terms evidence establishes the selected non-equity instrument class; `provider_claim_only` or `unknown` without that evidence must use `"unknown"`, stay candidate, and block release. Provider marketing text is preserved as a claim, not upgraded into Benten's warranty.

`ProviderReferenceV1` is exactly one of:

```text
{kind:"prestock_mark_reference",value:DecimalString,currency:string 1..16|null,provider_reported_as_of:timestamp|null}
{kind:"prestock_token_reference",value:DecimalString,currency:string 1..16|null,provider_reported_as_of:timestamp|null}
{kind:"prestock_implied_valuation_reference",value:DecimalString,currency:string 1..16|null,provider_reported_as_of:timestamp|null}
{kind:"tessera_auction_price_reference",value:DecimalString,currency:string 1..16|null,provider_reported_as_of:timestamp|null}
{kind:"tessera_auction_valuation_reference",value:DecimalString,currency:string 1..16|null,provider_reported_as_of:timestamp|null}
```

`provider_reported_as_of:null` is not replaced with fetch time. These values are source-labelled references only. A consumer must not subtract, rank or normalize values across providers when currency, as-of, rights or unit basis differs or is unknown.

Provider fetch freshness is presentation metadata, not a claim that the provider supplied a timestamp. For available evidence set `age = evaluated_at - source.observed_at`: `-5 seconds <= age <= 5 minutes` is `current_fetch`; `age < -5 seconds` is invalid; `5 minutes < age <= 24 hours` is `stale`; and `age > 24 hours` is `expired`. `provider_reported_as_of:null` still requires `source_as_of_unknown` and the label “provider as-of unknown.” Expired evidence may remain historical but cannot close PA sponsor proof. The reviewed identity catalog is not made false by age, but release/demo requires `-5 seconds <= evaluated_at - fetched_at <= 24 hours` and a matching revision; otherwise static browse stays available with `catalog_refresh_required` and dynamic IDs cannot expand it. Unavailable evidence has `source:null` and therefore `no_source`, never an invented validity time.

Before dispatch the browser stores monotonic `request_started`; at response receipt it stores monotonic `received`, BFF `evaluated_at` and local wall time. Set `rtt = received - request_started` and use `estimated_server_now_upper = evaluated_at + rtt + (monotonic_now - received)`. Charging the full non-negative RTT conservatively includes delivery time and cannot extend the 5-minute/24-hour boundaries. Initial local-wall difference is compared with `evaluated_at + rtt`; above 30 seconds marks the wall clock untrusted but never changes monotonic validity. Pageshow/visibility regain recomputes from the same anchors. Missing, negative, reset or non-monotonic anchors, or a background interval whose monotonic continuity cannot be proved, force `refresh_required`. These deadline values may be reduced after measurement, not increased without contract review.

`ChainIdentityV1` is `{cluster:"solana-mainnet",mint:Address,token_program:Address|null,decimals:integer 0..18|null,source_slot:integer 1..9007199254740991|null,extensions:{transfer_fee:"observed"|"absent"|"unknown",transfer_hook:"observed"|"absent"|"unknown",metadata_pointer:"observed"|"absent"|"unknown",onchain_metadata:"observed"|"absent"|"unknown"},account_digest:Sha256|null}`. A provider address alone stays candidate until owner/program/decimals and applicable extensions are independently observed.

`ProviderSourceV1` is `{provider:"xstocks"|"prestocks"|"tessera",source_url:string 1..512,observed_at:timestamp,provider_reported_as_of:timestamp|null,response_digest:Sha256,schema_revision:string 1..128,redistribution_status:"approved"|"pending_terms_review"}`. Fetch time and provider-reported time are never conflated.

`ProviderUnknownV1` is `{code:"source_as_of_unknown"|"currency_unknown"|"rights_unknown"|"company_binding_unknown"|"chain_identity_unknown"|"provider_catalog_mismatch"|"redistribution_pending"|"execution_quote_unavailable"|"asset_not_found",blocks:("display"|"comparison"|"release")[1..3]}`.

Cross-field rules are exact. `source.provider == asset.provider == request_binding.provider` and `asset.provider_asset_id == request_binding.provider_asset_id`; xStocks/Tessera `asset.mint == chain.mint`, and PreStocks `asset.contract_address == chain.mint`, whenever `chain` is present. `asset_kind` fixes the only allowed provider and reference kinds: xStocks has no provider reference in this v1 envelope, PreStocks permits only the three `prestock_*` references, and Tessera permits only the two `tessera_*` references plus an explicit `underlying_kind` taken from the provider item. Company binding never changes these rules. A mismatch returns unavailable at `identity_binding`; it cannot be repaired by consumer-side aliasing.

Canonicalization and digests reuse [Market Evidence v1 §4](market-evidence-v1.md#4-sourceprovenance-and-positive-states): UTF-8 RFC 8785 JCS, array order preserved. `evidence_id` hashes the complete response with only `evidence_id` omitted; `request_digest` hashes the validated provider/id request; `source.response_digest` hashes the exact raw provider response bytes rather than normalized JSON. `evidence_refs` may reference only the response digest, chain account digest or separately reviewed rights/company artifact digest present in the same evidence build; dangling or cross-provider references are invalid.

`verified_reference` requires exact request/asset/source identity, provider-specific reference semantics, reviewed non-equity rights, approved redistribution, the required chain binding and no unknown whose `blocks` includes `release`. A valid response that lacks any of those remains `candidate_unverified`; a read/shape/identity failure uses the unavailable branch. Neither positive state is an executable quote, eligibility determination or recommendation.

## 3. Provider-specific minimum evidence

| Provider | Minimum `verified_reference` evidence | Honest fallback |
| --- | --- | --- |
| xStocks | Existing reviewed registry identity and rights contract plus current public source digest; chain fields follow their existing contract | Existing snapshot/candidate states remain; this contract does not expand the registry silently |
| PreStocks | Exact API item identity, response digest, observed time, provider claim/terms separated, contract address independently chain-bound, API/UI catalog mismatch checked, redistribution approved | `candidate_unverified` or unavailable; no SEC/fundamental coverage, executable price or unconditional redemption is inferred |
| Tessera | Exact public token-detail identity, OpenAI/Kalshi discriminator, response digest, observed time, loan-participation rights source, mint/program/Token-2022 extension observation, auction-reference semantics | `candidate_unverified` or unavailable; no current market price, company valuation, NAV or unrestricted eligibility is inferred |

The 2026-09-16 public reads found that PreStocks exposed API reference fields without source timestamps/slot/token-program metadata and its API/UI catalogs differed, while Tessera's public values were labelled “Auction Price” and “Valuation at Auction Price” in its explorer and lacked source timestamp/currency/chain details in the API response. Those are research inputs, not embedded production fixtures or verified product coverage.

## 4. Planned adapter and consumer contract

The product search/list is supplied by a reviewed immutable `provider-assets.v1.json` identity artifact shaped exactly as `{schema_version:"provider-assets.v1",revision:Sha256,fetched_at:timestamp,entries:{provider,provider_asset_id,asset_kind,symbol,display_name,company_binding,mint_or_contract,source_digest}[1..512]}`. It rejects unknown fields, duplicate provider IDs/mints and is refreshed only through provider-specific validation and publication review. `revision` is the SHA-256 of the same JCS object with `revision` omitted. Search/filter reads this artifact; selecting a PreStocks/Tessera entry calls the by-ID provider-evidence operation, while xStocks resolves through Benten's existing reviewed registry/facts contract and is projected into the same presentation union. Live provider responses never silently add an item to the list or Benten's xStock registry.

No customer or order store is introduced. The reviewed identity artifact and immutable source/evidence receipts are the only planned local data products; provider credentials, raw private data and launch state are not persisted by Benten. Artifact rollback selects the preceding reviewed digest, while provider outage disables only that provider card and keeps snapshot facts and other providers available.

Future PreStocks/Tessera adapters expose one read-only operation per discriminator and never write Benten's xStock registry:

```text
GET /v1/provider-assets/{provider=prestocks|tessera}/{provider_asset_id}
  -> ProviderAssetEvidenceV1

POST /api/acquisition/provider-assets
  body -> {context_version:"2.0",provider:"prestocks"|"tessera",provider_asset_id:string 1..128}
  data -> ProviderAssetEvidenceV1
```

The owner GET accepts no body and requires the new `provider_asset:read` scope for PreStocks/Tessera under the existing consumer-auth/admission model. The Benten service caller shares its existing owner-side stable-caller quota and global circuit with quote/market-evidence operations rather than receiving a second bucket. Existing xStocks facts do not acquire this scope.

The browser-facing operation is exactly `POST /api/acquisition/provider-assets`; GET, other acquisition paths and unknown methods do not inherit it. The strict body above rejects unknown/repeated keys and supports only the reviewed PreStocks/Tessera artifact IDs. It requires the exact `__Host-benten-acquisition` session cookie, `X-Benten-CSRF` and one-use `X-Benten-Request-Nonce` defined by the [unsigned acquisition contract §4](../unsigned-acquisition-tool-contract.md#4-unsigned-context-and-fail-closed-lifecycle) before any owner call. The same atomic nonce/lease admission charges the existing per-session, trusted-ingress-IP and global acquisition counters and concurrency; provider reads do not receive a second rate or capacity bucket. The next nonce is returned only after a validated response under the same lost-response/new-session rule. The BFF forwards neither browser cookie nor CSRF value upstream; it sends only the allowlisted provider/id with its server-held `provider_asset:read` credential.

The BFF returns exactly `{context_version:"2.0",evidence:ProviderAssetEvidenceV1,freshness:ProviderFreshnessV1}` without evidence-state promotion, field loss or provider text. `ProviderFreshnessV1` is `{basis:"fetch_observed_at",evaluated_at:timestamp,valid_until:timestamp,state:"current_fetch"|"stale"|"expired"}` for available evidence, with `valid_until = source.observed_at + 5 minutes`, or `{basis:"no_source",evaluated_at:timestamp,valid_until:null,state:"unavailable"}` for unavailable evidence. Freshness does not replace `source.provider_reported_as_of`. Errors use the existing `context_version:"2.0"` nested envelope while preserving HTTP status/code/retryable/correlation digest. A 2 KiB BFF body/path ceiling, 2 KiB owner request-path/query ceiling, 64 KiB upstream response cap, 16 KiB normalized response cap, **2-second owner deadline**, five-second BFF hard deadline, no automatic retry/cross-provider fallback and `Cache-Control:no-store` are mandatory pending measured activation budgets. Session/auth/CSRF/replay/quota/store failures retain existing 401/403/409/429/503 mappings; owner/provider errors retain the 400/401/403/404/429/503/504 behavior below. No provider or owner credential enters static assets.

Malformed/repeated path input is 400, missing caller auth is 401, scope/policy denial is 403, and an unsupported provider or unreviewed asset ID is 404 using the existing nested error wire. Caller quota is 429. Upstream 429/5xx maps to redacted retryable 503 `provider_unavailable`; timeout maps to 504; oversized or schema-invalid upstream data maps to non-retryable 503 `provider_schema_unavailable`. A successfully reached provider that lacks the requested reviewed item returns HTTP 200 `UnavailableProviderAssetEvidenceV1` at `provider_read` with `asset_not_found`. Missing runtime configuration returns typed 503, never mock success. No quote, order, launch or wallet endpoint is added by this contract.

Planned public-side paths are `packages/acquisition-consumer/src/provider-asset-evidence-v1.ts`, `packages/acquisition-consumer/src/provider-assets.v1.json`, `apps/acquisition-bff/src/routes/provider-assets.ts`, and the design-gated market-readiness dossier. Generic adapters, credentials and provider policy remain outside Benten; public docs do not prescribe their repository path.

## 5. Tests and stop gates

| ID | Proof | Stop condition |
| --- | --- | --- |
| PA-01 union/shape | every provider available/unavailable branch; unknown key, unsafe number, malformed address/digest/time | coercion or impossible unavailable branch |
| PA-02 asset confusion | same company with distinct xStock/PreStock/T-token; mint, provider, rights and references cannot cross | alias, fungibility or inherited-rights inference |
| PA-03 source semantics | fetch time vs null provider-as-of; PreStocks catalog mismatch; Tessera auction labels; absent currency | invented current price, NAV, valuation or freshness |
| PA-04 chain binding | wrong owner/program/mint, missing decimals, Token-2022 fee/hook/metadata unknown | provider address promoted to verified chain identity |
| PA-05 policy/privacy | redistribution pending, provider text sanitization, private-source/import and secret scan | unapproved redistribution, private data or credential reaches Benten |
| PA-06 lossless consumer | fake-owner available/candidate/unavailable → exact `POST /api/acquisition/provider-assets` → BFF/UI with every unknown and source label retained; strict body and no alternate method/path | consumer ranking, calculation, field loss, state promotion or unstated interface |
| PA-07 transport/catalog | static artifact revision, provider/id allowlist, session/CSRF/one-use nonce and shared quota/concurrency admission before owner call, credential/cookie separation, 2/64/16 KiB caps, 2s/5s deadlines, 400/401/403/404/409/429/503/504, provider outage and catalog/API mismatch | silent catalog addition, uncharged provider path, nonce reuse, wrong status/retry, cross-provider fallback or provider text/secret leak |
| PA-08 freshness | null source-as-of; 0/2/5-second RTT at 4:59/5:00/5:01 and 24-hour boundaries; +5/+6-second future skew; catalog age; pageshow/tab regain; missing/reset/negative monotonic anchors; >30-second browser wall skew | fetch time promoted to provider as-of, delivery delay extending validity, stale evidence called current, expired evidence closing a sponsor claim, or background refresh |

Provider activation, paid capacity, login, terms acceptance, persistent account, wallet action and external release remain separate future gates. Passing this contract review proves none of them.
