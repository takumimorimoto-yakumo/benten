---
id: pwa-install-surface
title: Ship the PWA install surface without a service worker
date: 2026-09-24
status: decided
tags: [pwa, android, ios, web, manifest]
repos: [benten]
plan_start: 2026-09-24
plan_end: 2026-09-24
---

# PWA install surface

This records app IA item 6 (`docs/ui-design/app-ia-v2.md`, sections 3.4, 9.1 and 12.3 U6).

## What ships

- **One Web App Manifest per locale**: `/manifest.webmanifest` (English) and `/{locale}/manifest.webmanifest` for `ja`, `ko`, `zh-Hans`, `zh-Hant`. Each has `name` and `short_name` `Benten`, the locale's Explore description as `description`, `lang`, `start_url` equal to that locale's home, `scope` `/`, `display` `standalone`, and `theme_color` and `background_color` from the shadcn `--background` token. All locales share `id` `/`, so installing from two languages does not create two apps. `/en/manifest.webmanifest` does not exist, like `/en`.
- **Icons**: `icon-192.png`, `icon-512.png` (purpose `any`), `icon-maskable-512.png` (purpose `maskable`, mark inside the 80% safe circle with a margin), `apple-touch-icon.png` (180), and two 64 px tab icons, `favicon-light.png` and `favicon-dark.png`, all under `/icons/`. The design is the biwa-and-wave mark in [the app icon design](../ui-design/app-icon-design.md). Home-screen icons use the dark master (roiro ground, konjiki mark).
- **Document head**: every document links its own locale's manifest, the light and dark tab icons (`media="(prefers-color-scheme: …)"`) and the apple-touch icon, and carries `theme-color`. Code: `apps/public-web/app/features/pwa/`.

## How the icons are made

Updated 2026-09-24: the drawn letter B was replaced by the generated biwa-and-wave mark.

- Each theme has one 1024 master PNG in `docs/ui-design/assets/`, registered with its SHA-256 in `docs/ui-design/generated-image-manifest.v1.json` like every other tracked PNG. Each master is the current image of its identity (`benten/app-icon/roiro-konjiki`, `benten/app-icon/gofun-kincha`). The masters are Codex generations processed by a committed script; the design doc records the provenance.
- At build time, `app-icon.server.ts` decodes the master and reduces it by area averaging to each icon size in plain Node (`node:zlib`). The reduced sizes are not committed. A Vite plugin (`apps/public-web/vite.config.ts`) emits them into the client output, and the dev server serves the same bytes.
- No image dependency is added and the output is the same on every machine. `tests/pwa.test.ts` checks that each master's bytes match its registered hash and that each master is the latest artifact of its identity. It also checks that both masters are two flat colours drawing the same mark, and that the built maskable icon keeps the mark within 35% of the size from the centre.
- `theme_color`, `background_color` and the `theme-color` meta are the sRGB copy of the `:root` `--background` token (`tests/pwa.test.ts` fails on drift). They surround the running light-theme app, so they follow the page and not the icon.

## No service worker

Chrome's current install criteria (web.dev "What does it take to be installable?", checked 2026-09-24) are HTTPS, a manifest with a name, 192 and 512 icons, `start_url`, a standalone-class `display` and no `prefer_related_applications`, plus user engagement. A service worker with a fetch handler is no longer among them. Verified locally with Chrome for Testing (headless): `Page.getInstallabilityErrors` returns no errors for `/`, `/ja` and `/stock/NVDA`, and `PWA.install` succeeds.

U6 recommends a worker only if installability needs one, so none ships: no file, no registration. This keeps holdings, prices, wallet traffic and purchase documents from ever being served stale, with no cache to invalidate. The static test asserts that no worker file or `serviceWorker.register` call is built.

### If one is added later

Only for a measured need (for example, a TWA offline check on a device):

- cache only hashed `/assets/*`, `/icons/*` and an offline page; never `/api/*` (facts, prices, relay), wallet or Pyth traffic, and never a document in the buy flow, Holdings or Activity;
- navigation requests go to the network; the offline page is only the fallback;
- **no `skipWaiting`**: a new worker waits until every Benten tab is closed. Hashed assets make version skew harmless for cached files, but taking over mid-session could swap the chunk set under an open buy flow, whose one-send and unknown-outcome rules must not depend on a background update. `clients.claim` is not used either.

## Not done here

- `/about` install instructions (IA item 7).
- iOS standalone wallet message (IA section 3.5) and a `Share` action (section 3.4) are separate items.
- Android packaging: see `docs/android-packaging.md`.
