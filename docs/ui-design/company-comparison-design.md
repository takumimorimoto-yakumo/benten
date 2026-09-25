# Company comparison page: design contract

Status: **design artifact for P2-1, `review_pending`.** Written 2026-09-24 JST for the [Stocklana submission plan](../../specs/stocklana-submission-plan-2026-09-23.md) (sections 1, 2 and P2-1 are the requirement source). This document and its images implement nothing and record no human design acceptance. P2-1 starts only after P1-3 (Phase 1 acceptance), and it is the last item to be cut in Phase 2.

Scope: one read-only page per company, `/company/{slug}` plus `/{locale}/company/{slug}` for `ja`, `ko`, `zh-Hans`, `zh-Hant` (5 locales), that lists every Solana instrument Benten links to that company. It adds an explicit, reviewed, versioned company map to `packages/registry`, links from the home provider section and from each provider instrument page, and one change to how record tables render below the 52rem breakpoint. Nothing on this page can be bought; private-token trading is P2-2 and has its own gate.

Screenshot rubric for the independent visual review after implementation: [company-comparison-screenshot-rubric.md](company-comparison-screenshot-rubric.md).

## Visual direction images

Both images are Codex built-in image generations, restyled from real screenshots of the current `/provider/prestocks/OPENAI` page at `1440 × 900` and `390 × 844` so that they keep the shipped tokens. They are registered in [generated-image-manifest.v1.json](generated-image-manifest.v1.json) with `review_status: review_pending`.

| View | Image | SHA-256 | Raster | Intended viewport | Generated (JST) |
| --- | --- | --- | --- | --- | --- |
| Desktop, `/company/openai` | [2609241117_benten_company-openai_mineral-ink.png](assets/2609241117_benten_company-openai_mineral-ink.png) <!-- generated-image-current:benten/company-openai/mineral-ink --> | `c043620eff6019977e977997462ca2fa4de860c436a226c4ee787a0d07df90ac` | 1586 × 992 | 1440 × 900 | 2026-09-24 11:17:13 |
| Mobile, `/company/openai` | [2609241117_benten_company-openai-mobile_mineral-ink.png](assets/2609241117_benten_company-openai-mobile_mineral-ink.png) <!-- generated-image-current:benten/company-openai-mobile/mineral-ink --> | `654de70717d4fe17a10bc0a6217d9bb9fe51ea735c6d58c48fec78da8316e5b0` | 853 × 1844 | 390 × 844 (full-page crop) | 2026-09-24 11:17:05 |

Prompts: [desktop](prompts/2609241117_benten_company-openai_mineral-ink.txt), [mobile](prompts/2609241117_benten_company-openai-mobile_mineral-ink.txt). The prompt files differ from the prompts as sent in one phrase only: the five language-switcher names were sent in their native scripts and are described in English in the files, because the public tree allows no CJK text. SHA-256 of the prompts as sent: desktop `5b3073d2a70e69bc0159682c680880197bb478b4c5ea910d3c0e0c56dbc6d166`, mobile `193ecbedcdb133a33b98ccc040b2ad0b764d5268c9f6702541af4e59ee174b72`. Each prompt was sent with one real screenshot of the current OPENAI provider page as the visual reference; the screenshots were temporary and are not repository artifacts. Selection reason: each is the single candidate for its view. Both keep the page frame, tokens and density, show the two OpenAI instruments as separate records with the same five facts, put the "Not interchangeable" notice before the list, contain no number, no button and no purchase affordance, and the mobile image shows stacked records with nothing cut at the right edge. No second iteration was needed.

```sh
shasum -a 256 docs/ui-design/assets/2609241117_benten_company-openai*_mineral-ink.png
```

What the images establish: the page order, the notice-before-list hierarchy, the six-column desktop table, the stacked record cards at 390px, and the calm density. What they do not establish: exact pixels, final copy (the [message keys](#8-message-keys) win), interaction, accessibility or data. Addresses are shortened specimens of the real mints.

Known image deviations that this contract corrects:

- Desktop: `Primary sources` and `How this list is made` sit too close to the table; they are ordinary `.section` blocks with the standard `--space-7` section gap.
- Desktop: the shortened addresses render as `Prewe….rpgF`; the real format is `shortenAddress()` from `lib/format.ts`.
- Mobile: each card ends with a separate `Open OPENAI record` link. The contract has one link per instrument, the symbol, which gets a `--touch-target-min` hit area below 52rem (see [section 9](#9-accessibility)). Two links to the same record in one card would double the tab stops.
- Mobile: the stacked labels (`INSTRUMENT KIND`) inherit the existing uppercase table-header style. That is correct for `en`; in CJK locales the transform is a no-op, as today.
- Generated lettering may reflow; the copy in section 8 wins.

## 1. Job, user and boundaries

- User: an individual investor who has noticed that one private company appears as several Solana tokens (OpenAI as PreStocks `OPENAI` and Tessera `tOpenAI`; SpaceX as three), and wants to see them together before opening any of them.
- Job: see, for one company, which instruments exist, who issues each, what kind of instrument it is, what the provider claims about its rights, what kind of reference numbers the provider publishes, and what is still unknown.
- Success: the investor can say which provider stands behind each instrument, that no rights claim is verified by Benten, and that the instruments are not substitutes for one another, without being told which one to pick.
- Not interchangeable, by construction: the page shows **no reference value**, **no ordering by any value**, and **no aggregate** across instruments. The artifact itself marks `source_as_of_unknown` and `currency_unknown` as blocking `comparison` for every PreStocks entry, and `execution_quote_unavailable` as blocking it for every Tessera entry; the page respects that. Values stay on each instrument's own record page, where their units and unknowns are next to them.
- No advice, ranking or recommendation. The page `<main>` contains none of the words listed in [section 8.2](#82-vocabulary-rule), including in negated form ("not a quote"). Existing shared strings that negate those words (for example `providers.home.note`) are therefore **not reused** on this page.
- No purchase: no `<button>`, `<form>` or wallet element inside `<main>`, no link to a trading venue, and no link to `/stock/NVDA`'s purchase panel. Instrument pages are reached by ordinary links.

## 2. Which companies get a page (from the registry data)

Measured on the bundled artifacts on 2026-09-24:

- `provider-assets-v1.json` (revision `36f99832…`): 11 entries. The 8 PreStocks entries each carry a provider `company_id` for one of Anduril, Anthropic, Figure AI, Kalshi, Neuralink, OpenAI, Polymarket, SpaceX; the 3 Tessera entries carry OpenAI, Kalshi, SpaceX. No provider entry refers to a company with an SEC-covered xStock.
- `xstocks.json`: 154 tokens. `SPCX` / `SPCXx` is named "SpaceX xStock", issuer verified, `fundamentals_available: false`, `exclusion_reason: "private"`. `VCX` (Fundrise Innovation Fund) is a fund with `exclusion_reason: "private"`; it is not a company instrument.

Resulting instrument counts per page:

| Slug | Company | Instruments |
| --- | --- | --- |
| `anduril` | Anduril | PreStocks `ANDURIL` |
| `anthropic` | Anthropic | PreStocks `ANTHROPIC` |
| `figure-ai` | Figure AI | PreStocks `FIGUREAI` |
| `kalshi` | Kalshi | PreStocks `KALSHI`, Tessera `tKalshi` |
| `neuralink` | Neuralink | PreStocks `NEURALINK` |
| `openai` | OpenAI | PreStocks `OPENAI`, Tessera `tOpenAI` |
| `polymarket` | Polymarket | PreStocks `POLYMARKET` |
| `spacex` | SpaceX | xStocks `SPCX` (subject to review, see [decisions](#11-decisions)), PreStocks `SPACEX`, Tessera `tSpaceX` |

Proposal for US-listed companies: **no company page in map revision 1.** Each of the 129 SEC-covered xStocks would have exactly one instrument, so its company page would repeat the existing stock page, which already is the company-level view with SEC-sourced facts. The plan's "US-listed companies link to the existing stock page and show their xStock" is met where it arises: an xStock that the map binds to a company appears as a row that links to its stock page (SpaceX today). The schema reserves `listing_status: "us_listed"` so that a later revision can add a listed company with a second instrument without a schema change. Single-instrument pages (five companies above) are kept, because they are the entry point for P2-3 official announcements and because a one-row page still states the provider, rights claim and unknowns in one place.

`VCX` is recorded in the map's `excluded` list with reason `fund_not_single_company`, so a future reviewer does not bind it to OpenAI, Anthropic or SpaceX by its holdings.

## 3. The company map (registry package)

New files in `packages/registry/src/`: `company-map-v1.json` (the reviewed data), `company-map-validation.js` + `.d.ts` (fail-closed validator, copied to `dist` by `scripts/build.mjs` like the other validators), `company-read-model.ts` (frozen read model), `company-map.test.ts`.

### 3.1 Schema `benten.company-map.v1`

```json
{
  "schema_version": "benten.company-map.v1",
  "revision": 1,
  "reviewed_at": "2026-09-25T10:00:00+09:00",
  "review": { "reviewer": "maintainer", "method": "manual_source_review" },
  "bound_sources": {
    "provider_assets_revision": "36f9983238ca8eb98a3c8112d1f47a656fb7d0ea55f04dc8d9eed42bf6b7d7b3",
    "xstocks_registry_sha256": "<sha256 of xstocks.json bytes>"
  },
  "companies": [
    {
      "slug": "openai",
      "display_name": "OpenAI",
      "listing_status": "private",
      "instruments": [
        {
          "source": "provider_assets",
          "provider": "prestocks",
          "provider_asset_id": "OPENAI",
          "mint": "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
          "binding_basis": "provider_company_claim",
          "provider_company_id": "openai"
        },
        {
          "source": "provider_assets",
          "provider": "tessera",
          "provider_asset_id": "tOpenAI",
          "mint": "oPAiAikWTaFj9RYoRFD35ccfwhnMcB3ThgBZRHSkjTZ",
          "binding_basis": "provider_company_claim",
          "provider_company_id": "openai"
        }
      ]
    },
    {
      "slug": "spacex",
      "display_name": "SpaceX",
      "listing_status": "private",
      "instruments": [
        {
          "source": "xstocks_registry",
          "ticker": "SPCX",
          "mint": "Xs3oZwbHvqis4NYcf4YKWmEia2eC84wSiVrcYcTqpH8",
          "binding_basis": "issuer_product_name"
        },
        { "source": "provider_assets", "provider": "prestocks", "provider_asset_id": "SPACEX", "mint": "PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh", "binding_basis": "provider_company_claim", "provider_company_id": "spacex" },
        { "source": "provider_assets", "provider": "tessera", "provider_asset_id": "tSpaceX", "mint": "TSPXcLV76s6V2zDiZQ18kBfcbnjaE2ZzNT3ga2Pd99v", "binding_basis": "provider_company_claim", "provider_company_id": "spacex" }
      ]
    }
  ],
  "excluded": [
    { "source": "xstocks_registry", "ticker": "VCX", "reason": "fund_not_single_company" }
  ]
}
```

Field rules:

| Field | Rule |
| --- | --- |
| `schema_version` | exactly `benten.company-map.v1` |
| `revision` | positive integer; bumped on every change to `companies` or `excluded` |
| `reviewed_at` | RFC 3339 with offset; the time a person reviewed this revision |
| `review.reviewer` | non-empty handle (not an email); `review.method` is `manual_source_review` |
| `bound_sources.provider_assets_revision` | must equal `providerAssets.revision` at load; a provider refresh therefore fails the build until the map is re-reviewed |
| `bound_sources.xstocks_registry_sha256` | sha256 of `xstocks.json` bytes; checked in `company-map.test.ts` (file bytes are not available to a JSON import at runtime) |
| `slug` | `^[a-z0-9]+(-[a-z0-9]+)*$`, unique, lowercase only; this is Benten's identifier, independent of any provider's `company_id` (`figure-ai` vs PreStocks `figureai`) |
| `display_name` | 1–80 chars, unique; shown as the page title in every locale (company names are not translated) |
| `listing_status` | `private` or `us_listed` (reserved; unused in revision 1) |
| `instruments[]` | 1 or more; discriminated by `source` |
| `source: provider_assets` | `provider` + `provider_asset_id` must resolve with `findProviderAsset` exactly; `mint` must equal the entry's `mint_or_contract`; `provider_company_id` must equal the entry's `company_binding.company_id` (a consistency check against the provider's own claim, never the binding source) |
| `source: xstocks_registry` | `ticker` must resolve with `resolveTicker` exactly; `mint` must equal the entry's `mint` |
| `binding_basis` | `provider_company_claim` (the provider's own record names this company, confirmed by the reviewer) or `issuer_product_name` (the xStock issuer's product name names this company, confirmed by the reviewer against the issuer's product page) |
| order | companies sorted by `slug`; instruments sorted by `source` (`xstocks_registry` first), then provider name, then `provider_asset_id`. The validator **rejects** any other order, so nobody can place a preferred instrument first. |
| uniqueness | an instrument (by source identity and by mint) appears at most once across `companies` and `excluded` |
| completeness | every provider-assets entry appears in exactly one company or in `excluded`; a new provider entry fails the build until reviewed. xStocks need not be complete: an unmapped xStock simply has no company page |
| `excluded[].reason` | `fund_not_single_company` or `not_reviewed` |

Name strings are never compared: not `display_name` with `company_name`, not "SpaceX xStock" with "SpaceX". The provider `company_id` is compared only to catch a provider-side change.

### 3.2 Read model

```ts
export type CompanySlug = string;
export type CompanyInstrument =
  | { source: "provider_assets"; binding_basis: "provider_company_claim"; entry: ProviderAssetEntryV1 }
  | { source: "xstocks_registry"; binding_basis: "issuer_product_name"; entry: XStockEntry };
export interface CompanyRecord { slug: CompanySlug; display_name: string; listing_status: "private" | "us_listed"; instruments: readonly CompanyInstrument[] }

export const companyMap: CompanyMapV1;                                  // validated and frozen at module load
export function listCompanies(): readonly { slug: CompanySlug; display_name: string; instrument_count: number }[];
export function findCompany(slug: unknown): CompanyRecord | undefined;   // exact, case-sensitive; no trimming, prefix or fuzzy match
export function companyForProviderAsset(provider: unknown, id: unknown): { slug: CompanySlug; display_name: string } | undefined;
export function companyForXStock(ticker: string): { slug: CompanySlug; display_name: string } | undefined;
```

`/company/OpenAI`, `/company/openai/` variants that Next does not normalise, `/company/figureai` and `/company/open-ai` are 404, not redirects.

## 4. Placement and page order

Page order, identical on desktop and mobile:

1. Breadcrumb `← Other-provider references` to `/{locale}/#provider-references` (reuses `providers.page.back`).
2. `h1`: `{display_name}` with `<span class="muted">Private company</span>` (existing `.page-title` pattern).
3. Lede (`.page-lede`): what the list is and that the instruments are not substitutes.
4. Notice (`.notice`, no icon, not a live region): bold first line `Not interchangeable`, then two sentences.
5. `h2` `Instruments (n)` and the record table (section 5).
6. `h2` `Primary sources`: for a private company, `Benten has no SEC filing coverage for {name}, a private company.` P2-3 later adds `Official announcements` inside this section; nothing is shown for it before P2-3 ships. For an xStock row whose entry has `fundamentals_available: true` (reserved for `us_listed`), the section also links to that stock page's SEC-sourced facts.
7. `h2` `How this list is made`: the map sentence with revision and the provider fetch date (`providerAssetsManifest.fetched_at`, formatted with `formatSourceDate`).
8. Global footer (unchanged, outside `<main>`).

### Desktop (52rem and wider)

```text
+------------------------------------------------------------------------------------------+
| header (unchanged)                                                                       |
+------------------------------------------------------------------------------------------+
| <- Other-provider references                                                             |
| OpenAI Private company                                                                   |
| lede (one or two lines, max 72ch)                                                        |
| +- notice ----------------------------------------------------------------------------+  |
| | Not interchangeable / two sentences                                                  |  |
| +--------------------------------------------------------------------------------------+  |
| Instruments (2)                                                                          |
| +------------+-----------+---------------+-----------------+-----------------+----------+ |
| | Instrument | Provider  | Instrument    | Rights status   | Reference       | Unknowns | |
| |            |           | kind          |                 | semantics       |          | |
| +------------+-----------+---------------+-----------------+-----------------+----------+ |
| | OPENAI     | PreStocks | Economic      | Provider claim  | Publishes a     | - ...    | |
| | name, mint |           | exposure ...  | only + 4 lines  | mark ... units  | - ...    | |
| +------------+-----------+---------------+-----------------+-----------------+----------+ |
| Primary sources                                                                          |
| How this list is made                                                                    |
+------------------------------------------------------------------------------------------+
```

The table fits the container at 1440 × 900 without horizontal scrolling: it uses the new `.record-table` class (section 6), not `.table-scroll`'s `min-width: 48rem`. Column widths: instrument 13%, provider 10%, kind 14%, rights 21%, reference 21%, unknowns 21%, with `overflow-wrap: anywhere` only on the mint line. Lede and notice body are limited to `72ch`.

### Mobile (below 52rem, checked at 390 × 844)

```text
+----------------------------------+
| Benten                     Menu  |
| tagline                          |
+----------------------------------+
| <- Other-provider references     |
| OpenAI                           |
| Private company                  |
| lede                             |
| +- notice ---------------------+ |
| +------------------------------+ |
| Instruments (2)                  |
| +- record ---------------------+ |
| | OPENAI  PreStocks            | |  <- row header: symbol link + provider
| | OpenAI PreStocks             | |
| | Prewe…rpgF                   | |
| |------------------------------| |
| | INSTRUMENT KIND              | |
| | Economic exposure instrument | |
| |------------------------------| |
| | RIGHTS STATUS                | |
| | Provider claim only          | |
| | claimed by ..., unknowns     | |
| |------------------------------| |
| | REFERENCE SEMANTICS          | |
| |------------------------------| |
| | UNKNOWNS  (full list)        | |
| +------------------------------+ |
| +- record (tOpenAI) -----------+ |
+----------------------------------+
```

- Each instrument is one full-width card; the page never scrolls horizontally and no card has an inner scroll area.
- The `Provider` column is not repeated as a labelled row on mobile; the provider name sits next to the symbol in the card header (the cell is still in the DOM and read in order).
- Unknowns are always listed in full, never collapsed: they are the reason the instruments are not comparable.
- Gap between cards `--space-4`.

## 5. Row content

One row per mapped instrument, in map order. No value from `references[]` or `supply_reference` is rendered.

| Column | Provider-assets instrument | xStock instrument (SpaceX `SPCX`) |
| --- | --- | --- |
| Instrument (row header) | symbol as link to `/{locale}/provider/{provider}/{id}`; `display_name` muted; `shortenAddress(mint_or_contract)` mono with `title` = full address | ticker as link to `/{locale}/stock/{ticker}`; token `name` muted; `shortenAddress(mint)` |
| Provider | `providers.names[provider]` | `xStocks` (`company.xstockProvider`) |
| Instrument kind | `providers.instrumentKinds[rights.instrument_kind]` | `xStock` (`company.xstockKind`); Benten records no finer instrument kind |
| Rights status | bold `providers.rightsStatus[rights.status]`, then muted lines: `Claimed by {provider}, not verified by Benten` (only when status is `provider_claim_only`), `Equity ownership: {v}`, `Voting rights: {v}`, `Redemption: {providers.redemption[...]}` where `{v}` is `unknown` or `no` from the entry | `Not recorded by Benten` (`company.rights.notRecorded`); the row does not restate issuer terms |
| Reference semantics | if `references` is non-empty: `Publishes {list}` built with `Intl.ListFormat(locale, { type: "conjunction" })` over `company.referenceNouns[kind]`, then muted `Currency unknown. Provider as-of unknown.` when the respective unknown codes are present; if empty: `Publishes no reference value for this instrument` | `Registry identity only. No reference value is shown.` |
| Unknowns | `<ul>` of `providers.unknownCodes[code]` for every `unknowns[]` entry, in artifact order | `<ul>` with `No Benten filing coverage: {exclusionReasonLabel}` when `fundamentals_available` is false; otherwise `None recorded` |

## 6. Record table at 390px, and the same fix for the existing provider table

Measured on the current home page at 390 × 844: the `#provider-references` table container is 356px wide and its content 820px wide. Only the first two and a half of seven columns are visible; `Rights`, `Reference` and `Observed` sit off-screen with only a thin browser scrollbar hint, so they are easy to miss entirely.

New shared pattern `.record-table` (in `globals.css`, with a small `RecordTable` helper only if it removes duplication):

- Markup stays a real `<table>` with `<caption class="sr-only">`, `<th scope="col">` headers and one `<th scope="row">` per row. Because `display: block` removes implicit table semantics in Chromium and WebKit, the table, row groups, rows, header cells and cells carry explicit `role="table" | "rowgroup" | "row" | "columnheader" | "rowheader" | "cell"`.
- Each body cell starts with `<span class="record-table__label" aria-hidden="true">{column label}</span>`, hidden at 52rem and wider.
- 52rem and wider: an ordinary table, `table-layout: fixed`, `width: 100%`, no `min-width`, surface, hairline border and `--radius-md` like `.table-scroll`.
- Below 52rem: `thead` becomes visually hidden with the `.sr-only` technique (not `display: none`, so column headers stay available); each `tr` is a block card (surface, hairline border, `--radius-md`, padding `--space-4`, gap `--space-4` between cards); the row header is the card header; each `td` is a block with a hairline top rule and its visible label; the label uses the existing header style (`--text-xs`, bold, `--color-muted`, letter-spaced uppercase in `en` only).
- Nothing in the card may exceed the card width: long values wrap, mono addresses use `overflow-wrap: anywhere`.

Improvement for the existing provider table (one proposal): **apply `.record-table` to the home `#provider-references` table instead of `.table-scroll`.** Below 52rem each provider instrument becomes a card headed by its symbol link and provider name, with `Underlying company`, `Instrument`, `Rights`, `Reference` and `Observed` as labelled rows, so every column is visible without horizontal scrolling. Desktop rendering is unchanged except that the 48rem minimum width is dropped (the seven columns already fit the 82.5rem container). The per-instrument fact tables on provider pages already fit at 390px and stay as they are. Rejected alternative: keep horizontal scroll and add an edge fade plus a "scroll for more" hint; it still hides three columns by default and adds a nested scroll region on the main axis.

## 7. Entry points

- Home, `#provider-references` (`provider-references-section.tsx`): the `Underlying company` cell becomes a link to `/{locale}/company/{slug}` when `companyForProviderAsset` returns a company (it does for all 11 entries; an unmapped entry stays plain text). Above the table, one line: `By company:` followed by all company links in map order (alphabetical by slug, stated so the order is not read as a ranking): `Anduril, Anthropic, Figure AI, Kalshi, Neuralink, OpenAI, Polymarket, SpaceX`, rendered as an inline list with `Intl.ListFormat` separators, each link at least `--touch-target-min` tall below 52rem.
- Provider instrument page (`provider-page.tsx`), `Underlying company` section: after the fact rows, a note link `See every instrument linked to {name}` to the company page.
- Stock page (`stock-page.tsx`): when `companyForXStock(ticker)` returns a company (SPCX only, if accepted), the same note link under the `Registry record` note. The purchase panel slot is unchanged (SPCX shows the existing "not available" notice).
- `localizedPath` in `lib/i18n/config.ts` accepts `/company/{slug}`; the locale switcher then works on company pages. `middleware.ts` `isUnknownPublicPage` treats `company` with exactly one segment that `findCompany` resolves as known; anything else returns the existing 404 page with status 404.
- Metadata: `companyMetadataFor(locale, name)` with title `{name} instruments on Solana` and description `Every Solana instrument Benten links to {name}, with each provider's rights claim and what is unknown.`

## 8. Message keys

Add a `company` namespace to `apps/web/lib/i18n/messages.ts` with meaning-equivalent entries in all five locales, then refresh `apps/web/lib/i18n/catalog-manifest.json`. English:

```text
company.status.private            "Private company"
company.status.usListed           "US-listed company"            (reserved)
company.lede(name)                "Every Solana instrument that Benten's reviewed company map links to {name}. Each comes from a different provider and carries its own rights. They are listed together, not as substitutes."
company.lede.single(name)         "The Solana instrument that Benten's reviewed company map links to {name}. Benten links no other instrument to this company."
company.notice.heading            "Not interchangeable"
company.notice.body               "Holding one of these instruments gives you none of the rights of another. Their reference values are not compared here, because currency and as-of time are unknown. Open an instrument to see its full record."
company.notice.bodySingle         "Benten has not verified this provider's rights claim. Open the instrument to see its full record."
company.instrumentsHeading(n)     "Instruments ({n})"
company.caption(name)             "Instruments linked to {name}"
company.column.instrument / .provider / .kind / .rights / .reference / .unknowns
                                  "Instrument" / "Provider" / "Instrument kind" / "Rights status" / "Reference semantics" / "Unknowns"
company.rights.claimedBy(p)       "Claimed by {p}, not verified by Benten"
company.rights.equity(v)          "Equity ownership: {v}"
company.rights.voting(v)          "Voting rights: {v}"
company.rights.redemption(v)      "Redemption: {v}"
company.rights.notRecorded        "Not recorded by Benten"
company.referenceNouns.<kind>     "a mark reference" / "a token reference" / "an implied valuation reference" / "an auction reference" / "an auction valuation reference"
company.reference.publishes(list) "Publishes {list}"
company.reference.units           "Currency unknown. Provider as-of unknown."   (each sentence only when its unknown code is present)
company.reference.none            "Publishes no reference value for this instrument"
company.reference.xstock          "Registry identity only. No reference value is shown."
company.xstockProvider            "xStocks"
company.xstockKind                "xStock"
company.unknowns.noFilingCoverage(reason)  "No Benten filing coverage: {reason}"
company.unknowns.none             "None recorded"
company.sources.heading           "Primary sources"
company.sources.noSec(name)       "Benten has no SEC filing coverage for {name}, a private company."
company.method.heading            "How this list is made"
company.method.body(name, rev, date)  "Instruments are linked to {name} by an explicit, reviewed company map (revision {rev}), not by matching names. Provider records fetched {date}."
company.metadata.title(name) / company.metadata.description(name)
providers.home.byCompany          "By company:"
providers.page.companyPageLink(name)  "See every instrument linked to {name}"
stock.companyPageLink(name)       "See every instrument linked to {name}"
```

Reused unchanged: `providers.page.back`, `providers.names`, `providers.instrumentKinds`, `providers.rightsStatus`, `providers.redemption`, `providers.unknownCodes`, `providers.page.unknownValue`, `providers.page.noValue`, `exclusions.*`.

### 8.1 Locale notes

- Company names and symbols are never translated.
- `Intl.ListFormat` supplies locale list separators; the noun phrases in `company.referenceNouns` are written per locale, not generated by lowercasing labels.
- Japanese text keeps `word-break: auto-phrase` as elsewhere.

### 8.2 Vocabulary rule

Inside `<main>` of every company page, in every locale, the rendered text contains no term for quote, NAV, price, advice, recommendation, "best" or "buy", including negations. The web test keeps one pattern per locale. English: `/\b(quote|quotes|nav|price|prices|advice|advise|recommend\w*|best|buy|buying)\b/i`. For `ja`, `ko`, `zh-Hans` and `zh-Hant` the implementer writes the equivalent list in the test file (for each locale: the usual words for a price quote or bid/ask, net asset value, price, advice, recommendation and "recommended", and buying or purchase), because this public docs tree allows no CJK text. The implementer checks the reused `providers.*` and `exclusions.*` translations against these lists and replaces any match in a company-only key. The global footer disclaimer is outside `<main>` and out of scope for this test.

## 9. Accessibility

- Landmarks and headings: one `h1`; `h2` for `Instruments (n)`, `Primary sources`, `How this list is made`; no `h3` needed. The notice is a `<div class="notice">` with a `<p><strong>` first line, not a heading and not a live region.
- Table semantics: see section 6. The row header (`th scope="row"`) contains the symbol link, so a screen reader announces the instrument with every cell. `caption` names the company.
- Links: the symbol link is the only link per row. Below 52rem it is `inline-flex` with `min-height: var(--touch-target-min)`. Company links on the home line and the note links meet the same minimum below 52rem, 8px apart.
- Addresses: shortened for display with the full address in `title`; the full value and Copy are on the instrument page. The short form never replaces the full mint in any link or data attribute.
- 200% text zoom at 1440 × 900 collapses to the stacked layout (effective width below 52rem); no clipped text, no horizontal page scroll.
- Colour: none carries meaning here; the status is in words. Existing contrast pairs apply (ink 15.08:1, muted 5.93:1, action 8.8:1 on `--color-surface`).
- Focus: the existing 3px `--color-attention` outline; no custom focus handling (static page).
- Motion: none.

## 10. Tokens, components and tests

Tokens: no new colour, spacing or radius token. The only additions are CSS rules for `.record-table` built from existing tokens.

Components: `apps/web/components/company-page.tsx` (server component), `apps/web/app/company/[slug]/page.tsx`, `apps/web/app/[locale]/company/[slug]/page.tsx`; edits to `provider-references-section.tsx`, `provider-page.tsx`, `stock-page.tsx`, `lib/i18n/config.ts`, `lib/i18n/metadata.ts`, `middleware.ts`, `globals.css`. Living Catalog (`/dev/ui-catalog`): one `.record-table` specimen with a three-row fixture (the SpaceX shape) so the stacked mode can be checked without the page.

Tests (the plan's done-when, made concrete):

- `packages/registry/src/company-map.test.ts`: the bundled map validates; rejects an unknown asset, a mint mismatch, a `provider_company_id` mismatch, a duplicate instrument, an unmapped provider entry, a wrong `provider_assets_revision`, a wrong `xstocks_registry_sha256`, an unsorted company or instrument list, an uppercase or malformed slug; `findCompany` is exact (`OpenAI`, ` openai`, `figureai` return undefined).
- `apps/web`: renders `/company/openai` and `/company/spacex` in all 5 locales with the mapped instruments in map order; 404 status for an unknown slug, an uppercase slug and `/en/company/openai`; the vocabulary rule of section 8.2 inside `<main>`; no `<button>`, `<form>` or `input` inside `<main>`; no `references[].value` or `supply_reference.value` string of any mapped entry appears in the HTML; the home provider section and the OPENAI provider page link to `/company/openai`, localized per locale.
- Verification note: start `next start` bound to `localhost` (not `-H 127.0.0.1`); the middleware rewrites unknown pages to `http://localhost:<port>/benten-not-found`, and an IPv4-only bind makes that rewrite fail with 500 instead of 404.

## 11. Decisions

Decided in this design on technical grounds (reversible; the implementer may challenge with evidence):

1. No reference values on the company page; values stay on each instrument page. The artifact's own unknowns block `comparison`.
2. The binding source is the reviewed map; the provider `company_id` is only a consistency check. No name-string comparison anywhere.
3. Instrument order is a validated rule (source, provider, id), not free order and never a value order.
4. The map binds to the current provider-assets revision, so every provider refresh requires a map re-review before build.
5. Slugs are Benten's own and lowercase-exact; other casings 404 rather than redirect.
6. 390px uses stacked record cards built from a semantic table with explicit roles; horizontal table scrolling is not used on this page.
7. Single-instrument companies get a page (five of eight today).
8. `VCX` is recorded as excluded, not mapped.
9. Links: home company line plus linked company cells, provider page note link, stock page note link for a mapped xStock.

Needs a user decision (recommendation first):

1. **SpaceX xStock (`SPCX`) on the SpaceX page.** Recommend yes, with `binding_basis: issuer_product_name`, after the reviewer confirms on the xStocks issuer's product page that `SPCXx` tracks SpaceX. It is the only case where an xStock and provider tokens refer to the same company, so it is the most informative comparison on the site. Alternative: leave `SPCX` unmapped in revision 1.
2. **US-listed companies.** Recommend no company pages for them in revision 1 (section 2). Alternative: generate a page for every SEC-covered xStock, each with one row linking to its stock page.
3. **Apply `.record-table` to the home provider table now** (section 6). Recommend yes, in the same P2-1 change, because the same component and test cover both. Alternative: company page only; the home table keeps its hidden columns at 390px.
4. **Visual acceptance of the two images.** They are `review_pending`; the user or an independent reviewer decides whether they are the implementation reference or whether the text contract alone suffices.
5. **Reviewer identity in the map** (`review.reviewer`). Recommend a maintainer handle that already appears in the public repository; no email address.
