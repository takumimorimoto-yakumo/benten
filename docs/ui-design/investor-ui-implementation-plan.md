# Investor UI implementation plan

Status: **proposed implementation plan; independent review is recorded separately against the artifact digest; no UI implementation, dependency generation, preview, runtime acceptance, or direct-human design acceptance has occurred** (2026-09-16).

## 0. Authority, scope, and precedence

This document is the proposed implementation SSOT for the investor-facing information UI in `apps/public-web`. The companion [investor journey plan](investor-journey-plan.md) owns the proposed information hierarchy, user journeys, route intent, state language, and later design acceptance. This document owns the future file layout, shadcn foundation procedure, data projection, work order, tests, rollback, and commit boundaries. After independent closure, its reviewed revision becomes implementation-ready; until then it authorizes no build. If the journey plan changes a route or required state, update this implementation plan before building; do not maintain two executable DAGs.

The later [mobile investing implementation plan](../../specs/mobile-investing-implementation-plan.md) owns the proposed Portfolio/Activity expansion and Web-to-native sequence. This document remains authoritative for the initial Web Home/Dossier foundation and its canonical subcapsules. Mobile Portfolio work references those capsules rather than renaming them, while SwiftUI/Compose work has separate platform gates and never consumes shadcn files.

The current repository state is authoritative where it differs from a historical proposal:

- `apps/web` is the current custom-CSS application. It is not a component or styling source for the rebuild.
- `apps/public-web` is a React Router `7.18.4`, React `19.2.7`, Vite `8.3.0`, Tailwind `4.3.3` static-delivery capsule. It renders placeholder Home and Dossier text only.
- shadcn CLI `4.21.0` is installed app-locally, but there is no `components.json`, generated `components/ui`, UI test environment, or accepted browser screen. CLI presence is not a UI foundation.
- The generated 775 documents are five Homes plus `154 × 5` Dossiers. They prove route enumeration and static artifacts, not a finished page, interaction, accessibility, or visual quality.
- Current Benten remains snapshot/read-only and no-sign/no-send. This plan does not authorize a wallet, quote, transaction, RPC, API, deployment, or contest submission.

This pass is IA and implementation planning only. It creates no image because the user explicitly selected an implementation-first review for the initial informational Home and Dossier. That exception does not accept any old image and does not waive independent review of the future real browser UI. The purchase workspace remains subject to its separate accepted interaction/design and transaction gates.

## 1. Fixed decisions and unresolved gates

| Classification | Decision |
| --- | --- |
| User-confirmed | Investor is the primary audience; DBC/operator tooling is secondary and must not interrupt the ordinary browse-to-dossier journey. |
| User-confirmed | Use suitable official shadcn-generated default primitives. Do not add a bespoke palette, font, decoration, logo treatment, or copied legacy styling. |
| User-confirmed | Information architecture precedes page composition. Future real browser output, not a generated mock, is the review surface for initial Home/Dossier. |
| Current fact | Existing canonical informational routes are `/`, `/{locale}`, `/stock/:ticker`, and `/{locale}/stock/:ticker`, where supported non-English locales are `ja`, `ko`, `zh-Hans`, and `zh-Hant`. |
| Current fact | The catalog contract exposes identity and coverage. It does not expose sector, current price, change percent, ranking, recommendation, or an acquisition-ready route. |
| Recommended | Preserve the existing Home/Dossier URLs for the first real UI. Treat Home as catalog-first. Comparison is optional and may not become a mandatory step to reach a Dossier. |
| Recommended | A future `/markets` family is a noncanonical 308 alias to the locale Home and preserves only validated compatible browse query. Do not add `/company/:id`, `/market/:provider/:asset`, `/purchase`, `/dbc/:id`, or `/developers` until the accepted IA contract for that family has a strict DTO and route/static/release tests. |
| Recommended | A compare-only instrument receives an honest capability explanation and next action, not a disabled or misleading Buy control. A purchase control is absent until the exact route is activated by the purchase contract. |
| Unverified gate | shadcn CLI `4.21.0` output with the pinned React Router/Vite/Tailwind graph must be regenerated in a disposable, reviewable app-local spike and pass build, license, lockfile, accessibility, and bundle checks before adoption. |
| Recommended, unverified | Keep Vitest `5.0.0` for pure tests; add app-local Testing Library React + user-event with jsdom for deterministic component interaction, and Playwright through the Vitest browser provider for real Chromium behavior/screenshots. `UI-F0` pins exact resolved versions only after React `19.2.7`/Vite `8.3.0`/Vitest `5.0.0` compatibility, license, install and discovery pass; failed compatibility returns to a measured alternative instead of weakening tests. |

## 2. Investor journeys and executable scenario fixtures

These six scenarios are frozen before page code. Every scenario gets one locale-aware fixture, component/route test, and future browser evidence. Synthetic fixtures test presentation only and never become public facts, purchase readiness, or transaction evidence.

| ID | User scenario | Fixture | Component / route | Required browser evidence |
| --- | --- | --- | --- | --- |
| `UI-SC-01` | An unconnected first-time visitor sees a useful registry list without searching, opens a Dossier, and never encounters a wallet gate. | `catalog-default.v1.json`: reviewed identity/coverage projection, at least one verified, legacy, no-data, and excluded entry | Home catalog → current canonical Dossier | initial list, semantic heading/table-or-list, working detail link, no wallet/RPC request |
| `UI-SC-02` | A visitor filters by known ticker `NVDA`, opens the exact Dossier, then Back restores query, page, focus context, and scroll. | `catalog-query-nvda.v1.json` plus strict query cases | Home query reducer, result list, Dossier return link | URL query survives navigation; Back restores page/scroll; result count is announced |
| `UI-SC-03` | An instrument with incomplete facts or no purchase support remains readable and explains what is known, unknown, and possible next. | `dossier-no-verified-facts.v1.json`, `dossier-compare-only.v1.json` | Dossier identity, coverage, source, capability notice | no invented value or disabled faux order form; source/coverage and safe next action remain visible |
| `UI-SC-04` | Provider, quote, RPC, or purchase service is unavailable while bundled snapshot facts remain usable. | `dynamic-services-unavailable.v1.json` joined to an unchanged static Dossier | Dossier facts boundary and independent dynamic capability region | facts remain; dynamic failure is localized; retry/reload copy does not imply an order or erase facts |
| `UI-SC-05` | Future purchase recovery distinguishes pre-sign orphan/rejection, signed-but-unsent reload/expiry, send-unknown/reorg, finalized failure, holdings-unverified, corrupt/unavailable storage, and the undetectable full-erasure limit; none silently resends. | the receipt-state fixtures in §3.5, derived only after `PX-F0b/PX-U0` | future Purchase Intent workspace, not initial Home/Dossier | exact fact/next action/new-intent rule per state; current informational build has no active purchase CTA |
| `UI-SC-06` | The same required information and next action work on desktop, 390 px mobile, Japanese at 200% text, and keyboard-only navigation. | each preceding fixture in `ja` plus longest reviewed locale strings | shell, Home, Dossier, future accepted purchase workspace | `1440×900`, `390×844`, 200% text, visible focus, deterministic order, no page-level horizontal scroll |

`UI-SC-05` is a future transaction consumer test. Its inclusion in IA does not permit transaction code. Initial informational UI acceptance covers its honest unavailable boundary only.

## 3. Route and state contract

### 3.1 Initial route manifest

The first implementation changes the content of existing routes without increasing the static path set:

| Route family | Current purpose | First UI purpose | Explicit non-goal |
| --- | --- | --- | --- |
| `/`, `/{locale}` | static Home capsule | catalog-first Markets/Home with visible default list, strict query/filter/page state | wallet connect, personalized portfolio, price ranking |
| `/stock/:ticker`, `/{locale}/stock/:ticker` | static Dossier capsule | exact allowlisted instrument identity, coverage, sourced facts, rights/capability boundary | inferred company identity, purchase claim, live route inference |

The route source remains `apps/public-web/app/routes.ts`; prerender paths remain derived from the registry. The count remains computed, not hardcoded as a market-size invariant. Existing lowercase aliases, malformed paths, unsupported locales, encoded slashes, and unknown tickers retain the architecture's 308/404 rules.

### 3.2 Optional comparison and future purchase

Comparison must not be a mandatory journey step. The **first informational Home/Dossier implementation has no compare basket, selection checkbox, selected set, comparison-set URL/storage, or `Compare instruments` CTA**. Back/locale restoration covers only `q`, factual filters, sort, page, focus context, and scroll. The accepted route recommendation keeps `/` and the four non-English locale Homes canonical. A future `/markets` and locale equivalent issues a 308 to that same Home, preserving only keys and values accepted by the common closed browse parser; it does not render or own another catalog.

The selected PreStocks/Tessera sponsor lane is not deleted by that first-slice decision. Its later optional `/company/:company_id` comparison is produced automatically from the reviewed identity artifact: all and only provider instruments bound to the same exact `company_id`, each retaining provider, asset kind, mint, rights, units, source, and observation time. When that reviewed group contains at least two instruments, a Dossier or sponsor-lane link may expose `View related instruments`; one instrument retains its ordinary Dossier/sponsor route without a comparison CTA. The user does not hand-build a basket. A multi-company or manually selected comparison basket is outside P0. Before enabling this route, the provider artifact owner supplies the strict group projection and route manifest; `UI-P0` validates identity cardinality and no cross-company/provider aliasing. The optional route then preserves only its canonical `company_id` and ordinary Back/locale context, not a selected set.

The accepted IA reserves a future dynamic `/purchase` family, not `/purchase/:intent_digest`. Wallet, amount, attempt ID/generation, intent digest, quote, signature, and status never enter public query parameters. Reload/Back and recovery use the existing bounded client receipt, wallet+genesis lock, attempt generation, and send-phase contract; there is no later choice of a different public or server recovery handle. The user-visible mapping is fixed in §3.5 and the designer-owned IA table. No current route exposes a Buy CTA.

### 3.3 Home query state

Recommended initial query keys are `q`, `coverage`, `source`, `sort`, and `page`. Implement them as a pure closed parser/serializer with one canonical ordering. On canonical Home, an unknown or repeated key, an unknown enum, overlong or invalid-Unicode text, or an out-of-range/non-integer page renders the unfiltered first page with an explicit “filters could not be applied” notice and a link to the clean canonical URL; it never silently reinterprets the value or passes it to registry resolution. Malformed/unknown **path segments** remain 404 and known path aliases retain 308 behavior. The future `/markets` alias issues 308 only for a query the closed parser accepts, preserving its canonical serialization; invalid alias query renders an explanatory bad-parameters response with a clean canonical-Home link rather than redirecting ambiguous state.

Permitted presentation operations use only real catalog fields:

- text match over reviewed ticker, symbol, token name, underlying company when present, and exact full mint;
- coverage/source filters over existing `CoverageState` fields;
- deterministic sort by ticker or token name, with ticker as the final tie-breaker; coverage/source remain factual filters, not ranking axes;
- page size 20, bounded against the filtered result count.

Do not add sector, price, change percent, valuation, popularity, score, recommendation, or issuer-rights inference. Exact mint entry can select a result but is not the primary first-visit experience.

### 3.4 State taxonomy

The domain state owner is app code, not primitive variants. At minimum:

- catalog: `default`, `filtered`, `zero_results`, `invalid_query`, `restored_from_history`;
- identity: `exact_allowlisted`, `malformed`, `unknown`, `canonical_redirect`;
- facts: `verified`, `legacy_only`, `no_data`, `source_unavailable`;
- capability: `compare_only`, `route_unassessed`, `route_unavailable`, future `purchase_supported` only from an accepted policy artifact;
- delivery: `development_preview`, `reviewed_candidate`, `released_information`;
- dynamic region: `idle`, `loading`, `unavailable`, `stale`, future contract-derived positive states.

The UI must render a next action for every state. Color alone, blank space, spinner-only failure, zero-like placeholders, and catch-all “error” copy are rejected.

### 3.5 Purchase receipt to recovery action

This table is a presentation projection of [user-authorized browser execution v1 §§4–5](../../specs/contracts/user-authorized-browser-execution-v1.md); it does not rename or relax the receipt state machine.

| Contract receipt / condition | Fact shown to the user | Only primary recovery action | New intent permitted? | Future fixture |
| --- | --- | --- | --- | --- |
| `pre_sign_active`, current prompt owned | Benten has no recorded signature or submission; the current wallet review remains open. | Return to/await that one owned wallet prompt. | No parallel intent. | `purchase-wallet-prompt-owned.v1.json` |
| `pre_sign_active` orphan after reload/crash | Benten has no recorded signed transaction or submission for the interrupted review. | Fence and explicitly abandon the old generation; never act on a late callback. | Only after fenced abandonment and acknowledgement. | `purchase-pre-sign-orphan.v1.json` |
| `pre_sign_aborted` / wallet rejection | The wallet did not approve and nothing was submitted. | Acknowledge, then request fresh conditions and review. | Yes, after acknowledgement and a fresh generation. | `purchase-wallet-rejected.v1.json` |
| `signed_ready_to_send` in the original live callback | The exact wallet approval was recorded; submission of that same in-memory transaction is in progress after lock/generation/expiry revalidation. | Noninteractive submitting state; no second click, signature, or intent. | No. | `purchase-signed-live-callback.v1.json` |
| `signed_ready_to_send` observed after reload/crash | A signature was derived, but signed bytes were ephemeral and no send was invoked. Reload cannot resume the send. | Fence it as `signed_rejected_unsubmitted`, discard the attempt, then start a new context/review/wallet gesture. | Only after that rejection/acknowledgement transition. | `purchase-signed-unsent-reload.v1.json` |
| `signed_rejected_unsubmitted` / post-sign expiry or mutation | The signed transaction was not submitted and cannot be reused. | Acknowledge and start fresh conditions/review. | Yes, with a fresh generation; never send the old bytes. | `purchase-signed-unsent-expired.v1.json` |
| `submission_unknown` | A send was invoked for the displayed exact signature; success or failure is not yet known. | Check only that signature on the pinned cluster. | No. | `purchase-submission-unknown.v1.json` |
| `confirmed` or `reorg_or_dropped` | Confirmation is provisional, or the observed transaction regressed; neither is a final failure. | Continue same-signature finality reconciliation. | No. | `purchase-confirmed-reorg.v1.json` |
| `finalized` before causal holding verdict | The exact transaction finalized, but purchase completion is not yet proven. | Verify transaction effects and causal output holding. | No. | `purchase-finalized-awaiting-holding.v1.json` |
| `chain_failed` with exact finalized metadata | The exact transaction finalized with an onchain failure; it did not complete the purchase. | View failure evidence, acknowledge, then begin a fresh review if desired. | Yes, because exact finalized failure releases the lock. | `purchase-finalized-failure.v1.json` |
| `holdings_unverified` | The transaction finalized, but causal output/ceilings could not be verified; this is not success. | Retry read-only verification for the same signature or inspect its evidence. | No; the lock remains. | `purchase-holdings-unverified.v1.json` |
| `holdings_verified` | The finalized transaction and causal output holding match the audited receipt. | View the receipt/holding evidence or return to Dossier. | Yes; verified holding releases the lock. | `purchase-holdings-verified.v1.json` |
| storage unavailable, partial, or `corrupt_local_state` | The app cannot safely prove its local attempt state and disables purchase. | Repair/restore storage if possible and reconcile wallet/explorer history; no send. | No from this state. | `purchase-storage-unavailable.v1.json` |
| complete same-origin storage erase or another browser/device | The app cannot detect or reconstruct the prior local attempt and cannot promise cross-profile exactly-once. | Before any later purchase, require the user to reconcile wallet/explorer history; never claim “no previous transaction.” | Not automatically authorized; outside the local guarantee and subject to fresh review. | `purchase-storage-erased-limit.v1.json` |

Fixtures assert the displayed fact, primary action, lock/new-intent rule, and zero automatic wallet/send calls. They remain synthetic consumer evidence until the normative purchase dependencies and runtime QA pass.

## 4. Data projection and isolation

### 4.1 Build-only DTOs

Add one strict build-only public Web projection; do not serialize registry JSON or full snapshots into browser bundles.

```ts
type PublicCatalogItemV1 = {
  ticker: string;
  symbol: string;
  token_name: string;
  underlying_company: string | null;
  mint: string;
  issuer: string;
  issuer_verified: boolean;
  token_program: string;
  registry_as_of: string;
  filing_eligibility: string;
  snapshot_status: string;
  source_status: string;
  capabilities: {
    fundamentals: "available" | "no_data";
    pl: "available" | "no_data";
    bs: "available" | "no_data";
    cf: "available" | "no_data";
  };
  exclusion_reason: string | null;
};
```

The exact union values come from the public registry contract rather than copied literals. A Dossier projection adds only exact public identity, coverage, approved fact rows, their period/source references, `artifact_revision`, and `web_release_id`. It does not add provider secrets, private analyses, raw registry records, wallet state, quote state, or an execution capability inferred from a mint.

Projection tests reject unknown keys, nested unapproved values, non-finite numbers, overlong strings, unsupported locale/status values, and a mismatched release/artifact pair. Browser import-graph tests continue to reject facts API runtime, RPC, wallet, DEX, database, internal/private modules, and raw snapshots.

### 4.2 Static versus refreshed data

Initial Home/Dossier information is build-time static. It must remain usable without a product session. A later explicit refresh of provider or market evidence uses the reviewed BFF session/nonce/admission contracts and a visually separate dynamic region. It cannot overwrite identity or snapshot facts, and one failed card cannot remove other sourced cards. No unbounded parallel refresh is permitted.

### 4.3 Release skew and navigation

Retain the `web_release_id` + `artifact_revision` guard from the architecture. If React Router cannot prove safe root/leaf data consumption across navigation and prefetch, use full-document navigation. Preserve safe query state on a bounded reload, never loop, and show a manual recovery state after the first failed reload. A successful 775-path build does not prove this behavior.

## 5. Official shadcn foundation

### 5.1 Candidate configuration, not an installed fact

`UI-F0` should reproduce the observed CLI default for the pinned stack, then review the generated result. The expected candidate is:

```json
{
  "style": "base-nova",
  "rsc": false,
  "tsx": true,
  "tailwind": { "css": "app/static.css", "cssVariables": true, "baseColor": "neutral" },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "~/components",
    "ui": "~/components/ui",
    "utils": "~/lib/utils",
    "lib": "~/lib",
    "hooks": "~/hooks"
  }
}
```

The dated primary references are the official [React Router installation](https://ui.shadcn.com/docs/installation/react-router), [`components.json` contract](https://ui.shadcn.com/docs/components-json), and [Base UI Data Table recipe](https://ui.shadcn.com/docs/components/base/data-table), rechecked 2026-09-16. The recipe confirms that Data Table is a Table plus headless logic, not a generated Benten domain component.

The exact schema/output must be accepted from CLI `4.21.0` and official documentation; this excerpt is not permission to hand-author generated files. Base UI is the observed primitive base. Do not silently switch to `new-york`, Radix, or a rolling `@latest` result.

Before adoption, run app-local init/add in a disposable branch/worktree or reversible change set. Record:

- exact CLI binary path/version, Node/pnpm versions, command/options, working directory, and official documentation URLs/date;
- `components.json`, generated source/CSS, dependency/package/lock diff, license/SBOM, file hashes, and import reachability;
- build/typecheck/test/browser result and any generated default that violates the no-customization or accessibility constraints;
- a digest-bound primitive catalog fixture and the reason for every generated primitive.

Generated CSS variables and official component CSS are permitted. “No custom CSS” means no bespoke visual token, selector, palette, font, decoration, geometry, or legacy stylesheet; it does not mean removing the official generated CSS or forbidding Tailwind layout utilities. Accessibility repairs are allowed but must be documented and independently reviewed.

### 5.2 Primitives and domain composites

Use the smallest applicable official primitive set:

| Consumer | Official primitives, subject to `UI-F0` | Domain composite |
| --- | --- | --- |
| App shell | `Button`, `Separator`, optional `Sheet`, `Breadcrumb` | `site-shell`, locale/navigation/release label |
| Catalog controls | `Input`, `Select`, `Button`, `Badge` | `catalog-query-controls` |
| Catalog results | `Table`, `Pagination`, `Skeleton`, `Alert` | `market-catalog`, `catalog-result-row`, `coverage-state` |
| Dossier | `Card`, `Badge`, `Separator`, `Alert`, optionally `Accordion` | `token-identity`, `fact-with-source`, `route-capability`, `product-rights-notice` |
| Exact-value action | `Button`, optionally accessible `Tooltip`/toast primitive if accepted | `copy-exact-value`; copies full value and announces success/failure |
| Future purchase | `Field`, `Label`, `Input`, `Button`, `Card`, `Alert`, `Accordion`, `Sheet`/`Dialog`, `Skeleton` | purchase contract state consumers only after its gates |

The official Data Table recipe is a composition of Table and headless table logic, not a finished domain component. Start with the official Table plus a pure Benten query/page reducer. Add a headless table dependency only if `UI-F0` proves its pinned version, lock/license/bundle cost, keyboard/announcement behavior, and actual need. Do not install it by implication.

No generic primitive owns issuer meaning, fact verification, rights, route readiness, advice language, locale copy, or transaction state. Those decisions remain in typed domain composites.

## 6. Future file layout and dependency direction

```text
apps/public-web/
  components.json                         # generated/reviewed in UI-F0
  app/
    components/
      ui/                                 # official generated primitives only
      domain/
        site-shell.tsx
        market-catalog.tsx
        catalog-query-controls.tsx
        catalog-result-row.tsx
        token-identity.tsx
        coverage-state.tsx
        fact-with-source.tsx
        route-capability.tsx
        product-rights-notice.tsx
        copy-exact-value.tsx
      catalog/                            # local Living Catalog routes/fixtures
    lib/
      catalog-query.ts
      public-web-projection.server.ts
      release-guard.ts
      ui-release-state.ts
    routes/
      home.tsx
      locale-home.tsx
      dossier.tsx
      locale-dossier.tsx
    static.css                            # Tailwind + reviewed generated variables only
  tests/
    fixtures/ui/*.json
    catalog-query.test.ts
    public-web-projection.test.ts
    ui-scenarios.test.tsx
    ui-browser.spec.ts                    # after the selected browser harness exists
packages/public-copy/                     # existing A0a planned owner, five-locale approved messages
```

Dependency direction is `registry/build input → strict Web projection → domain composite → generated primitive`. Routes compose domain components. Generated primitives never import a domain package. Client code never imports the registry, snapshot, server projection, RPC, wallet, DEX, private package, or API runtime.

Do not copy `apps/web` components, markup, CSS, fonts, palette, or wallet code. Keep the old app available until the existing K0/N0 cutover and rollback gates close.

### 6.1 Mobile Portfolio/Activity overlay

The initial Home/Dossier capsules above remain wallet-free. The later [mobile investing plan](../../specs/mobile-investing-implementation-plan.md) is the only executable registry for Portfolio/Activity and adds `MOB-D1 -> WEB-M0/PORT-* -> MOB-S0/V0/H0 -> PX-E0 -> MOBILE-RC -> K0`. It reuses accepted `UI-F0`, `UI-S0`, `UI-H1` and `PX-U0/U1/QA`; it does not mark them complete.

After those prerequisites, the future public-Web layout may add exactly ten prerendered empty shells: `/portfolio`, four localized Portfolio paths, `/activity`, and four localized Activity paths. Personal data stays client-only; paths/query/HTML/build artifacts contain no wallet, holding, target, receipt or signature. The route count then derives as 785 rather than altering the protected 775 baseline retroactively. Locale/path/404 rules remain the same and `/en` remains invalid.

Only `apps/public-web/app/features/portfolio-client/**` receives a reviewed **read-only account and fixed-RPC import exception**. Its account facade exposes account+chain selection but no transaction feature; import-graph tests reject sign/send, keypair/seed/delegate, provider SDK and private-package reachability. The existing purchase island remains the only eventual signing/sending scope. The lossy current holdings helper is prohibited. Exact RPC/method/cap/cohort/decode and IndexedDB rules live in the mobile plan §§4–6. Before connection, the UI names the approved RPC and explains that it receives the public wallet address/account references and can observe the user's IP; target/receipt state is not sent. `Activity` reads a strict projection of the accepted purchase receipt and never creates another authoritative receipt store.

## 7. Development and preview boundary

Since the 2026-09-24 lifecycle revision, the root `pnpm dev` builds and starts the public Web (`apps/public-web`) together with the standalone facts API (`apps/public-api`) through `scripts/run-local-stack.mjs`; ports default to OS-assigned loopback ports and may be bound for one run with `BENTEN_LOCAL_STACK_WEB_PORT` and `BENTEN_LOCAL_STACK_API_PORT`. The legacy Next app `apps/web` is started only by the explicitly named `pnpm dev:legacy-web`. The development-only Living Catalog runs through `pnpm --filter @benten/public-web dev:catalog` and is never part of a build.

Every non-released public-Web runtime displays a factual official-default `Badge` derived from a build-safe `UiReleaseState`: `development_preview` or `reviewed_candidate`. The label is not a client-controlled query/env flag and never leaks private deployment data. A preview URL, local screenshot, or build capsule must not be presented as production.

No **initial Home/Dossier** state connects a wallet. Future purchase capability is mounted only inside the accepted purchase island after its safety gates pass. The later Portfolio overlay may connect a wallet solely through the separately reviewed read-only account facade after `PORT-O0/L0`; that does not authorize signing/sending and does not change the initial informational unit.

## 8. Testing and acceptance

### 8.1 Test layers

| Layer | Required proof |
| --- | --- |
| Pure unit | closed query parser/serializer; stable sort/tie-break; 20-item page bounds; DTO projection; locale lookup; release state; exact copy payload |
| Component interaction | six scenario fixtures; keyboard focus/order; result-count announcement; filter/page/Back restoration; copy success/failure; source link; every empty/degraded state and next action |
| Static/build | all derived paths and HTML/data pairs; canonical/alternate metadata; no catch-all fallback; bundle/import deny; no full snapshot; release/artifact binding |
| Browser | `1440×900`, `390×844`, Japanese 200%, keyboard-only, five locales, native/full navigation fallback, Back/scroll restoration, 404/308, manual recovery after skew/error |
| Independent visual QA | a different design reviewer inspects real screenshots and interactions against accepted IA, official defaults, mobile/zoom/a11y rubric; builder cannot approve its own output |
| Direct human acceptance | user reviews the real Home/Dossier and accepts or requests revision; technical/independent pass is not human satisfaction |

The current Vitest environment is Node-only. `UI-F0` must compare and pin a component/browser test option, record why it works with React `19.2.7` and Vitest `5.0.0`, and prove actual test discovery. Dependency installation success is not interaction proof.

### 8.2 Acceptance thresholds

- All six `UI-SC-*` scenarios map to a fixture, test ID, route/component, and evidence file.
- No display field lacks a public DTO source and locale string owner.
- No unaccepted route, wallet, Buy control, live price, ranking, or advice appears.
- Desktop/mobile/Japanese 200% retain the same decisions and next actions; responsive layout may differ.
- Keyboard operation has visible focus, semantic headings/labels, correct table headers/sort state, focus return, and live announcements where state changes.
- No page-level horizontal scroll at 390 px or 200% text; full mint/value remains accessible without visual truncation becoming the copied value.
- Facts remain visible under dynamic service failure.
- Existing path/artifact tests still prove the computed set; a count alone is never accepted as visual completion.

## 9. Work packages and canonical DAG mapping

These are implementation capsules under the existing canonical nodes, not a second release DAG.

| Capsule | Canonical node | Dependencies | Owner / allowed paths | Output and approach | Tests / acceptance | Abort / rollback | Commit boundary |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `UI-C0` contract freeze | `C0` | accepted journey-plan revision | design+architecture owners; this plan and route/fixture manifest only | freeze six scenarios, source fields, initial route set, requirement matrix | link/path/DAG/schema review | unresolved data/route authority stops component work | docs only |
| `UI-F0` official foundation | `F0-W` | `UI-C0`; current app pins | one Web foundation writer; `apps/public-web/components.json`, generated `components/ui`, CSS, dependency/lock/test config | reproducible CLI preflight, provenance, minimal primitive catalog, interaction harness choice | build/typecheck/discovery/license/SBOM/bundle and primitive a11y | revert the entire generated unit; static capsule remains | generated foundation + its tests only |
| `UI-P0` projection/query | `W1/S0` | `UI-C0`, public-data contract | Web data writer; server projection/query/tests | strict slim catalog + dossier projection and pure query/history model | unknown-field/data-leak/query property/fixture tests | reject projection; current placeholder remains | pure data/query + tests |
| `UI-L0` locale copy | `A0a` | `UI-C0`, accepted copy | copy/scanner owner; planned `packages/public-copy/**` | five-locale state/label catalog with scanner registration | missing/tamper/meaning parity/long-string tests | omit unapproved sentence; never inline copy | copy package + scanner evidence |
| `UI-S0` shell | `S0` | `UI-F0,UI-P0,UI-L0`; accepted IA hierarchy | one Web shared-file writer; root/routes/shell/release guard | official-default shell, current routes, preview label, release guard | static/route/skew/keyboard shell tests | revert shell unit; old app untouched | shell/shared route unit |
| `UI-H0` Home | limited informational sub-artifact of existing `U0` | `UI-S0`; relevant IA accepted | Home/domain writer | catalog-first list, query/filter/page, result announcements, navigation/Back context; no compare basket | `SC-01,02,03,06`; browser evidence | remove new Home components; preserve S0 | Home/domain/tests; does not close `U0` |
| `UI-D0` Dossier | limited informational sub-artifact of existing `U0` | `UI-S0`; relevant IA accepted | Dossier/domain writer | exact identity, coverage/facts/source/capability boundary | `SC-01,03,04,06`; source/copy/404 tests | remove Dossier unit; preserve Home/S0 | Dossier/domain/tests; does not close `U0` |
| `UI-I0` integration/recovery | `U0` integration evidence (input to canonical `R0`) | `UI-H0,UI-D0`, A0b facts boundary | release QA owner; tests/evidence only unless scoped fix | skew, dynamic outage, Back/scroll, locales, legacy/current separation | all informational scenarios; no regressions in computed paths | no cutover; return to exact owner capsule | QA/fixes by owning unit |
| `UI-V0` independent informational QA | partial evidence toward existing `V1` | `UI-I0`, accepted IA rubric | independent designer; screenshots/ledger | browser visual/interaction review of initial Home/Dossier | blocking findings closed and re-reviewed | return to exact owner capsule | cannot close `V1`; sponsor consumers remain required |
| `UI-H1` human informational review | partial evidence toward existing `D2` | `UI-V0` | product/user | real Home/Dossier acceptance or revision request | explicit disposition, not inference | revise and repeat QA | cannot close `D2`; selected full journey remains required |
| `D1-PX` purchase design | purchase `D1-PX` | `PX-C0,PX-F0a` exactly as purchase plan | design owner; design/fixture docs only | purchase state/recovery interaction acceptance, including §3.5 | design acceptance only; no synthetic ready | return to design | evidence only; no Web build |
| `PX-U1` purchase Web | purchase `PX-U1` | `D1-PX,PX-U0,S0` exactly as purchase plan | separate purchase Web writer/island | contract-derived Purchase Intent; no synthetic-ready promotion | `SC-05,06` plus purchase security/runtime QA | feature remains absent/off; informational UI stays | separate purchase unit |

The executable dependency edges are:

```text
UI-C0 -> {UI-F0,UI-P0,UI-L0}
{UI-F0,UI-P0,UI-L0,IA-ACCEPTED} -> UI-S0
UI-S0 -> {UI-H0,UI-D0}
{UI-H0,UI-D0,A0b} -> UI-I0
UI-I0 -> UI-V0
UI-V0 -> UI-H1
{PX-C0,PX-F0a} -> D1-PX
{D1-PX,PX-U0,S0} -> PX-U1
```

`IA-ACCEPTED` is the accepted revision of the designer-owned journey plan, not a fabricated Work Graph ID. `UI-H0/D0/I0/V0/H1` are sub-artifacts/evidence: none marks canonical `U0`, `V1`, or `D2` complete. Those parent gates still require the selected provider/DBC consumers and full investor journey defined by the selected-tracks plan. Home and Dossier may be implemented in parallel only after the shared shell files are frozen and ownership is disjoint. A single writer serializes root, route manifest, shared CSS, locale catalog, and lockfile changes.

## 10. Schedule, cut rules, and quality protection

Fixture design, `UI-F0` compatibility work, strict projection work, and textual IA may proceed in parallel; material page composition waits only for the relevant accepted IA hierarchy, not for live backend completion. Backend fixtures let informational and unavailable states be completed first.

The current contest schedule remains:

- Sep 22 20:00 JST: feature freeze. No new route, primitive, contract, dependency, or state after this boundary.
- Sep 22 20:00–Sep 24 20:00 JST: protected UI/UX window. UI defects and release-blocking safety repairs are allowed by their owner; feature additions and contract expansion are not. Sep 23 includes the first investor journey validation, load/safety/cost result review, and fix triage rather than postponing discovery to Sep 24.
- Sep 24 20:00 JST: release candidate and demo/video evidence revision.
- Sep 25 20:00 JST: evidence packet freeze, nine hours before the current Sep 26 05:00 JST deadline.

If capacity slips, cut optional breadth in this order: extra filters/sorts, standalone comparison route, extra catalog domains, additional symbols, P1 live quote, advanced operator presentation. Do not cut the selected sponsor proofs and call them complete; do not cut the six scenario acceptance, safety boundaries, 48-hour UX window, mobile/zoom/keyboard QA, or independent review. Missing mandatory proof returns the RC claim to unavailable.

## 11. Operational, cost, and rollback decisions

- Initial informational UI adds no database, session storage, local-storage identity, paid service, RPC, or server process. Static artifacts remain the source.
- Unknown dependency/provider/hosting price is not zero. Any future test/browser or component dependency needs a measured install/CI/bundle/license impact and the existing monthly-cost gate; this plan purchases nothing.
- Each logical unit has a reviewed reversal procedure: foundation, projection/query, copy, shell, Home, Dossier, purchase. Do not mix generated foundation/lock changes with page composition or purchase behavior.
- Old `apps/web` remains the protected current runtime through K0/N0. It is not called a proven safe rollback for a promoted release until K0/N0 test and authority gates accept the exact rollback procedure. A failed pre-cutover public-Web candidate is withheld; it does not trigger deletion or an unreviewed hybrid UI.
- No deployment follows from local build acceptance. Host configuration, public URL, promotion, and old-app retirement retain their separate authority.

## 12. Requirement traceability

| Requirement | Contract / source | Future path | Capsule | Test/evidence | Hard stop |
| --- | --- | --- | --- | --- | --- |
| `UI-01` catalog-first unconnected visit | journey plan + public read model | Home/domain catalog | `UI-P0,H0` | `SC-01`, projection and browser test | no default list or wallet starts |
| `UI-02` strict query/Back/scroll | this §3 + vNext T-02 | `catalog-query.ts`, Home | `UI-P0,H0` | `SC-02`, history/browser test | lost/misparsed state |
| `UI-03` truthful incomplete/compare-only | public-data and capability contracts | Dossier composites | `UI-D0` | `SC-03`, state fixtures | invented value/CTA |
| `UI-04` facts survive dynamic outage | snapshot isolation | Dossier dynamic boundary | `UI-I0` | `SC-04`, outage E2E | facts erased or joined failure |
| `UI-05` transaction states/no resend | purchase contract | future purchase island | `PX-U1` | `SC-05`, transaction QA | any auto-resend or synthetic ready |
| `UI-06` responsive/a11y parity | accepted IA rubric | all components | `UI-H0,D0,V0` | `SC-06`, screenshots/keyboard/AT | missing decision/next action |
| `UI-07` official-default foundation | user decision + official docs | `components.json`, `components/ui`, CSS | `UI-F0` | provenance/build/license/catalog | hand-authored/cross-app styles |
| `UI-08` current route/static integrity | vNext routing contract | routes/prerender/host | `UI-S0,R0` | derived paths, 308/404, release skew | catch-all or count-only proof |
| `UI-09` public/private isolation | repo invariants | projection/import graph | `UI-P0,S0` | scanner/client graph/unknown-key tests | private/runtime import |
| `UI-10` independent and human acceptance | UI delivery quality gate | evidence only | `UI-V0,H1` | separate reviewer + user disposition | builder self-approval |

## 13. Capsule start and completion gates

Common gates before any implementation capsule:

- [ ] this plan and the designer-owned journey plan have independently reviewed, mutually consistent revisions;
- [ ] `UI-C0` fixture/source/route manifest is frozen;
- [ ] shared-file ownership, commit order, browser QA owner, and protected-window capacity are assigned;
- [ ] no wallet, RPC, DEX, private package, or purchase route enters the informational unit.

`UI-F0` may then start with the accepted scope, current app pins, a pinned CLI `4.21.0` command, and an explicit disposable/reversible change set. Its **completion** requires reviewed generated files, package/lock diff, licenses/SBOM, hashes, build/typecheck, actual test discovery, primitive catalog, and no forbidden import. Those outputs cannot be an input to their own generation.

`UI-P0/UI-L0` may run in parallel from `UI-C0`. `UI-S0` and page capsules may start only after `UI-F0` completion, applicable projection/copy completion, and the relevant accepted IA hierarchy. Each page must map all visible fields to real public DTO fields and approved locale copy. `UI-I0`, independent QA, and human review run only after the corresponding real components exist. K0/N0 alone may approve cutover/rollback behavior.

Passing a capsule gate authorizes only that reviewed capsule. It does not activate a route, wallet, purchase, deployment, public release, or rollback operation.
