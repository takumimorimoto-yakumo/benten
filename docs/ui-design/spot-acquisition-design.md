# Spot acquisition homepage — design proposal

Status: `review_pending` **historical/partial reference for the full rebuild** — visual direction selected by the designer, **not accepted by the user and not authorized for UI implementation**. See `information-architecture-reset.md` (removed 2026-09-24; see git history; superseded by [investor-journey-plan.md](investor-journey-plan.md)); its macro hierarchy must be settled before any new visual direction.

Source revision at inventory: `303bd6b` on `develop` (2026-09-14 JST). The prior [mint-first design](homepage-design.md) and its [direct-human acceptance](acceptance.md) remain historical records for that different scope. They are not acceptance of this pivot.

[Current proposed desktop visual direction](assets/2609140140_benten_homepage_spot-acquisition.png) <!-- generated-image-current:benten/homepage/spot-acquisition -->

- Image bytes SHA-256: `851895e1d10f92a9b894eae2a8904707d5c2a2a82e8cf2a261acf91dad5faea1`
- Image dimensions and exact comparison viewport: `1506 × 1045`
- Intended judge viewport: `1440 × 1000`; mobile design check: `390 × 844`
- Provenance: Codex built-in image generation, 2026-09-14 01:40:43 JST
- [Final prompt](prompts/2609140140_benten_homepage_spot-acquisition.txt) · [manifest](generated-image-manifest.v1.json) · [current UI and future purchase boundary](README.md#current-information-ui-and-future-purchase-boundary)

The image communicates composition and visual tone. It is **not** a live quote, runtime screenshot, wallet interaction, accessibility test, pool verification, or evidence that any pictured token can currently be bought.

## 1. Single job and boundaries

The user is a person with a Solana wallet who wants to swap USDC for an **existing, supported xStock token**. The homepage's first job is to make that acquisition possible through a direct, verifiable onchain pool route while keeping token identity and public source-backed company facts at hand. A judge should understand the path in one viewport: choose token → enter USDC → get fresh quote → review → personally sign → see chain receipt.

This is a user-directed spot swap, **not** issuer minting, an investment recommendation, an automated agent trade, custody, a perpetual, or a promise that every xStocks registry entry is swappable. The issuer onboarding / primary issuance journey is a separate future scope and must not appear in this MVP. The interface publishes no proprietary analysis, private data, model signal, rating, or forecast. Availability depends on the user's jurisdiction and applicable provider terms; the acquisition flow must carry a concise eligibility notice and a launch-reviewed gate, not bury that limitation in a footer.

The current public runtime and local guidance are read-only. This proposal does not change them by itself. A later, explicitly accepted implementation must reconcile the trading policy, data and execution contracts, and legal copy before shipping.

## 2. Information hierarchy and visual direction

1. The right-side swap form is the obvious main action: selected xStock, USDC amount, live quote action, quote details, then review/sign.
2. The left dossier answers *what token is this?*: exact token mint, underlying company, issuer/token status, source filing, and at most two high-value verified public facts.
3. Registry membership, factual data availability, and an executable DEX route are three **different** states. Neither a listed ticker nor an available financial row proves liquidity.
4. The complete registry, longer facts, MCP setup, and existing read-only wallet holdings move below this initial transaction journey or to secondary routes. They are not deleted.

The memorable element is the quiet token → underlying → filing proof trail beside a clear USDC → xStock action. Keep the existing restrained mineral/ink foundation, fine rules, low radius, tabular figures, and Benten wordmark. Let the headline carry more personality with a restrained serif treatment; this is a **new** proposal, not inherited approval. Avoid finance-chart wallpaper, gradients, crypto glow, fake seals, third-party logos, decorative status dots without text, and repeated equal-weight cards. No invented external link is displayed.

Proposed new semantic roles, to be reconciled with existing CSS custom properties after acceptance: primary action, disabled action, verified fact, unchecked route, unavailable route, transaction warning, pending confirmation, and confirmed receipt. Check each actual foreground/background pair at WCAG AA; do not infer contrast from the mock. Use source typography that distinguishes company name, token symbol, address, amount, and time. Financial and quote figures need tabular numerals. No automatic animated entry; only user-triggered state replacement, removed for reduced motion.

### Desktop macro composition

```text
Benten        Explore xStocks | How swaps work | Connect wallet
Headline: Buy an xStock on Solana. Know what you own.
┌ public token dossier (about 57%) ┐  ┌ USDC → xStock swap (about 43%) ┐
│ exact mint + underlying company  │  │ 1 Choose → 2 Quote → 3 Review → 4 Sign │
│ registry / facts / route states  │  │ pay USDC, receive selected token        │
│ token → company → filing proof   │  │ Get live quote                           │
│ 2 verified facts, or honest gap  │  │ route/impact/min receive/fee/expiry    │
└───────────────────────────────────┘  │ Review swap (gated by fresh quote)       │
                                       └────────────────────────────────────────┘
Thin explanation: swapping existing pool liquidity, not primary issuance.
Below fold: expanded data, complete registry, MCP information, receipts/help.
```

At `1440 × 1000` the selected asset, pay/receive controls, quote CTA, route-state label, and concise proof must all be visible without scrolling. The fact sheet may continue below the fold when text is long; it must not displace the swap CTA.

### Mobile composition

At `390 × 844`, one page scroll: small selected-token identity and route state → swap form/quote CTA → concise proof/facts → expanded registry and educational content. This differs from the desktop visual order deliberately so buying stays the main job. Keep a persistent visible field label, ≥44 px touch target, full amount/value visibility, no horizontal page scroll, and no nested quote-card scroller. The mint may wrap/copy via disclosure; do not truncate without a full-address path. At 200% text zoom, the form and review sheet grow vertically instead of clipping. If an action bar is sticky, reserve bottom inset plus safe-area space; do not place critical text behind it.

## 3. Canonical content and data bindings

The mock's numbers, token presentation, and control states are illustrative. Runtime binds only to accepted public registry / verified-fact outputs and a separately validated live quote. Never copy values out of this file into UI code.

| Region | Required binding / copy rule |
| --- | --- |
| Selected asset | Exact allowlisted symbol, ticker, token name, full mint in copyable detail, underlying company name, issuer identity state. Do not conflate issuer with underlying company. |
| Three statuses | `Registry: listed`, `Public facts: source-backed` only when accepted facts exist, and `DEX route: not checked / available / unavailable`. Each has text as well as tone. Route status comes from fresh verified pool discovery, not registry or snapshot. |
| Proof | Token → underlying company → filing. The issuer badge belongs to the token only. Filing link appears only for a verified fact's exact source document. |
| Fact rows | At most two verified facts in the first view, each with actual value, unit, fiscal period/type, filing date, and source. If absent, show a plain `No source-verified facts yet` notice, **not** a dash under a `Source verified` badge. |
| Quote | Receive estimate, exact input/output mints and decimals, pool/program/route label, price impact, configured maximum slippage, minimum received, estimated network/rent/priority fees where known, and explicit expiry/time observed. Unknown values must be labeled unknown; do not invent a fee or rate. |
| CTA | `Get live quote` once selected mint and amount are valid; a wallet is not required merely to inspect a pool quote. `Connect wallet` is required before review/sign. `Review swap` only when a fresh quote and all execution gates pass. |
| Footer note | `Swap existing xStocks on Solana. This is not issuer minting.` Use an explanatory destination that exists; do not show a broken `How acquisition works` link. |

The mock renders Revenue `$215.938B` and Total assets `$206.803B`, but **image-rendered digits and period text are not data evidence**. Even where they resemble a previously accepted public artifact, the built UI must bind both values, source status, units, exact company spelling, and filing link from the actual accepted public data at runtime. **Correction to the image:** revenue is a duration fact (`2025-01-27` through `2026-01-25`), not an `as of` instant; total assets is an instant as of `2026-01-25`. If the runtime verified facts are absent, neither displayed value nor `Source verified` appears. The mock's token glyph is decorative and must not be passed off as an issuer logo. The mock's `Max` control must be hidden or disabled until the connected wallet's spendable USDC balance is known, and the central arrows are a one-way conversion cue, **not** an active sell/reverse feature. The header's old read-only descriptor must be updated to the accepted product copy before release.

## 4. Interaction and state contract

The flow is intentionally **not** a one-click auto-trade. Labels below are UI states; backend enum names belong to the execution contract.

| State | User-visible behavior |
| --- | --- |
| Selection idle | Show one explicitly selected registry token, exact mint access, separate facts and route states. No assumption that a route exists. Token search/select uses exact allowlisted identity; unsupported input shows `This token is not supported by Benten.` |
| Amount invalid / insufficient | Inline error near USDC field, no quote request. Amount > spendable balance and missing SOL for network costs have distinct messages after wallet balances are known. Do not silently round an amount upward. |
| Quote loading | Preserve amount and token, show `Checking available pools…` with busy state; block duplicate quote requests. |
| No verified pool / route | `No supported pool route is available for this token right now.` Keep the public dossier, disable review/sign, offer another token or retry; do not call this missing company data. |
| Quote unavailable | Explain temporary RPC/DEX failure, preserve input, allow retry. Do not call it `no pool` unless pool validation actually established that result. |
| Fresh quote | Show exact receive estimate and all quote details; named route/pool source, slippage cap, minimum received, fee estimate, and expiry. Wallet can connect now. No recommendation wording. |
| Quote expired or input changed | Mark stale, disable review/sign, explicitly request `Refresh quote`. Never submit the prior transaction or silently reuse it. |
| Review | Dedicated confirmation sheet shows pay, receive estimate/minimum, exact mint pair, route/program, price impact, slippage, fees, expiry, wallet address, and network. It states that this is a DEX swap of an **existing token**, not issuance, purchase, or redemption from the issuer. It includes a concise jurisdiction/eligibility notice and the reviewed eligibility acknowledgment required by the release policy; an ineligible or unacknowledged user cannot sign. One primary `Confirm in wallet` action; close/back returns without sending. Revalidate quote and transaction before opening the wallet approval. |
| Wallet rejected / simulation failed | No transaction-sent claim. Preserve context, show precise recovery and new quote if needed. |
| Signed / submitted | `Submitting…` then `Confirming on Solana…`; disable duplicate action. If status is unknown, show `Confirmation not yet known` and lookup/retry-status by signature, **not** a second send. |
| Confirmed | Show signature, explorer link for the exact cluster, amount actually spent/received, fee, confirmation time, and copyable receipt. Only confirmed status is success. |
| Failed after submission | Show transaction signature, failed status and explorer link, no success color, safe `Start a new quote` recovery. |

Review, wallet prompt, and receipt must all distinguish the issuer-backed token from the underlying stock. Benten never requests or stores a seed phrase or private key. A wallet rejection is not a transaction failure onchain. Every material state transition is announced without stealing focus; inline errors are tied to their field. Focus enters the review sheet heading and returns to its opener on dismiss. Keyboard Escape closes only the unsent review sheet. Reduced-motion preference removes optional transitions.

The final eligibility policy and jurisdiction-specific wording require review before deployment; the mock cannot certify legal suitability. Do not infer a user's location from wallet address or use a mere visual disclaimer as a substitute for a required eligibility gate. Keep the hero concise: detailed eligibility and non-advice copy belong at review and in a reachable explanation.

## 5. Component and catalog proposal

Reuse `IdentityProofRail`, `VerifiedFactList`, `DataStateNotice`, `StatusMark`, registry lookup, locale structure, and coverage strip where their semantics remain valid. New named families before page composition: `TokenSelect` (exact identity), `SwapAmountField`, `SwapQuoteDetails`, `RouteAvailabilityNotice`, `SwapReviewSheet`, `TransactionProgress`, and `TransactionReceipt`. The existing `WalletSection` is read-only holdings, **not** a trade signer; do not repurpose its label or silently mount a wallet provider globally. Follow the repository's current `/dev/ui-catalog` development-only route for specimen variants.

Catalog specimens should cover disconnected and connected wallet, amount error, quote loading, fresh/expired quote, no verified pool, temporarily unavailable quote, review, wallet reject, pending/unknown confirmation, failed transaction, confirmed receipt, long company name/full mint, source-backed facts, no facts, and all three independent coverage labels. Fixtures are deterministic and must not trigger a real transaction or imply a real-time market price.

## 6. Screenshot and review rubric

The builder provides **real browser** evidence; the independent critic compares it to the image at the same `1506 × 1045` viewport and also reviews `1440 × 1000` and `390 × 844`.

| Evidence | Non-substitutable check |
| --- | --- |
| Desktop `1506 × 1045`, quote idle | Compare macro two-column proportion, swap primacy, token/proof hierarchy, visual restraint, density, and typographic treatment against this mock. Verify no false live numbers. |
| Desktop `1440 × 1000`, quote ready | Selected token, amount, live receive/minimum, route, impact, fees, expiry, wallet gate, and review action visible and legible. Source facts retain a lower hierarchy. |
| Mobile `390 × 844`, quote idle/ready | Swap CTA encountered before deep data; one page scroll, no horizontal overflow, usable full mint, visible field labels and ≥44 px controls. |
| No route vs no facts vs unsupported mint | Three genuinely different messages and statuses; no route cannot reach signing, absent facts do not erase a valid trade route. |
| Expired quote and review | Timer/expiry visible; expired review disabled; confirmation sheet includes exact mints, minimum receive, fees, slippage, network, wallet, issuer/DEX distinction, eligibility notice/gate, and safe cancel. |
| Wallet rejected, pending, unknown, confirmed | No premature success, no duplicate submission, explicit recovery, signature-linked confirmed receipt. |
| Keyboard, 200% zoom, reduced motion | Logical tab order, visible focus, modal focus return, no clipped value/source/CTA, no mandatory animation. |
| Secondary consumers | Stock detail, registry, multilingual shell, local MCP setup, and read-only holdings retain their existing factual behavior and do not acquire misleading trade labels. |

The mock is **not** evidence for any of those runtime behaviors. Check actual loaded route and transaction states with safe deterministic fixtures first. No live trade or external publication is authorized by this design proposal.

## 7. Designer disposition and acceptance request

Three project-bound images were generated and registered. The first was rejected because it depicted third-party logos, an invented Wikipedia link, and mixed verification semantics. The second removed those visuals but still showed verified badges beside missing values and unnecessarily blocked quoting on wallet connection. The third image above is the latest mechanical `current` and the **designer-selected proposal**. It resolves those issues enough for visual-direction review; the exact corrections in Section 3 are authoritative over remaining image text.

The explicit human choice requested is whether to accept this **purchase-first composition and visual direction**, including the specified semantic corrections, for local UI implementation. `review_pending` is not direct-human acceptance, and this file grants no deploy, publish, push, submission, live trading, credential, or issuer-onboarding authority.
