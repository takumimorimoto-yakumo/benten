# Benten

*Everything on the record. Nothing invented.*

Benten is a mobile-first web app for an individual investor who wants to hold
a company through a Solana token. The investor starts from the company, not
the token: Benten shows which tokens on Solana reference that company, which
exact mint each one is, what the provider says the holder owns, where each
statement comes from, and a live Pyth reference price where a reviewed feed
exists. For one token, NVIDIA's xStock (NVDAx), the investor can buy with
USDC, SOL or SKR from their own wallet inside the app — SOL and SKR swap
through one fixed two-leg route to USDC first, and every purchase is capped
at 10 USDC's worth — and then check that the tokens arrived. Benten's server
never holds a key and never signs; the investor's own wallet signs and sends
every transaction. Benten gives no advice, ranking or recommendation.

The name comes from Benzaiten (Benten) / Saraswati: the goddess of knowledge
and wealth.

Links: [live demo](https://benten-mu.vercel.app) · [repository](https://github.com/takumimorimoto-yakumo/benten)

An MCP client (Claude, ChatGPT, or any Streamable HTTP client) can connect at
`https://benten-mu.vercel.app/api/mcp` — no account, no key. See [MCP server
(for agents)](#mcp-server-for-agents) below for the tool list, the local
stdio server and the chat-connector steps.

## What you can do

| Task | Where | What it does |
|---|---|---|
| Explore | `/`, `/companies` | Search companies and tickers; browse US-listed companies, private companies, and funds and other xStocks as separate groups |
| Company | `/company/{slug}` | Every Solana token Benten covers for that company, each with its provider, a one-line rights summary and its Pyth reference price where a feed exists; SEC-sourced facts for US-listed issuers |
| Product | `/stock/{ticker}`, `/provider/prestocks/{id}` | One token: exact mint, provider, what the holder owns, reference price, and whether Benten can buy it |
| Evidence | `/stock/{ticker}/evidence`, `/provider/prestocks/{id}/evidence` | The registry record, sources, filing references, digests and explicit unknowns behind each statement |
| Buy | `/stock/NVDA/buy` | Swap USDC, SOL or SKR for NVDAx in the user's own wallet, with a full preview before approval and status tracking to finalized |
| Holdings | `/holdings` | After an explicit refresh, the covered tokens the connected wallet holds, read from its token accounts, valued at the Pyth reference price where the feed is approved for valuation |
| Activity | `/activity` | Purchases made from this browser, with their final status and the NVDAx amount measured from the finalized transaction |

Every page exists in five locales: English (unprefixed), Japanese (`/ja`),
Korean (`/ko`), Simplified Chinese (`/zh-Hans`) and Traditional Chinese
(`/zh-Hant`). Language support does not state where the service is offered.
Reading needs no wallet; only Buy and Holdings ask for one.

## Why Solana

- **Exact identity.** Each product is one mint address. Benten compares mints
  byte for byte and never resolves a token by name or symbol, so the company
  page, the buy route and the holdings reader all refer to the same token.
- **Self-custody you can verify.** The user's wallet signs and sends the swap.
  Holdings are read from the wallet's own token accounts, and the purchase
  result is the token-balance change in the finalized transaction, which
  anyone can check on Solana Explorer.
- **On-chain reference prices.** Pyth prices are read directly from the Pyth
  receiver program's price accounts on Solana, without an API key.

## Safety boundary

- Benten servers hold no keys, sign nothing, send no transaction, and never
  relay signed bytes. The wallet signs and sends.
- The server runtime serves versioned, schema-validated snapshots plus three
  read-only network routes on the facts API:
  - `POST /api/solana-rpc`: a Solana JSON-RPC relay, needed because the public
    mainnet RPC rejects browser-origin requests. It forwards only an allowlist
    of read methods and unsigned `simulateTransaction`; every
    transaction-submitting method, any non-zero signature and `sigVerify` are
    rejected before the upstream. `getTokenAccountsByOwner` is accepted only
    with a covered product mint or one of the two token programs as filter.
  - `GET /api/prices?feed=<id>`: Pyth reference prices for feed ids in the
    reviewed feed map only, read with one `getMultipleAccounts` of the map's
    price accounts.
  - `POST /api/mcp`: the remote MCP endpoint. Its `prepare_purchase` tool
    reads the route mints and the pinned pool (and, paying with SOL or SKR,
    that token's mint and pinned first-leg pool) from the same upstream and
    quotes each amount locally from that reading, which one function instance
    reuses for 5 seconds (one refresh at a time per reading, and at most one
    attempt a second after a failure); it builds no transaction. Its other
    tools read the snapshots.
- The relay and prices routes accept same-origin callers only (or the exact origins in
  `SOLANA_RPC_RELAY_ALLOWED_ORIGINS`); the MCP endpoint also accepts callers
  without `Origin` (connectors). All three apply a per-client rate limit, bound
  request and response sizes, and time out the upstream. The upstream URL
  comes only from the server variable `SOLANA_RPC_UPSTREAM_URL` (default: the
  public mainnet RPC) and never appears in a response or the client bundle.
- Activity records and the remembered wallet stay in the browser's local
  storage. They are never sent to a Benten server.

## Purchase limits

- One product, one destination: NVDAx
  (`Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh`). Pay with USDC through the
  one fixed Meteora DLMM pool
  (`F4inHs4RQARpASmvLpj45QjGLdkukeGQrtQ22pimVy2a`), or pay with SOL or SKR
  through that token's own pinned first-leg pool into USDC, then the same
  fixed NVDAx pool. No other token can be bought in Benten, and no router or
  other pool is used for either leg.
- At most 10 USDC per transaction — or the SOL/SKR amount whose first leg
  quotes at most 10 USDC — because the fixed NVDAx pool holds only about $428
  of liquidity. Slippage is fixed at 100 bps on every leg, and a preview
  expires after 30 seconds.
- Before approval the flow shows the raw and display pay-token input, each
  leg's expected and minimum output, fees, slippage and the expiry. The
  Token-2022 scaled-amount multiplier is read at quote time, never from a
  stored value.
- The flow sends once and never retries automatically. It tracks the
  signature to finalized and reports the NVDAx change from the transaction's
  token balances. Benten's server builds and quotes the swap; it never signs
  — the investor's own wallet signs and sends.
- The issuer does not offer or sell NVDAx to US persons, and transfers may
  only be made to non-US persons. Benten does not check eligibility, and
  availability from any country is not guaranteed.
- A no-funds browser check passed: the swap was built for 1 USDC and an
  unsigned `simulateTransaction` through the relay succeeded, with the
  simulated NVDAx balance change equal to the quoted output. A funded
  purchase has not been recorded in this repository.

## Data sources and dates

| Source | What Benten uses | As of |
|---|---|---|
| xStocks registry | 154 registry records: identity, mint, token name | snapshot 2026-09-12 |
| SEC EDGAR `companyfacts` | 505 source-verified newest-year facts for 107 issuers, each with its filing accession, period, unit, scale and `us-gaap` concept | overlay `57140b46` |
| Annual history (FY2016 onward) | 1,182 annual periods for 124 issuers: 5,859 values, 5,506 verified against the cited 10-K or 20-F and 353 labeled `unverified_or_derived` | artifact `2026-09-24-annual-history-34ec4641` |
| Statement line items (FY2016 onward) | 40 PL, BS, CF and per-share line items for the same 124 issuers: 37,010 values, 35,913 verified against the cited 10-K or 20-F and 1,097 labeled `unverified_or_derived`; 8 calculated items (margins, returns, equity and current ratios, free cash flow) with their formulas | artifact `2026-09-25-statement-history-97cbb53d` |
| PreStocks | 8 private-company instruments: identity, one provider rights sentence, provider-reported reference numbers | fetched 2026-09-23 |
| Pyth | 153 reviewed feeds bound to 136 product mints; 134 approved for valuation | feed map `2026-09-24.1`; prices read live |

Notes on each source:

- **Catalog groups.** Of the 154 registry records, 129 are US-listed companies
  eligible for the filing workflow and each gets a company page; 23 are funds
  and other xStocks (14 ETFs, 8 non-SEC listings, 1 preferred security) with
  product pages but no company page; 2 (SPCX and VCX) are withheld from every
  product surface because the PreStocks track excludes non-PreStocks pre-IPO
  tokens. The US-listed company map is generated from SEC identity data and
  its human review is still pending; the company page says so.
- **SEC EDGAR.** Facts are mechanically extracted from each issuer's latest
  10-K: one accession, one period, no derivation. 78 issuers have all five
  supported facts, 28 have four and one has three; a fact the filing does not
  report under the supported concept, period and USD unit is omitted, never
  inferred. The other 22 eligible tickers keep a labeled legacy snapshot whose
  exact source and unit are unknown. This is not an independent audit of the
  filings. The per-ticker outcome is in
  [the EDGAR evidence ledger](./docs/evidence/edgar-verified-facts-2026-09-23.json).
- **PreStocks.** Provider claims, not quotes, executable prices, NAV or audited
  valuations. PreStocks reports no timestamp, currency, decimals or token
  program, so every entry stays `candidate_unverified` with explicit unknowns.
  Pre-IPO exposure in Benten comes only from PreStocks instruments.
- **Pyth.** A price is a reference observation with its source, feed, publish
  time and confidence, not a quote. An xStock is valued as raw amount / 10^decimals
  x the Token-2022 scaled-amount multiplier x the underlying share price
  (`Equity.US.<ticker>/USD`); the binding is by exact mint and ticker. Token
  feeds and the two private-company index feeds are shown but not used for
  valuation, because their unit basis is unverified. A price older than 60
  seconds is labeled stale with its time and never used for a valuation, so a
  feed that is not being updated shows as stale rather than as a current
  value. Prices are cached for 5 seconds per server instance.

## Architecture

| Path | Role |
|---|---|
| `apps/public-web` | The app. React Router + Vite, prerendered static documents (`ssr: false`) with client islands for search, prices, wallet, buy, Holdings and Activity; a small Node host serves the documents locally and forwards `/api/**` to the facts API |
| `apps/public-api` | Facts API: the four snapshot routes below, the RPC relay and the prices route |
| `packages/registry` | Versioned, schema-validated artifacts (xStocks registry, verified facts, legacy snapshot, PreStocks, company maps, search index) and their read models |
| `packages/purchase` | Framework-independent purchase logic for the fixed route: amounts, swap build, preview, transaction allowlist, state machine, tracker. Nothing here signs or sends |
| `packages/holdings` | Reads covered product holdings of a public key through the relay |
| `packages/pricing` | Pyth feed map, key-free on-chain price reader, valuation |
| `packages/solana-rpc-relay` | The read-only relay logic and its limits |
| `packages/solana` | Covered product mints and Solana venue observation helpers |
| `packages/mcp` | MCP server for agents over the same bundled data |
| `apps/web` | The earlier Next.js app, kept only as the migration source and scheduled for retirement (execution plan in Maintainers, below). It is not the product |

Facts API routes (all `GET`, snapshot only, no network):

| Route | Result |
|---|---|
| `/api/fundamentals/<ticker>` | Legacy v1 fundamentals shape for one ticker |
| `/api/financials/<ticker>?statement=pl\|bs\|cf` | Legacy v1 statement snapshot; `statement` is optional |
| `/api/v2/fundamentals?ticker=NVDA` | Identity, coverage, verified facts and the labeled legacy block; `mint` may replace `ticker` |
| `/api/v2/financials?ticker=NVDA&statement=cf` | Statement availability and data with the same selector rules |

PreStocks references are served to agents through the MCP tool
`list_provider_assets` and to people through the web pages; the facts API has
no provider-assets route.

## Run locally

Use Node.js 24 and pnpm 10.16.1.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` builds the packages, the facts API, the static web and its host,
then starts the API and the web on OS-assigned loopback ports and prints both
origins. Set `BENTEN_LOCAL_STACK_API_PORT` and `BENTEN_LOCAL_STACK_WEB_PORT`
to use fixed ports. Browser `/api/**` requests go only to the launched API.
No credential is needed; set `SOLANA_RPC_UPSTREAM_URL` to use your own RPC
endpoint for the relay and prices instead of the public mainnet RPC.

```bash
pnpm build
pnpm typecheck
pnpm test
bash scripts/check-publishable.sh
```

The legacy Next.js app keeps its own commands: `pnpm dev:legacy-web`,
`pnpm build:legacy-web` and `pnpm test:legacy-web`.

## Hosting on Vercel

One Vercel Project at the repository root serves the public Web and the facts
API. `vercel.json` sets no framework preset; its build runs `pnpm build` and
then `pnpm build:vercel`, which writes `.vercel/output` in the [Build Output
API v3](https://vercel.com/docs/build-output-api/v3) format
(`scripts/vercel/build-output.mjs`). The legacy Next.js app is not built.

- `static/` holds exactly the files the local Web host serves, each with the
  local host's `Content-Type`. Page documents are published under a path
  override, so there is no directory `index.html` other than the root one.
- One Node function, `_benten/ingress`, answers every other request with the
  same ingress decision as the local host (`apps/public-web/ingress/classify.ts`):
  the facts API, the relay, the prices route and the remote MCP endpoint in the same process, the
  canonical `308` for a ticker casing alias, and the scoped HTML `404` body.
- `config.json` sends to the static layer only an exact `GET` or `HEAD` of a
  servable path; every API path, percent-encoded or non-canonical path,
  `.html` address and other method goes to the function.
  `scripts/vercel/output.test.mjs` evaluates the generated routes against the
  classifier and compares every response with the local host.

Server environment (Project settings, all optional, never `NEXT_PUBLIC_*`):

| Variable | Meaning |
|---|---|
| `SOLANA_RPC_UPSTREAM_URL` | HTTPS upstream RPC for the relay and prices routes; default the public mainnet RPC. It never appears in a response. |
| `SOLANA_RPC_RELAY_ALLOWED_ORIGINS` | Comma-separated exact origins allowed to call the relay and prices routes. Unset, the caller must match the request `Host`, which works on every preview and production host. Set it only for a fixed domain list; a preview URL outside the list is then refused. |
| `BENTEN_SITE_ORIGIN` | Canonical site origin (for example `https://benten.example`, no trailing slash) that the MCP `prepare_purchase` link points at. Unset or not an exact http(s) origin, the link uses the request `Host`, so a preview links to itself. |
| `BENTEN_MCP_ALLOWED_ORIGINS` | Comma-separated exact browser origins allowed to call `POST /api/mcp` in addition to the site's own. Connectors send no `Origin` and do not need it. |

The relay and prices routes compare the caller's `Origin` with the request
`Host`, which Vercel sets to the host the browser addressed. They key their
per-client limit on `X-Real-IP`, which Vercel sets from the connecting client;
a client-sent value does not reach the function. The rate limits and the
prices cache are in memory **per function instance**: each instance counts
separately and a cold start forgets them, so the effective limit grows with
the number of instances. They bound a noisy client on one instance; they are
not a global quota.

One difference from the local host remains: routing cannot see the query, so
a servable page requested with a query the local host rejects (a control
character after one decode) is served as the page instead of a `404`.

## MCP server (for agents)

The MCP server exposes the same bundled data with no credential and no
network call.

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @benten/mcp smoke
```

The smoke starts the compiled stdio server, discovers the six tools and
prints a receipt from a real `get_fundamentals` call on the NVDAx mint: the
resolved company, a verified revenue fact with its period, unit and SEC URL,
and the artifact revision.

| Tool | Description |
|---|---|
| `list_xstocks` | List the xStocks registry products |
| `get_fundamentals` | Resolve an exact ticker or mint; return identity, coverage, verified facts and a labeled legacy snapshot |
| `get_financials` | Resolve an exact ticker or mint; return PL/BS/CF availability plus verified and legacy statement data |
| `get_wallet_holdings` | Validate a Solana address; returns `wallet_correctness_unverified` without an RPC call in this profile |
| `list_provider_assets` | List PreStocks instruments with their provider-reported references and rights claims |
| `get_onchain_price_history` | Resolve an exact ticker or mint; return the bundled daily series of executed xStock/USDC swap prices near each NYSE close, each with its transaction signature, pool, slot and block time (optional `from`/`to`). Executed trade prices, not quotes |

To use it from an MCP client, point it at the built entry point:

```json
{
  "mcpServers": {
    "benten": {
      "command": "node",
      "args": ["/absolute/path/to/benten/packages/mcp/dist/index.js"]
    }
  }
}
```

### Remote endpoint (chat connectors)

The same tools are served over Streamable HTTP at `POST /api/mcp` on the
public host (for example `https://<your-host>/api/mcp`), for chat apps that
add a remote MCP server as a connector. It needs no account and no key.

- Stateless, JSON responses: no session id, no SSE stream. `GET` and `DELETE`
  answer `405` with `Allow: POST`.
- A request without an `Origin` header (a connector calling from its server)
  is accepted. A request with `Origin` (a browser) is accepted only from the
  site's own origin, the origins in `SOLANA_RPC_RELAY_ALLOWED_ORIGINS`, or the
  exact origins in `BENTEN_MCP_ALLOWED_ORIGINS`; any other origin gets `403`.
- One JSON-RPC message per request: a batch (a JSON array) gets `400` with
  error `-32600`, as protocol revision 2025-06-18 removed batching.
- Per-client limit of 60 requests a minute (per function instance, like the
  relay), and of 10 `prepare_purchase` calls a minute on top of it (a spent
  budget answers the tool's `rate_limited` result), a 64 KiB request bound, a 1 MiB response bound (a larger answer
  becomes JSON-RPC error `-32603`), and the registry allowlist on every ticker
  and mint argument.

The remote endpoint adds one tool the stdio server does not have:

| Tool | Description |
|---|---|
| `prepare_purchase` | For a purchase the user explicitly asked for, on the one fixed route to NVDAx. Pay with USDC (the default; `amount_usdc` above 0 and at most 10), or set `pay_token` to `SOL` or `SKR` and give `amount` in that token's units: the quote then covers the same fixed two-leg route as the buy page (the token to USDC in its pinned pool, then that leg's USDC minimum to NVDAx), and a first leg quoted above 10 USDC answers `over_limit`. It returns the pay token, each leg's quote (output, minimum output after the fixed slippage, fees, price impact; `first_leg` is `null` for USDC), when the quote stops being current, and `purchase_url`, the Benten buy page with the pay token and amount filled in (`/stock/NVDA/buy?amount=5.00`, or `?amount=0.02&pay=sol`). Benten builds, signs and sends nothing: the page reads a fresh quote and the user's own wallet shows and approves the transaction. It carries the US-persons statement and the disclaimer |

The buy page accepts the `pay` parameter only as an exact lower-case pay token
id (`usdc`, `sol`, `skr`; anything else ignores the whole link), selects that
token in Step 1, and accepts the `amount` parameter in that token's units only
after the amount field's own checks (format, precision, above 0, and for USDC
at most the limit) and only into an empty field; it never starts a preview or
a wallet request by itself.

Add it in Claude under Settings, Connectors, Add custom connector, with the
URL above. In ChatGPT, turn on developer mode (Settings, Apps and connectors,
Advanced), then create a connector with the URL and no authentication.

```bash
curl -s https://<your-host>/api/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Each result carries `structuredContent` and one JSON text item. The data
contract is in [public data v2](./specs/contracts/public-data-v2.md), the
[data dictionary](./docs/data-dictionary.md) and the
[snapshot release procedure](./docs/snapshot-release.md).

## Known limits

- Only NVDAx is buyable in Benten. Every other product, including all
  PreStocks tokens, is shown for reading and checking only.
- No funded purchase has been recorded in this repository.
- Activity lists only purchases made from the same browser. A wallet's in-app
  browser keeps its own records.
- Holdings list only tokens Benten covers; other tokens in the wallet are not
  listed or valued. Profit and loss is not shown because there is no cost
  basis.
- The US-listed company map is generated and awaits human review. PreStocks
  data is provider-reported and `candidate_unverified`.
- The legacy financial snapshot has unknown exact source and unit and is
  always labeled as such.
- The MCP `get_wallet_holdings` tool does not return amounts yet.

## Planned next

- Purchase of PreStocks tokens, once each token's route, token program,
  transfer restrictions and eligibility are confirmed read-only.
- Android and Solana Seeker: checking whether a Mobile Wallet Adapter wallet
  can sign and send on mainnet from the web app, then a native client.
- Agent-first use: the investor's own agent turns their symbol, budget and
  conditions into a cited, non-binding draft; deterministic checks validate
  it, and the investor alone approves in their wallet. No agent UI exists yet.

## Not investment advice

Benten provides facts and tools, not opinions. It offers no investment advice,
recommendation, valuation, rating or prediction. See
[DISCLAIMER.md](./DISCLAIMER.md).

## Maintainers

Internal planning documents that are not part of the product above:

- [`apps/web` retirement execution plan](./specs/next-retirement-execution-plan.md)
