# F-03 legacy Next image optimizer disablement

Date: 2026-09-15

## Scope

The legacy `apps/web` application has no `next/image` consumer, image asset,
or AVIF asset. Its Next.js image optimizer is therefore disabled with
`images.unoptimized: true` in `apps/web/next.config.mjs`. This is a narrow
local mitigation for the reachable optimizer route; it does not upgrade Next.

## Evidence method

The installed local package is `next@14.2.35`. Its
`dist/server/next-server.js` checks `imagesConfig.unoptimized` before image
parameter validation and calls `render404` for `/_next/image` when it is true.
The regression test imports the real configuration and requires this flag.
After a production build, the generated `.next/images-manifest.json` must also
record `images.unoptimized: true`. A local Next runtime then receives a
non-payload request to `/_next/image` and must return HTTP 404 rather than
entering image-parameter validation or image processing.

## Local verification receipt

At local commit preparation, the Web test suite passed 43 tests, TypeScript
typecheck passed, and `next build` produced an images manifest with
`path: "/_next/image"`, `loader: "default"`, and `unoptimized: true`. The
production server returned HTTP 404 with `text/html; charset=utf-8` for both a
well-formed non-payload request (`url=/test.avif`, `w=64`, `q=75`) and an
invalid-width variant. Home returned HTTP 200 in English, Japanese, Korean,
Simplified Chinese, and Traditional Chinese; English and Japanese GME detail
also returned HTTP 200. A headless browser completed Home and GME navigation
without page errors.

## Visual exemption

This is a configuration-only security mitigation. It adds no screen, style,
asset, or layout change, so no new visual-direction artifact or visual
acceptance is claimed.

## Boundary

No AVIF payload or exploit is executed. This evidence is local only and does
not establish the deployed revision, CDN/ingress behavior, host operating
system, or remediation of the separate Windows-hosted Next advisory. The
remaining advisories and a supported-framework migration/upgrade remain
separate release decisions.
