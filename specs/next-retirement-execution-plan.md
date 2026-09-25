# Local Next.js retirement execution plan

Status: **additive local stack implemented; deletion not authorized**
(2026-09-22). This is the
authoritative plan for retiring the legacy Next.js application from the
repository's **local active runtime**. It authorizes and records the completed
additive local implementation, but does not authorize deletion, deployment,
publication, or any financial operation.

Revision (2026-09-23): for the hackathon submission revision, the repository
default `dev`, `build`, `typecheck`, and `test` were returned to the accepted
Next.js web application in `apps/web`, because the additive Web capsule is
still an under-construction shell and the submission needs a working product
surface. The additive stack is fully retained and remains runnable and
buildable under `pnpm dev:local-stack` and `pnpm build:vnext`, with its
guards, launcher test, and disposition manifest unchanged. `LR-N0` and `LR-V0`
remain unauthorized; nothing was deleted. Section 8's recorded `LR-G0` default
therefore describes the earlier revision, not the current default. The
categories in `specs/legacy-next-disposition.v1.json` are a byte inventory
produced by this retirement plan and describe what each file would become if
`LR-N0` were authorized; they do not mean the submission-default `apps/web`
application is pending deletion.

Revision (2026-09-24): by user decision, `apps/public-web` (React Router +
Vite) and `apps/public-api` are again the product body, and the 2026-09-23
revision above is reverted. Root `dev`, `build`, `typecheck`, and `test` once
more run the new Web plus the standalone facts API; the Next.js app keeps
`dev:legacy-web`, `build:legacy-web`, and `test:legacy-web` (typecheck plus
tests), `build:vnext` is folded into `build`, and CI runs the legacy commands
as a separate job. The framework-independent purchase logic moved from
`apps/web/lib/purchase/` to `packages/purchase` (`@benten/purchase`), and the
read-only Solana RPC relay moved to `packages/solana-rpc-relay`
(`@benten/solana-rpc-relay`), which both the legacy Next route and the facts
API use. This amends LR-HTTP-1 and LR-LOCAL-1 for exactly one route,
`POST /api/solana-rpc`, recorded where each contract is defined below; it is
the only exception to the snapshot-only facts runtime. `apps/web` is still not
deleted, and `LR-N0`/`LR-V0` remain unauthorized.

Hosting revision (2026-09-24, branch `vercel-hosting`, not deployed):
`vercel.json` no longer builds `apps/web`. One existing Vercel Project at the
repository root serves `apps/public-web` and `apps/public-api` from a Build
Output API v3 directory that `scripts/vercel/build-output.mjs` assembles after
`pnpm build`: the static layer answers only an exact `GET`/`HEAD` of the local
host's servable inventory, and one Node function answers every other request
with the same `classifyWebIngress` decision and the facts API in process
(`apps/public-web/host/hosted-ingress.ts`). This replaces the two-Project
proposal in the vNext architecture for this stage; `scripts/vercel/output.test.mjs`
is its equivalence evidence against the local host. Provider behavior
(routing on raw paths, path overrides, the Node 24 runtime, the edge client
address headers) is a separate live gate, and no deployment or Project
setting change is part of this revision.

## 0. One-page decision summary

The three additive blockers are now closed:

1. `apps/public-api` serves the four public facts routes without Next.js;
2. root `dev`, `build`, `typecheck`, and `test` use `apps/public-web` plus the
   standalone facts API; and
3. CI and publication checks follow that new local default and guard its output.

The remaining retirement milestone is deliberately narrow: obtain separate
authority for the reviewed 64-path removal manifest, remove the old app in one
dedicated commit, then run post-removal acceptance. Product UI,
AI, purchase, sponsor, native-client, public-hosting, and release acceptance
are independent lanes. They do not block additive local-runtime work and are
not made complete by it.

The target local command contract is a plain repository-default `dev`,
`build`, `typecheck`, and `test` over the new Web and facts API. The Web may be
shown only as an **under-construction, non-product shell** until its separate
design and browser acceptance passes. Local success is not evidence of a
provider 404, production rewrite, public deployment, or safe product release.

## 1. Scope, baseline, and precedence

This plan narrowly supersedes the old coupling that made *local* Next.js
retirement wait for product cutover `K0`. It does not supersede public release,
hosting, UI, purchase, sponsor, or rollback requirements in
[vNext architecture](vnext-architecture.md). Remote cutover and removal from a
deployed topology still require their own accepted evidence and authority.

Current evidence, not completion claims:

- `apps/web` is the active Next.js app and owns four facts HTTP routes.
- `packages/registry/src/public-read-model.ts` already owns the pure public
  read semantics; `packages/mcp` is an independent presenter over that model.
- `apps/web/lib/public-v2.ts` owns strict v2 query parsing and the current Web
  envelope/status mapping. Existing Web and MCP differential tests protect
  data semantics, but they are not an HTTP transport oracle.
- `apps/public-web` is a React Router static capsule. Its measured capsule
  output is not an accepted product UI or the repository-default lifecycle.
- A prior default `build/` rebuild reported `ENOTEMPTY`. It has **not** been
  reproduced in this planning turn; its current cause and status are unknown.
- Root scripts, CI, Vercel checks, `.vercelignore`, the publication scanner,
  and scanner tests still contain explicit legacy paths or Next assumptions.
- No persistent local port is allocated for this stack. A future diagnostic
  uses loopback port `0` or an explicitly supplied environment binding; a
  persistent port-registry change is a separate reviewed action.

### Invariants

- Public financial field meaning, allowlists, artifact revision, disclaimer,
  and MCP compatibility do not change.
- The facts API imports only public-safe read contracts. It has no private
  analysis, DB, credential, RPC, wallet, signing, sending, order, AI, purchase,
  acquisition, or provider dependency. Exceptions (2026-09-24 user
  decisions): the read-only relay route and the read-only Pyth prices route
  of the amended LR-HTTP-1, whose optional upstream credential lives only in
  the server environment.
- Legacy UI components, CSS, and IA are not copied and are not retirement
  acceptance gates. Useful pure validation or formatting logic is retained
  only through an explicit consumer and tests.
- Guard migration replaces protections; it never deletes a guard merely to
  make the retirement check pass. The sign/send deny boundary is unchanged.
- Old raw captures and Git history remain reviewable. No cleanup command may
  delete an unmarked, symlinked, foreign, or user-owned output directory.

## 2. Contracts to freeze before implementation

### LR-HTTP-1: exact facts HTTP contract

This section specializes [C-API/MCP exact public transport
parity](vnext-architecture.md#c-apimcp-exact-public-transport-parity) while
preserving the field and envelope meanings in the [public data v2
contract](contracts/public-data-v2.md). The matrix prevents a legacy capture
from overriding an intentional normalization.

The known paths are:

- `/api/fundamentals/:ticker`
- `/api/financials/:ticker`
- `/api/v2/fundamentals`
- `/api/v2/financials`

| Case | Legacy HTTP capture | New-shell authority |
| --- | --- | --- |
| Known path `GET` | Literal status, body, `Content-Type`, cache and revision headers are the parity oracle. | Match unless the public-data contract records an explicit reviewed delta; financial fields never change here. |
| Known path `HEAD` | Capture the real route/middleware result. | Same selector-derived status and material headers as target `GET`, empty body. Any old difference is a labeled migration. |
| Known path `OPTIONS` | Capture for provenance; do not inherit a framework default. | `204`, empty, `Allow: GET, HEAD, OPTIONS`, `Cache-Control: no-store`, no CORS grant. |
| Known path other method | Capture for provenance. | `405`, empty, exact C-API/MCP `Allow` and material headers, no CORS grant. |
| Unknown `/api/**`, any method | Capture only to document the legacy difference. | Intentional normalization: `404`; except `HEAD`, JSON `{"error":{"code":"unknown_endpoint"},"disclaimer":PUBLIC_DISCLAIMER}`, `Content-Type: application/json`, `Cache-Control: no-store`; `HEAD` has the same status/material headers and no body; no `Allow` or CORS. |

Dynamic facts and all error/control responses are `no-store`. The standalone
direct origin remains browser-CORS closed.

2026-09-24 amendment, relay route only: `/api/solana-rpc` is a known path
outside the facts matrix above. `POST` is the read-only Solana JSON-RPC relay
from `@benten/solana-rpc-relay`: measured method allowlist, unsigned-only
`simulateTransaction`, same-origin caller check (403 before the body is read),
per-instance rate limit (429 with `Retry-After`), 413 above the body bound,
and an upstream URL read only from the server environment, never echoed. Every
other method, including `HEAD` and `OPTIONS`, answers `405` with
`Allow: POST` and `Cache-Control: no-store` (empty body for `HEAD`), with no
CORS grant. The facts dispatcher itself stays network-free: the relay is
composed in front of it, and near misses such as `/api/solana-rpc/extra`
remain the unknown-path `404`.

2026-09-24 amendment, prices route only (Pyth reference prices, user
decision of the same day): `/api/prices` is a second known path outside the
facts matrix. `GET` and `HEAD` read Pyth reference prices from
`@benten/pricing`: the query is only one or more `feed` keys, each an exact
lowercase feed id from the reviewed feed map `pyth-feeds-v1.json`, at most
32, no repeat and no other key (`400` otherwise, `feed_not_allowed` for a
well-formed id outside the map); only that map's Pyth price accounts are
read, with one `getMultipleAccounts` to the same server-environment upstream
as the relay, never echoed. The route applies the relay's same-origin caller
check (`403` before any read), a per-instance per-client call budget (`429`
with `Retry-After`), a per-feed per-instance cache, an upstream timeout and
a response-body bound. `200` bodies are `{prices, feed_map_revision,
disclaimer}` with `Cache-Control: no-store`; a feed that could not be read
carries a closed reason and no value. Every other method answers `405` with
`Allow: GET, HEAD` and `Cache-Control: no-store`, with no CORS grant. The
Pyth Hermes HTTP API is not used because it requires an API key since
2026-08-26. The facts dispatcher stays network-free, and near misses such as
`/api/prices/extra` remain the unknown-path `404`.

Strict v2 parsing uses raw `URLSearchParams`: one of `ticker` or `mint`, no
unknown or repeated key, and `statement` only on financials. Framework query
helpers and automatic HEAD/OPTIONS behavior cannot replace this contract.
Intentional transport normalization is documented as a migration difference;
financial meaning may not drift.

A bounded capture ran the installed legacy Next route modules through real
local HTTP and froze GET/HEAD/OPTIONS/405, raw query, error, and unknown-path
observations with source revision and SHA-256. The unknown-path HTML is kept as
provenance-only because the new JSON 404 is an intentional normalization. The
new shell does not generate its own oracle. Registry outputs and MCP structured
outputs remain separate semantic oracles; comparing two functions that share
the new implementation is not HTTP parity.

### LR-LOCAL-1: local process and origin contract

The facts app is a plain Fetch `Request -> Response` boundary with a small
Node 24 `node:http` adapter. It deliberately uses no HTTP framework: four exact
routes, explicit method handling, raw `URLSearchParams`, and one JSON response
primitive were smaller and more directly verifiable than adding Hono. Tooling
is pinned to `typescript@5.9.3`, `vitest@5.0.0`, and
`@types/node@24.13.4`, aligned with the public-Web toolchain.

Tests bind each server to `127.0.0.1:0`. The local-stack launcher starts the
API, reads the OS-assigned origin, and passes it directly to the Web host/proxy.
Callers, URL parameters, browser storage, and forwarded headers cannot select
the target origin. Both servers share one launcher process; it prints both
loopback origins and closes both on `SIGINT` or `SIGTERM`. A persistent fixed
port or shared port-registry entry is out of this milestone.

2026-09-24 amendment: the launcher also accepts `BENTEN_LOCAL_STACK_API_PORT`
and `BENTEN_LOCAL_STACK_WEB_PORT` (default `0`) as an explicit per-run
environment binding; no persistent port is registered. Facts proxying still
forwards no request headers, cookies, body, or origin. The one exception is
the ingress decision `proxy_solana_rpc` for the exact path `/api/solana-rpc`:
the host streams its body unparsed to the same launcher-fixed API origin with
only `Content-Type`, `Content-Length`, `Origin`, `Sec-Fetch-Site`, and the
edge `Host` (the relay's caller check compares against it), sets `X-Real-IP`
from the socket in place of any client value, and returns only `Allow`,
`Cache-Control`, `Content-Type`, and `Retry-After`.

2026-09-24 amendment, prices route: the ingress decision `proxy_prices` for
the exact path `/api/prices` forwards `GET`/`HEAD` with the unchanged raw
query to the same launcher-fixed API origin under the same header rule as
`proxy_solana_rpc` (caller-check headers and edge `Host` only, `X-Real-IP`
from the socket, the same four response headers), with no request body.
Without an injected API origin it answers `503`
`{"status":"unavailable","service":"prices"}`.

Before removal, root `dev`, `build`, `typecheck`, and `test` become explicit
new-stack commands rather than recursive workspace discovery: they name
`@benten/registry`, `@benten/solana`, `@benten/mcp`, `@benten/public-api`, and
`@benten/public-web` plus the publication checks. The legacy app remains
invocable only through a clearly named oracle-capture command until `LR-N0`;
it is not silently exercised by a repository-default command. This makes the
default lifecycle truthful while keeping the old bytes available for review.

### LR-OUTPUT-1: generated-output ownership

The recommended default output is
`apps/public-web/.generated/local-web/output/`, separate from the three existing
`build/`, `build-capsule/`, and `build-host/` histories. Its ownership sidecar
is `apps/public-web/.generated/local-web.owner.json`, outside the compiler-cleaned
directory, and binds schema version, canonical output realpath, app identity,
and the last completed artifact digest. Before each build, the launcher uses
`lstat` and realpath containment: a missing output is creatable; a non-symlink
output may be replaced only when the valid sidecar names it. Missing/malformed
sidecar, symlink, foreign files, or containment failure aborts without cleanup.
The launcher writes an atomic `building` sidecar before compiler entry and
changes it to `complete` only after artifact validation. A failed/interrupted
attempt preserves and hashes its task-owned output as `failed`; a retry may
replace only that same contained, non-symlink attempt after proving its process
is gone and recording its file manifest. It never touches the existing
`build*` directories or an output without this sidecar lifecycle.

Before adopting that path, the bounded `ENOTEMPTY` diagnostic records current
configuration, `lstat`, symlink state, ownership, open handles, and builder
behavior and proves one fresh isolated build. Failure or React Router
incompatibility aborts `LR-W0`; it never triggers fallback deletion of existing
`build*` directories or an unspecified replacement path.

## 3. Implemented paths and ownership

These paths implement the additive local stack:

```text
apps/public-api/
  package.json, tsconfig.json
  src/app.ts, src/constants.ts, src/index.ts, src/node.ts
  src/presenters/legacy-v1.ts, src/presenters/public-v2.ts
  src/solana-address.ts
  tests/contract.test.ts, tests/direct-origin.test.ts
  tests/golden/legacy-http.json
apps/public-web/
  app/lib/public-api-client.ts
  ingress/local-proxy.ts
  tests/local-stack.test.ts, tests/release-guard.test.ts
scripts/
  run-local-stack.mjs
  run-local-stack.test.mjs
  check-legacy-disposition.mjs
```

The system owner owns the literal oracle, facts API, root lifecycle, CI and
publication guards. The Web owner owns only the public-Web client/proxy
integration and its browser-independent local-stack tests. UI design and
visual acceptance remain separate. No owner imports the old app into the new
runtime to achieve parity.

## 4. Authoritative work-package registry and DAG

This table is the only normative dependency graph. Prose and diagrams are
explanatory and must not add edges.

| WP | Owner | Depends on | Inputs | Outputs and allowed future paths | Tests/evidence | Abort, recovery, commit boundary |
| --- | --- | --- | --- | --- | --- | --- |
| `LR-C0` independent oracle | system | none | current legacy routes at a frozen revision; LR-HTTP-1 | literal fixtures/manifest under `apps/public-api/tests/golden/**`; no product source dependency | bounded real-local-HTTP capture; fixture digest/readback; mutation proves oracle is literal and Next-independent | Abort on unavailable legacy process, redirect/method ambiguity, unstable bytes, or secrets. Preserve capture separately; one additive fixtures/contract commit. **Can start immediately; no deletion, UI, AI, purchase, sponsor, native, or hosting gate.** |
| `LR-A0` facts shell | system | `LR-C0` | registry read model, current v1/v2 presenter behavior | `apps/public-api/**`; strict legacy/v2 presenters and explicit native method/unknown-path dispatcher | all literal HTTP fixtures; 154-asset fundamentals/PL/BS/CF semantic matrix; malformed/repeated/unknown query; direct port-0 process; MCP semantic compatibility; import/secret/network scans | No response widening. Separate additive API commit; old app remains. |
| `LR-W0` Web/output preflight | Web | none | current public-Web capsule, LR-OUTPUT-1 | guarded default output configuration and Web-only local host proof; no facts proxy yet | sidecar/realpath/symlink/foreign-output negatives; bounded ENOTEMPTY diagnosis; isolated build and local 404/308/fallback checks | Abort on output ambiguity, builder incompatibility, or need to copy old UI. Existing capsule stays intact. Separate additive Web-preflight commit; can run in parallel with C0/A0. |
| `LR-I0` default integrated local lifecycle | system + Web | `LR-A0`, `LR-W0` | LR-LOCAL-1, verified API and Web process | fixed-origin proxy/client, `scripts/run-local-stack.mjs`; explicit root new-stack command set | API direct and proxied contract; process abort/child-exit/port-0 tests; artifact/release mismatch; Web-down direct API | Abort on caller-controlled origin, client import of server/private code, or false product-ready label. Revert only integration/lifecycle commit; API and Web preflight remain. |
| `LR-G0` guard and CI migration | system | `LR-A0`, `LR-I0` | CI/package scripts, Vercel checker, ignore/scanner bindings and tests | root scripts/CI/config protection updates; no remote provider change | clean install/build/typecheck/test job definition; scanner fixture mutations for generated outputs and zero-catalog state; old-path absence; sign/send and private-data denies unchanged | Abort if any old guard lacks an equivalent replacement or remote assumptions are needed. One guard/CI commit, independently revertible. |
| `LR-X0` retained-value disposition | system + Web | `LR-C0`, `LR-W0` | exact `apps/web` inventory and tests | reviewed keep/move/history/delete manifest; only accepted pure helpers move to a named consumer | every moved helper has identical-input golden tests; route i18n/currency/period cases represented by accepted public-Web/copy tests; no old CSS/component dependency | If a consumer is not accepted, retain behavior as history rather than copying it. No deletion in this WP. One extraction commit only if there is actual retained code. |
| `LR-N0` authorized local retirement | system | `LR-G0`, `LR-X0`, explicit deletion authority | reviewed removal manifest and rollback commits | remove active `apps/web`, Next-only packages/lock entries/scripts/tests/config/ignore bindings; retain docs/Git/oracle | no active Next import/dependency/workspace/test/config/output binding; complete replacement guard suite; task-path diff manifest | No authority means stop with additive stack working. Abort on unclassified file or guard gap. Dedicated removal commit; recover with targeted revert, never reset hard. |
| `LR-V0` local retirement acceptance | system, independent reviewer | `LR-N0` | frozen post-removal tree | evidence receipt only | fresh frozen install; repository-default dev startup smoke, build, typecheck, test; facts direct/proxy; MCP; scanner; no-Next graph/path scan; no stale generated output used | Any failure means “local retirement incomplete.” Targeted revert of `LR-N0`/affected config only, preserving unrelated later commits. No deploy or product-release claim. |

Machine-readable edges:

```text
LR-C0 -> LR-A0
LR-A0 -> LR-I0
LR-W0 -> LR-I0
LR-A0 -> LR-G0
LR-I0 -> LR-G0
LR-C0 -> LR-X0
LR-W0 -> LR-X0
LR-G0 -> LR-N0
LR-X0 -> LR-N0
deletion-authority -> LR-N0
LR-N0 -> LR-V0
```

The graph is acyclic. Deletion authority gates only `LR-N0`; it does not block
the additive oracle, API, local Web, guard, or inventory work.

## 5. Requirement traceability and acceptance

| Requirement | Contract | Future module/path | WP | Required evidence |
| --- | --- | --- | --- | --- |
| Exact v1/v2 transport without financial drift | LR-HTTP-1 | `apps/public-api/src/**`, `tests/golden/**` | C0, A0 | independent HTTP literals; method/query/cache/error matrix; registry and MCP semantic parity |
| Standalone facts service, no private/effect graph | LR-HTTP-1/LR-LOCAL-1 | `apps/public-api/**` | A0 | process-level port-0 tests; import, secret, DB/RPC/wallet/order/AI deny scans |
| Independent Web preflight | LR-OUTPUT-1 | public-Web output/host tests | W0 | guarded output, bounded diagnostic, isolated build/HTTP behavior |
| Repository-default new Web + facts lifecycle | LR-LOCAL-1 | public-Web proxy, local-stack script, root scripts | I0 | fixed internal origin, child shutdown, direct/proxied facts, default commands |
| Protection coverage survives migration | existing publication/no-effect policies | CI, scanner, ignore/check scripts | G0 | path/hash/mode/CJK/tamper/output tests; sign/send deny unchanged |
| Useful logic retained without copying legacy UI | public fact and accepted-copy contracts | explicit extraction only | X0 | consumer-based golden tests and disposition manifest |
| Next absent from active local graph | removal manifest | old app and active manifests/config | N0, V0 | fresh dependency/import/path scans and full local commands |
| Local result not mislabeled as public release | this precedence boundary | evidence receipt | V0 | receipt says local only; remote provider/deploy gates remain open |

`LR-V0` accepts local retirement only when all four repository-default commands
are truthful and the direct facts endpoint remains usable while the Web is
down. Route-count, dependency installation, or build success alone is not UI,
product, hosting, or release completion.

## 6. Guard migration and legacy disposition detail

`LR-G0` must replace these bindings atomically with their new equivalents:

- root `dev`, `test`, and `check:vercel` assumptions and CI's legacy `web`
  test step;
- the config checker that exact-asserts a Next root `vercel.json`;
- `.vercelignore` and publication-scanner requirements for `.next/`;
- localization-manifest and message-source paths in the publication scanner
  and its hash, regular-file, unknown-CJK, traversal, and missing-manifest
  tests; and
- the old page path in the network-free-path set.

At `LR-G0`, root `check:vercel` and its CI invocation leave the active default
command graph; no replacement claims remote proof. At `LR-N0`, active root
`vercel.json` and its Next-exact checker are removed, with reviewed bytes
retained by Git history and the removal manifest. A future hosting decision
must add a new topology/config and separately named remote-release check from
first principles. Local CI checks only artifacts and routing contracts it can
actually observe.

Old locale routing/middleware and message catalogs are not copied merely to
preserve file paths. Until `LR-N0`, their existing manifest/hash checks remain.
If no accepted new localized-copy consumer exists at removal, `LR-N0` removes
the legacy catalog, manifest, and catalog-specific scanner branch/tests
together; it does not create an allowlist for nonexistent copy. The scanner's
default rule continues to reject unallowlisted CJK/source text, and zero
localized catalogs is tested as a valid fail-closed state. Accepted locale
IDs, canonical URL rules, and safe number,
currency, date, and period cases are represented by new public-Web fixtures.
The pure period presenter may move only if an accepted new screen consumes it;
otherwise its tests remain historical evidence until `LR-N0`. The old
components, CSS, wallet libraries, and screen-specific text are deletion
candidates, not hidden dependencies of the under-construction shell.

## 7. Separate lanes and cut lines

These lanes do not enter the local-retirement DAG:

- **UI/agent-first product:** still needs accepted information architecture,
  real browser implementation, independent visual/accessibility QA, and agent
  privacy/tool/evaluation design. The local shell must say under construction.
  2026-09-24 (W2a): once the Dossier rendered real registry content, the
  shell's `Under construction` aside was replaced by a factual `Development
  preview` badge in the shared header of every page; the runtime still labels
  itself unreleased until independent visual and direct-human acceptance.
- **Purchase:** still needs positive audited route/price evidence, wallet and
  transaction implementation, independent security/runtime QA, legal review,
  and personally authorized smoke. No purchase route is exposed by facts API.
- **Sponsors:** DBC, PreStocks, and Tessera evidence remains separately required
  for the selected contest claims. Local framework retirement proves none of it.
- **Native clients:** still need platform-specific wallet, receipt, recovery,
  physical-device, distribution, and store-policy evidence.
- **Remote release:** fixed-origin provider routing, real provider 404/cache,
  credentials, cost, observability, rollback, deployment and publication remain
  off. Local runtime cost is N/A beyond developer compute; provider pricing is
  deferred to that remote gate.

Optional product breadth may be cut in those plans according to their own
rules. The facts API, default local lifecycle, and migrated safety guards are
not allowed to claim those lanes complete.

## 8. Implementation sequence and logical commits

Implemented commit order:

1. `e723fde` — guarded Web output and fixed facts proxy (`LR-W0`);
2. `1863148` — literal oracle and standalone facts API (`LR-C0`, `LR-A0`);
3. `31c416f` — fixed-origin local launcher, default lifecycle, CI and guard
   migration (`LR-I0`, `LR-G0`);
4. this documentation unit — exact legacy disposition manifest (`LR-X0`).

`LR-N0` and `LR-V0` remain pending explicit deletion authority. The exact
inventory is [legacy-next-disposition.v1.json](legacy-next-disposition.v1.json).

## 9. Local implementation evidence

- The HTTP oracle was captured through real loopback Next.js HTTP at source
  revision `e3efffd`; its fixture SHA-256 is
  `30b22269112f7bc72bf53425eb1a2ead1c04bf90161c60f7c9eac9b1a5f18559`.
- The standalone API contract suite passes 23 tests, including literal v1/v2
  bodies, strict raw query handling, method policy, 154-ticker and mint
  coverage, unknown selectors, and independent port-zero operation.
- The root local stack smoke proves direct and proxied facts are byte-equivalent,
  preserve cache/revision headers, and close cleanly on `SIGTERM`.
- The Web owner independently re-ran `pnpm run dev` and observed `/` 200,
  unknown dossier 404, canonical redirect 308, proxied known facts 200,
  unknown ticker 404, and the guarded 1,562-file output sidecar in `complete`
  state. Browser inspection reached the real repository runtime.
- Repository-default `build` and `typecheck` pass. The full test command covers
  registry, Solana read-only boundaries, MCP, API, Web guarded output/proxy,
  integrated launcher, exact legacy inventory, and publication scanner.

Each commit stages explicit paths, runs its focused checks plus `git diff
--check`, and preserves unrelated work. Rollback is a targeted revert of the
failing logical unit in reverse dependency order. A rollback never uses
`reset --hard`, deletes unowned generated files, or reverts independent UI,
AI, purchase, sponsor, or native commits.
