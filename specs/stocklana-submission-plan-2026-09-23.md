# Stocklana submission plan (2026-09-23)

Status: **authoritative execution plan for the Stocklana submission, as decided by
the user on 2026-09-23**. It supersedes, for deadline scope and priority only, the
[selected-tracks implementation plan](stocklana-selected-tracks-implementation-plan.md),
the [purchase-complete MVP execution plan](stocklana-purchase-mvp-execution-plan.md),
the [product plan](product-plan.md) and the
[award strategy](stocklana-award-strategy.md). Those four documents remain as
history and as reference for the contracts they define; they are not re-litigated
here except where this plan explicitly narrows or replaces them. Revised
2026-09-23 to phase delivery: US-listed companies first, private-company
tokens after Phase 1 acceptance.

Deadline: **2026-09-26 05:00 JST**. Feature freeze: **2026-09-25 20:00 JST**. This
plan was written 2026-09-23 23:30 JST.

Tracks: **Main + PreStocks + Tessera**. Meteora DBC, Clawpump and Pyth are **not**
entered for this submission.

Implementation proceeds **one work item at a time**; there are no parallel
implementation lanes for this plan.

## 1. User and problem

The primary user is an individual investor who wants exposure to US-listed
companies, and to private companies, through Solana tokens. Agent developers
using the MCP server are a secondary audience over the same data.

The problem: one company can appear as several tokens from different providers
(for example, OpenAI as PreStocks `OPENAI` and Tessera `tOpenAI`; Kalshi and
SpaceX likewise), each with different rights, and the numbers providers show are
references, not executable prices. For private companies there are no SEC
filings, so the only primary sources are the company's own announcements.

What Benten does: for each company, list every instrument side by side with
source-labeled rights and reference semantics; show primary-source facts (SEC
EDGAR for US-listed issuers, official announcements for private companies); and,
on one verified route, let the investor buy in their own wallet and verify the
result.

2026-09-23 user decision: delivery is phased. Phase 1 serves the investor
journey for US-listed companies only — discover an xStock, read SEC-sourced
facts on the existing stock page, buy, and verify. Phase 2 extends the same
journey to private-company tokens.

Main-track mapping: the real user/problem above; a functioning end-to-end
journey discover → compare → buy → verify; the reason for Solana (exact mint
identity, wallet-signed on-chain purchase and verifiable holding).

PreStocks mapping (creativity, integration depth, product quality): PreStocks
instruments in the company comparison, the MCP tool, and instrument pages.
Tessera mapping (OpenAI or Kalshi T-Token use case): `tOpenAI` and `tKalshi` in
the company comparison with rights claims.

## 2. Invariants

- Benten servers never hold keys, never sign, never send transactions, never
  relay signed bytes.
- Server runtime data stays versioned, validated snapshots. The only
  network-effect surface is the browser purchase island, which talks to Solana
  RPC from the user's browser (through the read-only relay described below).
- 2026-09-24 user decision: the Benten server hosts one read-only Solana
  JSON-RPC relay, because the public mainnet RPC rejects browser-origin
  requests. The relay logic is `@benten/solana-rpc-relay`
  (`packages/solana-rpc-relay`); the product runtime serves it from the facts
  API `apps/public-api` at `POST /api/solana-rpc`, and the public Web ingress
  forwards that exact path to the fixed API origin. The legacy Next route
  `apps/web/app/api/solana-rpc/route.ts` uses the same package and is not the
  product runtime. It forwards only a measured
  method allowlist (reads, unsigned `simulateTransaction`, and the signature
  status and transaction reads needed to track a user-sent swap); every
  transaction-submitting or funding method is rejected before the upstream. A
  simulate is decoded and rejected if any signature is non-zero or
  `sigVerify` is requested, so the relay never relays signed bytes. The
  upstream URL, which may carry a provider credential, lives only in the
  server environment variable `SOLANA_RPC_UPSTREAM_URL` (never `NEXT_PUBLIC_`,
  never in the client bundle or any response). The server still holds no
  keys, signs nothing and sends nothing; the user's wallet signs and sends.
- No advice, ranking or recommendation. Unknowns stay explicit; provider
  references are never labeled a quote or NAV.
- 2026-09-23 user decision: the earlier "no purchase UI" invariant is replaced
  by the purchase item below (P1-2). The purchase need not be usable from Japan;
  the product ships with that stated as a limitation.
- The legacy financial snapshot comes from a private upstream. It stays labeled
  legacy with unknown source, and the upstream is never named in the public
  tree. Before any export, `scripts/check-publishable.sh` must pass with a
  private `DENYLIST_REGEX` supplied and `DENYLIST_REQUIRED=1`.

## 3. Work items (in execution order)

### Phase 1 — US-listed companies (must complete and be verified before Phase 2 starts)

#### P1-1 — Correctness fixes (was W2's README part)

- README still says 109 source-verified issuers in "What it is" and "Why
  Solana"; the artifact has 107. Fix, and reframe README around the investor
  problem while keeping the MCP section. The README must not claim purchase
  functionality until purchase is implemented.
- Target: 2026-09-24 12:00 JST.

#### P1-2 — Purchase: NVDAx with USDC (was W3; aim to ship; hard gate)

- Route: the Meteora DLMM pool `F4inHs4RQARpASmvLpj45QjGLdkukeGQrtQ22pimVy2a`
  (NVDAx `Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh`, USDC
  `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`), identity observed read-only
  on 2026-09-14 (`docs/route-feasibility-2026-09-14.md`).
- Browser-only design, replacing the owner/BFF/session architecture of the
  purchase-complete MVP plan for this deadline: wallet connect via Wallet
  Standard; the browser builds one exact-in swap with the Meteora DLMM SDK
  against the fixed pool; before signing it shows raw USDC input, quoted
  output, minimum output, fees, slippage and expiry; the user signs in their
  wallet; the browser sends once (no automatic retry); it tracks the signature
  to finalized and shows the NVDAx holding delta from the transaction's token
  balances.
- Amounts are integer raw units; the Token-2022 Scaled UI multiplier is read at
  quote time, never from a stored constant.
- The page states that the issuer prohibits US persons, that Benten does not
  determine eligibility, and that availability from any country is not
  guaranteed.
- Gate G-B1, 2026-09-24 18:00 JST: in a browser, the SDK builds the transaction
  for a fixed small amount and a no-funds `simulateTransaction` of the unsigned
  message succeeds. If not, the purchase is cut and the submission ships
  without it, stating that.
- G-B1 result, 2026-09-24 06:40 JST: **PASS**. `next build` + `next start`
  on localhost, `/dev/purchase-spike` opened in a real Chromium browser, all
  RPC through the same-origin relay `/api/solana-rpc` (upstream: the public
  mainnet RPC). Fixed input 1 USDC (`1000000` raw), slippage 100 bps, an
  unsigned transaction for a public key whose canonical USDC account held
  more than 1 USDC (found read-only from recent USDC activity, as in the
  earlier Node-side check). Quote: output `441982` raw NVDAx, minimum
  `437562`, fee `2250` (protocol `250`) on input. Unsigned
  `simulateTransaction` (`sigVerify: false`, `replaceRecentBlockhash: true`):
  `err: null`, `unitsConsumed: 39312`; the NVDAx token account's simulated
  balance went from `0` to `441982`, a delta equal to the quoted output. The
  browser's network log shows 10 JSON-RPC POSTs, all to `/api/solana-rpc`
  (`getMultipleAccounts` 4, `getAccountInfo` 3, `simulateTransaction` 2,
  `getLatestBlockhash` 1), and no request to any other host. Nothing was
  signed or sent and no funds moved; this does not replace G-B2.
- Gate G-B2: a funded smoke of at most 1 USDC is performed only by the user
  personally, with explicit authority given at that time. Agents never sign or
  send.
- Done when: G-B1 passed, unit tests for amount conversion, instruction/account
  allowlist and state machine, and either a G-B2 receipt or an explicit "not
  run".
- Target: 2026-09-25 12:00 JST.

#### P1-3 — Phase 1 acceptance

- `pnpm build && pnpm typecheck && pnpm test` and
  `bash scripts/check-publishable.sh` pass.
- Desktop and 390px screenshots reviewed.
- The user verifies Phase 1 working end to end.
- Phase 2 does not start until this item is done.

### Phase 2 — private-company tokens (starts only after P1-3)

#### P2-1 — Company comparison view (was W1)

- Route `/company/{slug}` plus the four locale variants, 5 locales total.
- Company-to-instrument mapping is an explicit, reviewed, versioned map in the
  registry package, never name-string matching. Private companies covered:
  OpenAI, Anthropic, SpaceX, Kalshi, Anduril, Figure AI, Neuralink, Polymarket
  (the 8 PreStocks + 3 Tessera entries). US-listed companies link to the
  existing stock page and show their xStock.
- Each row: provider, instrument kind, rights status, reference semantics and
  unknowns; no instrument is presented as interchangeable with another.
- Links from the home provider section and each provider instrument page.
- Done when: web tests cover mapping, 5 locales, 404 for unknown slug, and
  absence of any quote/advice wording; screenshots at desktop and 390px
  reviewed.
- Target: after P1-3.

#### P2-2 — Private-token trading

- Make the PreStocks and Tessera instruments tradable.
- Gate P2-G0: for each instrument, confirm read-only its liquid route on
  Solana, its token program, any rights or transfer restrictions, and
  eligibility requirements. An instrument that cannot be confirmed stays
  read-only.
- Uses the same browser-only, server-never-signs design as P1-2.
- Target: after P1-3.

#### P2-3 — Official announcements for private companies (was W4)

- For the 8 private companies, a versioned snapshot of official announcements:
  title, publication date, URL, source kind. No body text, images or marketing
  copy.
- Sources: the company's own newsroom or blog feed or sitemap. A producer
  script under `scripts/` (tooling only, like the provider producer) writes a
  validated artifact; runtime reads only the snapshot.
- X (Twitter): gate N-X0 checks whether compliant API access is available
  within the deadline and budget. Collecting from X by scraping is not
  allowed. If N-X0 fails, the company page shows only a link to the verified
  official account, with no collected posts.
- Shown on the company page as "Official announcements", each with its date
  and source link, with the snapshot date shown.
- Optional within P2-3: recent SEC 8-K filings for xStock issuers from EDGAR
  submissions data.
- Target: after P1-3.

#### P2-4 — Tessera token-details refetch (was W2's Tessera part)

- Retry the Tessera `token-details` endpoint once; if still failing, keep
  references empty and say so.
- Target: after P1-3.

## 4. Cut order

Phase 1 is never cut, except P1-2 if gate G-B1 fails. Phase 2 items are
attempted only if Phase 1 acceptance (P1-3) completes before the 2026-09-25
20:00 JST freeze. Within Phase 2, the cut order is:

1. X collection (keep link only)
2. the rest of P2-3
3. P2-2
4. P2-1

## 5. After freeze

Not implementation; each step needs its own user approval before it starts:

- Demo video
- History-free public repository export
- Vercel deployment
- Submission packet update
- Submission

None of these start before the user decides at freeze.

## 6. Verification for every item

`pnpm build && pnpm typecheck && pnpm test` and `bash scripts/check-publishable.sh`;
web items also get desktop and 390px screenshots.

## 7. Revision 2026-09-24

This section records the 2026-09-24 decisions and the state of each item at
commit `8435c3d`. It amends the sections above where it says so; the text above
is kept as the 2026-09-23 plan of record.

### 7.1 Tracks

- Tracks are now **Main + PreStocks + Pyth**. Tessera is no longer entered.
- Reason for dropping Tessera: the PreStocks bounty states that projects
  integrating any non-PreStocks pre-IPO token are ineligible. Tessera
  instruments (`tOpenAI`, `tKalshi`, `tSpaceX`) and the non-PreStocks pre-IPO
  registry rows `SPCX` and `VCX` are therefore withheld from every product
  surface: web pages, search, company pages, the facts API and the MCP tools.
  The bundled artifacts may keep the rows; the company map records them as
  excluded.
- The Tessera mapping in section 1 and item P2-4 no longer apply.
- Pyth mapping ("where live financial data does real work"): the Pyth
  reference price is shown on company and product pages, and it values the
  connected wallet's holdings in Holdings. Prices are read key-free from the
  Pyth receiver program's price accounts on Solana through a reviewed feed map
  (`packages/pricing`, feed map revision `2026-09-24.1`: 153 feeds bound to
  136 product mints, 134 approved for valuation).
- Main-track mapping is unchanged in substance: one wedge, the company-first
  journey Explore -> company -> product -> buy NVDAx -> Holdings -> Activity.

### 7.2 Invariant amendment: Pyth prices route

Section 2 said the only network-effect surface is the browser purchase
island through the relay. Amended: the facts API also serves
`GET /api/prices`, a read-only route that reads only the feed map's Pyth price
accounts with one `getMultipleAccounts` against the same server-configured
upstream as the relay. It uses the relay's caller check (same origin or the
configured allowed origins) and rate limiter, bounds the upstream response,
times out, and caches each feed for 5 seconds per instance. It was chosen
because Pyth's Hermes HTTP API needs an API key and this repository takes
none. The other invariants of section 2 stand: no keys, no signing, no
sending, no relayed signed bytes.

### 7.3 Product runtime: public-web

- `apps/public-web` (React Router, prerendered) with `apps/public-api` is the
  product body again, and the root `dev`, `build`, `typecheck` and `test` run
  it. The Next.js app in `apps/web` keeps only the `*:legacy-web` commands and
  is scheduled for retirement
  ([next-retirement-execution-plan.md](next-retirement-execution-plan.md)).
  Deletion of `apps/web` is still not authorized.
- `vercel.json` still builds the legacy Next.js app. A deployment of
  public-web needs its own configuration and remains a post-freeze step
  (section 5).

### 7.4 Information architecture v2

The app follows [app-ia-v2.md](../docs/ui-design/app-ia-v2.md): a mobile-first
shell with three tabs (Explore, Holdings, Activity), company pages at the
center for US-listed and private companies, product pages, separate evidence
pages, and the buy flow at `/stock/NVDA/buy`, in five locales. Implemented at
`8435c3d`: Explore and the companies list, company, product and evidence
pages, the buy flow, Holdings with Pyth valuation, device-local Activity with
`Check again`, one app-level wallet session with silent reconnect, and
client-side navigation. Not implemented at `8435c3d`: the `/about`, `/learn`,
`/legal` and `/developers` pages and the PWA manifest (IA v2 section 8.9).

### 7.5 Phase 2 items

- P2-1 (company view): delivered in the IA v2 form, covering US-listed
  companies as well as the 8 PreStocks private companies. The US-listed
  company map is generated and its human review is pending.
- P2-2 (private-token trading) and PreStocks purchase: **not part of this
  submission**. PreStocks products are shown as `Compare only`; gate P2-G0 has
  not been run. Stated in the README as planned next.
- P2-3 (official announcements): **not implemented** for this submission; no
  announcement snapshot or producer exists. Gate N-X0 was not run.
- P2-4 (Tessera refetch): dropped with Tessera.

### 7.6 Purchase gates

- G-B1: **PASS** (section 3, P1-2, recorded 2026-09-24 06:40 JST). The
  purchase was later moved from the legacy spike page to the public-web buy
  flow; the per-transaction cap is 10 USDC (`PURCHASE_CONFIG.maxUsdcInRaw`),
  lowered from 100 USDC on 2026-09-24 because the fixed pool holds only about
  $428 of liquidity.
- G-B2 (funded smoke of at most 1 USDC, by the user personally): **not run**
  as of this revision. Whether it is run before the 2026-09-25 20:00 JST
  freeze is the user's decision. If it is not run, the submission states
  "not run".

### 7.7 Submission materials

- The hackathon requires at least one of a GitHub link, a live demo link or a
  video link. The demo video is therefore optional; section 5's approval
  rule still applies to each after-freeze step.
- The README was rewritten for the submission (branch `submission-docs`) with
  the live demo, repository and video links left as `TBD`.
