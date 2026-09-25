---
id: react-router-static-web
title: Recommend React Router Framework Mode for static public Web
date: 2026-09-14
status: exploring
tags: [architecture, web, api]
repos: [benten]
plan_start: 2026-09-14
plan_end: 2026-09-14
---

## Scope and decision status

The narrow [local Next.js retirement plan](../../specs/next-retirement-execution-plan.md)
now owns the executable order for the standalone facts shell, repository-default
local lifecycle, protection migration, and any later authorized removal. This
ADR still owns the framework recommendation and remote-topology hypothesis; it
does not make local retirement depend on product UI or public deployment.

Directly confirmed product requirements are React with default shadcn/ui,
robust user experience rather than migration-cost optimization, and a fresh
reconsideration of Next.js. The available history does **not** independently
preserve the proposal behind a past “OK”, so it cannot prove that the user
selected React Router specifically. Accordingly, this ADR **recommends**
React Router v7 Framework Mode and Vite, `ssr: false`, and an explicit
registry-derived prerender list as the new static-Web candidate. It does not
remove Next.js, create a project, install a dependency, or authorize a
deployment. `apps/web` remains the current production implementation until a
separately authorized, verified cutover and retirement gate passes.

The two-Vercel-Project topology and Hono API shell below are **recommendations
to prove**, not user-approved hosting, vendor, credential, cost, or release
decisions. They are recorded here only to give F0 a coherent hypothesis. The
authoritative work packages, operational limits, cost study and release gates
remain in [vNext architecture](../../specs/vnext-architecture.md); this ADR
does not duplicate them.

The new Web has no runtime SSR server, React Server Components, or Server
Actions. `ssr: false` still causes React Router to render the root at build
time, so routes must be safe when browser globals are unavailable. Build-time
pre-rendering is not runtime SSR and does not create a data or order backend.
Public data remains the reviewed snapshot only; wallet/RPC/DEX code is absent
from discovery pages. This Web/API split does **not** make either app the owner
of a generic Solana connector. A future approved connectivity capability is
independently operated. Initial future network access is an external registered
server/agent calling that owner's API directly; any Benten-hosted context
adapter needs a distinct later transport/session decision. No long-lived
capability key belongs in static Web assets, and no provider SDK belongs in the
facts API or local stdio MCP. This is a future boundary, not an existing runtime.

## Web recommendation after comparison

| Candidate | Assessment | Decision |
| --- | --- | --- |
| **React Router v7 Framework Mode + Vite, `ssr: false`, enumerated prerender** | Framework route modules provide the build-time path/data/HTML mechanism needed for finite canonical locale and dossier URLs, plus route-level error handling and client navigation. The tagged documentation says `prerender: true` omits dynamic parameter values; an array/function must enumerate them. | **Recommended candidate** for F0, not user-confirmed framework selection. |
| Next.js static export | Official Next documentation supports build-time HTML/static payload output. It remains technically capable of static delivery. | **Not recommended for the new candidate**, because this scope has not shown a need for Next-specific request/server model features; this is not a claim that Next cannot be separated or run statically. |
| React + raw Vite SPA (with or without React Router Data/Declarative mode) | To retain the required registry documents, initial HTML metadata, data output and unknown-route classification, it needs a separate SSG mechanism, whether packaged or custom. A generic SPA fallback can return 200 for an unknown detail URL, which violates the required real 404. | **Not currently recommended.** The RR candidate already provides static HTML/data generation and routing in one build; hosting/ingress still owns true 404 in either choice. |
| Astro static site + React islands | Viable static technology. Its page-template/island integration would require deliberate coordination of the interactive catalog's React navigation, URL state, error states and return-scroll behavior with Astro routing/hydration. | **Not currently recommended.** No product requirement currently justifies that integration boundary; reconsider if F0 shows React Router output or hosting cannot meet the public URL contract. |
| TanStack Router (non-Start) + Vite | The researched official material documents router SSR in the TanStack Start context. This survey did not establish an equivalent non-Start static-export path for the required finite HTML/data contract. | **Not currently recommended.** This is an evidence gap, not a claim that non-Start static export is impossible. |
| TanStack Start static prerender / SPA | Official documentation shows static prerender and SPA modes, so it is capability-viable. Its current overview labels Start as RC while describing the Start API as stable; host and client-data parity for this product would need additional proof. | **Not currently recommended.** No product benefit over the RR candidate has been established for the added RC/host/client-data evaluation. |

React Router is recommended for its build-time static-route capability, not for a
claim of superior speed, SEO, reliability, or vendor fit. Raw Vite is not
rejected because it is incapable of React/shadcn UI; retaining this URL
contract would add a separate SSG mechanism, packaged or custom, whereas the
recommended React Router build provides static documents/data and routing
together. The host ingress independently provides true HTTP 404. The first build must
derive all paths from the allowlisted registry rather than use `@latest`, a
hand-maintained ticker list, or a runtime upstream request.

## Recommended responsibility topology (not yet approved or deployed)

Recommend two independently built Vercel Projects from this monorepo:

```text
reviewed snapshot -> @benten/registry pure read model
                    |                         |
             public-web build            public-api adapter
                    |                         |
 Web Project: static Web + ingress   API Project: JSON only
      /api/** -- fixed-origin rewrite --> /api/** (prefix preserved)
```

`apps/public-web` would own static files, canonical 308 aliases and the
five-locale HTML 404 response. Its ingress would route `/api/**` **first** to
a deployment-configured, reviewed fixed API origin while preserving the
`/api` prefix; it must never accept a caller-provided origin or become an open
proxy. The API Project would remain directly callable for server-to-server
clients if the Web Project is unavailable. “JSON only” means the API has no
HTML pages, locale copy, static files, SPA fallback, or HTML 404. It does not
mean every method response is JSON: preserve current control-method bodies and
headers where the [C-API/MCP method matrix](../../specs/vnext-architecture.md#c-apimcp-exact-public-transport-parity)
requires it. The unknown API-path JSON 404 is an intentional normalization;
the matrix, not framework defaults, owns its exact disposition. Five-locale
public copy belongs only to the Web/ingress boundary.

The API hypothesis is `apps/public-api/src/app.ts` as a thin Hono
`Request -> Response` presenter and `src/index.ts` exporting that app as the
default Vercel entry. `@hono/node-server` is only the candidate local/other
Node adapter, not a second domain service. `packages/registry` stays the pure
identity/fact authority. `packages/mcp` remains a separate Node stdio
presenter over that read model; it does not call Web or API HTTP for financial
reads. No API route gains signing, sending, ordering, private analysis, or a
live upstream data connector.

Web and API code may deploy independently while using the same reviewed
artifact revision. A **data** update is different: build and preview both
projects for `Rnew`, then promote them sequentially; do not call this atomic.
During any mixed-revision interval, the Web compares every dynamic API result
revision with its page revision. On mismatch it rejects the complete dynamic
result, displays the revision and a refresh/retry state, and never joins old
and new financial fields. The separate Web deployment identity and stale-tab
handling for HTML, generated `.data`, prefetches and lazy chunks are owned by
[C-RELEASE](../../specs/vnext-architecture.md#c-release-independent-code-deployments-coordinated-public-artifact-data),
not by `artifact_revision` alone. This preserves snapshot-only semantics.
Detailed release ordering, cache behavior and rollback thresholds remain there
rather than being repeated here.

## API transport comparison

| Candidate | Fit for four protected snapshot GET routes | Recommendation |
| --- | --- | --- |
| Native Vercel Fetch handler / local `node:http` wrapper | Smallest runtime dependency and legitimate fallback for a Vercel-only function. A standalone Node mode would require Benten to own the low-level request/response, abort, timeout, shutdown, method and parity bridge. | Keep as the reversal fallback; prove it if Hono fails parity or adapter detection. |
| **Hono + official Node adapter** | Standard `Request`/`Response` app, explicit route/error hooks and documented Vercel default-app export; preserves a narrow HTTP shell without changing registry semantics. | **Recommended hypothesis** for F0-A, not adopted. Test raw query and HEAD behavior against the current Next oracle. |
| Fastify | Appropriate if later requirements genuinely need its schema/plugin/logging surface. Its validation and automatic HEAD defaults require deliberate fail-closed compatibility configuration. | Not preferred for the present four-route extraction; reconsider by ADR with the golden parity suite if scope changes. |

Hono is not chosen for an unmeasured performance claim. The API must preserve
the existing v1/v2 GET/HEAD body, status, selector precedence and malformed
input behavior, while its OPTIONS and unsupported-method responses follow the
same [C-API/MCP method matrix](../../specs/vnext-architecture.md#c-apimcp-exact-public-transport-parity).
Do not claim strict all-method JSON parity or let Hono defaults decide it. In
particular, do not substitute Hono's convenient parsed-query helper for the
current raw `URLSearchParams` rules before duplicate/unknown query tests pass.

## Candidate versions and evidence limits

F0 must use exact pins and a clean, frozen workspace resolution; no dependency
is installed or locked by this ADR. The bounded candidate set observed in
registry metadata on 2026-09-14 is:

```text
react/react-dom                 19.2.7
react-router/@react-router/dev  7.18.3
vite                            8.3.0
typescript (Web-local)          5.9.3
tailwindcss                     4.3.3
shadcn CLI                      4.21.0
hono                            4.13.7
@hono/node-server               2.1.1
```

The Web must own TypeScript 5.9.3 locally: `@react-router/dev@7.18.3` declares
TypeScript `^5.1.0 || ^6.0.0`, while the current workspace root range is
TypeScript 7. Actual peer resolution, generated shadcn files, Vite/plugin
compatibility, license/SBOM and Node 24 build behavior are unverified until a
clean F0 prototype.

Version-scoped React Router evidence (not rolling latest-site documentation):

- [v7.18.3 pre-rendering](https://github.com/remix-run/react-router/blob/react-router%407.18.3/docs/how-to/pre-rendering.md): dynamic values require explicit enumeration; with `ssr: false`, pre-rendered matched routes may use loaders and emit static HTML/data.
- [v7.18.3 SPA mode](https://github.com/remix-run/react-router/blob/react-router%407.18.3/docs/how-to/spa.md): `ssr: false` disables runtime rendering but build-renders the root; SPA fallback behavior needs host routing.
- [Next.js static export](https://nextjs.org/docs/app/guides/static-exports): documents build-time HTML/static payload output; it does not prove this scope needs the Next-specific model.
- [Astro routing](https://docs.astro.build/en/guides/routing/): supports the static/dynamic route capability considered for the unselected Astro alternative; it does not establish an advantage for this product's interactive React route state.
- [TanStack Router SSR](https://tanstack.com/router/latest/docs/framework/react/guide/ssr): documents the SSR path considered in the survey; a non-Start static-export equivalent was not established here.
- [TanStack Start static prerendering](https://tanstack.com/start/latest/docs/framework/react/guide/static-prerendering), [SPA mode](https://tanstack.com/start/latest/docs/framework/react/guide/spa-mode), and [overview](https://tanstack.com/start/latest/docs/framework/react/overview): establish the capability-viable Start alternative and its current RC/stable-API labeling.
- [shadcn Vite installation](https://ui.shadcn.com/docs/installation/vite) and [shadcn React Router installation](https://ui.shadcn.com/docs/installation/react-router): document both supported non-Next foundations, so shadcn does not require Next.js.
- [Vercel monorepos](https://vercel.com/docs/monorepos) and [rewrites](https://vercel.com/docs/routing/rewrites): support the proposed separate Project and fixed external-origin rewrite mechanisms, not this repository's final routing correctness.
- [Vercel Hono](https://vercel.com/docs/frameworks/backend/hono), [Vercel Node runtime](https://vercel.com/docs/functions/runtimes/node-js), and [Hono Node adapter](https://hono.dev/docs/getting-started/nodejs): support the candidate adapter shapes, not wire-contract parity or deployment approval.

## F0 proof, limits, and reversal

Before implementation/cutover, F0 must demonstrate an isolated clean build
with registry-derived five-locale document paths, correct HTML/data metadata,
real unknown URL and unknown `.data` non-200 behavior, validated 308 aliases,
`/api/**` prefix-preserving precedence, no usable SPA fallback URL, and no
wallet/RPC graph in discovery bundles. F0-A separately demonstrates the four
current API routes' direct-origin defined-contract parity, including raw
queries, the C-API/MCP method matrix, error bodies and revision labels.
Browser, accessibility, visual review, cost,
host-provider behavior, CORS/rate limits, security and release evidence remain
separate gates.

Reverse the framework selection by a new decision if the pinned React Router
build cannot produce the registry URLs/metadata, the Web host cannot guarantee
API-first routing plus true HTML 404, or client isolation fails. Reverse the
Hono recommendation to a native Fetch dispatcher if its adapter or golden
parity proof fails; reconsider Fastify only if measured API complexity changes.
None of these reversals permits a silent SPA catch-all, moving HTML 404 into
the API, retaining Next as the new destination, or adding execution authority.
