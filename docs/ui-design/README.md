# Benten UI design handoff

Product precedence: [agent-first investing](../decisions/agent-first-investing.md) is now the accepted direction. The primary future journey begins with the investor's question, budget and conditions; AI may prepare a cited draft, deterministic tools validate exact economics and authority, and the investor makes the wallet decision. The existing IA, images and screen acceptance predate that direction and **must not be reused as acceptance of the agent-first hierarchy or interaction model**. Agent-first IA, privacy/model egress, hostile-content handling, draft/tool state contracts, independent visual QA and human acceptance remain a separate next design step. No AI or purchase UI is implemented by this pointer.

## Current information UI and future purchase boundary

NVDAx purchase (P1-2 of the [Stocklana submission plan](../../specs/stocklana-submission-plan-2026-09-23.md)): the 2026-09-23 user decision replaced the no-purchase-UI boundary for this one route. Its design contract is [purchase-panel-design.md](purchase-panel-design.md) (images `review_pending`) with the independent [screenshot rubric](purchase-panel-screenshot-rubric.md). The statements below remain in force for every other token and route.

App icon: the biwa-and-wave mark, its colours, masters and consumers are in [app-icon-design.md](app-icon-design.md) (the two opaque masters `approved`; the two transparent masters added for the tab icon and header mark are `review_pending`).

Company comparison (P2-1, Phase 2): the read-only `/company/{slug}` page and the reviewed company map in `packages/registry` are specified in [company-comparison-design.md](company-comparison-design.md) (images `review_pending`) with its [screenshot rubric](company-comparison-screenshot-rubric.md). It adds no purchase capability.

The current public UI is an information surface backed by exact allowlisted identity and bundled public facts. Registry membership, filing eligibility, financial-data coverage and a future purchase route are independent states: one never proves another. Unknown ticker or mint input fails closed as unsupported by the current snapshot; it is not converted into a route or market-availability claim. The current runtime remains read-only and **no-sign/no-send**.

Any future purchase flow requires its own accepted product, execution, legal and visual contracts. It must keep unknown post-submission outcomes unresolved, look up the known signature when one exists and never resend automatically. Critical identity, route, quote, review, confirmation and recovery copy must remain meaning-equivalent across all five supported locales (`en`, `ja`, `ko`, `zh-Hans`, `zh-Hant`). Keyboard order and focus return, visible focus, status announcements, reduced motion, 200% text zoom, full-mint access, touch targets and mobile overflow are acceptance criteria. Deterministic fixtures must not sign or send. The builder supplies real-browser evidence; an independent reviewer evaluates the affected desktop, mobile and state evidence, and the builder does not self-certify visual acceptance.

These constraints preserve the reusable safety and quality requirements from the suspended purchase-first proposal. They do not revive its hierarchy, mock, component plan or implementation authorization. The proposal image, prompt, manifest and design review remain historical evidence under [the spot-acquisition design](spot-acquisition-design.md).

Mobile-first product expansion is proposed in the [mobile investing implementation plan](../../specs/mobile-investing-implementation-plan.md); the [mobile client platform ADR](../decisions/mobile-client-platform.md) now records the user-confirmed Web-deadline then separately proven SwiftUI/Compose sequence. They add Portfolio and Activity to the investor journey. They do not turn the current UI into a wallet, PWA or native app, and they do not apply shadcn to native screens.

Current information-architecture proposal: [investor journey and three-screen product flow](investor-journey-plan.md). It defines the investor-first Markets → exact Dossier → Purchase Intent journey, preserves the existing `/stock/{ticker}` deep links and five-locale baseline, and treats company comparison/DBC/developer tooling as optional or secondary paths. It is **proposed for review only**: no generated image, visual acceptance, purchase capability, or UI implementation is claimed. The current purchase route remains unproved and must not expose an active purchase CTA.

Current implementation-first handoff: [observed shadcn CLI foundation, Home/Dossier initial layout and acceptance boundary](shadcn-baseline-review.md). The user instructed that the layout be established in the **real shadcn-based app without another generated image**. The F0 CLI preflight observed `base-nova`/Base UI/neutral CSS variables/Lucide at its pinned version, not the previously assumed `new-york`. This authorizes a provisional code-native Home/Dossier build from the textual IA and runtime iteration, not acceptance of any old mock, the resulting screen, or human satisfaction. The 1052 shadcn-baseline image remains mechanically current and `review_pending` but is an **outdated approximation, not an implementation reference**; rejected mobile images are unusable. Independent browser review and the user's judgment of the real app remain outstanding.

Historical review candidates only: [Home desktop](assets/2609140910_benten_home-workspace_ink-neutral.png), [Dossier desktop](assets/2609140916_benten_token-dossier_ink-neutral.png), and their [screen/state contract](unsigned-route-workspace-design.md). SHA-256 respectively `54b248cdc83c7d8e377c59c75826b5f7a1f9efb241d5e81987b49f0843127c38` and `70b5fd3b069eefe439ee96a47f5a69c94258fbba6a5d534233ef2f88304ee50d`; intended viewport `1440 × 900`. Both remain **`review_pending` — not current implementation references**. Three Home mobile image attempts were rejected; Dossier mobile was not generated. Desktop NVDAx facts are checked visual specimens, not runtime fixtures. The current product boundary remains read-only facts/registry with zero executable routes; future route check would produce an **unsigned handoff only**, signed/sent in a user's own wallet or user-side agent. No Benten spend authority, order-completed claim, or live-trade UI exists today.

The long-horizon investigate → decide → acquire IA, the earlier capability-first foundation, the four-image vNext bundle, the browse-first Home contract, the earlier acquisition IA, the old consumer matrix and the old builder handoff (`investigate-decide-acquire-ia.md`, `capability-first-foundation.md`, `vnext-acceptance-bundle.md`, `discovery-home-design.md`, `ia-acquisition.md`, `consumer-matrix.md`, `implementation-handoff.md`) were superseded 2026-09-14 design-exploration iterations with no accepted image and no current implementation reference; they were removed in the 2026-09-24 doc cleanup (removed 2026-09-24; see git history). React Router Framework Mode + Vite is the selected technical direction; shadcn primitives are a future design baseline, not present installed components. The [purchase-first image](spot-acquisition-design.md) remains historical evidence for the suspended purchase-first proposal, preserved intentionally. The prior acceptance below remains historical for the mint-first/read-only scope only.

Historical mint-first status: `accepted-for-implementation` for that earlier scope

Human design acceptance: recorded in [acceptance.md](acceptance.md)

Historical implementation authorization: granted only for the old mint-first scope and corrections in [the homepage design contract](homepage-design.md), **not** for the requested full rebuild.

[Historical mint-first visual direction](assets/2609131203_benten_homepage_sumi-proof.png) <!-- generated-image-current:benten/homepage/sumi-proof -->

- Image SHA-256: `e3a553327f9eeac3d7a5de0bab7d1ab81076080b3799141a8b742b5072e164a0`
- Image dimensions: `1505 x 1045`
- Intended desktop design viewport: `1440 x 1000`
- Exact comparison viewport after implementation: `1505 x 1045`
- Mobile behavior viewport: `390 x 844`
- Provenance: Codex built-in image generation, generated 2026-09-13 12:03 JST
- Prompt: [public generation prompt](prompts/2609131203_benten_homepage_sumi-proof.txt)
- Manifest: [generated-image-manifest.v1.json](generated-image-manifest.v1.json)
- Consumer inventory: `consumer-matrix.md` (removed 2026-09-24; see git history)
- Builder handoff: `implementation-handoff.md` (removed 2026-09-24; see git history)

To inspect the original bytes from the repository root:

```sh
open docs/ui-design/assets/2609131203_benten_homepage_sumi-proof.png
shasum -a 256 docs/ui-design/assets/2609131203_benten_homepage_sumi-proof.png
```

The generated image establishes composition, hierarchy, density, and visual tone. It is not a runtime screenshot or evidence of interaction, accessibility, data correctness, or public availability. Text and state behavior in the design contract are authoritative where they correct the image. Acceptance authorizes local UI implementation and its verification; it does not certify the future implementation or authorize external release actions.
