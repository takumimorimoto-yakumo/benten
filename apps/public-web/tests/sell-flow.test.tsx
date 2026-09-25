import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { INITIAL_SELL_STATE, purchaseReducer, type PreviewTerms, type PurchaseAction, type PurchaseState } from "../../../packages/purchase/src/purchase-machine.ts";
import { PURCHASE_CONFIG } from "../../../packages/purchase/src/config.ts";
import { BuyFlow } from "../app/features/buy-flow/buy-flow.tsx";
import { ActivityRecordCard, isSaleRecord } from "../app/features/activity/activity-record.tsx";
import { ACTIVITY_CONFIG } from "../app/features/activity/activity-config.ts";
import type { ActivityRecord } from "../app/features/activity/activity-store.ts";
import { FIXTURE_NOW_MS, FIXTURE_WALLET, holdingsFixture } from "../app/features/holdings/holdings-fixtures.ts";
import { HoldingsConnected } from "../app/features/holdings/holdings-view.tsx";
import { activityWriteFor } from "../app/features/purchase-island/purchase-activity.ts";
import { PurchasePanelView, type PanelHandlers, type PanelRefs } from "../app/features/purchase-island/purchase-panel-view.tsx";
import { createWalletSession } from "../app/features/wallet-session/wallet-session.ts";
import { PORTFOLIO_MESSAGES } from "../app/i18n/holdings-messages.ts";
import { PUBLIC_WEB_LOCALES } from "../app/i18n/locales.ts";
import { PURCHASE_MESSAGES } from "../app/i18n/purchase-messages.ts";
import { SHELL_MESSAGES } from "../app/i18n/shell-messages.ts";
import { EMPTY_VALUE } from "../app/i18n/format.ts";
import { createActivityCatalog, createHoldingsProducts } from "../app/lib/portfolio-catalog.server.ts";
import { createSaleFrame } from "../app/lib/purchase-frame.server.ts";

const ADDRESS = FIXTURE_WALLET;
const WALLET = { id: "Test Wallet", name: "Test Wallet" };
const MULTIPLIER = "1.001701196801074";
const BUILT_AT = FIXTURE_NOW_MS;
const SIGNATURE = "5".repeat(88);
const catalog = createActivityCatalog("en");
const NVDAX_MINT = catalog.tokens.find((token) => token.scaledUi)!.mint;
const USDC_MINT = catalog.tokens.find((token) => token.symbol === "USDC")!.mint;

const HANDLERS: PanelHandlers = {
  onConnect: () => undefined, onDisconnect: () => undefined, onAmountChange: () => undefined, onAmountBlur: () => undefined,
  onPreview: () => undefined, onApprove: () => undefined, onCheckAgain: () => undefined, onStartNew: () => undefined,
};

function refs(): PanelRefs {
  return { previewHeading: createRef(), errorTitle: createRef(), resultHeading: createRef(), amountInput: createRef() };
}

function run(state: PurchaseState, ...actions: PurchaseAction[]): PurchaseState {
  return actions.reduce(purchaseReducer, state);
}

const READY = run(
  INITIAL_SELL_STATE,
  { type: "walletsDetected", wallets: [WALLET], unsupported: [] },
  { type: "connectRequested", walletId: WALLET.id },
  { type: "connectSucceeded", walletId: WALLET.id, walletName: WALLET.name, address: ADDRESS },
  { type: "balanceLoaded", address: ADDRESS, raw: 38_533_225n },
  { type: "sellTermsLoaded", address: ADDRESS, multiplier: MULTIPLIER, capRaw: 4_470_742n },
);
const PREVIEWING = run(READY, { type: "amountEdited", text: "0.01" }, { type: "previewRequested" });
const INPUT_RAW = PREVIEWING.attempt.phase === "previewing" ? PREVIEWING.attempt.inputRaw : 0n;

function preview(overrides: Partial<Omit<PreviewTerms, "id">> = {}): Omit<PreviewTerms, "id"> {
  return {
    walletAddress: ADDRESS, side: "sell", product: "NVDA", payToken: "USDC", firstLeg: null, inputRaw: INPUT_RAW, consumedInputRaw: INPUT_RAW,
    outputRaw: 2_236_700n, minimumOutputRaw: 2_214_333n, feeRaw: 2_274n, protocolFeeRaw: 227n, feeOnInput: true, priceImpactPct: "0.08",
    builtAt: BUILT_AT, expiresAt: BUILT_AT + PURCHASE_CONFIG.previewTtlMs, nvdaxMultiplier: { value: MULTIPLIER, readAt: BUILT_AT },
    createsNvdaxAccount: false, createsUsdcAccount: true, lastValidBlockHeight: 500, wireTransaction: new Uint8Array(0), ...overrides,
  };
}

const REVIEW = run(PREVIEWING, { type: "previewSucceeded", requestId: 1, preview: preview() });
const AWAITING = run(REVIEW, { type: "approveRequested", now: BUILT_AT + 1_000 });
const SUBMITTED = run(AWAITING, { type: "walletSigned", signature: SIGNATURE, now: BUILT_AT + 2_000 });
const FINALIZED = run(
  SUBMITTED,
  { type: "statusObserved", signature: SIGNATURE, status: "confirmed", now: BUILT_AT + 3_000 },
  { type: "statusObserved", signature: SIGNATURE, status: "finalized", now: BUILT_AT + 4_000 },
);
const RESULT = run(FINALIZED, {
  type: "resultRead",
  signature: SIGNATURE,
  // A sale's measured balance changes: NVDAx left the wallet, USDC arrived.
  result: { nvdaxDeltaRaw: -INPUT_RAW, usdcPaidRaw: -2_236_812n, payToken: "USDC", paidRaw: -2_236_812n, nvdaxMultiplier: { value: MULTIPLIER, readAt: BUILT_AT } },
});

function render(state: PurchaseState, locale: (typeof PUBLIC_WEB_LOCALES)[number] = "en", now = BUILT_AT + 5_000): string {
  return renderToStaticMarkup(<PurchasePanelView state={state} now={now} locale={locale} handlers={HANDLERS} refs={refs()} announcement="" flow={{ leading: <a href="/stock/NVDA">x</a>, step: "Step" }} />);
}

function text(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ");
}

describe("sell panel", () => {
  it("reaches every step of a sale through the reducer", () => {
    expect([READY, PREVIEWING, REVIEW, AWAITING, SUBMITTED, FINALIZED, RESULT].map((state) => state.attempt.phase)).toEqual(["editing", "previewing", "reviewReady", "awaitingWallet", "submitted", "finalized", "result"]);
  });

  it("names the sale, drops the pay-token choice and shows the per-sale maximum in every locale", () => {
    for (const locale of PUBLIC_WEB_LOCALES) {
      const html = render(READY, locale);
      const copy = PURCHASE_MESSAGES[locale];
      expect(html, locale).toContain('data-trade-side="sell"');
      expect(text(html), locale).toContain(copy.sell.heading);
      expect(text(html), locale).toContain(copy.sell.noticeHeading);
      expect(text(html), locale).toContain(copy.sell.amountLabel);
      expect(html, locale).not.toContain("data-purchase-pay-token");
      expect(html, locale).toContain("data-sell-limit");
      // The cap (raw 4470742) is shown in display units at the multiplier: 0.04478347 NVDAx.
      expect(text(html), locale).toContain("0.04478347");
      expect(text(html), locale).not.toContain(copy.heading);
    }
  });

  it("says the limit is still being read, and never offers a preview error before it is", () => {
    const loading = run(INITIAL_SELL_STATE,
      { type: "walletsDetected", wallets: [WALLET], unsupported: [] },
      { type: "connectRequested", walletId: WALLET.id },
      { type: "connectSucceeded", walletId: WALLET.id, walletName: WALLET.name, address: ADDRESS });
    expect(text(render(loading))).toContain(PURCHASE_MESSAGES.en.sell.limitLoading);
    const failed = run(loading, { type: "sellTermsFailed", address: ADDRESS });
    expect(text(render(failed))).toContain(PURCHASE_MESSAGES.en.sell.limitUnavailable);
  });

  it("explains an amount above the cap with the cap and the USDC limit", () => {
    const over = run(READY, { type: "amountEdited", text: "0.1" }, { type: "amountCommitted" });
    expect(text(render(over))).toContain("One sale may use at most 0.04478347 NVDAx, about 10.00 USDC.");
  });

  it("shows NVDAx sold, expected and minimum USDC, and the USDC account creation in the review", () => {
    const html = render(REVIEW);
    const copy = PURCHASE_MESSAGES.en.sell;
    for (const label of [copy.youSell, copy.expected, copy.minimum, copy.minimumNote, copy.accountCreation]) expect(text(html)).toContain(label);
    expect(text(html)).toContain("2.2367 USDC");
    expect(text(html)).toContain("2.214333 USDC");
    expect(html).toContain(`raw ${INPUT_RAW}`);
  });

  it("reports an over-limit preview with the per-sale limit", () => {
    const failed = run(PREVIEWING, { type: "previewFailed", requestId: 1, failure: "overLimit", details: "19946789" });
    const html = text(render(failed));
    expect(html).toContain(PURCHASE_MESSAGES.en.sell.overLimit.title);
    expect(html).toContain("The pool expects to return 19.946789 USDC for this amount, above the limit of 10.00 USDC per sale.");
  });

  it("shows the measured result as USDC received and NVDAx sold, and restarts as a sale", () => {
    const html = text(render(RESULT));
    const copy = PURCHASE_MESSAGES.en.sell;
    expect(html).toContain(copy.resultHeading);
    expect(html).toContain("2.236812 USDC");
    expect(html).toContain(copy.soldLabel);
    expect(html).toContain(copy.startNew);
    expect(html).not.toContain(PURCHASE_MESSAGES.en.result.heading);
  });
});

describe("sell flow frame", () => {
  it("prerenders the sale's frame in the flow in every locale", () => {
    for (const locale of PUBLIC_WEB_LOCALES) {
      const html = renderToStaticMarkup(
        <MemoryRouter initialEntries={["/stock/NVDA/sell"]}>
          <BuyFlow locale={locale} frame={createSaleFrame(locale)} productHref="/stock/NVDA" side="sell" />
        </MemoryRouter>,
      );
      expect(html, locale).toContain('data-trade-side="sell"');
      expect(html, locale).toContain('data-phase="frame"');
      expect(text(html), locale).toContain(PURCHASE_MESSAGES[locale].sell.heading);
      expect(html, locale).toContain(PURCHASE_MESSAGES[locale].sell.noScript);
      expect(html, locale).toMatch(/<a[^>]*data-buy-flow-close=""[^>]*href="\/stock\/NVDA"/);
    }
  });
});

describe("sale Activity writes", () => {
  it("records a sale as NVDAx in and USDC out, and the measured USDC received and NVDAx sold", () => {
    const opened = activityWriteFor(REVIEW, AWAITING, BUILT_AT)!;
    expect(opened).toMatchObject({ phase: "opened", inputMint: NVDAX_MINT, outputMint: USDC_MINT, inputRaw: INPUT_RAW.toString(), expectedOutputRaw: "2236700", minimumOutputRaw: "2214333" });
    const sent = activityWriteFor(AWAITING, SUBMITTED, BUILT_AT)!;
    expect(sent).toMatchObject({ phase: "sent", inputMint: NVDAX_MINT, outputMint: USDC_MINT, signature: SIGNATURE, attemptKey: opened.attemptKey });
    const finalized = activityWriteFor(FINALIZED, RESULT, BUILT_AT)!;
    expect(finalized).toMatchObject({ phase: "finalized", receivedRaw: "2236812", paidRaw: INPUT_RAW.toString(), receivedDisplay: null, attemptKey: opened.attemptKey });
  });

  it("titles a sale record with the token sold and a purchase record with the token bought", () => {
    const tokens = new Map(catalog.tokens.map((token) => [token.mint, token]));
    const record: ActivityRecord = {
      id: "attempt-0002", createdAt: FIXTURE_NOW_MS - 60_000, updatedAt: FIXTURE_NOW_MS, walletAddress: FIXTURE_WALLET, genesisHash: ACTIVITY_CONFIG.mainnetGenesisHash,
      routeId: catalog.routeId, inputMint: NVDAX_MINT, outputMint: USDC_MINT, inputRaw: "998301", expectedOutputRaw: null, minimumOutputRaw: null,
      previewExpiresAt: null, phase: "finalized", signature: SIGNATURE.slice(0, 87), finalizedAt: FIXTURE_NOW_MS, receivedRaw: "2236812", receivedDisplay: null, paidRaw: "998301", lastCheckedAt: null,
    };
    expect(isSaleRecord(record, tokens)).toBe(true);
    expect(isSaleRecord({ inputMint: USDC_MINT, outputMint: NVDAX_MINT }, tokens)).toBe(false);
    const html = renderToStaticMarkup(<ActivityRecordCard record={record} locale="en" tokens={tokens} productHref="/stock/NVDA" connected check={{ kind: "idle" }} nowMs={FIXTURE_NOW_MS} copyable={false} />);
    expect(html).toContain(">Sell NVDAx</a>");
    expect(text(html)).toContain("2.236812 USDC");
    for (const locale of PUBLIC_WEB_LOCALES) expect(PORTFOLIO_MESSAGES[locale].activity.sell("NVDAx"), locale).not.toBe(PORTFOLIO_MESSAGES[locale].activity.buy("NVDAx"));
  });

  it("warns against selling again, not buying again, while a sale is unresolved", () => {
    const tokens = new Map(catalog.tokens.map((token) => [token.mint, token]));
    const record: ActivityRecord = {
      id: "attempt-0003", createdAt: FIXTURE_NOW_MS - 60_000, updatedAt: FIXTURE_NOW_MS, walletAddress: FIXTURE_WALLET, genesisHash: ACTIVITY_CONFIG.mainnetGenesisHash,
      routeId: catalog.routeId, inputMint: NVDAX_MINT, outputMint: USDC_MINT, inputRaw: "998301", expectedOutputRaw: "2236700", minimumOutputRaw: "2214333",
      previewExpiresAt: null, phase: "sent", signature: SIGNATURE.slice(0, 87), finalizedAt: null, receivedRaw: null, receivedDisplay: null, paidRaw: null, lastCheckedAt: null,
    };
    const html = renderToStaticMarkup(<ActivityRecordCard record={record} locale="en" tokens={tokens} productHref="/stock/NVDA" connected check={{ kind: "idle" }} nowMs={FIXTURE_NOW_MS} copyable={false} />);
    expect(html).toContain("Do not sell again until you have checked.");
    expect(html).not.toContain("buy again");
    for (const locale of PUBLIC_WEB_LOCALES) {
      const copy = PORTFOLIO_MESSAGES[locale].activity;
      for (const phase of ["opened", "outcome_unknown", "sent", "confirmed", "not_finalized"] as const) expect(copy.salePhaseNote[phase], `${locale} ${phase}`).not.toBe(copy.phaseNote[phase]);
    }
  });
});

describe("Holdings entry to the sell flow", () => {
  it("links the sell flow for the fixed-route product only", () => {
    const products = createHoldingsProducts("en");
    expect(products.filter((product) => product.sellHref !== null).map((product) => [product.symbol, product.sellHref])).toEqual([["NVDAx", "/stock/NVDA/sell"]]);
    expect(createHoldingsProducts("ja").find((product) => product.mint === NVDAX_MINT)?.sellHref).toBe("/ja/stock/NVDA/sell");
  });

  it("shows Sell next to Buy for a held NVDAx row", () => {
    const products = new Map(createHoldingsProducts("en").map((product) => [product.mint, product]));
    const fixture = holdingsFixture("nvdax-fresh", products);
    if (fixture?.kind !== "read") throw new Error("fixture");
    const html = renderToStaticMarkup(<MemoryRouter><HoldingsConnected locale="en" address={FIXTURE_WALLET} screen={fixture} nowMs={FIXTURE_NOW_MS} /></MemoryRouter>);
    expect(html).toMatch(/<a href="\/stock\/NVDA\/sell" data-cta="sell"[^>]*>Sell NVDAx<\/a>/);
  });
});

describe("Disconnect lock held by the purchase and the sale", () => {
  it("stays locked while either holds it", () => {
    const session = createWalletSession({ watchWallets: () => () => undefined, connectWallet: async () => ({ kind: "failed" }), disconnectWallet: async () => undefined, watchConnectedAccount: () => () => undefined });
    session.setDisconnectLocked(true, "purchase");
    session.setDisconnectLocked(false, "sale");
    expect(session.getState().disconnectLocked).toBe(true);
    session.setDisconnectLocked(true, "sale");
    session.setDisconnectLocked(false, "purchase");
    expect(session.getState().disconnectLocked).toBe(true);
    session.setDisconnectLocked(false, "sale");
    expect(session.getState().disconnectLocked).toBe(false);
    session.setDisconnectLocked(true);
    expect(session.getState().disconnectLocked).toBe(true);
    session.setDisconnectLocked(false);
    expect(session.getState().disconnectLocked).toBe(false);
  });
});

describe("Disconnect lock wording names the flow that holds it", () => {
  it("records the holder: the sale alone, the purchase when both, none when unlocked", () => {
    const session = createWalletSession({ watchWallets: () => () => undefined, connectWallet: async () => ({ kind: "failed" }), disconnectWallet: async () => undefined, watchConnectedAccount: () => () => undefined });
    expect(session.getState().disconnectLockHolder).toBeNull();
    session.setDisconnectLocked(true, "sale");
    expect(session.getState().disconnectLockHolder).toBe("sale");
    session.setDisconnectLocked(true, "purchase");
    expect(session.getState().disconnectLockHolder).toBe("purchase");
    session.setDisconnectLocked(false, "purchase");
    expect(session.getState().disconnectLockHolder).toBe("sale");
    session.setDisconnectLocked(false, "sale");
    expect(session.getState().disconnectLockHolder).toBeNull();
  });

  it("has a sale wording distinct from the purchase wording in every locale", () => {
    for (const locale of PUBLIC_WEB_LOCALES) {
      const shell = SHELL_MESSAGES[locale].wallet;
      expect(shell.disconnectLockedSale, locale).toBeTruthy();
      expect(shell.disconnectLockedSale, locale).not.toBe(shell.disconnectLocked);
    }
  });
});

describe("sale preview failures use the sale's own wording", () => {
  it("shows a changed multiplier as changed terms, with a refresh, in every locale", () => {
    const failed = run(PREVIEWING, { type: "previewFailed", requestId: 1, failure: "sellTermsChanged", details: "multiplier 1 is now 1.002" });
    expect(failed.sellTerms).toEqual({ kind: "unknown" });
    for (const locale of PUBLIC_WEB_LOCALES) {
      const copy = PURCHASE_MESSAGES[locale];
      const html = text(render(failed, locale));
      expect(html, locale).toContain(copy.sell.termsChanged.title);
      expect(html, locale).toContain(copy.action.refresh);
    }
  });

  it("shows a failed sale check as a paused sale, never a paused purchase, and offers no retry", () => {
    const failed = run(PREVIEWING, { type: "previewFailed", requestId: 1, failure: "routeCheck", details: "the pool quotes 1 raw USDC, below the reference value of 2.23 USD by more than the tolerance" });
    for (const locale of PUBLIC_WEB_LOCALES) {
      const copy = PURCHASE_MESSAGES[locale];
      const html = text(render(failed, locale));
      expect(html, locale).toContain(copy.sell.routeCheck.title);
      expect(html, locale).not.toContain(copy.error.routeCheck.title);
      expect(html, locale).not.toContain(copy.action.refresh);
      expect(html, locale).not.toContain(copy.action.tryAgain);
    }
  });
});

describe("the sale review shows what the sale was checked against", () => {
  const reference = { feedId: "b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593", pythSymbol: "Equity.US.NVDA/USD", price: "225.24123", publishTime: BUILT_AT / 1000 - 4, valueUsd: "2.25" };
  const checked = run(PREVIEWING, { type: "previewSucceeded", requestId: 1, preview: preview({ saleReference: reference }) });

  it("states the Pyth feed, the price, its publish time and the amount's value in every locale", () => {
    for (const locale of PUBLIC_WEB_LOCALES) {
      const html = render(checked, locale);
      expect(html, locale).toContain(`data-pyth-reference-check="${reference.feedId}"`);
      expect(html, locale).toContain(`data-pyth-publish-time="${new Date(reference.publishTime * 1000).toISOString()}"`);
      expect(text(html), locale).toContain("NVDA/USD");
      expect(text(html), locale).toMatch(/225\.24/);
      expect(text(html), locale).toMatch(/2\.25/);
    }
    expect(text(render(checked))).toContain("Checked against the Pyth reference price NVDA/USD: $225.24");
    expect(text(render(checked))).toContain("Value of this amount at that price: $2.25.");
  });

  it("keeps the line through an expired preview and while the wallet is asked", () => {
    expect(render(run(checked, { type: "approveRequested", now: BUILT_AT + 1_000 }))).toContain("data-pyth-reference-check");
    expect(render(checked, "en", BUILT_AT + PURCHASE_CONFIG.previewTtlMs + 1_000)).toContain("data-pyth-reference-check");
  });

  it("shows no line for a preview that carries no reference", () => {
    expect(render(REVIEW)).not.toContain("data-pyth-reference-check");
  });
});

describe("a sale stopped without a usable Pyth reference", () => {
  it("says the reference is out of date outside trading hours, with a refresh, in every locale", () => {
    const failed = run(PREVIEWING, { type: "previewFailed", requestId: 1, failure: "referenceUnavailable", details: "stale" });
    for (const locale of PUBLIC_WEB_LOCALES) {
      const copy = PURCHASE_MESSAGES[locale];
      const html = text(render(failed, locale));
      expect(html, locale).toContain(copy.sell.referenceStale.title);
      expect(html, locale).toContain(copy.sell.referenceStale.body);
      expect(html, locale).not.toContain(copy.sell.routeCheck.title);
      expect(html, locale).toContain(copy.action.refresh);
    }
  });

  it("says the reference could not be read for any other reason", () => {
    const failed = run(PREVIEWING, { type: "previewFailed", requestId: 1, failure: "referenceUnavailable", details: "malformed_price_account" });
    for (const locale of PUBLIC_WEB_LOCALES) {
      const copy = PURCHASE_MESSAGES[locale];
      const html = text(render(failed, locale));
      expect(html, locale).toContain(copy.sell.referenceUnavailable.title);
      expect(html, locale).not.toContain(copy.sell.referenceStale.title);
    }
  });
});

describe("a sale result with a balance change the other way", () => {
  it("shows no amount for NVDAx that rose or USDC that fell", () => {
    const odd = run(FINALIZED, {
      type: "resultRead",
      signature: SIGNATURE,
      result: { nvdaxDeltaRaw: 5n, usdcPaidRaw: 7n, payToken: "USDC", paidRaw: 7n, nvdaxMultiplier: { value: MULTIPLIER, readAt: BUILT_AT } },
    });
    const html = text(render(odd));
    expect(html).toContain(EMPTY_VALUE);
    expect(html).not.toMatch(/-0\.0000000|-0\.000007/);
    expect(html).not.toContain("raw -5");
    expect(html).not.toContain("raw -7");
  });
});
