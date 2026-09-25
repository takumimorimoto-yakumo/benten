# Provider Assets Static Integration Plan

Status: **implemented 2026-09-23 for the hackathon revision**. This plan covers only
the static identity-artifact subset of
[Provider Asset Evidence v1](contracts/provider-asset-evidence-v1.md) §1-§4.

Implemented read-only UI routes: the home section `/#provider-references` and the
per-instrument page `/provider/{provider}/{provider_asset_id}`, plus the locale
variants `/{locale}/provider/{provider}/{provider_asset_id}` for `ja`, `ko`,
`zh-Hans` and `zh-Hant`. They browse the same static artifact; there is no
wallet, quote, order or purchase control on any of them.

## 1. Scope

One reviewed, immutable `provider-assets.v1` artifact plus a read model, one MCP
tool and one Next JSON route. Every surface is snapshot-only, network-free,
allowlist-gated and read-only. The artifact lists provider-reported identity,
rights claims and reference values for PreStocks and Tessera. It never states a
quote, an executable price, a NAV, an audited valuation or an authorization, and
it never touches the xStocks registry.

## 2. Not implemented

- No live provider adapter and no `GET /v1/provider-assets/{provider}/{id}` owner
  operation.
- No BFF, no `POST /api/acquisition/provider-assets`, no session cookie, CSRF
  token or one-use nonce, no quota or circuit admission.
- No `ProviderFreshnessV1` runtime, no `evaluated_at`, no monotonic anchors and
  no `current_fetch`/`stale`/`expired` labels.
- No chain binding: no RPC, no `ChainIdentityV1`, no token program, decimals or
  Token-2022 extension observation. Every entry stays `candidate_unverified`.
- No wallet, quote, order, launch or signing path.
- No `verified_reference` promotion. Redistribution review is still pending.

## 3. Data sources

| Provider | Endpoint | Auth | Items |
| --- | --- | --- | --- |
| PreStocks | `GET https://prestocks.com/api/prestocks` | none | 8 |
| Tessera | `GET https://rest-api.tessera.pe/v1/public/tokens` | none | 3 |
| Tessera | each item's metadata `uri` on `cdn.tesseralab.co` | none | 3 |

`GET https://rest-api.tessera.pe/v1/public/token-details` answered HTTP 500 on
2026-09-23, so no `tessera_auction_price_reference` or
`tessera_auction_valuation_reference` is published and Tessera entries carry an
empty `references` array. Neither provider supplies a timestamp, currency,
decimals or token program.

## 4. Numbers

Provider APIs encode reference values as JSON numbers. The producer parses the
raw response bytes with its own lossless JSON reader that keeps every numeric
**lexeme** as text, so no value passes through a JavaScript `number`. A lexeme is
accepted only when it is nonnegative, has no exponent and matches the contract
`DecimalString` form; trailing fractional zeroes and a trailing dot are removed
without rounding. Tessera reports `latest_supply` as a JSON string, which is
already lossless and is validated by the same rule. Anything else omits the
reference and records an unknown. `markValuation` has no reference kind in the
contract and is therefore not published at all.

## 5. States and unknowns

Every entry is `evidence_state: "candidate_unverified"`, `not_quote: true`,
`not_authorization: true`, and carries `source_as_of_unknown` (display,
comparison), `chain_identity_unknown` (release) and `redistribution_pending`
(release). PreStocks entries add `currency_unknown` (comparison) because their
three references have no currency. Tessera entries add
`execution_quote_unavailable` (comparison) because the auction endpoint is down.
`provider_reported_as_of` is always `null` and is never replaced with fetch time.

Every entry also carries `rights_unknown` (comparison, release): Benten never
fetched either provider's terms document, so no rights field is a reviewed
observation. PreStocks and Tessera rights are both `provider_claim_only` with
`equity_ownership: "unknown"`, `voting_rights: "unknown"` and
`redemption_kind: "unknown"`. Tessera keeps its published terms URL as an
informational link a reader can open, not as evidence. One short provider
sentence and the provider's `external_url` are stored; no marketing paragraph
is.

The implemented artifact entry is a superset of the contract's §4 identity
fields, adding `evidence_state`, `rights`, `references`, `unknowns`,
`external_url`, `not_quote`, `not_authorization` and an optional
`supply_reference` outside the `ProviderReferenceV1` union. In this static
catalog, an unknown's `blocks` denotes what that unknown blocks on the path to
`verified_reference` — promotion — while static browsing of candidate entries
remains available.

`underlying_kind` gains `"spacex"` because the provider's public catalog lists
tSpaceX. Dropping it silently would violate the no-silent-catalog rule.

## 6. Files

| Path | Role |
| --- | --- |
| `scripts/providers/build-provider-assets.mjs` | Producer. Tooling only; no runtime imports it. |
| `packages/registry/src/provider-assets-v1.json` | Reviewed immutable artifact. |
| `packages/registry/src/provider-assets-manifest.json` | Digest, revision and per-provider counts. |
| `packages/registry/src/provider-assets-validation.js` / `.d.ts` | Fail-closed validator, copied by the registry build. |
| `packages/registry/src/provider-read-model.ts` | `providerAssets`, `listProviderAssets`, `findProviderAsset`. |
| `packages/mcp/src/lib/provider-assets.ts`, `packages/mcp/src/server.ts` | `list_provider_assets` tool. |
| `apps/web/app/api/v2/provider-assets/route.ts` | GET-only JSON route. |
| `apps/web/components/provider-references-section.tsx` | Home section, separate from the xStocks table. |
| `apps/web/components/provider-page.tsx`, `apps/web/components/copy-value.tsx` | Per-instrument page and its address copy control. |
| `apps/web/app/provider/[provider]/[id]/page.tsx`, `apps/web/app/[locale]/provider/[provider]/[id]/page.tsx` | Route pair, `notFound()` on any inexact provider/id. |
| `apps/web/lib/provider-presentation.ts` | Lossless `DecimalString` grouping and label lookups. |

Raw provider responses are cached outside the repository under a scratch
directory chosen by `--cache-dir` or `PROVIDER_CACHE_DIR`; they are never
committed. `scripts/check-snapshot-release.mjs` ignores the two provider files
because it governs the xStocks snapshot release only.

## 7. Tests

- Registry: artifact and manifest load, exact key sets, enums, base58 32-byte
  decode, `DecimalString` canonical form, duplicate id and mint rejection,
  recomputed `revision`, tampered-artifact module-load failure, read-model
  positives and negatives.
- MCP: tool listing, strict input, filters, miss, and the compiled smoke.
- Web: 200 list, 200 by id, 404 `asset_not_found`, 400 unknown key.
- Web UI: home section row count and separation from the xStocks table,
  provider page section order in all five locales, full mint rendered, absent
  acquisition controls, and `notFound()` for an inexact provider or identifier.
- Repository: `scripts/check-publishable.sh` treats the new route as
  network-free.

## 8. Stop gates

1. A provider value reaching the artifact through a JavaScript `number`.
2. A reference kind, currency or as-of time that the provider did not report.
3. Any entry promoted past `candidate_unverified` without chain binding,
   reviewed rights and approved redistribution.
4. A catalog entry silently dropped, renamed or merged with an xStock.
5. Redistribution of provider marketing text, images or bulk descriptions.
6. Any network call, credential, cookie, nonce or signing path in a runtime
   package.
7. A revision or manifest digest that does not match the artifact bytes.
