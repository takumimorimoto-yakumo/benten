# Company comparison page: screenshot rubric for independent visual QA

Use after implementation of the [design contract](company-comparison-design.md). The reviewer is neither the builder nor the contract author. The builder supplies runtime screenshots; the reviewer returns OK or NG per row with the screenshot ID and a one-line reason. Technical pass, visual delivery and the user's own satisfaction are recorded separately.

## 0. Entry checks

1. Run the generated-image manifest checker (maintainer tooling, not part of this repository) against `docs/ui-design/generated-image-manifest.v1.json`; for `benten/company-openai/mineral-ink` and `benten/company-openai-mobile/mineral-ink` record path, SHA-256 and `review_status`, recompute each digest with `shasum -a 256`, and open each image at original size. `scripts/check-publishable.sh` independently enforces that every tracked PNG's path and hash matches this manifest.
2. For every runtime screenshot record path, SHA-256, viewport, locale and URL. Mock and runtime paths are listed separately. The mock is a composition reference, not a pixel target; where the contract lists an image deviation, the contract wins.
3. Serve with `next start` bound to `localhost` (see contract section 10).

## 1. Required screenshots

| ID | Viewport | URL | Compare with |
| --- | --- | --- | --- |
| C1 | 1440 × 900, full page | `/company/openai` | desktop mock |
| C2 | 390 × 844, full page | `/company/openai` | mobile mock |
| C3 | 1440 × 900 and 390 × 844, full page | `/company/spacex` | contract sections 4 and 5 (three rows, xStock first) |
| C4 | 390 × 844 | `/company/anduril` | single-instrument copy |
| C5 | 390 × 844 | `/ja/company/openai` and one of `/ko`, `/zh-Hans`, `/zh-Hant` | C2 |
| C6 | 1440 × 900 at 200% text zoom | `/company/openai` | contract section 9 |
| C7 | 390 × 844 | `/` scrolled to `#provider-references` | contract sections 6 and 7 |
| C8 | 1440 × 900 | `/provider/prestocks/OPENAI`, `Underlying company` section | contract section 7 |
| C9 | 1440 × 900 | `/company/unknown` (status 404 from the network log) | existing not-found page |

## 2. Visual rows

| Row | Criterion |
| --- | --- |
| V1 Order | Breadcrumb, title with muted status, lede, notice, `Instruments (n)`, list, `Primary sources`, `How this list is made`; same order on both viewports. |
| V2 Not interchangeable | The notice precedes the list; no number, value, sort control, highlight, "compare" affordance or visual weighting that favours one instrument. |
| V3 No purchase | No button, form, wallet element or trading link inside `<main>`. |
| V4 Desktop table | Six columns fit 1440 × 900 with no horizontal scroll; top-aligned cells; row header shows symbol link, name and short mint. |
| V5 Mobile records | One full-width card per instrument; every label/value pair visible; nothing clipped at the right edge; no inner or page horizontal scroll; unknowns listed in full. |
| V6 Token coherence | Only existing tokens; surfaces, hairlines, radii and type match the provider and stock pages. |
| V7 Locales | Same structure in each locale; no overflow; company names and symbols untranslated. |
| V8 Home table | At 390 × 844 each provider instrument is a card with all columns visible (if user decision 3 is accepted); otherwise note "not in scope". |

## 3. Behaviour rows (functional axis, reported separately)

| Row | Criterion | Evidence |
| --- | --- | --- |
| F1 Mapping | Rows equal the map's instruments in map order for all 8 slugs | web test |
| F2 404 | Unknown, uppercase and `/en/` slugs return 404 | web test and C9 network log |
| F3 Vocabulary | Section 8.2 lists have no match inside `<main>` in 5 locales | web test |
| F4 No values | No reference or supply value string of a mapped entry in the HTML | web test |
| F5 Keyboard | Tab order: breadcrumb, header links, instrument links in row order, footer; visible focus on each | C1 and C2 with focus captures |
| F6 Links | Home and provider page links reach the localized company page | web test |
