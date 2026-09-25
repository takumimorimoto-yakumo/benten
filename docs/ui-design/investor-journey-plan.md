Superseded by [app-ia-v2.md](app-ia-v2.md) on 2026-09-24; kept as history.

# Benten investor journey and information architecture

Status: **proposed IA for review; no visual acceptance or implementation authorization**
Updated: 2026-09-16
Delivery mode: plan only. This document adds no route, UI, wallet, quote, transaction, or public capability.

The proposed [mobile investing plan](../../specs/mobile-investing-implementation-plan.md) extends this three-task IA with connected-account **Portfolio** and local **Activity** continuity. Explore, exact Dossier and one-intent Purchase remain the semantic foundation: Portfolio does not become a recommendation dashboard, and Activity does not become a server order history. Native iOS/Android UI needs separate design/runtime acceptance and does not inherit this Web/shadcn acceptance.

## 1. Product job and truth boundary

Benten's primary user is an investor/researcher who wants to move through one coherent job:

> find an instrument → understand the referenced company and the instrument itself → inspect evidence and purchase support → review exact purchase conditions → explicitly approve in the user's wallet → reconcile the submitted transaction and resulting holding.

The UI must feel task-oriented without pretending Benten is already a broker. Today the repository provides a reviewed, read-only snapshot. The proposed purchase MVP remains unproved until the exact route, quote, transaction audit, wallet capability, legal gate, finality, and causal-holding checks pass. Until then, the UI may explain that purchase is not yet provided, but it must not expose an active purchase CTA or imply an executable route.

The IA must preserve these distinctions:

| Object | What it answers | Must not be presented as |
| --- | --- | --- |
| Reference company | Which business or asset the instrument references | The token issuer or proof of token rights |
| Provider/instrument | Who defines the product and what kind of product it is | Direct ownership of the referenced equity |
| Token identity | Exact network, mint/contract, symbol and decimals | Proof of purchase support or legal eligibility |
| Source-backed company fact | A published value with unit, period, source and freshness | A recommendation, forecast, rank, or current market price |
| Legacy snapshot value | Compatibility data with its own provenance | A source-verified fact or live price |
| Indicative/reference value | A provider-described reference observation | A DEX-executable quote, NAV, or guaranteed execution price |
| Executable quote | Amount- and account-bound route economics with expiry | A durable order or proof of completion |
| Purchase support | Benten's bounded capability for one exact route | General market tradability or user eligibility |
| Transaction result | Signature, finality and transaction effects | Current holding unless causal holding verification also passes |

Current snapshot counts are separate facts, not one coverage percentage: 154 xStock identities; 128 records with a financial snapshot; browse coverage of 125 `legacy_snapshot`, 3 `source_verified`, and 26 `not_applicable`; and 14 source-backed facts across the 3 source-verified companies. `not_applicable` means there is no financial row in this artifact, not that the company or instrument is bad. The catalog count is not the current global xStocks universe and not a tradable count. Every count displayed at runtime must come from the accepted artifact and include its snapshot date.

## 2. Users and jobs

### J1 — First-time investor

- Understand what Benten lets them inspect before searching or connecting a wallet.
- Browse a visible neutral list and distinguish `purchase supported`, `compare only`, and `not yet verified` without interpreting those labels as investment quality.
- Open one dossier and understand the company, instrument, evidence coverage, product/rights status, and purchase capability in that order.

### J2 — Investor who knows the ticker or company

- Narrow the visible catalog by ticker, reference-company name, or token symbol/name.
- Reach the exact dossier without passing through a mandatory company-comparison screen.
- Verify the exact mint/network in a technical disclosure before any consequential action.

Exact mint remains a supported advanced lookup and execution identifier, but it is not the primary Home input. Partial mint matching never resolves an instrument.

### J3 — Returning investor or result reconciler

- Return to the same public browse state through URL-backed filters, page, and sort.
- Resume a locally known sent attempt by checking its same signature rather than creating another wallet prompt; a signed-but-never-sent attempt follows the explicit fresh-review recovery below.
- Inspect the original account, signature, cluster, finality, transaction effects, and causal holding state.
- For an unknown post-send outcome, query the same known signature; never sign or resend automatically.

### Secondary users

- An operator may inspect advanced DBC evidence in its dedicated secondary route. This is not part of the investor purchase path.
- A developer may discover read-only API/MCP facts from a secondary navigation or dossier disclosure. Developer tooling does not occupy the primary first fold and does not imply remote trading authority.

## 3. Chosen IA: three screen families

The recommended structure integrates comparison and result reconciliation into three screen families. It avoids a mandatory company page and a separate receipt page while allowing the already planned provider/company/DBC URLs to map to the same domain consumers.

| Screen family | User's question | First information | One primary CTA | Return/recovery |
| --- | --- | --- | --- | --- |
| 1. Markets / comparison | “What can I inspect, and which items does Benten support?” | Snapshot count/date, visible A–Z catalog, search and factual filters | `View details` | URL preserves public query/filter/sort/page; Back restores scroll |
| 2. Exact instrument dossier | “What exactly is this product, what evidence exists, and can Benten take me to purchase conditions?” | Instrument overview and coverage/purchase state, then company evidence, product terms, technical identity | Positive verified route: `Review purchase conditions`; otherwise `Return to results` or `View source` | Back returns to the previous catalog state; a direct deep link falls back to the locale Home |
| 3. Purchase Intent workspace | “What will this wallet approval do, what happened, and is the resulting holding verified?” | Original instrument/account, amount, quote state and recovery status | Exactly one state-dependent action, such as `Get conditions`, `Review in wallet`, or `Check status` | Before signing: back to dossier. After durable `send_invoked`: remain pinned to the same signature; signed-but-never-sent recovery follows the receipt table |

### Alternatives considered

| Option | Benefit | Cost/risk | Disposition |
| --- | --- | --- | --- |
| A. Three integrated families (recommended) | Known-ticker path is short; compare is optional; receipt state stays with the intent that caused it | Dossier must carefully separate company, instrument, evidence and purchase support | Adopt for IA |
| B. Mandatory company page between catalog and dossier | Makes cross-provider comparison explicit | Slows the main known-ticker journey, creates a fourth required page and invites company/instrument conflation | Do not require; keep company comparison optional |
| C. Separate receipt/history page | Shareable status appears simple | Encourages server-order expectations, splits recovery from its intent, and expands storage/privacy scope | Do not add for P0; reconcile in Purchase Intent |

### P0 comparison boundary

The initial Home and Dossier do **not** provide checkboxes, a comparison basket, selected-set state, or a `Compare instruments` CTA. Users browse one catalog and open one exact dossier. No comparison selection is stored in URL, session storage or local storage.

The required future sponsor comparison remains an optional navigation path, not optional product scope: when a reviewed company binding has more than one reviewed provider instrument, the Dossier may expose `View related instruments`. That opens `/company/{company_id}` and renders the complete artifact-derived group for that company automatically. The user does not select or remove members. `Back to instrument` returns to the originating Dossier when present; otherwise `Back to instruments` returns to the locale Markets state. Locale is preserved. A user-built multi-company or multi-instrument comparison basket is outside P0.

## 4. Route and screen-family mapping

Route count, generated-document count, screen-family count and state count are different measures and must not be reported interchangeably.

### Current protected baseline

- Locales: **5** (`en` at unprefixed canonical paths plus `ja`, `ko`, `zh-Hans`, `zh-Hant`). `/en` remains invalid.
- Current canonical public route families: **2** — Home and exact xStock dossier.
- Current generated document URLs: **775** — 5 Homes plus 154 × 5 exact dossiers.
- Existing deep links `/stock/{TICKER}` and localized equivalents remain valid; known lowercase aliases retain their existing canonical redirect behavior.

### Future URL families mapped to the three screens

| URL family | Screen family | Role in the investor journey | Canonical-data boundary |
| --- | --- | --- | --- |
| `/` and `/{locale}` | Markets / comparison | Primary entry and xStock catalog | Existing registry-derived Home |
| `/markets` and locale equivalent | Markets / comparison | Future noncanonical alias to the locale Home/discovery surface; it preserves compatible public query state and never becomes a second catalog. The architecture owner selects the redirect/alias mechanism. | One shared catalog/query composite |
| `/stock/{ticker}` | Exact dossier | Existing xStock deep link and shortest known-ticker path | Exact registry resolution; no duplicated dossier model |
| `/company/{company_id}` | Markets / comparison detail | Optional navigation that automatically lists all reviewed provider instruments bound to that company; never a required step to purchase and never a user-built basket | Shared company/instrument comparison projection |
| `/market/{provider}/{provider_asset_id}` | Exact dossier | Provider-specific instrument detail | Same dossier domain composite with provider-specific identity/provenance |
| `/purchase` | Purchase Intent workspace | Dynamic, non-prerendered consequential flow only after gates | No wallet, amount, intent digest, quote, or status in public query parameters |
| `/portfolio` and locale equivalent | Later Portfolio continuity | Prerendered empty shell; client-only exact account holdings, value coverage and user-authored target after mobile gates | No private value in URL/HTML/server; read-only wallet/RPC island only |
| `/activity` and locale equivalent | Later Activity continuity | Prerendered empty shell; strict local purchase-receipt projection and sole recovery action | No server order history, receipt copy or automatic retry |
| `/dbc/{pool_or_scenario_id}` | Secondary advanced evidence | Operator/sponsor evidence, outside the primary purchase path | No purchase-support inference |

This IA fixes `/` and `/{locale}` as the canonical discovery entry and keeps 775 as the **current** document baseline. The separately gated mobile overlay would add five Portfolio and five Activity shells, producing a computed 785 only after those routes pass design, RPC/store/import, static and release review. `/markets` is a future alias only; it must preserve compatible public query state and render no separately managed catalog. The architecture owner still owns the exact redirect/alias mechanism and localized manifest. This IA does not delete or newly accept the other planned provider routes. The new Purchase Intent must use the already planned `/purchase` family; do not invent a `/purchase/{intent_digest}` public path.

## 5. Markets / comparison contract

### Initial state before search

The Home screen must be useful without typing:

1. A concise statement of the job: inspect reviewed token identities and public evidence; purchase is available only for an explicitly supported route.
2. Snapshot date and separate counts. Show `154 xStock identities in this reviewed snapshot`, not `154 assets available to buy`.
3. The first page of **20** neutral A–Z results.
4. Search, filters, sort, and result count directly above the results.

Do not render a mint-only hero, a blank search-only landing, a fabricated market-price dashboard, popularity/recommendation ranking, price change, or chart when those fields do not exist.

### Search and exact resolution

- Text narrowing matches the accepted browse projection for ticker, reference-company/display name, and token symbol/name.
- Text matching is navigational, not proof that a company identity is verified.
- Pasting a full exact mint may resolve the allowlisted item through an advanced path; partial mint text produces no identity resolution.
- Unknown exact mint shows `This mint is not in the reviewed snapshot` and offers `Clear search`. It must not fuzzy-match another asset.
- Search updates the visible list; it does not hide the catalog model behind a separate submission page.

### Filters and sort

Only expose filters backed by actual fields in the active catalog projection:

- current xStock catalog: public-evidence coverage (`source-backed facts`, `legacy snapshot`, `not applicable`), with an explanation that `not applicable` is an artifact-coverage state rather than a company judgment;
- future reviewed cross-provider catalog: provider and instrument kind, only after those values exist in the accepted provider artifact;
- Benten purchase support (`supported`, `compare only`, `not verified/unavailable`) only when the policy projection can populate all categories truthfully.

Do not invent sector, region, market-cap, price, return, or liquidity filters. Purchase support and financial-data coverage are independent axes. A source-backed fact never makes a token purchasable; a purchase-supported token does not imply complete company facts. Do not default to a `purchase supported` filter while there are zero proven routes, because an unexplained empty first page would misrepresent the catalog.

Default sort is A–Z by stable ticker/symbol. Additional sort choices require an accepted field and deterministic tie-breaker. Do not add performance, price, popularity, or “best” sorts.

### URL and Back behavior

- Public browse state only may appear in the URL: `q`, factual filters, sort, and page.
- Changing search/filter resets page to 1; clearing a single chip preserves the others.
- Browser Back restores query, filters, sort, page, and scroll position.
- Locale changes preserve compatible public browse state.
- Wallet address, amount, balance, intent digest, quote, signature, or purchase status never appear in public search/query state.

### Loading, empty, error and stale

| State | Required UI | Recovery |
| --- | --- | --- |
| Initial/loading | Header and filter geometry remain stable; show row skeletons with no fabricated values | Wait; no wallet/RPC starts |
| Ready | Result count plus 20/page list/table | Open exact dossier |
| Zero results | State which active text/filter combination produced zero; do not say “no assets exist” | `Clear all filters` and individual removable chips |
| Static read error | Plain failure message; no cached rows relabelled current | `Retry catalog` |
| Partial provider/evidence outage | Preserve accepted snapshot rows; label unavailable refresh separately | Continue browsing snapshot or retry evidence |
| Stale artifact | Show artifact date and update state without implying live market freshness | Open source/provenance; no purchase inference |

### Desktop and mobile

- Desktop: search and factual filters precede a semantic table with ticker/name, provider/type, evidence coverage, and Benten purchase support. Whole-row activation is optional; a visible `View details` action remains keyboard accessible.
- Mobile: search remains first, filters open in a `Sheet`, and results become labeled list items/cards. Do not squeeze the desktop table horizontally. The first viewport shows the job, search, count, and at least one complete result.

## 6. Exact dossier contract

### Reading order

1. **Overview:** ticker, token/provider name, reference-company name, evidence coverage, and Benten purchase-support state.
2. **Company decision material:** source-backed facts with exact value, unit, complete period, filing/source link, filing date and freshness. Legacy rows live in a separate lower-emphasis section and are never labelled “current price”.
3. **Instrument and product terms:** provider/issuer roles and reviewed rights/restrictions copy. If legal wording is not accepted, omit the assertion or label the section as awaiting review; do not invent a paraphrase.
4. **Purchase conditions:** only a capability summary until the user enters the Purchase Intent workspace. Provider reference/indicative values remain distinct from executable DEX conditions.
5. **Technical identity disclosure:** network, complete mint/contract, decimals/token program when present, observed issuer address when present, source and copy actions. Long addresses are accessible but not the page's headline.
6. **Secondary tools:** read-only API/MCP and advanced evidence links.

### Primary action by capability

| Capability state | User-facing message | Primary action |
| --- | --- | --- |
| Exact reviewed route is positive | `Purchase conditions can be checked for this exact instrument.` | `Review purchase conditions` |
| Current route gate is still unproved | `Purchase functionality is not available yet.` | No purchase CTA; `Return to results` remains navigation |
| Compare only | `Benten does not support purchasing this instrument in this MVP.` | `View source` or `Return to results`; `View related instruments` appears only when a reviewed same-company group exists |
| Previously supported, quote currently unavailable | `Purchase conditions could not be retrieved. No transaction was prepared.` | `Check conditions again` after a bounded retry |
| Evidence unavailable | Preserve exact identity; state which evidence is unavailable | `Retry evidence` |

Never expose backend enum names such as `candidate_unverified` to investors. Copy must say what is unavailable, what did not happen, and the next safe action.

### Navigation and responsive behavior

- `Back to results` returns to the exact public Home/Markets URL and scroll position when present.
- A direct deep link uses a locale-appropriate `Browse instruments` fallback.
- Desktop may use a secondary rail for capability and technical disclosures, but DOM/tab order follows the reading order above.
- Mobile uses one natural column. Facts use vertically labelled rows; long addresses wrap or pair with a full-value copy action; no horizontal financial table.

## 7. Purchase Intent workspace contract

This screen exists only when the purchase contract and exact route gates permit it. The current zero-ready-route state must render as unavailable or remain unmounted; it must not show a faux swap form.

### Continuous task order

`exact instrument → wallet/account → amount → fresh quote → immutable review → wallet approval → single submission → finality → causal holding`

One workspace owns the entire sequence and the locally recoverable result. Do not split it into tabs, a transient modal, or a separate generic receipt page.

### Meaning of each boundary

- Browsing and the dossier require no wallet.
- Connecting a wallet reveals a public account and balances; it is not permission to spend.
- A quote is not an order and expires.
- An unsigned transaction is not submitted.
- Opening the wallet is not approval.
- A wallet rejection means nothing was submitted; it is not an onchain failure.
- A signature and send attempt do not prove finality.
- Finality does not by itself prove the current holding; transaction effects and a causal post-confirmation holding check remain separate.

### Conditions shown before wallet approval

Before the wallet opens, every important condition must be reachable in the natural reading order and explicitly reviewable. Opening/closing the external wallet must not erase or mutate that review. Desktop may keep a summary visible alongside the action; mobile may require natural vertical scrolling and a deliberate final review checkpoint. The review includes:

- wallet account and Solana Mainnet;
- exact spend and receive token identities;
- amount, raw amount basis, and any display multiplier/as-of basis;
- venue and route-policy revision;
- maximum USDC debit;
- estimated output and minimum receive;
- quote age, expiry, slippage and price impact;
- DEX/LP, token-transfer, integrator and other amount-affecting fees;
- estimated network/priority fee and ATA rent in SOL where applicable;
- unknown values as `Unknown`, never zero;
- whether an associated token account is created;
- plain-language instruction summary and technical disclosure.

Any unknown required debit, minimum receive, recipient, writable account, program, amount-affecting fee, or transfer-hook effect blocks wallet review.

### Receipt-bound recovery and the only safe next action

The UI reads the existing receipt/lock contract; it does not invent a looser state machine. A “new intent” below means a new context, review and wallet gesture. It is never an automatic resend.

| Receipt/evidence situation | Fact shown to the user | Only primary action | New intent? |
| --- | --- | --- | --- |
| `pre_sign_active`, current wallet prompt still owned | `A wallet review is already open. Nothing has been submitted.` | `Return to wallet review` or wait for the owned prompt | No parallel intent |
| Pre-sign orphan after reload/crash, no recorded signature and no send marker | `Benten has no recorded signed transaction or submission for the interrupted review.` | `Abandon review and start again` after fencing the old generation | Yes, after the orphan is abandoned |
| `pre_sign_aborted`, including explicit wallet rejection before bytes | `You rejected or ended the wallet review. Nothing was submitted.` | `Review new conditions` | Yes, after acknowledgement |
| `signed_ready_to_send` in the original live callback, durable signed receipt present, bytes still ephemeral, all lock/generation/expiry checks pass | `Wallet approval was received. Submitting this exact transaction once.` | Non-interactive `Submitting…`; do not ask for another click/signature | No parallel intent |
| `signed_persisted` after reload/crash, or post-sign context/blockhash/quote expiry before durable `send_invoked` | `The transaction was signed but was not submitted. The signed bytes are no longer available and will not be reconstructed.` | `Acknowledge and review new conditions`; first record rejected-unsubmitted and discard any live bytes | Yes, only through a new context/review/wallet gesture |
| Durable `send_invoked` with timeout/error, `submission_unknown`, or pruned/null/lagging lookup | `Submission was attempted for this signature. The outcome is not known yet.` | `Check this signature` | No |
| `confirmed`, not finalized | `The transaction is confirmed but not final.` | `Check finality` | No |
| `reorg_or_dropped` before a finalized outcome | `The earlier confirmation regressed or was dropped. The final outcome is unresolved.` | `Check this signature` | No |
| `chain_failed` proven by finalized metadata for the exact signature/message with non-null error | `The transaction finalized with an onchain failure.` | `View failure details and acknowledge` | Yes, only after this finalized failure releases the lock |
| Finalized transaction with `holdings_unverified`, missing/mismatched causal metadata, or holdings RPC unavailable | `The transaction is finalized, but Benten has not verified the required token effect.` | `Recheck transaction evidence` | No; the active lock remains |
| `holdings_verified` | `The finalized transaction and its causal token effect were verified.` | `View purchase result` | Yes; the verified result releases the active lock |
| Local storage unavailable, quota/full, or a receipt write/read cannot be made durable | `Purchase is disabled because Benten cannot preserve the recovery record required for one-send protection.` | `Restore browser site storage and recheck` | No while unavailable |
| `corrupt_local_state` or partial/tampered receipt | `The local recovery record cannot be trusted. Benten will not submit or start another purchase from this state.` | `View recovery steps` and reconcile the recorded wallet/signature through wallet/explorer evidence | No until a trusted recovery disposition exists |
| Complete site-data erase/new browser profile | `Benten cannot detect a prior local attempt after site data is erased.` | `Check wallet and explorer history before purchasing again` | Technically possible only after manual reconciliation; no exactly-once guarantee |
| Different browser/device/profile | `Purchase history and locks are local to the original browser profile and are not synchronized here.` | `Check the original wallet/profile and explorer history` | Technically possible only after manual reconciliation; no cross-device exactly-once guarantee |

Expiry before signing discards the review and requires fresh conditions. Expiry **after** durable `send_invoked` never proves failure and never releases the lock. A processed/confirmed error, elapsed time or `getTransaction:null` is not the finalized `chain_failed` state.

### Refresh, cross-tab and privacy

- Refresh and a second tab in the same origin/profile observe the same local attempt and cannot create another wallet prompt while the required storage/lock capabilities work.
- Status remains pinned to the original account, cluster, message and signature even if the connected account later changes.
- The accepted bounded local receipt may contain only public digests/signature/status evidence needed for recovery. Signed bytes, seed/private keys, full holdings and reusable authority are never stored.
- Same-profile local locking cannot guarantee exactly-once behavior after complete storage erasure or across devices/profiles. The UI discloses this before purchase and never claims automatic detection.
- Clearing the local recovery view cannot cancel or prove the absence of an onchain transaction. It is not presented as a normal recovery control.

Each row above requires a deterministic receipt/state-machine fixture plus reload, Back and cross-tab QA before Purchase Intent implementation can be accepted. This document does not claim that any recovery row is implemented today.

## 8. State-count ledger

The IA uses **6 reusable UI state-equivalence groups**, matching the existing purchase UX/PX contract. This is not 6 screens and does not replace the contract enums.

1. Browse and evidence — catalog initial/loading/ready/zero/error plus source-backed/legacy/no-data and purchase-supported/compare-only/blocked modifiers.
2. Wallet and amount prerequisites — disconnected/connecting/connected, invalid amount, insufficient USDC/SOL, account-or-network change and read error.
3. Quote lifecycle — idle, loading, fresh, expiring, expired, unavailable, route/policy changed and quote error.
4. Review and wallet interaction — review ready, wallet opening, rejection, wallet unavailable/error, context change and outcome uncertainty before submission.
5. Submission and finality — signed-not-submitted, submitting, known signature/confirming, confirmed, finalized, finalized onchain failure, submission unknown and reorg/dropped.
6. Holding verification — baseline/refresh, causal delta verified, current holding observed, mismatch and RPC unavailable.

The labels overlap: for example, a `source-backed` item may still be `compare only`. Therefore individual labels are not added into a “state count” KPI, and backend reason codes do not justify new ad-hoc layouts. `Partial provider outage`, `stale snapshot`, and detailed failure reasons are modifiers attached to the nearest group. The normative execution enums remain in the purchase contract; this IA only specifies their user-visible meaning and recovery.

## 9. shadcn-first component boundary

Use the actual app-local shadcn CLI default primitives selected by the pinned implementation, with its generated theme variables and necessary responsive layout utilities. “No bespoke CSS” means no custom palette, typeface, decorative visual layer, one-off component skin, or imitation trading terminal. It does not prohibit the normal grid/flex/spacing/wrapping utilities required to compose accessible pages.

| Need | Default primitive/composition | Domain owner |
| --- | --- | --- |
| Search and amount | `Field`, `Label`, `Input` | Query rules / raw amount rules |
| Factual filters | `Select`, `Checkbox`, mobile `Sheet` | Browse projection and URL state |
| Results | `Table`, `Pagination`; mobile `Card`/list | Catalog identity and capability semantics |
| State labels | `Badge`, `Alert` | Evidence/purchase status mapping; never Badge logic |
| Facts/fees | Semantic table or labelled rows, `Separator` | Provenance, units, periods, fee status |
| Technical details | `Accordion` or `Collapsible`, copy `Button` | Exact identity and disclosure |
| Async states | `Skeleton`, `Alert`, disabled/loading `Button` | State machine and recovery action |
| Purchase review | `Card`, `Field`, `Alert`, `Separator`, `Button` | Quote/approval/transaction contract |

Domain composites such as Catalog Results, Instrument Overview, Fact Provenance, Purchase Availability, Quote Review, Transaction Status and Holding Verification own semantics and tests. Generic primitives must not infer financial state.

Primary navigation is purpose-labelled: `Browse instruments`; optionally `Transaction status` appears only when a local attempt exists. `Developers` is secondary. The locale switcher is navigation, not a form filter.

## 10. Accessibility and responsive acceptance

### All screens

- One `h1`, sequential headings, skip link, visible focus, logical DOM/tab order and no color-only status.
- Search counts and consequential async results use restrained live announcements.
- Buttons and links have action/object-specific names; copy controls identify the copied mint/signature/account.
- Minimum 16 CSS px mobile body text and 44 × 44 CSS px touch targets.
- At 200% browser text zoom, no overlap, clipping, hidden action, or two-dimensional page scrolling.
- Five locales preserve meaning and state; long CJK and address content wraps without truncating the only exact identifier.
- Loading keeps enough structure to avoid layout jumps; errors appear beside their affected task and include recovery.

### Purchase-specific

- Keyboard-only users can complete every pre-sign step and recover from rejection/error.
- Quote expiry is announced at a meaningful threshold and at expiry, not every second.
- Focus returns from wallet rejection to the status heading/recovery action.
- The user can explain the exact asset, maximum debit, minimum receive, expiry, fees and what wallet approval does before the wallet opens.
- Mobile uses one natural vertical scroll; fee and fact data become labelled rows rather than compressed tables.
- A sticky action must never obscure an error, status, or holding result.

## 11. Text wireframes for discussion

These describe information order, not visual acceptance.

```text
MARKETS / HOME
[Benten]  [Browse instruments]                         [Locale]
Inspect reviewed instruments and evidence. Purchase appears only when supported.
154 xStock identities · snapshot <date> · purchase routes <truthful state>
[Search ticker, company, or token] [Filters] [Sort A–Z]
[active filter chips]                         154 results
Ticker | Instrument / company | Provider/type | Evidence | Purchase support | View details
... first 20 neutral A–Z rows ...
[pagination]
```

```text
EXACT DOSSIER
[Back to results]
<Ticker> · <token/provider name>            <coverage> <purchase state>
Reference company: <name>
[Company facts: value · unit · full period · source · freshness]
[Legacy/no-data disclosure]
[Instrument / product terms or reviewed-copy pending state]
[Purchase capability summary]               [Review purchase conditions]
[Technical identity: network · full mint · Copy · provenance]
[Developer / advanced evidence links]
```

```text
PURCHASE INTENT
[Back to dossier — only before signature]
<Exact instrument> · Solana Mainnet · <original account>
[Amount] [Get conditions]
[Fresh quote: max debit · min receive · expiry · route · all fees]
[Approval meaning and technical details]
[Review in wallet]
[Signature / finality / transaction effects]
[Current holding verification]
```

## 12. Acceptance and handoff gates

This document is ready for product/architecture review when reviewers can answer yes to all of the following:

- A first-time investor can choose from an initial list without knowing a ticker or mint.
- A known-ticker investor reaches the exact dossier without a mandatory comparison detour.
- Initial Home/Dossier contains no comparison basket or selected-set persistence; optional company comparison is an artifact-derived same-company group with explicit entry and return.
- Company facts, product rights, reference value, executable quote and purchase support cannot be mistaken for each other.
- Compare-only and purchase-unverified states never expose a misleading Buy action.
- Public browse URL state excludes wallet and transaction data.
- The one purchase workspace explains wallet approval, one-send behavior, unknown-outcome recovery and causal holdings.
- Every receipt state exposes one safe next action and states whether a new intent is allowed, including storage-erasure and cross-device guarantee limits.
- Current and proposed capabilities are visibly separate.
- Existing `/stock/{ticker}` deep links and five-locale behavior have an explicit migration owner.
- The implementation can use default shadcn primitives without recreating the old mint-first UI inside new components.

Read-only Home/Dossier implementation must not wait for a live purchase route. Once this IA is accepted, the already recorded project-specific implementation-first exception permits the builder to establish those two informational layouts in the real default-shadcn app and seek browser feedback there. That exception is not acceptance of the resulting screen or of any previous image. It does not authorize a live Purchase Intent.

Remaining gates:

1. Product/architecture acceptance of this IA and the final route/alias manifest gates the informational Home/Dossier build.
2. Acceptance or explicit suppression of product-rights/legal copy gates its public display, not the whole read-only shell.
3. Exact purchase policy, route and wallet contracts gate the Purchase Intent; current unproved purchase remains disabled/unmounted.
4. The implementation-first exception applies to the initial default-shadcn Home/Dossier layout only. Purchase states or later material visual expansion still require their applicable visual-author and direct-human gate.
5. Every implemented scope requires direct human browser feedback and independent desktop/mobile/keyboard/200% runtime review before release.
6. Portfolio/Activity additionally require the mobile plan's accepted design, fixed read-only RPC/import boundary, private IndexedDB store, post-integration security/runtime and independent visual review, explicit human disposition and same-revision `MOBILE-RC`; initial Home/Dossier acceptance is not inherited.

Previous generated images do not accept this IA or the purchase flow. This plan does not authorize a funded transaction, deployment, or public release.
