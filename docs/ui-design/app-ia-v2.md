# Benten app information architecture v2 (mobile-first investing app)

Status: **authoritative IA for the Stocklana app rebuild, `review_pending`.** Written 2026-09-24 17:05 JST from the user decisions of 2026-09-24 and the information design the user approved in conversation that day. It supersedes [investor-journey-plan.md](investor-journey-plan.md). This document implements nothing, adds no route by itself, records no human visual acceptance and authorizes no funded transaction.

Delivery mode: design artifact only. No images were generated. The user's standing instruction for this pass is to build from the shadcn/ui generated defaults and decide the look in the running implementation ([shadcn-baseline-review.md](shadcn-baseline-review.md)). The visual-direction image route is therefore intentionally skipped. The acceptance surface is the real browser app at 390 x 844 and 1440 x 900, reviewed independently and then by the user.

Relationship to other documents:

| Document | What changes | What stays binding |
| --- | --- | --- |
| [investor-journey-plan.md](investor-journey-plan.md) | Replaced as the IA source. Its three task families (Explore, exact record, one-intent purchase) survive as tabs and flows here. | Nothing is inherited implicitly; where a rule is kept, this document restates it. |
| [purchase-panel-design.md](purchase-panel-design.md) | Placement only: the panel becomes a full-screen flow on mobile and a sheet on desktop, at its own URL (section 5). | Every state, transition, safety rule, copy string, error case, amount rule and accessibility rule. |
| [company-comparison-design.md](company-comparison-design.md) | The company page becomes the center of the app and covers US-listed companies too. Tessera and SPCX are removed. The vocabulary rule is widened for the Pyth reference price and the buy action (section 7). | Company map discipline: explicit reviewed map, exact slugs, validated instrument order, no name matching, no aggregate across instruments. |
| [stocklana-submission-plan-2026-09-23.md](../../specs/stocklana-submission-plan-2026-09-23.md) | Track selection changed on 2026-09-24 to Main + PreStocks + Pyth; Tessera and SPCX are out of the product. That plan still names Tessera and must be updated by its owner. | Invariants in its section 2, gates G-B1/G-B2, freeze and deadline times. |
| [mobile-investing-implementation-plan.md](../../specs/mobile-investing-implementation-plan.md) sections 3 and 4 | Target allocation is out of scope for this submission; the Portfolio tab is narrowed to Holdings. | Holdings reader constraints (exact account, raw integers, strict decode, no fallback zero, no P/L without cost basis), local-only private state. |
| [agent-first-investing.md](../decisions/agent-first-investing.md) | Only a reserved slot is defined (section 4.4). | The whole ADR. No agent UI ships in this pass. |
| [mobile-client-platform.md](../decisions/mobile-client-platform.md) | Adds a PWA shell and an optional Android app path (section 10: Solana Mobile WebView shell recommended, TWA as the alternative) as Web packaging. | "Mobile Web", "PWA", "TWA" and "native app" stay different packages with different evidence. |

## 1. Users, jobs and success

### 1.1 User

An individual investor on a phone who wants exposure to a company (US-listed or private) through a Solana token, holds or can get USDC in a self-custody wallet, and does not want to learn provider jargon first. Agent developers using the MCP server are a secondary audience served by `/developers`.

### 1.2 Problem

Today's broker apps do not offer private companies at all, and token providers each show their own product in their own words. The investor cannot answer, in one place and on a phone: can I hold this company, through which token, what do I actually own, what is it worth now, and did my purchase arrive. Provider numbers look like prices but are not executable, and the exact token identity (the mint) is invisible in most interfaces.

### 1.3 Three jobs and their success conditions

| Job | Start | Success, measured in the real app |
| --- | --- | --- |
| J1 Discover: "what can I hold here?" | `/` with no wallet | Within the first 390 x 844 screen the investor sees the search field and the three groups (US-listed companies, private companies, funds and other xStocks) with counts, and one tap reaches a full list. They can tell that exactly one token is buyable inside Benten today. |
| J2 Decide and buy: "I want NVIDIA / OpenAI. Can I hold it, which token, what rights, what will I pay?" | search, a shared link, or `/stock/{ticker}` | Two taps from search to the company page, which names each token, its provider, a one-line rights summary, the Pyth reference price with its time (where a feed exists) and whether Benten can buy it. For NVDA: four taps from the company page to the wallet approval, with the swap preview (raw and display USDC, expected and minimum NVDAx, fees, slippage, expiry) on screen at the approval. For OpenAI: the page says plainly that Benten shows it for comparison only and why. |
| J3 Check: "did it arrive, what is it worth now?" | Holdings or Activity tab | After one explicit refresh, Holdings shows the NVDAx quantity read from the wallet's token accounts, its value at the Pyth reference price with the price time, and the observation time. Activity shows the purchase with its final status and the NVDAx delta measured from the finalized transaction. |

### 1.4 How the design answers the judging question

"Could this be a real app that people will actually use?"

- Real user and problem: the company-first model (section 2) is the investor's own mental model. The screen question is "can I hold NVIDIA", not "browse a token registry".
- Working end to end: the demo path is one continuous run in the real app: Explore, search "nvidia", company page, Buy NVDAx, amount, swap preview, approve in wallet, status trail to finalized, result, Holdings shows the new NVDAx with its Pyth value, Activity shows the record. Nothing in that path is a mock.
- Why Solana: every step reads a Solana fact: the exact mint as identity, token accounts as holdings, Pyth price data as live value (read on Solana where the feed account exists, section 8.4), a wallet-signed swap on a Meteora pool as purchase, and the finalized transaction's token balances as proof of receipt.
- Completeness: an app shell (tabs, header wallet, back behavior), every empty, loading, error and not-connected state designed (section 4), five locales, installable to the home screen, and truthful limits stated where they apply.
- Better than a broker app: private companies next to listed ones in the same shape, what you own stated per token, proof of receipt you can check yourself, and no hidden custody.

## 2. Object model

### 2.1 Objects and their sources of truth

| Object | Meaning | Source of truth (runtime reads only this) | Identity |
| --- | --- | --- | --- |
| Company | The business the investor wants exposure to | `packages/registry` company map (revision 2, section 8.1); names from SEC EDGAR identity (`verified-facts-v2.json` `underlying_company`) for US-listed issuers, reviewed display names otherwise | lowercase slug, exact |
| Product (instrument) | A Solana token that references the company | `xstocks.json` (xStocks) and `provider-assets-v1.json` (PreStocks) | mint; route key is ticker (`/stock/NVDA`) or provider id (`/provider/prestocks/OPENAI`) |
| Route (way to buy) | A verified path Benten can build for one product | pinned constants in `packages/purchase` (NVDAx, USDC, Meteora DLMM pool `F4inHs4R...Vy2a`) | exact mint comparison, never name |
| Evidence | Why Benten says what it says | registry record, SEC filing references, provider statements, unknown codes, source digests, legacy snapshot label | per product |
| Company facts | Reported numbers about the company | SEC EDGAR via the annual history `verified-facts-annual-v1.json` (newest `verified_reported` point per metric; 124 issuers); legacy snapshot shown only on the evidence page with its legacy label | fiscal year named by the month it ends (section 7.2), and filing reference |
| Reference price | A live price observation from Pyth, with source, feed, time and confidence. Not a quote, not executable, not a NAV | Pyth price feed through a reviewed feed map (section 8.4) | feed id bound to a mint in the map |
| Holding | Tokens the connected wallet holds for a mint Benten covers | Solana token accounts read through the relay, decoded raw | wallet address + mint + observation slot |
| Activity record | One purchase attempt made from this device | device-local store (section 8.5) | local record id |

### 2.2 Relations

```text
Company 1 --- n Product            (company map; order validated: xStocks first, then provider, then id)
Product 1 --- 0..1 Route           (only NVDAx has one today)
Product 1 --- 1 Evidence           (always; its own page)
Company 1 --- 0..1 Company facts   (US-listed and source-verified only)
Product 1 --- 0..1 Reference price (only where the reviewed feed map binds a feed)
Wallet  1 --- n Holding --- 1 Product
Wallet  1 --- n Activity record --- 1 Product (+ 1 Route)
```

Rules that follow from the model:

- A product appears at most once and under at most one company. Funds, ETFs and the preferred security are products without a company (section 2.3).
- A company page never aggregates across its products and never orders them by any value.
- A reference price belongs to a product (or its referenced share), never to a company as a whole.
- A holding exists only for a mint in the allowlist. Other tokens in the wallet are counted, not listed or valued.
- An activity record is private device state. It never goes to a Benten server, a URL or a log.

### 2.3 Scope of the catalog after the 2026-09-24 decision

Measured on the bundled artifacts at HEAD `ff00b74`:

| Group | Count | Company page | Product page |
| --- | --- | --- | --- |
| US-listed companies with SEC coverage (`fundamentals_available: true`) | 129 xStocks (107 with source-verified EDGAR facts, 22 legacy snapshot only) | yes, one per company | `/stock/{ticker}` |
| Private companies via PreStocks | 8 (Anduril, Anthropic, Figure AI, Kalshi, Neuralink, OpenAI, Polymarket, SpaceX) | yes | `/provider/prestocks/{id}` |
| Funds and other xStocks: ETFs (14), non-SEC listings (8), preferred (1) | 23 | no | `/stock/{ticker}` |
| Tessera (`tOpenAI`, `tKalshi`, `tSpaceX`) | 3 | removed | removed |
| `SPCX` (SpaceX xStock, pre-IPO) | 1 | removed from the SpaceX page | removed |
| `VCX` (Fundrise Innovation Fund, private holdings) | 1 | none | recommended removed (user decision U2) |

Removal means: not prerendered, not in any list, search index, sitemap or link, and the old URL returns the scoped 404. The artifacts may keep the entries; the company map records them in `excluded` so the build stays complete. The PreStocks rule ("works that incorporate pre-IPO tokens other than PreStocks are not eligible") is the reason. After removal every private company has exactly one product, so the private company page is a one-product page; the "not interchangeable" comparison notice is used only when a company has two or more products.

## 3. Navigation and app shell

### 3.1 Top-level destinations

| Tab | URL | Label | Icon (Lucide) | Top-level question |
| --- | --- | --- | --- | --- |
| Explore | `/` | Explore | `search` | What can I hold? |
| Holdings | `/holdings` | Holdings | `layers` | What do I hold and what is it worth? |
| Activity | `/activity` | Activity | `receipt-text` | What happened to my purchases? |

Three tabs, always with text labels. Buying is not a tab: it is a task entered from a product's `Buy` action. Everything else (company, product, evidence, companies list, learn, about, legal, developers) is a detail page under Explore; the Explore tab stays highlighted on those pages.

### 3.2 Shell layout

Mobile (below the existing `md` / 52rem breakpoint):

```text
+--------------------------------------+  <- top safe-area inset
| [<] Benten             [EN v] [Wallet]|  header, 56px; [<] only on detail pages
+--------------------------------------+
|                                      |
|  page content (single natural scroll)|
|                                      |
|  footer: disclaimer + About, Learn,  |
|  Legal, Developers links             |
+--------------------------------------+
| [Explore]   [Holdings]   [Activity]  |  tab bar, 56px + bottom safe-area inset
+--------------------------------------+
```

Desktop (52rem and wider):

```text
+-----------------------------------------------------------------------------------+
| Benten   Explore  Holdings  Activity        [search companies or tickers]  EN v  [Wallet] |
+-----------------------------------------------------------------------------------+
| breadcrumb on detail pages (Explore / NVIDIA / NVDAx)                             |
| page content, max-width container (existing PageContainer)                       |
| footer                                                                           |
+-----------------------------------------------------------------------------------+
```

- The header search on desktop is the same component as Explore's search, shown on every page except Explore itself (where the large field is the page's primary control). On mobile, search lives on Explore only; a detail page reaches it through the Explore tab.
- The `Preview` badge in the current header is dropped from the mobile header (space) and kept in the footer as `Preview build` (user decision U7).
- Language: a compact menu button showing the current locale code; it opens the existing locale list and switches the same page (existing `LanguageSwitcher` rules: `/en` never exists, unsupported path is 404).
- Wallet: one app-level wallet session (section 3.5) with three header states: `Connect wallet` (outlined, not filled: the header never carries the page's primary action), `Connecting...`, or the short address (`7xKX...9f2a`) opening a menu with `Copy address`, `Switch wallet` and `Disconnect`. Connecting from the header is never required to read anything.
- Tab bar and header are hidden inside the buy flow on mobile (section 5); the flow has its own top bar with Close.

### 3.3 Back behavior and deep links

- Every page has a stable URL and opens directly without a wallet; this is the share and deep-link surface. `/stock/{ticker}` stays the shortest path for someone who knows the ticker.
- Browser Back is the history back and is never intercepted.
- The in-app back button `[<]` appears on detail pages. It calls history back when the previous entry is inside the app; when the page was opened directly (no in-app history, the normal case for a shared link or a standalone PWA launch), it goes to the logical parent: evidence to product, product to company (or to `/companies` for a fund), company to Explore, learn/legal/about/developers to Explore, buy flow to its product.
- A tab tap goes to that tab's root. Returning to Explore by the tab restores the last Explore scroll position and filter within the session (client-side state, not URL, except the filter, which is a hash `#private` / `#us-listed` / `#funds` so it survives reload and can be shared).
- Client-side navigation is required. Today internal links are plain anchors, so every navigation reloads the document, which would drop the wallet session and any in-flight purchase tracking. All internal links use the router's client-side link; the prerendered documents remain the entry points.
- Focus moves to the new page's `h1` after a route change, and the document title changes with it.

### 3.4 PWA shell

- `manifest.webmanifest` per locale (`/manifest.webmanifest`, `/{locale}/manifest.webmanifest`) with `name` `Benten`, localized `description`, `start_url` equal to that locale's home, `scope` `/`, `display` `standalone`, `theme_color` and `background_color` from the generated shadcn background token, icons 192 and 512 plus a maskable 512. Each document links its locale's manifest.
- `viewport` gains `viewport-fit=cover`; the header and tab bar pad with `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)`; the buy flow's bottom action bar does the same. Zoom stays enabled.
- Standalone mode (`display-mode: standalone`) has no browser back button or URL bar, so the in-app back button and a `Share` action (Web Share API with copy-link fallback) on company and product pages are required there; they are shown in browser mode too for consistency.
- Service worker: none ships (U6, settled in [pwa-install-surface.md](../decisions/pwa-install-surface.md)). Chrome's current install criteria do not require one, and Chrome for Testing reported no installability errors without it. If a measured need appears later, the limits in that decision apply: only hashed static assets, icons and an offline page, never `/api/*`, relay responses, wallet traffic, Pyth data or buy-flow, Holdings and Activity documents.
- Install prompt: no custom banner. `/about` explains `Add to Home Screen` for iOS Safari and Android Chrome in two short steps.

### 3.5 Wallet session and wallet in-app browsers

- One wallet session store at the app shell, discovered through the Wallet Standard registry, filtered to wallets with the sign-and-send feature on `solana:mainnet` (the purchase rule). The purchase flow and Holdings consume this store; the purchase flow does not own a separate connection. A silent reconnect is attempted once on load only for the wallet the user connected in this browser before; it never opens a wallet prompt.
- Account or network change in the wallet: Holdings clears its in-memory observation and shows the new account's empty state until refreshed; a purchase attempt before `submitted` returns to `walletDisconnected` (existing rule); after `submitted` tracking continues for the approving address (existing rule).
- Phantom and Solflare in-app browsers inject Wallet Standard wallets: the app works as in desktop Chrome, but PWA install is not offered there and local Activity lives in that browser's storage, not the phone browser's. `/about` and the Activity empty state say that records stay in the browser where the purchase was made.
- Mobile browser with no injected wallet (iOS Safari, Android Chrome without a Mobile Wallet Adapter wallet): the `No Solana wallet found` state adds `Open this page in your wallet app` with one outlined link per supported wallet, using that wallet's documented browse deep link for the current URL. Exact link formats are verified before shipping; an unverified format is not shown.
- Android Chrome and Solana Seeker: on Android only, the app shell registers the Mobile Wallet Adapter wallet as a Wallet Standard wallet (a dynamic chunk that other browsers never load), so an installed MWA wallet app (including Seed Vault on Seeker) can be chosen. Whether it completes sign-and-send on mainnet from this page is a device gate (section 10); until it passes, it is treated like any wallet and filtered by features. When no wallet app answers, the wallet menu says so.
- iOS standalone PWA: no wallet can inject into it. The header wallet menu and the buy flow say `Wallets cannot connect inside the home-screen app on iPhone. Open Benten in your wallet app.` with the deep links above. Reading (Explore, company, product) works fully.

## 4. Pages

Every figure, time, address and rights sentence in the wireframes below is a specimen. Real values come from the sources in section 2, and each `What you own` sentence is reviewed copy per provider kind, checked against the issuer's or provider's own documentation before it ships.

All pages exist in 5 locales: unprefixed English and `/{ja|ko|zh-Hans|zh-Hant}/...`. Prerendered pages are static documents; "island" means a client component that reads the network from the browser after hydration. Without JavaScript every prerendered page stays readable; islands show a one-line `Needs JavaScript` note in their reserved space.

### 4.1 Page table

| URL | Screen question | First information | Primary CTA (one) | States | Render | Data |
| --- | --- | --- | --- | --- | --- | --- |
| `/` Explore | What can I hold? | search field; three groups with counts; the one line `You can buy NVIDIA (NVDAx) with USDC inside Benten. Everything else is shown so you can check it.` | Search | search: no match, one match, several; index load failure falls back to the full list link | prerendered + search island | search index, company map, counts |
| `/companies` | Show me everything | segmented filter All / US-listed / Private / Funds and other; A-Z list | none (rows are links) | empty filter impossible by data; hash filter unknown falls back to All | prerendered | company map, xstocks, provider assets |
| `/company/{slug}` | Can I hold this company, through what, with what rights, at what reference price? | name + status, `Ways to hold on Solana (n)` product cards | `Buy NVDAx` if a product has a route; otherwise none | price island: loading, shown, stale-labelled, not shown with reason | prerendered + price island | company map, verified facts, feed map, Pyth |
| `/stock/{ticker}` | What exactly is this token, what do I own, can I buy it here? | symbol, name, company link, provider; Pyth reference price; `What you own`; identity (mint + Copy); capability block | `Buy NVDAx` (NVDA only) | as company, plus `Not buyable in Benten` capability | prerendered + price island | xstocks, verified facts, feed map, Pyth |
| `/provider/prestocks/{id}` | Same, for a private-company token | as above, `Compare only` capability with reasons | none | mint-extension island: reading, shown, unreadable | prerendered + mint island | provider assets, relay (mint account) |
| `/stock/{ticker}/evidence`, `/provider/prestocks/{id}/evidence` | Why does Benten say this? | registry record, sources, unknowns | none | static | prerendered | registry, provider assets, legacy snapshot |
| `/stock/NVDA/buy` | What exactly will one approval do, and did it work? | route line, `Before you buy`, current step | per purchase state (section 5) | every purchase state | prerendered frame + purchase island | purchase package, relay, wallet |
| `/holdings` | What do I hold and what is it worth? | connected address, observation time, holdings list, total when complete | `Connect wallet` or `Refresh` | not connected, no wallet, reading, list, none held, partial, error, stale | prerendered empty shell + island, `noindex` | relay, feed map, Pyth, wallet |
| `/activity` | What happened to my purchases? | records newest first | none (per-record `Check again`) | empty, list, storage unavailable | prerendered empty shell + island, `noindex` | local store, relay |
| `/about` | What is Benten and can I trust it? | one-paragraph what/why Solana/limits; install steps | none | static | prerendered | copy |
| `/learn/{topic}` | Explain this term | short explainer | none | static | prerendered | copy |
| `/legal/{terms,privacy,disclaimer}` | Rules | legal text | none | static | prerendered | copy |
| `/developers` | How do I use the data from an agent? | MCP tools, API endpoints, limits | none | static | prerendered | existing README content |

`/learn` topics for this pass: `xstocks` (what an xStock is and what you own), `prestocks` (what a PreStocks token is, SPV exposure, provider claims), `reference-prices` (what the Pyth reference price is and is not), `self-custody` (your wallet signs and sends; Benten never holds funds). Each product page's `What you own` links to its topic.

### 4.2 Explore `/`

Question: what can I hold, and how do I get to one company fast.

Mobile 390px:

```text
+--------------------------------------+
| Benten                 [EN v][Connect]|
+--------------------------------------+
| Own a piece of the companies you     |  h1, 2 lines max
| follow, in your own wallet.          |
|                                      |
| [ Search a company or ticker       ] |  48px field, autofocus off
|   NVIDIA            NVDA  US-listed  |  suggestion rows (when typing)
|   NVIDIA ... (max 6)                 |
|                                      |
| You can buy NVIDIA (NVDAx) with USDC |  capability line, muted
| inside Benten. Everything else is    |
| shown so you can check it.           |
|                                      |
| Private companies (8)          All > |  h2 + link to /companies#private
| +----------------------------------+ |
| | Anduril                PreStocks | |  8 rows, alphabetical, full width
| | Anthropic              PreStocks | |
| | ...                              | |
| +----------------------------------+ |
| US-listed companies (129)      All > |  h2 + link to /companies#us-listed
| | Airbnb                ABNB xStock| |  first 5 rows A-Z, then "See all 129"
| | ...                              | |
| Funds and other xStocks (23)   All > |  link only, one line of examples
|                                      |
| New here? What is an xStock /        |  learn links
| PreStocks token / reference price    |
| footer                               |
+--------------------------------------+
| Explore*    Holdings     Activity    |
+--------------------------------------+
```

Desktop difference: h1 and search on the left two thirds, capability line and learn links on the right third; the two company groups sit side by side (private left, US-listed right with 10 rows); the header search is hidden on this page.

- Groups are ordered by the investor's likely surprise, not by value: private companies first because that is what broker apps do not offer. Rows inside a group are alphabetical, stated in the group's caption.
- Rows show no price. 150 live prices on one page would multiply relay and Pyth reads and invite ranking by movement; prices live on company and product pages.
- The capability line is a fact, not a promotion. NVIDIA is not given a card or a highlight in the lists; its row carries the same `Buy in Benten` text tag every buyable product would carry.
- Search rules (CLAUDE.md invariant 1): typing matches the query against a build-time index of reviewed display names, reviewed aliases, tickers and symbols (case-folded prefix and word-prefix matching, for suggestions only). Selecting a suggestion opens the entry's own slug or ticker, which the index took from the registry; Enter opens the first suggestion only when exactly one exists; otherwise it shows the suggestion list. A typed ticker that is not in the index shows `No company or ticker matches "{q}"` with a link to `/companies`. Suggestions never construct a URL from the typed text.
- States: typing (suggestions), no match, index not loaded (field still works as a link to `/companies`), without JavaScript (the field is a form that goes to `/companies`).

### 4.3 Companies `/companies`

Filter chips as a segmented control (All / US-listed / Private / Funds and other), hash-backed. A-Z list with a sticky letter header on mobile. Row: company name, product symbols, provider names, `Buy in Benten` tag where a route exists. Funds and other rows link straight to `/stock/{ticker}` because they have no company page. No price, no sort other than A-Z.

### 4.4 Company page `/company/{slug}`

Question: can I hold this company, through what, with what rights, and at what reference price.

Order: title band; `Ways to hold on Solana (n)` (so the Pyth reference price and the buy action are on the first screen at 390 x 844 and 1440 x 900; final QA NG2, 2026-09-25); the price and financials chart (section 4.8, when the page has chart data); the financial statements (section 4.9, US-listed); company facts (US-listed) or source note (private); reserved agent slot; `How Benten links these` (method sentence with map revision); footer.

US-listed example, `/company/nvidia`, mobile 390px:

```text
+--------------------------------------+
| [<] Benten             [EN v][7xKX..]|
+--------------------------------------+
| NVIDIA                               |  h1
| US-listed company. SEC filer.        |  muted status line
| [Share]                              |  quiet
|                                      |
| Ways to hold on Solana (1)           |  h2
| +----------------------------------+ |
| | NVDAx  NVIDIA xStock             | |  card header: symbol + name, link to product
| | xStocks                          | |  provider
| | Tracks one NVIDIA share. No      | |  what you own, one sentence, link "More"
| | voting rights.            More > | |
| |----------------------------------| |
| | Pyth reference price             | |  label (fixed term)
| | $182.41      at 14:32:05 ET      | |  large tabular figure + absolute time
| | Pyth NVDA/USD, +/- $0.05         | |  feed + confidence, muted
| |----------------------------------| |
| | Buy in Benten with USDC          | |  capability line
| | [        Buy NVDAx             ] | |  the page's one filled button
| +----------------------------------+ |
|                                      |
| From SEC filings                     |  h2
| Revenue   $xx.x B Year ended Jan     |  FactList from the annual history
|           2026                       |
| Net income $xx.x B Year ended (...)  |
| Source: 10-K filed 2026-02-xx  link  |
|                                      |
| How Benten links these  (map rev 2)  |
| footer                               |
+--------------------------------------+
| Explore*    Holdings     Activity    |
+--------------------------------------+
```

Private example, `/company/openai`, mobile 390px:

```text
+--------------------------------------+
| [<] Benten             [EN v][Connect]|
+--------------------------------------+
| OpenAI                               |
| Private company. No SEC filings.     |
| [Share]                              |
|                                      |
| Ways to hold on Solana (1)           |
| +----------------------------------+ |
| | OPENAI  OpenAI PreStocks         | |
| | PreStocks                        | |
| | Economic exposure through an SPV,| |
| | as claimed by PreStocks. Not     | |
| | shares. Not verified by Benten.  | |
| |                           More > | |
| |----------------------------------| |
| | No Pyth price feed for this token| |  plain statement, no number
| |----------------------------------| |
| | Compare only. Benten does not    | |  capability, quiet surface
| | offer buying this token. Why >   | |  link to product page capability
| +----------------------------------+ |
|                                      |
| Primary sources                      |
| Benten has no SEC filing coverage    |
| for OpenAI, a private company.       |
| How Benten links these  (map rev 2)  |
+--------------------------------------+
| Explore*    Holdings     Activity    |
+--------------------------------------+
```

Desktop difference: title band full width; below it two columns, the product card(s) in a 26rem right column (same width token as the purchase panel, sticky while the left column scrolls) and the chart, statements and facts/sources on the left, so the buy action sits where the purchase panel used to be. With two or more products, the cards stack in the left column in map order under the `Not interchangeable` notice, and the right column is omitted.

- Primary CTA: `Buy NVDAx` on the product card when the product has a route. It goes to `/stock/NVDA/buy`, whose first screen repeats the exact identity (symbol, mint, provider, issuer restriction) before any amount, so the "identity before action" rule of the purchase design holds.
- The price block follows section 6.3 and 7. If no feed is mapped: `No Pyth price feed for this token`. If the read fails: `Pyth reference price unavailable right now` with a quiet `Try again`. Never a zero, dash-as-number or a provider reference in its place.
- Reserved agent slot (ADR agent-first): a named, empty region after the facts, `data-slot="consider-with-my-conditions"`, rendered as nothing in this build. Recommended not to show a disabled button or a "coming soon" line (user decision U4).
- Company facts: for revenue and net income, the newest annual-history point that a filing reports (`verified_reported`), each with its fiscal year named by the month it ends (`Year ended Feb 2026`, section 7.2) and a filing link. Values that no filing reports are never summarized. A US-listed company with no such point: `SEC facts for {name} are not yet verified by Benten.` with a link to the evidence page.

### 4.5 Product pages

Question: what exactly is this token, what do I own, and can I buy it here.

`/stock/NVDA`, mobile 390px:

```text
+--------------------------------------+
| [<] Benten             [EN v][7xKX..]|
+--------------------------------------+
| NVDAx                                |  h1: symbol
| NVIDIA xStock, by xStocks            |  name + provider
| Company: NVIDIA >                    |  link to company page
|                                      |
| Pyth reference price                 |
| $182.41            at 14:32:05 ET    |
| Pyth NVDA/USD (the NVIDIA share),    |  basis stated: underlying share
| +/- $0.05                            |
|                                      |
| What you own                         |  h2
| A token that tracks one NVIDIA share |  from reviewed copy per provider kind
| (after the display multiplier). You  |
| do not get voting rights. The issuer |
| prohibits US persons. More >         |  -> /learn/xstocks
|                                      |
| Token identity                       |  h2
| Mint   Xsc9...9qEh        [Copy]     |  full mint copied
| Token program  Token-2022            |
| Decimals 8                           |
| Evidence and sources >               |  -> /stock/NVDA/evidence
|                                      |
+--------------------------------------+
| Buy in Benten with USDC              |  sticky bottom action bar (mobile)
| [          Buy NVDAx               ] |
+--------------------------------------+
| Explore*    Holdings     Activity    |
+--------------------------------------+
```

- The on-chain trade price chart (section 4.8, when the product has a price series) is the first card of the left column, below the Pyth block on mobile; on an xStock it adds `On-chain price vs Pyth reference: +x.xx%` with both times and the per-share unit.
- The mobile action bar sits above the tab bar and only exists on a product with a route. Other xStocks show, in the same place in the content (not sticky): `Not buyable in Benten. Benten builds purchases only for NVDAx with USDC, through one fixed pool.` with no link to NVDA (existing steering rule).
- Desktop: two columns; the right 26rem column holds price, capability and the `Buy NVDAx` button, sticky; identity and `What you own` on the left.

`/provider/prestocks/OPENAI`, mobile 390px:

```text
+--------------------------------------+
| [<] Benten             [EN v][Connect]|
+--------------------------------------+
| OPENAI                               |
| OpenAI PreStocks, by PreStocks       |
| Company: OpenAI >                    |
|                                      |
| No Pyth price feed for this token.   |
|                                      |
| What you own                         |
| PreStocks says this token is backed  |
| 1:1 by SPV exposure that tracks the  |
| company. Benten has not verified     |
| this. Not shares; voting and         |
| redemption unknown. More >           |
|                                      |
| Compare only                         |  h2, quiet surface
| Benten does not offer buying this    |
| token. From its mint, read at 14:32: |  mint-extension island
| - every transfer pays a 1% fee       |  shown only when read from the mint
| - the issuer can move tokens from    |
|   any holder (permanent delegate)    |
| Benten will offer it only when it    |
| can show these terms before you      |
| approve.                             |
|                                      |
| Token identity  Mint Prew...rpgF Copy|
| Evidence and sources >               |
+--------------------------------------+
| Explore*    Holdings     Activity    |
+--------------------------------------+
```

- The transfer-fee and permanent-delegate lines are rendered from the Token-2022 mint extensions read through the relay (`getAccountInfo`, already allowed). If the read fails: `Benten could not read this token's mint just now.` and the generic sentence stays. The numbers are never hardcoded from this document.
- PreStocks-published references (mark, token, implied valuation) are shown only on the evidence page, labelled `Published by PreStocks. Currency and as-of time unknown.`

### 4.6 Evidence pages

`/stock/{ticker}/evidence` and `/provider/prestocks/{id}/evidence` receive today's record tables unchanged in content: registry record, legacy snapshot (with its legacy label), the annual history year by year (newest first; each year with its annual report, accession number and link; each value with its status, a restatement's original value and filing, and `Not verified against the filing` for `unverified_or_derived` values), provider statement, references with their unknowns, unknown codes, source digests, fetch dates, company map revision. Stacked record cards below 52rem (existing `StackingTable`). No CTA.

### 4.7 Holdings and Activity

See section 6 for Holdings and section 5.4 for Activity, including wireframes.

### 4.8 Price and financials chart

Question: how has this token traded on Solana since its listing, against what the company reported.

- One chart. Company page (US-listed): the xStock's daily on-chain trade price as a line (right axis) over the company's annual revenue and net income as bars (left axis, short USD). Each fiscal year's two bars share that year's width (revenue first), so a year reads as a span, not a point. Company page (private): the provider token's line only, when its series exists; otherwise no chart region. Product page: the line only. A US-listed company whose xStock has no bundled on-chain series shows the financials-only chart of its registry annual figures; a product page without a series shows no chart.
- The line is one executed swap per NYSE session (nearest the close, in the reviewed xStock/USDC pool), in USDC per token before the token's display multiplier (`usdcPerUnscaledToken`), labelled `{symbol} price per token (on-chain trades)` with a note that it is not the price of one underlying share. The multiplier's history is not available, so a per-share line could be drawn only for the last few sessions. A session without a verified trade is a gap with one of the source's four reasons. The readout adds `Open in Solana Explorer` for the swap, the pool with its DEX name, and a note that the value is one executed trade near the close.
- Product page, Pyth comparison: only when the last trade has a value for one share (`usdcPerUnderlyingShare`, the multiplier at that trade is known); that value is compared with the Pyth reference price. Otherwise no difference is shown, with a note that the multiplier history is unavailable.
- The days are not in the page: each ticker's series is one locale-free static file, `/data/prices/{TICKER}.{digest}.json`, that the section reads after hydration (five locales share it). Without JavaScript the table links that file. It is a data file like the statements files (4.9): named by the first 16 hex digits of its SHA-256 and served as JSON with `Cache-Control: public, max-age=31536000, immutable` by the loopback host and the hosted output alike.
- Periods `3M` / `1Y` / `All` (default `All`: every fiscal year and the whole price history). The price is drawn only from the series' first session; before it the plot is a quiet band, and the seam is labelled `On-chain series from {date}` (the first session after the reviewed pool existed, which is not necessarily the xStock's listing day). A financials-only chart offers `All` alone.
- Selecting (pointer, tap, or Left/Right on the focused plot) fills the readout under the plot: a day shows `On-chain trade price`, the date, the value per share and the swap on Solana Explorer; a figure shows its value, its fiscal year named by the month it ends (section 7.2), the exact period end, `10-K filed {date}` and the filing link. Under bars the time axis names fiscal years the same way (the month alone on a phone); a price-only chart keeps calendar ticks. The readout has a fixed height so selecting never moves the page, and its links stay reachable on a phone.
- Only `verified_reported` figures are drawn; an `unverified_or_derived` one is listed as `Not verified against the filing`; an excluded fact has no bar. Days without a swap are gaps in the line with their reason.
- Legend and source note: `Price: executed swaps on Solana (pool ...). Financials: SEC filings.`
- States: loading (reserved height), no JavaScript (the table carries the data), island error with `Try again`, empty period, gaps, financials only, price only. `Show the data as a table` lists the same fiscal years and days with their links.
- Recharts (shadcn chart) loads after hydration, only on company and product pages; the range control exists only once the page is interactive, so the prerendered company page keeps no button.

The Living Catalog shows every state at `/_catalog/charts`.

### 4.9 Financial statements

Question: what did the company report, line by line, over ten years, and how is each value known.

- Company page (US-listed only), after the chart. Tabs `Income statement` / `Balance sheet` / `Cash flow` / `Per share` / `Key ratios` (shadcn Tabs, Base UI). The four statement tabs hold the registry's reported rows (`getStatementSeries(ticker, "pl" | "bs" | "cf" | "per_share")`); `Key ratios` gathers every calculated row (margins, ROE and ROA on year-end values, equity ratio, current ratio, free cash flow). Rows without a value in any shown year are hidden; a tab without rows is omitted.
- Each tab: one small chart (PL: revenue, operating income and net income bars with the operating margin line; BS: total assets beside liabilities and equity stacked; CF: operating, investing and financing cash flow with free cash flow; per share: diluted EPS and dividends; ratios: three margins), drawn by the chart island loaded after hydration; then a table of the newest ten fiscal years (columns named by `fiscalYearLabel` axis form, oldest to newest), the unit and scale note, and the readout.
- 390px: the item column stays in place and the years scroll sideways inside the table (never the page); the table opens scrolled to the newest year. Chosen over one card per year because a statement is read across years, per line; cards would lose that comparison and repeat every label ten times.
- Values are short (`$215.9B`, `$2.94`, `24.53B`, `55.8%`); the exact value is in the readout. An absent value is `—`, never 0. How each value is known shows in the cell and in a legend: reported plain, `Not verified against the filing` muted with a dotted underline, `Calculated from reported figures` italic.
- Selecting (tap, click, or arrow keys in the one-tab-stop grid) fills the readout, which sticks above the tab bar while the table is in view: reported value with period (share counts: the annual report's cover date, not the year end), `10-K filed {date}` link, XBRL concept and any restatement; unverified value with its reason; calculated value with its formula and both inputs, each linked to its filing; absent value with the source's reason.
- Delivery (2026-09-25, size): each ticker's statements, every fiscal year, are one locale-free static file `/data/statements/{TICKER}.{digest}.json` (the first 16 hex digits of its SHA-256), written by the build and served with `Cache-Control: public, max-age=31536000, immutable` by both the loopback host and the hosted output. The company and evidence documents of all five locales name the same file and read it after hydration; the documents themselves carry only a summary. Before this, every document carried the whole statements twice (markup and loader data), about 190 KB per company page and 400 KB per NVDA evidence page, five times over.
- Prerendered (and without JavaScript): the summary table of the main lines for the newest five years (revenue, operating income, net income attributable to the parent or else net income, total assets, net cash from operating activities, diluted EPS), each value styled by how it is known, with a last row linking each year's annual report, and a table caption; then a dashed frame where every line appears, which says `All {n} items for {m} fiscal years show here with JavaScript on.` only without JavaScript. No button.
- Hydrated: the frame says `Loading all {n} items for {m} fiscal years.` (a polite live region announces it, and `All items loaded.` after), then the full section replaces the summary. A failed or malformed file shows `The full statements could not load. The main items are in the table above.` with `Try again`; the summary stays. The file is validated before use (schema, ticker, one cell per year, every filing index in range, https filing links); nothing partial is shown.
- Evidence page: when the statements exist, the document prerenders the same summary with exact values; once the file loads, the annual history lists every line for every year (newest open, earlier years in `details`), each with its exact value and how it is known. The five-fact history is then not sent in the loader data.
- Fixture (`BENTEN_PUBLIC_WEB_CHART_FIXTURE=1`, local builds only) replaces NVIDIA's data and says so. Living Catalog: `/_catalog/statements`.

## 5. Purchase flow

### 5.1 Placement

- URL `/stock/NVDA/buy` and its four locale variants, prerendered as a frame (heading, route line, notice, reserved wallet step) exactly as the current prerendered purchase frame. `/stock/{other}/buy` is 404 (the route exists only where the pinned constant matches, by exact mint comparison on the `resolveTicker` entry).
- Mobile: full screen. Header and tab bar hidden; own top bar `[X Close]  Buy NVDAx with USDC`; a bottom action bar holds the state's one primary action and at most one secondary, above the bottom safe area.
- Desktop: a right-side sheet (shadcn `Sheet`), width `--purchase-panel-width` (26rem), over the dimmed product page rendered from the same route tree; Esc and the Close button navigate to `/stock/NVDA`. Opening `/stock/NVDA/buy` directly renders the product page with the sheet open.
- The purchase state lives in the app-level purchase store, not in the sheet component. Closing the flow or switching tabs never cancels a wallet request or stops tracking. After `submitted`, a small status line appears above the tab bar (mobile) or under the header (desktop): `Purchase sent. Tracking until finalized. View`, linking to Activity.

### 5.2 Steps mapped to the unchanged state contract

The panel's content order is kept on every step: heading, route line, `Before you buy` (the four sentences, never collapsed or moved), then the step content, then the action bar.

| Step (shown as `Step n of 3` text, not a number badge) | Contract states | Step content | Primary action |
| --- | --- | --- | --- |
| 1 Amount | `walletNotDetected`, `walletDisconnected`, `walletConnecting`, `editing`, `previewing`, `previewFailed`, and `walletOutcomeUnknown` returning here with the earlier-request warning | identity line (NVDAx, NVIDIA xStock, mint short + Copy), wallet step or connected row, USDC balance, amount field with raw helper | `Connect wallet` / `Preview swap` / `Try again` per contract |
| 2 Review | `reviewReady`, `previewExpired`, `awaitingWallet` | swap preview rows and notes, countdown and absolute expiry; trail appears at `awaitingWallet` | `Approve in wallet` / `Refresh preview` / busy |
| 3 Result | `submitted`, `confirmed`, `notFinalized`, `failedOnChain`, `dropped`, `finalized`, `result`, `resultUnreadable` | five-step trail, signature + Copy, keep-open note, result block, explorer link | none / `Check again` / outlined `Start a new purchase` per contract |

Unchanged: every transition, send-once, double expiry check, edit invalidates, structured-rejection-only rule, unknown-outcome lock, tracking cadence and cap, result from finalized token balances, all copy and error rows, focus and announcement rules, button weight table, amount parsing, display truncation, and `unsupportedToken` (now expressed as the 404 of the route plus the product page's `Not buyable` block).

Additions that do not change any state or condition:

1. `Close` availability: always available. Before `submitted` it discards nothing except what the contract already discards on navigation (the preview stays in the store until it expires; returning shows it). During `awaitingWallet` Close hides the flow; the wallet request continues and its outcome lands in the store and in Activity.
2. Activity writes (section 5.4) at `awaitingWallet` (attempt opened, outcome unknown), at `submitted` (signature known) and at each terminal state. This makes the contract's "earlier request may have been sent" warning survive a reload on the same device and replaces decision 12 ("no persistence of the signature") with local persistence. The in-flight copy `Keep this page open until it is finalized.` changes to `You can leave this screen. Benten keeps checking while Benten is open, and Activity keeps the signature.` (message key change, five locales). This is listed as change C5.
3. Mobile action bar: the primary action moves from inline to the bottom bar. The contract's desktop sticky-aside fit rules no longer apply inside a sheet (the sheet scrolls its body, the action bar is pinned); the rubric's "action stays visible" intent is met by the pinned bar.

Mobile, step 2 `reviewReady`:

```text
+--------------------------------------+
| [X Close]   Buy NVDAx with USDC      |
| Step 2 of 3: Review                  |
+--------------------------------------+
| One fixed route: Meteora DLMM pool   |
| F4in...Vy2a [Copy]. You approve and  |
| send in your own wallet. Benten      |
| never signs or holds funds.          |
| +- Before you buy -----------------+ |
| | The issuer prohibits US persons  | |
| | from buying or holding NVDAx.    | |
| | Benten does not check whether    | |
| | you are eligible.                | |
| | Availability from any country is | |
| | not guaranteed.                  | |
| | This is not investment advice.   | |
| +----------------------------------+ |
| Swap preview                         |  h3, focus target
| You pay              10.00 USDC      |
|                      raw 10000000    |
| Expected to receive  0.0441982 NVDAx |
| Minimum you receive  0.0437562 NVDAx |
| Pool fee             ...             |
| Slippage tolerance   1.00%           |
| Price impact         <0.01%          |
| Preview expires      in 0:24         |
|                      at 14:33:10     |
| notes paragraph                      |
+--------------------------------------+
| [Refresh preview] [Approve in wallet]|  bottom bar; approve is the filled one
+--------------------------------------+
```

(Figures are specimens. The swap preview never shows the Pyth reference price: the preview is what the pool will do, the reference price is not executable, and placing them together invites a false comparison.)

### 5.3 Entry points

`Buy NVDAx` on the company card (`/company/nvidia`), on the product page action bar or aside (`/stock/NVDA`), and from a Holdings row for NVDAx (`Buy more` is not used; the row action is `Buy NVDAx`, secondary weight). No other entry. Search results and lists never link to the flow directly.

### 5.4 Activity `/activity`

Local record (device and browser only):

```text
id, created_at, wallet_address, genesis_hash, route_id (pinned pool), input_mint, output_mint,
input_raw, expected_output_raw, minimum_output_raw, preview_expires_at,
phase: opened | sent | confirmed | finalized | failed | dropped | not_finalized | outcome_unknown,
signature (null until sent), finalized_at, received_raw, paid_raw, last_checked_at
```

Rules: no signed bytes, no transaction bytes, no amounts from the preview presented as results. `received_raw` and `paid_raw` come only from the finalized transaction's token balances. Actions per record: `Check again` (one `getSignatureStatuses`, then `getTransaction` when finalized; no resend, no rebuild) and `View on Solana Explorer`. `outcome_unknown` records show `Check this wallet on Solana Explorer` and cannot be resumed. `Clear history on this device` at the bottom, with a confirmation dialog stating it does not affect anything on the network.

Mobile 390px:

```text
+--------------------------------------+
| Benten                 [EN v][7xKX..]|
+--------------------------------------+
| Activity                             |
| Purchases made from this browser.    |
|                                      |
| +----------------------------------+ |
| | Buy NVDAx               Finalized| |  status in words + icon
| | +0.0441982 NVDAx  for 10.00 USDC | |  measured result
| | Today 14:33  wallet 7xKX...9f2a  | |
| | Signature 5hQ...kP2 [Copy]       | |
| | View on Solana Explorer          | |
| +----------------------------------+ |
| +----------------------------------+ |
| | Buy NVDAx      Not finalized yet | |
| | 10.00 USDC sent  Do not buy again| |
| | until you have checked.          | |
| | [Check again]  View on Explorer  | |
| +----------------------------------+ |
|                                      |
| Clear history on this device         |  quiet, destructive style separated
+--------------------------------------+
| Explore     Holdings     Activity*   |
+--------------------------------------+
```

States: empty (`No purchases from this browser yet. Purchases you make in Benten appear here. Records made in another browser or wallet app are not shown.` + link `Explore companies`), list, storage unavailable (`This browser does not let Benten keep a history. Your purchases are still on the network; check your wallet's activity.`), a record being checked (busy on its own button only). Records for all wallets used in this browser are listed, each labelled with its wallet; the connected wallet's records come first. Desktop: same list in a 48rem column.

## 6. Holdings `/holdings`

### 6.1 What is shown

- Only mints in the product allowlist: the 152 xStocks that remain after removals and the 8 PreStocks mints. Anything else is summarized as `{n} other tokens in this wallet are not covered by Benten` without names or values. Those accounts are counted, never decoded: only their mint and owner positions are read, and the ones that cannot be read are added as `{m} of them could not be read` instead of failing the read. An account whose mint cannot be read at all might be a covered token's, so the read is partial (list shown, no total). Accounts of covered mints are decoded strictly and any defect fails the read closed.
- Per holding: company name, symbol, quantity for display, raw amount (secondary line), value at the Pyth reference price when available, and a link to the product page.
- Quantity: raw `u64` summed per mint across the owner's token accounts as `bigint`. xStocks display amount applies the Token-2022 Scaled UI multiplier read from the mint at the observation (same truncation rule as the purchase design). A PreStocks mint without that extension shows `raw / 10^decimals`. Frozen, delegated or withheld states are named on the row, not hidden.
- Observation line: `Read from Solana at 14:35:12 (slot 3xx,xxx,xxx)`; mint metadata slot is not merged into one "snapshot" claim.

### 6.2 Valuation rules

- Value = display quantity x Pyth reference price, only when all of these hold: the product is in the reviewed feed map; the map's basis says how one display unit relates to the feed (for xStocks bound to an equity feed: one display unit equals one referenced share, a claim the map reviewer confirms against the issuer's documentation, gate PY-2); the price read succeeded; the confidence interval is within `maxConfidenceRatio` of the price (config, recommended 1%).
- Freshness: a price whose publish time is within `liveMaxAgeSeconds` (config, recommended 60 s) is shown with its time. An older price is shown with `Last Pyth update {date time}` (US equity feeds do not update when the market is closed, and a weekend demo must still work), never labelled live. There is no hidden cutoff that silently drops weekend values; a price older than `maxAgeHours` (config, recommended 96 h) is not used.
- Not shown otherwise, with the reason on the row: `No Pyth price feed for this token`, `Pyth reference price unavailable right now`, `Pyth confidence too wide to show a value`. Unknown value is never zero.
- Total: `Value at Pyth reference prices` appears only when every covered holding has a value; it shows the oldest price time used (`uses prices from 14:32 to 14:35 ET`). If any holding lacks a value, no total is shown and the header says `Total not shown: {n} of {m} holdings have no Pyth value.`
- No profit or loss, no change since purchase, no percentage of portfolio, no chart. Benten has no cost basis (Activity amounts are one device's purchases, not the wallet's history).

### 6.3 Confidence interval display

The main figure is the price rounded to cents for USD feeds. The confidence appears as a secondary line `+/- $0.05` on product and company pages and in the Holdings row's expanded detail, not in the total. The label is `Pyth confidence`, linked to `/learn/reference-prices`.

### 6.4 Wallet switching

- Holdings always shows exactly one address: the connected one. Switching wallets or accounts clears the list immediately and shows the new address with `Refresh to read holdings`; nothing from the previous account is shown under the new one.
- The last observation per address may be kept in memory for the session only, shown as stale (`Read at 14:35. Refresh to update.`) when the user returns to that address. No holdings are persisted in this pass.
- Refresh is explicit (button, and pull-to-refresh in standalone mode). Opening the tab after connecting triggers one automatic read; after that, only the user refreshes.

### 6.5 Wireframe

Mobile 390px, connected:

```text
+--------------------------------------+
| Benten                 [EN v][7xKX..]|
+--------------------------------------+
| Holdings                             |
| Wallet 7xKX...9f2a                   |
| Read from Solana at 14:35:12         |
| [Refresh]                            |  the page's primary action
|                                      |
| Value at Pyth reference prices       |  only when complete
| $8.05                                |
| uses prices from 14:32 ET            |
|                                      |
| +----------------------------------+ |
| | NVIDIA                NVDAx      | |
| | 0.0441982 NVDAx       $8.05      | |
| | raw 4419820           14:32 ET   | |
| +----------------------------------+ |
| 3 other tokens in this wallet are    |
| not covered by Benten.               |
+--------------------------------------+
| Explore     Holdings*    Activity    |
+--------------------------------------+
```

States:

| State | Content | Primary |
| --- | --- | --- |
| not connected | `Connect a wallet to see the tokens Benten covers. Benten only reads; connecting does not let Benten move funds.` | `Connect wallet` |
| no wallet found | same as purchase `No Solana wallet found` + wallet app links (section 3.5) | none |
| reading | skeleton rows, `Reading your token accounts...` polite | busy `Refresh` |
| none held | `This wallet holds none of the tokens Benten covers.` + `Explore companies` link | `Refresh` |
| list | as wireframe | `Refresh` |
| partial | list; rows without values show their reason; no total | `Refresh` |
| error | `Benten could not read this wallet just now. Nothing changed.` (relay busy / unavailable / response invalid, each with its own title) | `Try again` |
| stale | previous list with `Read at {time}. Refresh to update.` | `Refresh` |

Desktop: the same list as a table (company, symbol, quantity, raw, value, price time) in the main column; the header block on the left of the title band.

## 7. Vocabulary

### 7.1 Never shown in user-facing copy (every locale, every page)

quote, NAV / net asset value, advice or advise (except the fixed sentence `This is not investment advice.` and the legal pages), recommend / recommended, best, top, popular, trending, undervalued, fair value, target price, signal, profit, loss, gain, return (as in performance), performance, "1 NVDAx = ...".

### 7.2 Fixed terms

| Term | Where | Meaning |
| --- | --- | --- |
| `Pyth reference price` | company, product, holdings, learn | A price observation published through Pyth for a named feed, with time and confidence. Not a quote, not what you will pay. The feed name is always shown next to it (`Pyth NVDA/USD`). |
| `Value at Pyth reference price(s)` | holdings | quantity x Pyth reference price, with the price time |
| `Pyth confidence` | secondary lines | the feed's confidence interval |
| `Last Pyth update {time}` | when older than the live window | the price is not live |
| `swap preview`, `Expected to receive`, `Minimum you receive`, `Price impact` | buy flow only | unchanged from the purchase design |
| `Published by PreStocks` | evidence only | provider references; never called a price |
| `Buy {symbol}` | CTA only, only for a product with a route | the one action name; the flow heading and Activity records reuse `Buy {symbol}` |
| `Compare only` / `Not buyable in Benten` | products without a route | capability, stated as fact |
| `Year ended {Mon YYYY}` | every fiscal-year label: company facts, the evidence page's annual history, the chart's axis, readout and table | a fiscal year is named only by the month it ends, never by a fiscal-year number, because issuers number their years differently (Home Depot calls the year ended Feb 2026 its FY2025). One function (`fiscalYearLabel`, `app/i18n/fiscal-year.ts`) formats it in every locale; the data's `fiscal_year` stays an internal key. |
| `On-chain trade price` | company and product charts | what executed swaps on Solana paid for the token, per underlying share; never a quote, a NAV or a Pyth value. The source note names the pools. |

### 7.3 Test rule update

The company-comparison design's vocabulary test forbids "price" and "buy" inside `<main>`. It becomes: the forbidden list of 7.1 anywhere in `<main>`, per locale; "price" allowed only inside elements marked `data-term="pyth-reference-price"`, `data-term="price-impact"`, `data-term="pyth-confidence"` or `data-term="onchain-trade-price"` (the chart section); "buy" allowed only inside `data-cta="buy"` and the buy-flow route. The CJK equivalents are written in the test file, not in this document (public tree rule). Negated forms of 7.1 words stay forbidden, except the one advice sentence. Standard accounting names (statement line names such as `Gross profit`, `Return on equity (ROE)` and `Return on assets (ROA)`, and the statements' own names in each language, including the Korean name of the income statement) are shown as investors read them and are allowed only inside `data-term="accounting-line-item"` elements; outside that mark every 7.1 word stays forbidden (2026-09-25; this replaces the earlier paraphrases such as `Gross income` and the Korean income-statement exception).

## 8. Data and backend inventory (for the main session's cross-check)

Status is observed at HEAD `ff00b74`.

| # | Need | Status | What is required | Constraint |
| --- | --- | --- | --- | --- |
| 8.1 | Company map revision 2 | exists as revision 1 (8 private, SPCX and Tessera mapped) | add 129 `us_listed` companies (slug, display name; binding basis `sec_issuer` with the CIK from the EDGAR filing reference for the 107 verified, `issuer_product_name` for the 22 legacy-only, each reviewed); remove Tessera instruments and SPCX into `excluded` with a new reason `not_offered`; decide VCX (U2). Bound source digests updated. Validator order and completeness rules unchanged. | never name-match to bind; reviewed data only |
| 8.2 | Search index | missing | build-time JSON from the map and registry: `{kind: company or product, slug or ticker, display_name, aliases[], symbols[], tickers[], group}`; aliases reviewed by hand (for example Alphabet / Google), not generated. About 160 entries; ship inside the Explore document or as one hashed static file. | suggestions may be fuzzy; opening is exact |
| 8.3 | Holdings reader | missing | relay method `getTokenAccountsByOwner` added with the relay's measured-evidence rule, restricted to `programId` filter for SPL Token and Token-2022, `jsonParsed` not allowed (base64 only), bounded response; SDK-free decoder; mint metadata via `getMultipleAccounts` (allowed). Fallback if the relay change is refused: derive associated token accounts for covered mints and read them with `getMultipleAccounts` (no new method, but misses non-associated accounts; the page must then say `Counts associated token accounts only`). | read-only; no fallback zero; address never logged by Benten |
| 8.4 | Pyth reference prices | missing | (a) reviewed `pyth-feed-map-v1.json` in the registry: mint, feed id, feed symbol, basis (`underlying_share` or `token`), reviewer, date; candidates may be proposed by a script from Pyth's feed list, but only reviewed rows are used. (b) Reader: recommended first, read Pyth price feed accounts on Solana through the existing relay (`getAccountInfo` / `getMultipleAccounts`), decoded strictly (price, confidence, exponent, publish time, feed id equal to the map). Gate PY-0: confirm that maintained feed accounts exist on Solana mainnet for the NVDA equity feed and the other mapped feeds. If PY-0 fails, (c) read Pyth's Hermes HTTP API from the browser, which adds a new external host and needs the invariant decision U1. | a price is a reference; failure shows nothing |
| 8.5 | Activity local store | missing | IndexedDB database `benten_activity_v1`, one object store keyed by record id, strict schema validation on read, versioned migration; writes at the transitions in 5.2. Record list per section 5.4. | device-local; never in URL, server, analytics |
| 8.6 | App-level wallet session | partial (inside the purchase island) | lift connection into a shell store consumed by the header, Holdings and the buy flow; keep the purchase island's feature filter and identifiers confined as `check-publishable.sh` requires | no new wallet capability |
| 8.7 | Client-side navigation and shell | missing | router links for internal navigation, shell layout with tabs, route-change focus, nested `/stock/:ticker/buy` and `/evidence` routes | prerender stays the entry |
| 8.8 | Mint extension reader for PreStocks | missing | decode Token-2022 `TransferFeeConfig` and `PermanentDelegate` from the mint account via the relay | show only what was read |
| 8.9 | PWA assets | missing | per-locale manifests, icons, theme color, `viewport-fit=cover`, safe-area CSS; service worker per U6 | no caching of dynamic data |
| 8.10 | Copy | partial | new namespaces `nav`, `explore`, `companies`, `holdings`, `activity`, `price`, `learn`, `about`, `legal`, `developers` in five locales; purchase key change C5; catalog manifest refresh | English strings in this document are the source |
| 8.11 | Scope removal | missing | Tessera and SPCX (and VCX if U2) removed from prerender, lists, search, links, sitemap; tests that their URLs 404. MCP `list_xstocks` still returns SPCX: the main session decides whether the product removal extends to MCP (U3). | eligibility rule |
| 8.12 | Legal pages | missing | terms, privacy (names the RPC provider and Pyth access, local storage contents), disclaimer from `DISCLAIMER.md` | no claims beyond facts |

Route count after this IA (5 locales each): `/`, `/companies`, 137 company pages, 152 product pages + 152 evidence, 8 PreStocks pages + 8 evidence, 1 buy frame, `/holdings`, `/activity`, `/about`, 4 learn, 3 legal, `/developers`. Prerender count is tested from the data, not hardcoded.

## 9. Scope until the freeze (2026-09-25 20:00 JST) and cut order

About 27 hours remain at the time of writing, and implementation proceeds one item at a time.

### 9.1 Recommended implementation order

| # | Item | Why here | Done when |
| --- | --- | --- | --- |
| 0 | Scope removal (Tessera, SPCX, U2) and Pyth gate PY-0 (read-only spike, no UI) | eligibility is a hard rule; PY-0 decides the Pyth path before any UI depends on it | removed URLs 404 in tests; PY-0 result recorded with the feed accounts read |
| 1 | Shell: tabs, header wallet (lifted session), client-side navigation, back rules, safe-area | every later screen sits in it | 390 and 1440 screenshots of Explore, product, empty Holdings, empty Activity |
| 2 | Company map rev 2 + search index + Explore + `/companies` + company pages | J1 and J2 depend on it | NVIDIA and OpenAI pages in 5 locales; search opens by exact id |
| 3 | Product pages restructured + evidence subpages + Pyth price island | Pyth track and J2 | NVDA page shows a Pyth reference price with time and confidence, or the correct not-shown state |
| 4 | Buy flow at `/stock/NVDA/buy` + Activity store + `/activity` | J2 end and J3 | the existing purchase test suite passes unchanged against the moved panel; Activity survives reload |
| 5 | Holdings reader + valuation | J3 and Pyth "does real work" | NVDAx holding read and valued, all states in the Living Catalog |
| 6 | PWA manifest and icons | completeness | installs on Android Chrome and iOS Safari; standalone back works |
| 7 | About, learn (4), legal (3), developers | completeness | pages in 5 locales |

Fallback kept until item 4 is verified: the current in-page purchase panel on `/stock/NVDA` stays working; the route version replaces it only after it passes the same tests and a browser check.

### 9.2 Cut order (first cut first)

1. `/developers` page (the README keeps the MCP section)
2. learn topics beyond `reference-prices` and `xstocks`
3. `/companies` filter chips (keep the A-Z list with group headings)
4. service worker and offline page (keep manifest and safe-area)
5. PreStocks mint-extension island (keep the generic `Compare only` sentence)
6. desktop sheet (open the buy flow as a full page on desktop too)
7. Holdings total (keep per-row values)
8. buy flow move (keep the in-page panel; add Activity writes to it)

Never cut: scope removal, shell, company pages, product pages, Pyth reference price on NVDA product and in Holdings, the purchase path, Holdings quantity, Activity, 5 locales for shipped pages. If PY-0 fails and U1 is refused, the Pyth track has no live data path; that must be escalated at once, not cut silently.

## 10. Extending to Android (Solana Seeker / dApp Store)

The IA stays the same; these additions are needed. Preparation details and sources are in [android-packaging.md](../android-packaging.md).

- Packaging: recommended is the Android WebView shell generated by Solana Mobile's `solana-mobile webshell` from the Web App Manifest. Solana Mobile recommends it for web apps because browser Local Network Access restrictions break Mobile Wallet Adapter connections from web pages, including Trusted Web Activity (TWA) wrappers; the shell handles wallet intents itself, always hides the URL bar and needs no Digital Asset Links. The alternative is a TWA (for example with Bubblewrap), which needs `/.well-known/assetlinks.json` with the package name and signing certificate fingerprint and a host rule for that path (not added; the path stays 404). The wrapper, package name and keystore owner are still open.
- Wallet: the Web app registers the Mobile Wallet Adapter wallet on Android (section 3.5), so Seed Vault on Seeker or an installed wallet app is the connection path in Chrome and in the shell. Device gate AND-W0 on a physical Seeker with the chosen wrapper: the wallet appears in Wallet Standard with sign-and-send on mainnet, returns to the app after approval, and the one-send and unknown-outcome rules hold across app switching and process death. If AND-W0 fails, the Android app ships read-only (buy flow shows `This wallet cannot approve purchases from this app`).
- Back: Android system Back maps to history back; the app's own back rules (section 3.3) must produce the same result, and closing the buy flow with system Back follows the flow's Close rules. Predictive Back must not skip the flow's Close.
- No URL bar: `Share` becomes required on company and product pages (already specified); external links (Solana Explorer, filings, provider sites) open in the system browser or a Custom Tab, never inside the app.
- Storage: the WebView shell has its own storage, not Chrome's; a TWA uses Chrome's storage for the origin. Activity records made in the app and in Chrome on the same device are therefore separate with the shell. The Activity empty state copy covers this; it is tested on device, not assumed.
- Store listing: the dApp Store publishing flow, publisher identity, app description, screenshots from the real app, privacy policy (8.12), region and financial-content statements, and the issuer's US-person restriction. No submission is authorized by this document.
- Settings page `/settings` (language, clear local history, about and version) becomes worth adding, because an app user has no browser menu.
- Pull-to-refresh on Holdings and Activity, and a status line for in-flight purchases that survives app switching.
- iOS stays out of scope; the iOS home-screen PWA remains read-only for wallets (section 3.5).

## 11. Visual principles within the shadcn defaults

The generated shadcn Base UI / Nova tokens, Geist and Lucide stay untouched; no custom palette. Choices made here are layout and emphasis only:

- One memorable element per screen: on company and product pages the Pyth reference price figure (large, tabular, with its time right beside it); on the result step the received NVDAx figure (existing). Everything else stays quiet.
- The only filled button on any screen is that screen's primary action. Header wallet and tab bar never use the filled style.
- Capability is text on a quiet surface, not colour: `Buy in Benten`, `Compare only`, `Not buyable in Benten`.
- Status (Activity, trail, holdings reasons) always has a word and an icon; colour is supplementary.
- Motion only in response to the user: sheet open and close, tab change without animation, reduced motion respected.
- Touch targets at least `--touch-target-min` (2.75rem), 8px apart; body text 16px on mobile; no horizontal page scroll at 390px or at 200% text zoom.

## 12. Decisions

### 12.1 Changes from the proposal the user approved in conversation

| # | Proposal | This document | Reason |
| --- | --- | --- | --- |
| C1 | `/buy/{instrument}` | `/stock/{ticker}/buy` (and later `/provider/{p}/{id}/buy`) | the purchase is bound to one exact product; nesting under the product URL keeps one identity namespace, makes the logical back target obvious, lets desktop render the sheet over its product page, and needs no separate instrument-id scheme |
| C2 | `/portfolio` tab | `/holdings`, label `Holdings` | this pass has no target allocation; "portfolio" promises allocation and management that the mobile ADR ties to a feature not in scope |
| C3 | evidence as `.../evidence` | kept, and the evidence page receives today's record tables unchanged | as proposed; stated for clarity |
| C4 | company pages for all companies | company pages for US-listed and private companies only; funds, ETFs, non-SEC listings and the preferred security keep product pages without a company page | they have no single company; binding them to one would be a false company claim |
| C5 | Activity local storage | also changes the purchase design's decision 12 and one in-flight message | a history that forgets the signature on reload cannot answer J3, and keeping the known signature strengthens the "do not buy again" rule |
| C6 | search candidates on name and ticker | candidates also include reviewed aliases; Enter opens only a single unambiguous match | investors type "Google"; aliases must be reviewed data, never generated matching |
| C7 | agent entry on the company page | slot defined but nothing rendered | a visible control with no function lowers the "real app" impression and could read as advice (U4) |
| C8 | price display with Pyth | no price in lists, and the swap preview never shows the Pyth price | avoids ranking by movement and relay load, and avoids a false comparison between a reference and an executable preview |

### 12.2 Decided here on technical grounds (reversible)

1. Three tabs, labels always visible; buy is a flow, not a tab.
2. Client-side navigation with prerendered entry documents.
3. One app-level wallet session; the header wallet button is never the primary style.
4. Holdings total only when every covered holding has a value; no P/L.
5. Old Pyth prices shown with `Last Pyth update`, not hidden, within `maxAgeHours`.
6. Activity is per browser, all wallets listed with labels.
7. Private groups first on Explore, rows alphabetical, no prices in lists.

### 12.3 Needs a user decision (recommendation first)

- **U1 Pyth read path if gate PY-0 fails.** Recommend: read Pyth price feed accounts on Solana through the existing relay (no new host, and it shows Solana doing the work). If those accounts do not exist for the needed feeds, allow the browser to call Pyth's Hermes API as a second network surface, amending the submission plan's invariant that the browser purchase island is the only network surface. Alternative: route Hermes through the Benten server, which adds a server-side market data read (a larger invariant change).
- **U2 VCX.** Recommend removing `VCX` (Fundrise Innovation Fund, private holdings) from the product with SPCX, because it is pre-IPO exposure not issued by PreStocks and keeping it risks the PreStocks eligibility rule for no user benefit. Alternative: keep it as a fund product page.
- **U3 MCP scope.** Recommend that the removal extends to the MCP tools and API (`list_xstocks` stops returning SPCX and, if U2, VCX), because the MCP server is part of the submitted work. Alternative: UI only.
- **U4 Agent slot.** Recommend rendering nothing in this build. Alternative: a non-interactive line `Checking a company against your own conditions is coming later.`
- **U5 Activity persistence (C5).** Recommend accepting local persistence of the signature and attempt summary in this browser, disclosed on `/legal/privacy`. Alternative: memory only, as the purchase design decided, with Activity limited to the current session.
- **U6 Service worker.** Settled: none ships, because Chrome's current install criteria do not require one ([pwa-install-surface.md](../decisions/pwa-install-surface.md)). A static-only worker as in 3.4 is added only for a measured need.
- **U7 `Preview` badge.** Recommend moving it from the header to the footer (`Preview build`), since it is release status, not navigation. Alternative: keep it in the header on desktop only.
- **U8 Pyth feed coverage at freeze.** Recommend mapping NVDA first and then every US-listed feed the reviewer can confirm by feed id before the freeze; unmapped products say `No Pyth price feed for this token`. Alternative: NVDA only.

### 12.4 Unresolved facts to verify during implementation

- PY-0 and PY-2 (feed accounts on Solana; the unit relation between an xStock display unit and the equity feed).
- Which wallets expose sign-and-send on mainnet in Phantom and Solflare in-app browsers and through Mobile Wallet Adapter in Android Chrome; exact browse deep-link formats.
- Android Chrome installability requirements for the pinned target version.
- PreStocks mint extensions (transfer fee basis points, permanent delegate) as read from each mint.
