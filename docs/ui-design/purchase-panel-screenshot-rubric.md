# NVDAx purchase panel: screenshot rubric for independent visual QA

Use after implementation. The reviewer is not the builder and not the author of the [design contract](purchase-panel-design.md). The builder supplies runtime evidence; the reviewer returns a verdict per row. Technical pass, visual delivery and the user's own satisfaction are recorded separately; one never implies another.

## 0. Entry checks (reviewer)

1. Run the generated-image manifest checker (maintainer tooling, not part of this repository) against `docs/ui-design/generated-image-manifest.v1.json` and, for each identity `benten/nvda-purchase-{review,finalized,expired,mobile-states}/mineral-ink`, record the current path, SHA-256 and `review_status`. Recompute each digest with `shasum -a 256` and open each image at original size; `scripts/check-publishable.sh` independently enforces that every tracked PNG's path and hash matches this manifest.
2. Record, for every runtime screenshot used, its path, SHA-256, viewport, locale, URL and the fixture or real state that produced it. Mock and runtime paths are listed separately.
3. The mock is a design reference, not a pixel target. Compare composition, hierarchy, density, typography, surfaces, component coherence and state treatment. Where the contract lists an image deviation, the contract wins.
4. States that need a wallet or the network are captured from Living Catalog fixtures (`/dev/ui-catalog`) that render the real components from reducer states without RPC or wallet; the builder states which screenshots come from fixtures and which from the live page. No reviewer or builder signs or sends to obtain evidence. The funded G-B2 smoke, if the user runs it, is separate evidence.

## 1. Required screenshots

| ID | Viewport | URL / fixture | State | Compare with |
| --- | --- | --- | --- | --- |
| S1 | 1440 × 900 | `/stock/NVDA` | `walletDisconnected` (first view, real page) | contract section 2 and 3 |
| S2 | 1440 × 900 | fixture | `reviewReady`, scrolled so the sticky panel is at its sticky offset (V8) | review mock |
| S3 | 1440 × 900 | fixture | `result` (finalized) | finalized mock |
| S4 | 1440 × 900 | fixture | `previewExpired` | expired mock |
| S5 | 390 × 844 | `/stock/NVDA` full page | `walletDisconnected`, full-page capture showing vertical order | contract section 2 (mobile) |
| S6 | 390 × 844 | fixture | `reviewReady` | mobile board screen 1 |
| S7 | 390 × 844 | fixture | `result` | mobile board screen 2 |
| S8 | 390 × 844 | fixture | `notFinalized` | mobile board screen 3 |
| S9 | 1440 × 900 and 390 × 844 | `/stock/TSLA` (any non-NVDA registry ticker) | `unsupportedToken` | contract section 2 (other stock pages) |
| S10 | 1440 × 900 at 200% text zoom | fixture | `reviewReady` | contract section 10 |
| S11 | 390 × 844 | `/ja/stock/NVDA` and one of `/ko`, `/zh-Hans`, `/zh-Hant` | `walletDisconnected` and fixture `reviewReady` | S5, S6 |
| S12 | 1440 × 900 | fixture | one each of `simulationFailed`, `relayBusy`, `failedOnChain`, `walletNotDetected` | contract section 6 |

## 2. Visual rows (each OK or NG, with the screenshot ID and a one-line reason)

| Row | Criterion |
| --- | --- |
| V1 Placement | Desktop: two-column band below the title; panel on the right, top aligned with `Registry record`, width consistent with `--purchase-panel-width`; left column unchanged. Mobile: title, jump link, registry record, panel, legacy, in that order; single natural scroll. |
| V2 One primary action | Exactly one filled primary button visible per state (none in submitted, confirmed and unsupported states; outlined `Start a new purchase` in result). |
| V3 Order inside panel | Heading, route line, `Before you buy`, wallet step, amount, preview/trail/result, action, footnotes. The notice is in the same place in every state and shows all four sentences. |
| V4 Terms legibility | Preview rows: label left, value right on desktop; stacked on mobile; tabular figures; muted raw value with each amount (beside it on desktop, under it on mobile); no truncated number; units always visible. |
| V5 Memorable element | The vertical trail and the `+… NVDAx` figure read as the one emphasis of the finalized state; no confetti, glow, gradient, illustration or extra colour. |
| V6 Error treatment | Tinted surface, left border, icon and bold title; body names what did not happen and the next action; expired preview values dimmed, not struck through. |
| V7 Token coherence | Only existing and contract-added tokens: surfaces, ink, muted, action, verified, attention; radii and spacing match the rest of the page; the panel looks like the same product as the registry table and home page. |
| V8 Density | In `reviewReady` (reached after the user has operated the panel, so the page may be scrolled), the whole sticky panel, from the notice through the approve button, fits inside the 1440 × 900 viewport (S2, captured at that scroll position). On mobile the approve button is reachable without horizontal scroll and is not hidden behind anything fixed. Changed 2026-09-24: the earlier "fits the first view" wording contradicted V1, which aligns the panel top with `Registry record` below the title band, so V1 takes precedence and V8 is measured on the sticky panel after interaction. |
| V9 Unsupported pages | Quiet notice in the same slot, no button, no link to NVDA, no layout jump compared with S1. |
| V10 Locales | Non-English pages keep the same structure; no clipped or overflowing strings in the panel; numbers and raw values unchanged; the four notice sentences present. |

## 3. Behaviour and accessibility rows (functional axis, reported separately from visual)

| Row | Criterion | Evidence |
| --- | --- | --- |
| F1 Send once | One wallet sign-and-send request per approved preview; approve button inert while waiting; no call to any send RPC in the network log | fixture test plus network log of a live page session up to `awaitingWallet` with a rejecting test wallet or the user's G-B2 run |
| F2 Expiry | Countdown reaches `Expired`, approve disabled, `Refresh preview` primary; approve after expiry never calls the wallet | unit test of reducer and fixture screenshot |
| F3 Amount model | Raw helper equals the parsed integer; 7-decimal input rejected; no float conversion; NVDAx display truncates | unit tests |
| F4 Result source | Delta computed from finalized `getTransaction` token balances for the approving wallet and the NVDAx mint | unit test with a recorded transaction fixture |
| F5 Tracking cap | Polling stops at the configured cap and shows `Not finalized yet` with `Check again`, full-signature Copy and explorer link | fixture and unit test |
| F6 Vocabulary | No `quote`, `NAV`, `best`, `recommended` in rendered panel text in all five locales | automated text test |
| A1 Keyboard | Tab order follows visual order; every action reachable; visible 3px focus | keyboard walk-through notes |
| A2 Focus moves | Preview heading on ready, error title on error, result heading on completion, amount field on new purchase | notes or test |
| A3 Announcements | Ready, 10-second warning, expiry, sent, confirmed, result announced once; countdown not announced every second | screen reader notes |
| A4 200% zoom | S10 shows stacked rows, no clipping, no page-level horizontal scroll | S10 |
| A5 Touch targets | Every panel button and link at least 44 px tall at 390 px | measured in devtools |
| A6 Contrast | Pairs listed in contract section 8 hold in the implementation (spot-check computed colours) | devtools |
| A7 Reduced motion | No transition with `prefers-reduced-motion: reduce` | notes |

## 4. Verdict format

```text
mock:    <path> sha256:<digest> review_status:<status>   (one line per identity)
runtime: <ID> <path> sha256:<digest> viewport:<w x h> locale:<locale> source:<live|fixture>
V1..V10: OK | NG - <reason> - repair owner: <builder|designer>
F1..F6, A1..A7: OK | NG | not verified - <reason>
technical pass: yes | no
visual delivery: pass | fail
human satisfaction: not assessed (the user decides on the real app)
```

An NG in any V row fails visual delivery; it is not offset by other rows. Repair owner is the builder when the runtime departs from the contract, and the designer when the contract itself is wrong or incomplete.
