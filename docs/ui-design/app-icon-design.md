# Benten app icon

Status: the user chose the shape (option 1, "biwa and wave") and the colours, and has since seen and approved all four masters below, opaque and transparent (their `review_status` is `approved`).

## Mark

One teardrop that is both the body of a biwa lute and a drop of water, cut by two thick wave bands. The name comes from Benzaiten (wealth, music, water); the mark stays abstract geometry, with no figure or religious symbol. Two flat colours only: no gradient, gloss or shadow. The canvas is a full-bleed 1024 square without rounded corners, because the platform applies the mask.

## Colours

| Theme | Ground | Mark | Mark : ground contrast |
|---|---|---|---|
| Dark (official icon) | roiro (lacquer black) `#0C0C0C` | konjiki (gold) `#E6B422` | 10.17 : 1 |
| Light | gofun (shell white) `#FFFFFC` | kincha (gold-brown) `#C47222` | 3.63 : 1 |

Ratios are WCAG 2 relative-luminance contrast; the non-text minimum is 3 : 1. Konjiki on gofun would be only 1.92 : 1, so the light theme uses the deeper kincha.

## Images

[Dark master](assets/2609242333_benten_app-icon_roiro-konjiki.png) <!-- generated-image-current:benten/app-icon/roiro-konjiki -->

[Light master](assets/2609242333_benten_app-icon_gofun-kincha.png) <!-- generated-image-current:benten/app-icon/gofun-kincha -->

[Konjiki transparent master](assets/2609251422_benten_app-icon_konjiki-transparent.png) <!-- generated-image-current:benten/app-icon/konjiki-transparent -->

[Kincha transparent master](assets/2609251422_benten_app-icon_kincha-transparent.png) <!-- generated-image-current:benten/app-icon/kincha-transparent -->

| File | SHA-256 | Role |
|---|---|---|
| `assets/2609242333_benten_app-icon_roiro-konjiki.png` | `587cebcd8d686d5fb9548bac2d962dfd24eca2bf56b860c1ab3f8fb45f06b10f` | Dark master, 1024, opaque. Home-screen icons (manifest `icons`, `apple-touch-icon`, MWA `appIdentity.icon`) |
| `assets/2609242333_benten_app-icon_gofun-kincha.png` | `12e4642818d261509679168bb8e8799dbe05970afda4fcb1084572e9055feb45` | Light master, 1024, opaque. Kept as the light-theme reference image; no runtime consumer since the transparent kincha master took over the light favicon and header mark |
| `assets/2609251422_benten_app-icon_konjiki-transparent.png` | `e796695a4c6e31d8c8861cb7858bed66ebaa27f8c81b87e22fc7365ccbbfd09e` | Konjiki transparent master, 1024, RGBA. Dark favicon, header mark in the dark app theme |
| `assets/2609251422_benten_app-icon_kincha-transparent.png` | `420340f39a27cfb9ab3b6bfa3c5853880cb4dff6eee175fe5371ac5faf03e4cc` | Kincha transparent master, 1024, RGBA. Light favicon, header mark in the light app theme |
| `assets/2609242332_benten_app-icon_roiro-konjiki.png` | `23b9e5139eb3eb5686496e49cc5f80ac68e2533e35b116b071b8d4178b7f7901` | Dark Codex generation (1254), source of all four masters above |
| `assets/2609242331_benten_app-icon_gofun-kincha.png` | `fd959cbff8fc3e9204e8fd6aa3e632ec39571afe466fe946d7f0e9ef870be107` | Light Codex generation (1254), not used (`rejected`, see below) |

### How they were made

1. Both generations are Codex built-in image generation, editing the option-1 candidate (SHA-256 `382228ea…5eaa`, not committed) with the prompts in `prompts/2609242332_benten_app-icon_roiro-konjiki.txt` and `prompts/2609242331_benten_app-icon_gofun-kincha.txt`: same shape, new colours, mark reduced to fit a 68% circle.
2. Both kept the option-1 shape. They differ slightly in scale (the mark is 59.5% of the canvas height in the dark one and 64.7% in the light one), so a theme switch in the tab or header would make the mark jump. The light generation is therefore not used.
3. `scripts/design/flatten-app-icon.py` reads the dark generation as a coverage mask, removes the generation noise (flat areas become exactly flat; only anti-aliased edges lie between the colours), reduces it to 1024 by area averaging, and composes the same mask in each theme's two colours. Running it again reproduces both opaque masters byte for byte.
4. `scripts/design/transparent-app-icon.py` reduces the identical mask (it imports `flatten-app-icon.py`'s `mask_1024` rather than recomputing it) and writes the mask straight to the alpha channel of a single flat mark colour, with no ground fill: konjiki (`#E6B422`) and kincha (`#C47222`), the same two mark colours as the opaque masters. Compositing the konjiki transparent master over roiro (`#0C0C0C`) reproduces the opaque dark master to within 1 level per channel (independent rounding: one path composites then rounds to a byte, the other rounds straight to alpha). Running the script again reproduces both transparent masters byte for byte; `tests/pwa.test.ts` checks both the byte-for-byte reproduction and the cross-consistency with the opaque masters.

All four masters are therefore processed generations, not raw outputs. The manifest records this in each master's `provenance.tool`.

## Safe area

The mark's farthest pixel is 32.7% of the icon size from the centre. The maskable safe circle has a radius of 40%, so the mark leaves a margin of 7.3% of the icon size (the requirement is 5% or more). One master therefore serves both the `any` and the `maskable` icons. `tests/pwa.test.ts` checks the 35% bound on the built maskable icon.

## Where each file is used

| Consumer | Theme | Background | Size | Source |
|---|---|---|---|---|
| Manifest `icons` (`any` 192 and 512, `maskable` 512) | dark | opaque | 192, 512 | reduced at build time from the opaque dark master |
| `apple-touch-icon` | dark | opaque | 180 | reduced at build time from the opaque dark master |
| Mobile Wallet Adapter `appIdentity.icon` | dark | opaque | 192 (`/icons/icon-192.png`) | same file as the manifest icon |
| Tab icon, `(prefers-color-scheme: light)` | light | transparent | 64 | reduced at build time from the kincha transparent master |
| Tab icon, `(prefers-color-scheme: dark)` | dark | transparent | 64 | reduced at build time from the konjiki transparent master |
| Header mark (with the name from `md`; alone below `md`), `--app-header-mark-size` | the app theme (the `dark` variant: `.dark`, or the OS when no script ran), not the tab strip | transparent | 64 file shown at 2.25rem | the tab icon files |

The three home-screen consumers always read the opaque dark master because manifests cannot reliably switch icons by colour scheme, and a manifest icon cannot rely on the app's own background showing through on every platform's home screen. The tab icon and header mark read the transparent masters instead, so no square shows behind the mark; `--app-header-mark-size` was sized up from the former opaque square's 1.75rem to 2.25rem to keep a similar visual weight now that the mark alone (not a filled square) carries the shape. The manifest's `theme_color` and `background_color` stay the light shadcn `--background` (`#ffffff`), because a manifest cannot follow a colour scheme. Since the app gained light and dark themes (2026-09-25), the document head carries two `theme-color` metas, `#ffffff` for `(prefers-color-scheme: light)` and the dark `--background` `#0a0a0a` for `(prefers-color-scheme: dark)`, and when the reader pins Light or Dark in the header's theme menu the theme boot script adds one more `theme-color` meta first in the head in that theme's colour (see [shadcn-baseline-review.md](shadcn-baseline-review.md#light-and-dark-themes-2026-09-25)). The SVG favicon was removed. The mark exists only as a generated raster, and redrawing it as a vector would be a new, unreviewed drawing.

## Checks for a reviewer

- The generated-image manifest checker (maintainer tooling, not part of this repository), queried against `docs/ui-design/generated-image-manifest.v1.json` for the latest `benten app-icon roiro-konjiki`, `benten app-icon gofun-kincha`, `benten app-icon konjiki-transparent` and `benten app-icon kincha-transparent` entries, must return the four masters above.
- Open all four masters at full size. Look at the 192 and 48 reductions on white and on black, and at the 80% safe circle drawn over the master. For the two transparent masters, check on both a light and a dark surface that no square shows behind the mark.
- In the built app, check that the tab icon follows the emulated colour scheme, that the header mark shows no background square in either app theme, and that installability errors are empty.
