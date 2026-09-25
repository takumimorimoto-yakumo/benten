# Benten app icon

Status: the user chose the shape (option 1, "biwa and wave") and the colours; the final images below are `review_pending` until the user has seen them.

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

| File | SHA-256 | Role |
|---|---|---|
| `assets/2609242333_benten_app-icon_roiro-konjiki.png` | `587cebcd8d686d5fb9548bac2d962dfd24eca2bf56b860c1ab3f8fb45f06b10f` | Dark master, 1024. Home-screen icons, dark favicon, header mark in the dark app theme |
| `assets/2609242333_benten_app-icon_gofun-kincha.png` | `12e4642818d261509679168bb8e8799dbe05970afda4fcb1084572e9055feb45` | Light master, 1024. Light favicon, header mark in the light app theme |
| `assets/2609242332_benten_app-icon_roiro-konjiki.png` | `23b9e5139eb3eb5686496e49cc5f80ac68e2533e35b116b071b8d4178b7f7901` | Dark Codex generation (1254), source of both masters |
| `assets/2609242331_benten_app-icon_gofun-kincha.png` | `fd959cbff8fc3e9204e8fd6aa3e632ec39571afe466fe946d7f0e9ef870be107` | Light Codex generation (1254), not used (`rejected`, see below) |

### How they were made

1. Both generations are Codex built-in image generation, editing the option-1 candidate (SHA-256 `382228ea…5eaa`, not committed) with the prompts in `prompts/2609242332_benten_app-icon_roiro-konjiki.txt` and `prompts/2609242331_benten_app-icon_gofun-kincha.txt`: same shape, new colours, mark reduced to fit a 68% circle.
2. Both kept the option-1 shape. They differ slightly in scale (the mark is 59.5% of the canvas height in the dark one and 64.7% in the light one), so a theme switch in the tab or header would make the mark jump. The light generation is therefore not used.
3. `scripts/design/flatten-app-icon.py` reads the dark generation as a coverage mask, removes the generation noise (flat areas become exactly flat; only anti-aliased edges lie between the colours), reduces it to 1024 by area averaging, and composes the same mask in each theme's two colours. Running it again reproduces both masters byte for byte.

The masters are therefore processed generations, not raw outputs. The manifest records this in each master's `provenance.tool`.

## Safe area

The mark's farthest pixel is 32.7% of the icon size from the centre. The maskable safe circle has a radius of 40%, so the mark leaves a margin of 7.3% of the icon size (the requirement is 5% or more). One master therefore serves both the `any` and the `maskable` icons. `tests/pwa.test.ts` checks the 35% bound on the built maskable icon.

## Where each file is used

| Consumer | Theme | Size | Source |
|---|---|---|---|
| Manifest `icons` (`any` 192 and 512, `maskable` 512) | dark | 192, 512 | reduced at build time |
| `apple-touch-icon` | dark | 180 | reduced at build time |
| Mobile Wallet Adapter `appIdentity.icon` | dark | 192 (`/icons/icon-192.png`) | same file as the manifest icon |
| Tab icon, `(prefers-color-scheme: light)` | light | 64 | reduced at build time |
| Tab icon, `(prefers-color-scheme: dark)` | dark | 64 | reduced at build time |
| Header mark (with the name from `md`; alone below `md`), `--app-header-mark-size` | the app theme (the `dark` variant: `.dark`, or the OS when no script ran), not the tab strip | 64 file shown at 1.75rem | the tab icon files |

The icons are always the dark master because manifests cannot reliably switch icons by colour scheme. The manifest's `theme_color` and `background_color` stay the light shadcn `--background` (`#ffffff`), because a manifest cannot follow a colour scheme. Since the app gained light and dark themes (2026-09-25), the document head carries two `theme-color` metas, `#ffffff` for `(prefers-color-scheme: light)` and the dark `--background` `#0a0a0a` for `(prefers-color-scheme: dark)`, and when the reader pins Light or Dark in the header's theme menu the theme boot script adds one more `theme-color` meta first in the head in that theme's colour (see [shadcn-baseline-review.md](shadcn-baseline-review.md#light-and-dark-themes-2026-09-25)). The SVG favicon was removed. The mark exists only as a generated raster, and redrawing it as a vector would be a new, unreviewed drawing.

## Checks for a reviewer

- The generated-image manifest checker (maintainer tooling, not part of this repository), queried against `docs/ui-design/generated-image-manifest.v1.json` for the latest `benten app-icon roiro-konjiki` and `benten app-icon gofun-kincha` entries, must return the two masters above.
- Open both masters at full size. Look at the 192 and 48 reductions on white and on black, and at the 80% safe circle drawn over the master.
- In the built app, check that the tab icon follows the emulated colour scheme and that installability errors are empty.
