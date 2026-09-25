import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { ActivityRecordCard, amountText } from "../app/features/activity/activity-record.tsx";
import type { ActivityRecord } from "../app/features/activity/activity-store.ts";
import { ACTIVITY_CONFIG } from "../app/features/activity/activity-config.ts";
import { FIXTURE_NOW_MS, FIXTURE_WALLET, HOLDINGS_FIXTURE_NAMES, fixtureReads, holdingsFixture } from "../app/features/holdings/holdings-fixtures.ts";
import { buildHoldingsView, valuationFeeds } from "../app/features/holdings/holdings-model.ts";
import { HoldingsConnected, holdingsStateName, type HoldingsScreen } from "../app/features/holdings/holdings-view.tsx";
import { PRICE_DISPLAY_CONFIG } from "../app/features/pricing/price-config.ts";
import { PORTFOLIO_MESSAGES } from "../app/i18n/holdings-messages.ts";
import { PUBLIC_WEB_LOCALES } from "../app/i18n/locales.ts";
import { SHELL_MESSAGES } from "../app/i18n/shell-messages.ts";
import { createActivityCatalog, createHoldingsProducts } from "../app/lib/portfolio-catalog.server.ts";

const products = new Map(createHoldingsProducts("en").map((product) => [product.mint, product]));
const catalog = createActivityCatalog("en");
const NVDAX_MINT = catalog.tokens.find((token) => token.scaledUi)!.mint;

function screen(name: (typeof HOLDINGS_FIXTURE_NAMES)[number]): Extract<HoldingsScreen, { kind: "read" }> {
  const fixture = holdingsFixture(name, products);
  if (fixture?.kind !== "read") throw new Error(`${name} is not a read fixture`);
  return fixture;
}

function render(fixture: HoldingsScreen, locale: (typeof PUBLIC_WEB_LOCALES)[number] = "en"): string {
  return renderToStaticMarkup(<MemoryRouter><HoldingsConnected locale={locale} address={FIXTURE_WALLET} screen={fixture} nowMs={FIXTURE_NOW_MS} /></MemoryRouter>);
}

describe("Holdings labels built at prerender", () => {
  it("labels every supported product, links its page, and offers Buy only where the route exists", () => {
    expect(products.size).toBeGreaterThan(150);
    const buyable = [...products.values()].filter((product) => product.buyHref !== null);
    expect(buyable.map((product) => [product.symbol, product.buyHref])).toEqual([["NVDAx", "/stock/NVDA/buy"]]);
    expect(products.get(NVDAX_MINT)).toMatchObject({ symbol: "NVDAx", href: "/stock/NVDA" });
    const ja = createHoldingsProducts("ja").find((product) => product.mint === NVDAX_MINT);
    expect(ja?.buyHref).toBe("/ja/stock/NVDA/buy");
    expect([...products.values()].some((product) => product.href.startsWith("/provider/prestocks/"))).toBe(true);
  });
});

describe("Holdings valuation rules", () => {
  it("values NVDAx at a fresh Pyth price and shows the total with the price time", () => {
    const { view } = screen("nvdax-fresh");
    expect(view.rows).toHaveLength(1);
    expect(view.rows[0]).toMatchObject({ value: "8.06", valueReason: null, feed: { pyth_symbol: "Equity.US.NVDA/USD", values_holdings: true }, priceRead: { result: { status: "fresh" } } });
    expect(view.total).toMatchObject({ value: "8.06" });
    expect(view.otherAccounts).toBe(3);
  });

  it("shows a stale price with its time but values nothing and gives no total", () => {
    const { view } = screen("nvdax-stale");
    expect(view.rows[0]).toMatchObject({ value: null, valueReason: "price_stale", priceRead: { result: { status: "stale" } } });
    expect(view.total).toBeNull();
    expect(view.withoutValue).toBe(1);
  });

  it("gives a PreStocks holding without a feed its reason, and then no total", () => {
    const { view } = screen("prestocks-no-feed");
    const prestocks = view.rows.find((row) => row.product.href.includes("/provider/"));
    expect(prestocks).toMatchObject({ value: null, valueReason: "no_price_feed", feed: null, priceRead: null, displayAmount: "2.5" });
    expect(view.total).toBeNull();
  });

  it("values nothing with a price whose confidence is too wide, or that is too old to show", () => {
    const base = screen("nvdax-fresh");
    const price = base.view.rows[0]!.priceRead!.result!;
    if (price.status === "unavailable") throw new Error("expected a price");
    // Exactly at the limit (1% of 182.41) still values; one raw unit more does not.
    const limit = (BigInt(price.price_raw) * BigInt(PRICE_DISPLAY_CONFIG.maxValueConfidenceBps)) / 10_000n;
    const atLimit = buildHoldingsView(base.observation, products, fixtureReads([{ ...price, confidence_raw: String(limit) }]), FIXTURE_NOW_MS);
    expect(atLimit.rows[0]).toMatchObject({ value: "8.06" });
    const wide = { ...price, confidence_raw: String(limit + 1n), confidence: "1.83" };
    const view = buildHoldingsView(base.observation, products, fixtureReads([wide]), FIXTURE_NOW_MS);
    expect(view.rows[0]).toMatchObject({ value: null, valueReason: "price_confidence_too_wide" });
    expect(view.total).toBeNull();
    const ancient = { ...price, status: "stale" as const, publish_time_unix: price.publish_time_unix - (PRICE_DISPLAY_CONFIG.maxDisplayAgeHours + 1) * 3600 };
    const old = buildHoldingsView(base.observation, products, fixtureReads([ancient]), FIXTURE_NOW_MS);
    expect(old.rows[0]).toMatchObject({ value: null, valueReason: "price_too_old" });
    const unread = buildHoldingsView(base.observation, products, new Map(), FIXTURE_NOW_MS);
    expect(unread.rows[0]).toMatchObject({ value: null, valueReason: "price_unavailable", priceRead: null });
  });

  it("gives no total for an incomplete read, and never a value without the mint", () => {
    const { view } = screen("partial");
    expect(view.readComplete).toBe(false);
    expect(view.rows[0]).toMatchObject({ value: null, valueReason: "holding_metadata_unavailable", displayAmount: null });
    expect(view.total).toBeNull();
  });

  it("asks prices only for feeds that may value a holding, and says why a mapped feed may not", () => {
    expect(valuationFeeds([{ mint: NVDAX_MINT }, { mint: NVDAX_MINT }])).toHaveLength(1);
    const openai = [...products.values()].find((product) => product.href.endsWith("/OPENAI"))!;
    expect(valuationFeeds([{ mint: openai.mint }])).toEqual([]);
    const base = screen("prestocks-no-feed");
    const openaiHolding = { ...base.observation.holdings[1]!, mint: openai.mint };
    const view = buildHoldingsView({ ...base.observation, holdings: [openaiHolding] }, products, new Map(), FIXTURE_NOW_MS);
    expect(view.rows[0]).toMatchObject({ value: null, valueReason: "unit_basis_unverified", feed: null });
  });
});

/** IA section 7.1, in English: none of these may appear on the tabs. */
const FORBIDDEN = /\b(quote|quotes|nav|advice|advise|recommend\w*|best|top|popular|trending|profit|loss|gain|return|performance)\b/i;

describe("Holdings rendering", () => {
  it.each(PUBLIC_WEB_LOCALES)("renders every fixture state without forbidden words in %s", (locale) => {
    for (const name of HOLDINGS_FIXTURE_NAMES) {
      const fixture = holdingsFixture(name, new Map(createHoldingsProducts(locale).map((product) => [product.mint, product])));
      if (!fixture) continue;
      const html = render(fixture, locale);
      expect(html, `${locale} ${name}`).toContain(`data-holdings-screen="${holdingsStateName(fixture)}"`);
      expect(html.replace(/<[^>]+>/g, " ").match(FORBIDDEN), `${locale} ${name}`).toBeNull();
    }
  });

  it("shows the wallet short, reads it whole to screen readers, and copies the full address", () => {
    for (const locale of PUBLIC_WEB_LOCALES) {
      const html = render(screen("nvdax-fresh"), locale);
      const line = /<span class="font-mono" title="([^"]+)" data-holdings-address=""><span aria-hidden="true">([^<]+)<\/span><span class="sr-only">([^<]+)<\/span><\/span>/.exec(html);
      expect(line, locale).not.toBeNull();
      const [, title, visible, spoken] = line!;
      expect(title).toBe(FIXTURE_WALLET);
      expect(spoken).toBe(FIXTURE_WALLET);
      expect(visible).toBe(`${FIXTURE_WALLET.slice(0, 6)}…${FIXTURE_WALLET.slice(-6)}`);
      // The full address is never visible text: only the hidden spoken copy and the title carry it.
      expect(html.split(FIXTURE_WALLET).length - 1, locale).toBe(2);
      expect(html, locale).toContain(`>${SHELL_MESSAGES[locale].wallet.copyAddress}</button>`);
    }
  });

  it("shows the total as the one large figure, the Buy action outlined, and the raw amount", () => {
    const html = render(screen("nvdax-fresh"));
    expect(html).toContain("data-holdings-total=\"\"");
    expect(html).toContain("$8.06");
    expect(html).toMatch(/<a href="\/stock\/NVDA\/buy" data-cta="buy" class="[^"]*border-border/);
    expect(html).toContain("raw 4419820");
    expect(html).toContain("3 other token accounts in this wallet are not covered by Benten.");
    expect(html).not.toContain("Buy more");
  });

  it("counts other token accounts, and how many of them could not be read, without naming them", () => {
    const { view } = screen("other-unreadable");
    expect(view).toMatchObject({ otherAccounts: 4, unreadableAccounts: 1, readComplete: true });
    expect(view.total).not.toBeNull();
    const html = render(screen("other-unreadable"));
    expect(html).toContain("4 other token accounts in this wallet are not covered by Benten. 1 of them could not be read.");
    for (const locale of PUBLIC_WEB_LOCALES) {
      const counted = PORTFOLIO_MESSAGES[locale].holdings.otherAccounts(4, 1);
      expect(counted, locale).not.toBe(PORTFOLIO_MESSAGES[locale].holdings.otherAccounts(4, 0));
      expect(render(screen("other-unreadable"), locale), locale).toContain(counted);
    }
    expect(PORTFOLIO_MESSAGES.en.holdings.otherAccounts(1, 1)).toBe("1 other token account in this wallet is not covered by Benten. It could not be read.");
  });

  it("keeps the list but no total when some accounts could not be identified", () => {
    const fixture = screen("unidentified");
    expect(holdingsStateName(fixture)).toBe("partial");
    expect(fixture.view.total).toBeNull();
    const html = render(fixture);
    expect(html).toContain('data-holdings-row="NVDAx"');
    expect(html).toContain("a token Benten covers may be missing from this list");
    expect(html).toContain("2 of them could not be read.");
    expect(html).toContain("Total not shown: part of this read is missing.");
  });

  it("does not claim a wallet holds none of the covered tokens when the read is partial", () => {
    const base = screen("unidentified");
    const observation = { ...base.observation, holdings: [] };
    const view = buildHoldingsView(observation, products, new Map(), FIXTURE_NOW_MS);
    const html = render({ ...base, observation, view });
    expect(html).not.toContain("data-holdings-none");
    expect(html).toContain("a token Benten covers may be missing from this list");
    expect(render(screen("none-held"))).toContain("data-holdings-none");
  });

  it("labels a stale price with its last update and says why there is no total", () => {
    const html = render(screen("nvdax-stale"));
    expect(html).toContain("Last Pyth update");
    expect(html).toContain("Total not shown: 1 of 1 holding has no Pyth value.");
    expect(html).toContain('data-term="pyth-reference-price" data-pyth-price-status="stale"');
  });

  it("shows the row's price with the same block and wording as the product pages", () => {
    const html = render(screen("nvdax-fresh"));
    expect(html).toContain('data-term="pyth-reference-price" data-pyth-price-status="live"');
    expect(html).toContain("$182.41");
    expect(html).toContain("Pyth NVDA/USD, for one underlying share");
    expect(html).toMatch(/<p id="[^"]+" class="sr-only">Pyth reference price<\/p>/);
    const loading = screen("nvdax-fresh");
    const reading = render({ ...loading, prices: "loading", view: buildHoldingsView(loading.observation, products, new Map(), FIXTURE_NOW_MS) });
    expect(reading).toContain('data-pyth-price-status="loading"');
    expect(reading).toContain("Reading Pyth reference prices...");
  });

  it("shows reading, not read, error and stale read states", () => {
    expect(render({ kind: "not-read", reading: true })).toContain("Reading your token accounts...");
    expect(render({ kind: "not-read", reading: false })).toContain("Refresh to read holdings for this wallet.");
    expect(render({ kind: "unavailable", reason: "rate_limited", reading: false })).toContain("Solana reads are busy");
    expect(render(screen("stale-read"))).toContain("Refresh to update.");
  });

  it("names too many token accounts as its own cause, without calling it temporary", () => {
    const html = render({ kind: "unavailable", reason: "account_limit", reading: false });
    expect(html).toContain("This wallet has too many token accounts for Benten to read");
    expect(html).toContain("Benten reads up to 256 token accounts per token program.");
    expect(html).not.toContain("just now");
    const mintLimit = render({ kind: "unavailable", reason: "mint_limit", reading: false });
    expect(mintLimit).not.toContain("too many token accounts");
  });
});

describe("Activity record", () => {
  const record: ActivityRecord = {
    id: "attempt-0001", createdAt: FIXTURE_NOW_MS - 60_000, updatedAt: FIXTURE_NOW_MS, walletAddress: FIXTURE_WALLET, genesisHash: ACTIVITY_CONFIG.mainnetGenesisHash,
    routeId: catalog.routeId, inputMint: catalog.tokens[0]!.mint, outputMint: NVDAX_MINT, inputRaw: "10000000", expectedOutputRaw: "4419820", minimumOutputRaw: "4375621",
    previewExpiresAt: null, phase: "sent", signature: "5".repeat(88).slice(0, 87), finalizedAt: null, receivedRaw: null, receivedDisplay: null, paidRaw: null, lastCheckedAt: null,
  };
  const tokens = new Map(catalog.tokens.map((token) => [token.mint, token]));
  const card = (value: ActivityRecord) => textAndMarkup(renderToStaticMarkup(
    <ActivityRecordCard record={value} locale="en" tokens={tokens} productHref="/stock/NVDA" connected check={{ kind: "idle" }} onCheck={() => undefined} nowMs={FIXTURE_NOW_MS} copyable={false} />,
  ));
  /** Markup plus its text with tags removed, so a phrase split across inline elements still matches. */
  function textAndMarkup(html: string): string {
    return `${html}\n${html.replace(/<[^>]+>/g, "")}`;
  }

  it("offers Check again for a sent purchase and says not to buy again", () => {
    const html = card(record);
    expect(html).toContain("data-activity-check=\"\"");
    expect(html).toContain("Check again");
    expect(html).toContain("Do not buy again until you have checked.");
    expect(html).toContain("Amount entered: 10.00 USDC");
    expect(html).toContain(`https://explorer.solana.com/tx/${record.signature}`);
    // Preview amounts stay in the details, labelled as not a result.
    expect(html).toContain("From the swap preview before approval; not a result.");
  });

  it("shows the measured result of a finalized purchase and no check", () => {
    const html = card({ ...record, phase: "finalized", finalizedAt: FIXTURE_NOW_MS, receivedRaw: "4419820", receivedDisplay: "0.0441982", paidRaw: "10000000" });
    expect(html).toContain("Received 0.0441982 NVDAx");
    expect(html).toContain("Paid 10.00 USDC");
    expect(html).not.toContain("data-activity-check=\"\"");
  });

  it("points an unknown outcome to the wallet on Solana Explorer, without a check", () => {
    const html = card({ ...record, phase: "outcome_unknown", signature: null });
    expect(html).toContain("Check this wallet on Solana Explorer");
    expect(html).not.toContain("data-activity-check=\"\"");
  });

  it("formats raw amounts exactly and keeps Scaled UI amounts in raw units without the measured display", () => {
    const copy = PORTFOLIO_MESSAGES.en.activity;
    expect(amountText("10000000", tokens.get(catalog.tokens[0]!.mint), null, "en", copy)).toBe("10.00 USDC");
    expect(amountText("5", tokens.get(catalog.tokens[0]!.mint), null, "en", copy)).toBe("0.000005 USDC");
    expect(amountText("4419820", tokens.get(NVDAX_MINT), null, "en", copy)).toBe("4419820 raw NVDAx");
  });
});

describe("Holdings and Activity catalog", () => {
  function shape(value: unknown): unknown {
    if (typeof value === "function") return `fn/${value.length}`;
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([name, nested]) => [name, shape(nested)]));
    return typeof value;
  }
  it("has one catalog per locale with an identical key structure", () => {
    expect(Object.keys(PORTFOLIO_MESSAGES)).toEqual([...PUBLIC_WEB_LOCALES]);
    for (const locale of PUBLIC_WEB_LOCALES) expect(shape(PORTFOLIO_MESSAGES[locale]), locale).toEqual(shape(PORTFOLIO_MESSAGES.en));
  });
});
