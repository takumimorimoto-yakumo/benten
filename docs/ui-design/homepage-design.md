# Homepage design contract: mint to filing

Status: `historically accepted for mint-first scope; not an implementation basis for the full rebuild`. See `information-architecture-reset.md` (removed 2026-09-24; see git history; superseded by [investor-journey-plan.md](investor-journey-plan.md)). The original human acceptance record remains unchanged.

Target release profile: optional Profile C, Web Enhanced

Source revision: `fa7cf7e`

Related product contracts:

- [Product and delivery plan](../../specs/product-plan.md)
- [Public data v2 contract](../../specs/contracts/public-data-v2.md)
- [Current visual direction](assets/2609131203_benten_homepage_sumi-proof.png)

## 1. Product job

The homepage has one job: let a Solana agent developer or hackathon judge paste a known xStocks mint and understand, in one uninterrupted path, the token identity, underlying company, source-backed financial facts, and the filing context for those facts.

Success means that a first-time visitor can complete the known-mint journey without a wallet, distinguish the token issuer from the underlying company, open the filing attached to a verified fact, and find the MCP setup path. The page does not make trading, price, portfolio, recommendation, or forecast claims.

The first viewport prioritizes:

1. A visible mint input and a working NVDA example.
2. A proof rail from token to underlying company to filing.
3. A small set of source-verified facts with period and unit metadata.
4. An accurate local MCP setup action.
5. Separate counts for registry, filing eligibility, and current snapshot availability.

The complete registry remains below the first viewport. Under the mandatory `mint_core` release profile, the executable wallet UI is omitted and the page must not construct a Solana RPC connection. The wallet section may return as secondary content only under `wallet_enhanced`, after the wallet amount gates in the product plan pass. It never becomes necessary for the hero journey.

## 2. Visual direction

The visual character is a calm evidence desk: cool mineral surfaces, deep ink text, fine rules, and one compact proof rail. It should feel precise enough for a developer tool and quiet enough for financial source review. The single memorable device is the line connecting token, company, and filing. Decoration never competes with the data.

The generated mock is the macro reference. Use its asymmetric hero, proof rail, split fact/setup area, and thin coverage strip. Do not reproduce the mock as a background image.

### Foundation tokens

The current application has global spacing, radius, type, and color custom properties, but no Living Catalog and no named homepage compositions. The builder should extend that existing token file rather than placing values in components.

| Token role | Proposed value | Use |
| --- | --- | --- |
| Canvas | `#eef0ec` | Page background |
| Surface | `#f9faf7` | Input, fact sheet, and quiet panels |
| Ink | `#14252b` | Headings and primary text |
| Muted ink | `#51646a` | Secondary text and metadata |
| Rule | `#c9d1cd` | Dividers and field boundaries |
| Action | `#234c61` | Primary action and code-panel surface |
| Verified | `#2f665a` | Source-verified state with a text label |
| Attention | `#a84a3a` | Focus accent or compact provenance mark only |

Verified and attention color pairs must retain visible text or icons; color alone never communicates state. The proposed foreground/background pairs have at least WCAG AA contrast for normal text. Dark mode is not part of the accepted macro direction. If the existing automatic dark scheme remains, the builder must provide a complete semantic mapping and independent same-state screenshots rather than inheriting unrelated old values.

Use the existing system sans stack for UI and body copy. A system serif may be used only for the Benten wordmark, expressing the product's record-keeping character. Mint values and code use the existing mono stack. Financial figures use tabular numerals in the sans stack so they remain easy to compare without turning all data into terminal styling.

Keep corners restrained at the existing small and medium radii. Use no gradient, glass effect, glow, paper texture, stock chart, token coin illustration, decorative background, or repeated floating-card shadow. Motion is limited to a user-triggered result replacement of about 160-200 ms using opacity; remove it under `prefers-reduced-motion`.

## 3. Desktop composition

The primary design viewport is `1440 x 1000`, with an approximately 1320 px content measure and generous side gutters. The generated image is `1505 x 1045`; final comparison evidence must also include that exact viewport so visual differences are attributable to implementation rather than scaling.

```text
┌ Benten · short product descriptor          How it works  Registry  GitHub* ┐
├─────────────────────────────────────────────────────────────────────────────┤
│ Start with a Solana mint.      │ xStocks mint [full address              ] │
│ End at the filing.             │ [Resolve mint]  Try NVDA                  │
│ Facts only. No wallet required.│                                             │
├ TOKEN ───────────────── COMPANY ───────────────── FILING ────────────────────┤
│ token name + symbol      exact company name        form/date/period/source  │
│ issuer verification      identity source state     open filing               │
├ Verified facts, 3 rows ─────────────────┬ Use Benten in your agent ─────────┤
│ value + unit + period + source           │ verified local setup + copy       │
│                                           │ known / no-data / unknown states  │
├ 154 registry entries | 129 eligible | 128 available      Browse registry ──┤
```

`GitHub*` is conditional. Show it only after the configured repository URL is confirmed accessible without the builder's session. Until then, omit the link and preserve the header spacing naturally; do not show a disabled control or an operational warning.

The full registry begins below this strip. It may gain search and state labels, but it cannot precede the mint journey. In `mint_core`, no executable wallet section is rendered and no wallet provider may construct an RPC connection. In an accepted `wallet_enhanced` release, the wallet section may follow the registry or a secondary “More ways to explore” section, but it never appears in the first viewport.

## 4. Authoritative interface copy and binding

Generated-image text is illustrative. Use these labels and runtime data bindings in implementation.

### Header and hero

- Wordmark: `Benten`
- Descriptor: `Open-source financial facts for Solana xStocks.`
- Heading: `Start with a Solana mint. End at the filing.`
- Supporting text: `Resolve token identity, underlying company, and source-backed financial facts for agents. Facts only.`
- Reassurance: `No wallet required.`
- Field label: `xStocks mint`
- Primary action: `Resolve mint`
- Example action: `Try NVDA`

The example inserts the exact registered NVDA mint, `Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh`, and runs the same resolver as manual input. It is not a separate canned result.

### Proof rail

The three proof steps are semantic groups:

1. `Token` displays `token_name`, `token_symbol`, `ticker`, and the registry's token-issuer verification state. The label is `Issuer verified` only when the issuer state says so.
2. `Underlying company` displays the exact `underlying_company` string and its identity-source state. It must not inherit the issuer-verification badge.
3. `Filing` displays the form, period end, filed date, and filing link belonging to the verified facts in view.

The mock places `Issuer verified` beside the company. Implementation must move it to the Token step. The mock's `NVIDIA Corporation` is a visual placeholder; render the accepted source value, currently `NVIDIA CORP`, from data. The decorative cinnabar glyph in the mock becomes a plain compact status mark with visible text.

`Source verified` applies to individual facts and their referenced source context. It must never imply that every legacy value, the whole company record, or all statements were verified. A successful verified fact cannot show a missing filing date or period end; if required metadata is absent, that fact does not enter the verified list.

### Verified fact sheet

The first viewport shows at most three accepted facts. Prefer revenue, net income attributable to the parent, and total assets. Each row binds its displayed value, currency, unit, scale, concept, period, and filing source from the same verified fact object. Formatting may abbreviate a value for scanning, but the full integer and scale remain available to assistive technology or an adjacent detail.

Fact count is variable by issuer. The current candidate overlay contains five NVDA facts, five MSFT facts, and four AMZN facts. Render only facts present in the accepted verified set. Do not insert a zero, dash, empty row, or verified marker for a fact that is absent. If no verified fact exists, replace the verified section with the correct legacy or no-data state instead of showing an empty verified frame.

The NVDA candidate values for implementation are:

| Fact | Public integer value | Display candidate | Context |
| --- | ---: | ---: | --- |
| Revenue | `215938000000` | `$215.938B` | FY2026 duration, 2025-01-27 through 2026-01-25 |
| Net income attributable to parent | `120067000000` | `$120.067B` | FY2026 duration, 2025-01-27 through 2026-01-25 |
| Total assets | `206803000000` | `$206.803B` | Instant, 2026-01-25 |
| Total liabilities | `49510000000` | `$49.510B` | Instant, 2026-01-25 |
| Operating cash flow | `102718000000` | `$102.718B` | FY2026 duration, 2025-01-27 through 2026-01-25 |

All values use USD currency units and scale `1`. The filing is Form 10-K, filed 2026-02-25, at [the public SEC filing](https://www.sec.gov/Archives/edgar/data/1045810/000104581026000021/nvda-20260125.htm). Render these only through an accepted verified artifact; do not hardcode them in the page or treat this design document as the runtime data source.

### MCP setup

Title: `Use Benten in your agent`

Description: `Build from this repository, then add the local server to your MCP client.`

The quick path may copy these existing local commands:

```sh
pnpm install
pnpm build
node packages/mcp/dist/index.js
```

Label the action `Copy local commands`. A separate `MCP client config` link may open the corresponding README section after its final URL is confirmed accessible. The mock's abbreviated command is composition guidance only. Do not invent an `npx` package, hosted endpoint, global install, or path that depends on an unknown working directory.

### Coverage strip

Derive all counts from the registry and artifact at render time:

- `{registry_count} registry entries`
- `{eligible_count} filing-eligible`
- `{snapshot_available_count} snapshot available`

For the current accepted baseline these are 154, 129, and 128. Eligibility and current availability remain separate. ASML is eligible and has no current row, so it contributes to 129 but not 128.

## 5. Interaction and state model

The field has a persistent visible label, accepts exactly one mint, and submits with Enter or the primary button. Do not resolve on each keystroke. Preserve the user's input while loading or after an error.

| State | Required behavior and copy |
| --- | --- |
| Idle | NVDA example action is available; no result is announced before a request. |
| Loading | Button reads `Resolving…`, is disabled, and the result region uses `aria-busy="true"`. |
| Source-verified success | Show identity first, then only verified facts with their period, unit, and source. Announce `Mint resolved.` in a polite live region. |
| Partial overlay | Show verified facts in the verified section and legacy values in a separate, lower-emphasis legacy section. Never merge their labels. |
| Legacy snapshot | Show known identity and `Legacy snapshot`. Copy: `Filing date, unit, source, and reported-versus-calculated status are unverified for these values.` |
| ASML `no_data` | Show known token identity and `No current financial row`. Copy: `ASML is filing-eligible, but the current Benten snapshot has no financial row for it.` Offer `Try NVDA`. |
| Structurally ineligible | Show known token identity and its exact exclusion reason. Do not call it missing data. |
| Unknown mint | Inline field error: `This mint is not in the current Benten registry.` Do not describe it as fake, malicious, or fraudulent. |
| Malformed input | Inline field error: `Enter a valid Solana address.` |
| Service unavailable | Preserve input and show `Benten could not read the current public snapshot. Try again.` |
| Copied | Action reads `Copied` briefly and announces the result without moving focus. |

Error text appears beside the field and is referenced by `aria-describedby`. Focus moves to the result heading after successful explicit submission and to the input on invalid submission. Filing links name the form and company, for example `Open NVIDIA CORP 2026 10-K`, rather than relying on `Open filing` alone.

## 6. Mobile behavior

At `390 x 844`, use one page scroll and 16 px side gutters. There is no horizontal page scroll.

- Keep the wordmark and one essential navigation action in the first row. Other links move into a native disclosure control with a 44 px minimum target.
- Stack hero copy above the lookup field. Keep the complete address in the input; internal text scrolling is acceptable.
- Turn the proof rail into a vertical sequence in document order: Token, Underlying company, Filing. The connecting rule stays decorative and is hidden from assistive technology.
- Stack each fact as label, formatted value, then period/unit/source metadata. Never truncate dates, values, or the company name without an adjacent way to reveal the full text.
- Place the MCP setup after the fact list. The code block may scroll internally, while the copy button stays outside that scroll region.
- Render coverage counts as three text rows separated by rules. The registry table uses its existing contained horizontal scroller or a registered catalog alternative; the page itself does not scroll sideways.
- Keep the full registry below the core journey. Omit executable wallet UI under `mint_core`; if the separate `wallet_enhanced` gate passes, place its wallet UI below the registry.

At 200% text zoom, allow the proof rail, fact rows, navigation, and coverage strip to wrap vertically. No fixed-height container may clip content.

## 7. Components and Living Catalog

Build reusable components before composing the page. Suggested boundaries are semantic rather than an imposed file layout:

- `MintLookupForm`: label, address input, example action, submit, and inline status.
- `IdentityProofRail`: Token, Underlying company, and Filing groups.
- `VerifiedFactList`: fact value plus complete period/unit/source metadata.
- `DataStateNotice`: named variants for `legacy-snapshot`, `no-data`, `not-eligible`, `unknown-mint`, and `service-unavailable`.
- `McpSetupPanel`: accurate commands, copy feedback, and optional verified documentation link.
- `CoverageStrip`: three independently named counts and registry link.
- `StatusMark`: shared text-plus-symbol treatment for issuer and fact source states.

`WalletSection` is not part of the `mint_core` page composition. Its provider wrapper must not be mounted merely to hide the visible control, because that would leave an unnecessary RPC construction path. It becomes an optional secondary consumer only in `wallet_enhanced`.

The repository currently has no Living Catalog. Add a development-only catalog at `/dev/ui-catalog`, with no production navigation link and `noindex` metadata. In production it must return not found. Display at least:

- lookup idle, loading, malformed, and unknown states;
- proof rail at desktop and 390 px widths;
- source-verified results with five facts and four facts, one partial-overlay result, and one legacy result;
- ASML `no_data` and one structural exclusion;
- long company name, full mint, maximum fact length, and missing optional facts;
- MCP copy ready and copied states;
- coverage strip at desktop and mobile widths.

Catalog specimens use deterministic public fixtures. They do not call a network and do not claim that generated placeholders are production data.

## 8. Screenshot and acceptance rubric

After implementation, the builder supplies real browser evidence and an independent reviewer compares it with the current mock.

| Evidence | Required check |
| --- | --- |
| `1505 x 1045` ready state | Compare composition, density, type hierarchy, proof-rail continuity, surface treatment, and first-viewport content with the current mock. |
| `1440 x 1000` ready state | Confirm the intended judge viewport shows the complete input, identity trail, three verified facts, MCP CTA, and coverage strip without the wallet or full registry taking priority. |
| `390 x 844` ready state | Confirm vertical proof order, readable fact metadata, usable copy action, 44 px targets, and no horizontal page scroll. |
| NVDA success | Verify displayed identity, all shown values, period, filing date, form, and source link come from the accepted artifact. |
| Four/five-fact, partial overlay, and legacy | Verify variable fact counts do not create zero-filled or empty verified rows; source status is fact-scoped and legacy content cannot inherit verified styling. |
| ASML and unknown mint | Verify known `no_data` and unknown registry states remain distinct and use the required copy. |
| Keyboard and focus | Tab order follows document order; Enter submits; focus is visible; success/error focus behavior matches Section 5. |
| Text zoom and motion | At 200% text zoom nothing clips; reduced motion removes the result transition. |
| Conditional links | GitHub and README links appear only after signed-out access succeeds; every visible action has a reachable destination. |
| Release-profile wallet boundary | `mint_core` renders no executable wallet control and constructs no Solana RPC connection. `wallet_enhanced` may render the secondary wallet only after its amount and replay gates pass. |

The builder runs the repository build, typecheck, contract tests, the generated-image manifest checker, and a real browser interaction pass. The builder does not certify visual acceptance. An independent UI reviewer records mock and runtime screenshot paths and byte digests, checks both desktop and mobile evidence, and returns a separate visual verdict.

## 9. Acceptance boundary

Acceptance of this artifact covers the visual direction, information order, first-viewport composition, responsive behavior, component set, and named states in this document. Direct human acceptance was recorded on 2026-09-13 for the current image and the semantic corrections in this contract. Local UI implementation and verification are authorized.

The acceptance does not authorize deployment, publication, repository access changes, or hackathon submission. It does not certify the generated image as functional evidence or the future implementation as visually complete. Independent browser-based visual review remains a completion gate after the build.

## 10. Designer disposition

The current image is the accepted visual direction. It was selected because the mint input is unmistakable, the token-company-filing relationship is visible without explanation, the first viewport contains both human-readable proof and an agent setup path, and the visual tone is calm without becoming generic crypto chrome. No other successful project-bound candidate was generated.

The design has three explicit levels:

- Macro: asymmetrical hero, horizontal proof rail, facts/setup split, and a thin coverage strip before secondary content.
- Meso: lookup form, proof groups, fact rows, setup panel, state notices, and coverage summary as named components.
- Micro: cool mineral palette, fine rules, restrained radii, tabular financial figures, visible focus, text-plus-symbol status, and limited user-triggered motion.

The image was inspected at its original `1505 x 1045` dimensions and its byte digest was verified. Its known corrections are part of the acceptance target: move issuer verification to Token, use the exact company name from data, never pair a verified status with missing source metadata, bind setup commands to the working repository instructions, simplify the decorative provenance glyph, and hide external links until their signed-out destinations work. These corrections clarify semantics without changing the selected composition.
