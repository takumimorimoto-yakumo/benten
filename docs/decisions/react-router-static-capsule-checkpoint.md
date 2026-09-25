---
id: react-router-static-capsule-checkpoint
title: React Router static capsule checkpoint
date: 2026-09-16
status: done
tags: [architecture, web, static]
repos: [benten]
---

## Scope

This checkpoint records a local build and loopback-host measurement for the
proposed static Web. It is not a cutover, hosting decision, visual acceptance,
API migration, or execution feature. The existing application remains the
authoritative runtime.

The [local Next.js retirement plan](../../specs/next-retirement-execution-plan.md)
uses this checkpoint only as partial Web evidence. It owns the future default
local lifecycle and keeps the historical `ENOTEMPTY` observation unverified
until a bounded, non-destructive diagnostic is run.

## Observed build requirement and pins

The initial `react-router build` with `ssr: false` and only
`react-router`/`@react-router/dev` at 7.18.3 stopped before the build with:

```text
Could not determine server runtime. Please install @react-router/node,
or provide a custom entry.server.tsx/jsx file in your app directory.
```

The local package now uses the aligned exact set
`react-router`, `@react-router/dev`, and `@react-router/node` at **7.18.4**,
plus the standard entry's exact `isbot` dependency at **5.2.2**. The
7.18.4 tagged change notes were evaluated before the move: they did not make
7.18.3 generally unsafe, but matching the standard runtime's exact peer is
the measured, reproducible path. Future interactive/hydrated Web work must
re-evaluate the React Router patch level rather than treating this checkpoint
as a latest-version or vulnerability claim.

The standard renderer is used only while producing the static artifacts; the
configuration still has `ssr: false`, so no runtime Web renderer is supplied
by this capsule.

## Local output and HTTP evidence

`pnpm --filter @benten/public-web test:capsule` built into the task-scoped,
ignored `build-capsule/` output, then verified:

- 775 registry-derived canonical HTML documents and 775 corresponding static
  data artifacts across the five locales.
- One additional `__spa-fallback.html` output from React Router. It is not in
  the local host inventory, and direct access is tested as HTTP 404.
- A loopback-only, port-0 host serves only generated static paths, returns
  308 for a validated dossier casing alias, returns 404 for unknown,
  malformed, English-prefix, trailing-slash, and fallback requests, and sends
  fixed `503`/`no-store` JSON for the facts and acquisition API prefixes.
- The generated client graph contains `entry.client` and `hydrateRoot`.
  `ssr: false` therefore does not mean that the document is JavaScript-free
  or that client navigation/revalidation is absent. The artifact check found
  no Node adapter, financial snapshot, wallet, RPC, or venue dependency in
  the emitted client files.

An earlier default `build/` rebuild failed locally during ignored-output
cleanup with `ENOTEMPTY`. No directory was manually removed. React Router's
documented `buildDirectory` option is used only by the test script to produce
the fresh `build-capsule/` evidence; a future deployment must choose and prove
its own output/host configuration. The normal `pnpm -r build` path still uses
React Router's default `build/` directory and has not been claimed as passing
by this checkpoint.

## Open gates

This is only an F0-W **build/local HTTP partial**. It does not establish a
provider-host true 404, fixed-origin API proxy, production cache behavior,
release marker, stale-tab handling, native full-document navigation, disabled
data prefetch, lazy-chunk recovery, or release-skew safety. It does not
implement any product screen, locale copy, shadcn component, API/BFF, wallet,
signing, sending, or order flow.
