import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { FIXTURE_BUILT_AT, PURCHASE_FIXTURES, type PurchaseFixtureName } from "../../../packages/purchase/src/fixtures.ts";
import { purchaseReducer, type PurchaseState } from "../../../packages/purchase/src/purchase-machine.ts";
import type { ApprovalOutcome } from "../../../packages/purchase/src/wallet-standard.ts";
import { BuyFlow } from "../app/features/buy-flow/buy-flow.tsx";
import { FLOW_STEPS, flowStepOf, flowStepText } from "../app/features/buy-flow/flow-steps.ts";
import { ACTIVITY_CONFIG } from "../app/features/activity/activity-config.ts";
import { createActivityStore, type ActivityStorage } from "../app/features/activity/activity-store.ts";
import { activityAttemptId, activityWriteFor, recordPurchaseActivity } from "../app/features/purchase-island/purchase-activity.ts";
import { PurchasePanelView, type PanelHandlers, type PanelRefs } from "../app/features/purchase-island/purchase-panel-view.tsx";
import { PurchaseStatusLineView, STATUS_LINE_PHASES } from "../app/features/purchase-island/purchase-status-line.tsx";
import { approveOnce, createPurchaseStore, prefillPurchase } from "../app/features/purchase-island/purchase-store.ts";
import { readDeepLink } from "../../../packages/purchase/src/deep-link.ts";
import { PUBLIC_WEB_LOCALES, type PublicWebLocale } from "../app/i18n/locales.ts";
import { PRODUCT_MESSAGES } from "../app/i18n/product-messages.ts";
import { PURCHASE_MESSAGES, purchaseMessagesFor } from "../app/i18n/purchase-messages.ts";
import { PRODUCT_ROUTES, PRODUCT_TICKERS, SELL_ROUTE } from "../../../packages/purchase/src/routes-table.ts";
import { ROUTE_DEX_LABELS } from "../../../packages/purchase/src/route-dex.ts";
import { createPurchaseFrame, createSaleFrame } from "../app/lib/purchase-frame.server.ts";

const HANDLERS: PanelHandlers = {
  onConnect: () => undefined, onDisconnect: () => undefined, onAmountChange: () => undefined, onAmountBlur: () => undefined,
  onPreview: () => undefined, onApprove: () => undefined, onCheckAgain: () => undefined, onStartNew: () => undefined,
};
const NAMES = Object.keys(PURCHASE_FIXTURES) as PurchaseFixtureName[];

function refs(): PanelRefs {
  return { previewHeading: createRef(), errorTitle: createRef(), resultHeading: createRef(), amountInput: createRef() };
}

const LEADING = <a href="/stock/NVDA" data-buy-flow-close="">Close</a>;

function renderFlow(name: PurchaseFixtureName, locale: PublicWebLocale): string {
  const fixture = PURCHASE_FIXTURES[name];
  const flow = { leading: LEADING, step: flowStepText(fixture.state.attempt.phase, locale) };
  return renderToStaticMarkup(<PurchasePanelView state={fixture.state} now={fixture.now} locale={locale} handlers={HANDLERS} refs={refs()} announcement="" flow={flow} />);
}

function renderCard(name: PurchaseFixtureName, locale: PublicWebLocale): string {
  const fixture = PURCHASE_FIXTURES[name];
  return renderToStaticMarkup(<PurchasePanelView state={fixture.state} now={fixture.now} locale={locale} handlers={HANDLERS} refs={refs()} announcement="" />);
}

function text(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ");
}

/** The panel content after the notice: identical in the card and in the flow. */
function contentAfterNotice(html: string): string {
  const start = html.indexOf("</ul></div>", html.indexOf("data-purchase-notice"));
  // Up to the panel's live region, its last child; only the wrappers after it differ.
  return html.slice(start, html.lastIndexOf('<p class="sr-only" role="status" aria-live="polite" aria-atomic="true">')).replace(/_R_[0-9a-z]+_/g, "_id_");
}

describe("buy flow steps (app IA 5.2)", () => {
  it("maps every contract state to one of three steps, in order", () => {
    expect(FLOW_STEPS).toEqual(["amount", "review", "result"]);
    const expected: Record<string, string> = {
      walletNotDetected: "amount", walletDisconnected: "amount", walletConnecting: "amount", editing: "amount", previewing: "amount", simulationFailed: "amount", walletOutcomeUnknown: "amount",
      reviewReady: "review", previewExpired: "review", awaitingWallet: "review",
      submitted: "result", confirmed: "result", notFinalized: "result", failedOnChain: "result", dropped: "result", finalized: "result", result: "result", resultUnreadable: "result",
    };
    for (const [name, step] of Object.entries(expected)) expect(flowStepOf(PURCHASE_FIXTURES[name as PurchaseFixtureName].state.attempt.phase), name).toBe(step);
    expect(flowStepOf("frame")).toBe("amount");
    for (const locale of PUBLIC_WEB_LOCALES) {
      expect(Object.keys(PRODUCT_MESSAGES[locale].flow.steps), locale).toEqual([...FLOW_STEPS]);
      expect(flowStepText("reviewReady", locale), locale).toContain(PRODUCT_MESSAGES[locale].flow.steps.review);
    }
    expect(flowStepText("reviewReady", "en")).toBe("Step 2 of 3: Review");
  });

  it("keeps the panel content order on every step: heading, route line, Before you buy, then the state's content and actions", () => {
    for (const locale of PUBLIC_WEB_LOCALES) {
      for (const name of NAMES) {
        const html = renderFlow(name, locale);
        const heading = html.indexOf('id="purchase-heading"');
        const step = html.indexOf("data-purchase-step");
        const route = html.indexOf("data-purchase-route");
        const notice = html.indexOf("data-purchase-notice");
        expect(heading, name).toBeGreaterThan(html.indexOf("data-buy-flow-close"));
        expect(step, name).toBeGreaterThan(heading);
        expect(route, name).toBeGreaterThan(step);
        expect(notice, name).toBeGreaterThan(route);
        for (const later of ["data-purchase-wallet", "data-purchase-field", "data-purchase-stage", "data-purchase-actions"]) {
          const index = html.indexOf(later);
          if (index !== -1) expect(index, `${name}: ${later}`).toBeGreaterThan(notice);
        }
        const copy = PURCHASE_MESSAGES[locale].notice;
        for (const sentence of [copy.heading, copy.usPersons, copy.noEligibilityCheck, copy.noAvailabilityGuarantee, copy.notAdvice]) expect(text(html), `${locale} ${name}`).toContain(sentence);
        expect(html, name).toContain('data-purchase-variant="flow"');
      }
    }
  });

  it("shows exactly the card's state content and actions, so no state or action changes in the flow", () => {
    for (const name of NAMES) expect(contentAfterNotice(renderFlow(name, "en")), name).toBe(contentAfterNotice(renderCard(name, "en")));
  });

  it("prerenders the frame like the island's first state inside the flow", () => {
    for (const locale of PUBLIC_WEB_LOCALES) {
      const frame = renderToStaticMarkup(
        <MemoryRouter initialEntries={["/stock/NVDA/buy"]}>
          <BuyFlow locale={locale} frame={createPurchaseFrame(locale)} ticker="NVDA" productHref="/stock/NVDA" />
        </MemoryRouter>,
      );
      expect(frame, locale).toMatch(/<div data-buy-flow="" role="dialog" aria-modal="true" aria-labelledby="purchase-heading"/);
      expect(frame, locale).toContain('data-phase="frame"');
      expect(text(frame), locale).toContain(flowStepText("frame", locale));
      expect(frame, locale).toContain(`<noscript><p data-purchase-noscript="" class="text-sm text-muted-foreground">${PURCHASE_MESSAGES[locale].noScript}</p></noscript>`);
      expect(frame, locale).not.toContain("data-purchase-wallet");
      // Close works without JavaScript: a link to the product page.
      expect(frame, locale).toMatch(/<a[^>]*data-buy-flow-close=""[^>]*href="\/stock\/NVDA"/);
      const island = renderFlow("walletDetecting", locale);
      const top = (html: string) => html.slice(html.indexOf("data-purchase-route"), html.indexOf("</ul></div>", html.indexOf("data-purchase-notice")));
      expect(top(frame).replace(/<span aria-hidden="true" data-purchase-copy-pending="" class="invisible">([\s\S]*?<\/button><span class="sr-only"[^>]*><\/span><\/span>)<\/span>/, "$1"), locale).toBe(top(island));
    }
  });
});

describe("send once in the flow", () => {
  it("asks the wallet once however often Approve is pressed, and a rejection allows one new request", async () => {
    const store = createPurchaseStore(PURCHASE_FIXTURES.reviewReady.state);
    let settle: (outcome: ApprovalOutcome) => void = () => undefined;
    const requestApproval = vi.fn(() => new Promise<ApprovalOutcome>((resolve) => { settle = resolve; }));
    const now = () => FIXTURE_BUILT_AT + 5_000;
    expect([approveOnce(store, requestApproval, now), approveOnce(store, requestApproval, now), approveOnce(store, requestApproval, now)]).toEqual([true, false, false]);
    expect(requestApproval).toHaveBeenCalledTimes(1);
    settle({ kind: "rejected" });
    await Promise.resolve();
    await Promise.resolve();
    expect(store.getState().attempt.phase).toBe("reviewReady");
    expect(approveOnce(store, requestApproval, now)).toBe(true);
    expect(requestApproval).toHaveBeenCalledTimes(2);
  });
});

describe("Activity writes (app IA 5.2 addition 2)", () => {
  function step(state: PurchaseState, ...actions: Parameters<typeof purchaseReducer>[1][]) {
    return actions.reduce((current, action) => purchaseReducer(current, action), state);
  }
  const AT = FIXTURE_BUILT_AT + 20_000;

  it("reports opened, sent, confirmed and a measured finalized result under one attempt key, without transaction bytes", () => {
    const ready = PURCHASE_FIXTURES.reviewReady.state;
    const awaiting = step(ready, { type: "approveRequested", now: FIXTURE_BUILT_AT + 5_000 });
    const opened = activityWriteFor(ready, awaiting, AT)!;
    expect(opened).toMatchObject({ phase: "opened", signature: null, inputRaw: "1000000", expectedOutputRaw: "441982", minimumOutputRaw: "437562", receivedRaw: null, paidRaw: null });
    expect(opened.inputMint).toBe("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    expect(opened.outputMint).toBe("Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh");
    expect(JSON.stringify(opened)).not.toMatch(/wireTransaction|signedTransaction/);

    const submitted = PURCHASE_FIXTURES.submitted.state;
    const sent = activityWriteFor(PURCHASE_FIXTURES.awaitingWallet.state, submitted, AT)!;
    expect(sent.phase).toBe("sent");
    expect(sent.signature).toMatch(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/);
    expect(sent.attemptKey).toBe(opened.attemptKey);

    expect(activityWriteFor(submitted, PURCHASE_FIXTURES.confirmed.state, AT)?.phase).toBe("confirmed");
    const result = PURCHASE_FIXTURES.result.state;
    const finalized = activityWriteFor(PURCHASE_FIXTURES.finalized.state, result, AT)!;
    expect(finalized.phase).toBe("finalized");
    expect(finalized.attemptKey).toBe(opened.attemptKey);
    if (result.attempt.phase !== "result") throw new Error("fixture");
    expect(finalized.receivedRaw).toBe(result.attempt.result.nvdaxDeltaRaw.toString());
    expect(finalized.paidRaw).toBe(result.attempt.result.usdcPaidRaw.toString());
  });

  it("reports rejection, unknown outcome and every other end, and nothing for transitions that are not attempt ends", () => {
    const awaiting = PURCHASE_FIXTURES.awaitingWallet.state;
    expect(activityWriteFor(awaiting, PURCHASE_FIXTURES.reviewReadyRejected.state, AT)?.phase).toBe("rejected");
    expect(activityWriteFor(awaiting, PURCHASE_FIXTURES.walletOutcomeUnknown.state, AT)?.phase).toBe("outcome_unknown");
    expect(activityWriteFor(PURCHASE_FIXTURES.confirmed.state, PURCHASE_FIXTURES.notFinalized.state, AT)?.phase).toBe("not_finalized");
    expect(activityWriteFor(PURCHASE_FIXTURES.submitted.state, PURCHASE_FIXTURES.failedOnChain.state, AT)?.phase).toBe("failed");
    expect(activityWriteFor(PURCHASE_FIXTURES.submitted.state, PURCHASE_FIXTURES.dropped.state, AT)?.phase).toBe("dropped");
    expect(activityWriteFor(PURCHASE_FIXTURES.finalized.state, PURCHASE_FIXTURES.resultUnreadable.state, AT)).toMatchObject({ phase: "finalized", receivedRaw: null, paidRaw: null });
    expect(activityWriteFor(PURCHASE_FIXTURES.editing.state, PURCHASE_FIXTURES.previewing.state, AT)).toBeNull();
    expect(activityWriteFor(PURCHASE_FIXTURES.previewing.state, PURCHASE_FIXTURES.reviewReady.state, AT)).toBeNull();
    expect(activityWriteFor(awaiting, awaiting, AT)).toBeNull();
  });

  it("turns an attempt key into Activity's record id one-to-one, and never writes another shape", () => {
    const wallet = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
    expect(activityAttemptId(`${wallet}:1790000000000`)).toBe(`${wallet}_1790000000000`);
    expect(activityAttemptId(`${"z".repeat(44)}:${"9".repeat(19)}`)).toHaveLength(64);
    expect(activityAttemptId(`${wallet}:1790000000000`)).not.toBe(activityAttemptId(`${wallet}:1790000000001`));
    for (const bad of ["", wallet, `${wallet}:`, `${wallet}:12.5`, `0OIl${wallet.slice(4)}:1`, `${wallet}:1:2`]) expect(activityAttemptId(bad), bad).toBeNull();
  });

  it("records the attempt in Activity: opened, sent and a measured finalized result on one record", () => {
    const values = new Map<string, string>();
    const storage: ActivityStorage = { getItem: (name) => values.get(name) ?? null, setItem: (name, value) => void values.set(name, value), removeItem: (name) => void values.delete(name) };
    const store = createActivityStore({ storage: () => storage, now: () => AT });
    const ready = PURCHASE_FIXTURES.reviewReady.state;
    const awaiting = step(ready, { type: "approveRequested", now: FIXTURE_BUILT_AT + 5_000 });
    recordPurchaseActivity(activityWriteFor(ready, awaiting, AT)!, store);
    let list = store.list();
    if (list.status !== "available") throw new Error("storage");
    expect(list.records).toHaveLength(1);
    expect(list.records[0]).toMatchObject({ phase: "opened", signature: null, genesisHash: ACTIVITY_CONFIG.mainnetGenesisHash, expectedOutputRaw: "441982", minimumOutputRaw: "437562", previewExpiresAt: expect.any(Number) });
    expect(list.records[0]!.id).toMatch(/^[A-Za-z0-9_-]{8,64}$/);

    recordPurchaseActivity(activityWriteFor(PURCHASE_FIXTURES.awaitingWallet.state, PURCHASE_FIXTURES.submitted.state, AT)!, store);
    recordPurchaseActivity(activityWriteFor(PURCHASE_FIXTURES.submitted.state, PURCHASE_FIXTURES.confirmed.state, AT)!, store);
    const result = PURCHASE_FIXTURES.result.state;
    recordPurchaseActivity(activityWriteFor(PURCHASE_FIXTURES.finalized.state, result, AT)!, store);
    list = store.list();
    if (list.status !== "available" || result.attempt.phase !== "result") throw new Error("fixture");
    expect(list.records).toHaveLength(1);
    const record = list.records[0]!;
    expect(record).toMatchObject({ phase: "finalized", finalizedAt: AT, lastCheckedAt: AT, receivedRaw: result.attempt.result.nvdaxDeltaRaw.toString(), paidRaw: result.attempt.result.usdcPaidRaw.toString() });
    // The preview numbers survive the later writes (a write leaves out what it does not carry).
    expect(record).toMatchObject({ expectedOutputRaw: "441982", minimumOutputRaw: "437562" });
    expect(record.signature).toMatch(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/);
    // Display units apply the multiplier read at the result, truncated like the panel's figure.
    expect(record.receivedDisplay).toMatch(/^\d+\.\d+$/);
    const exact = Number(result.attempt.result.nvdaxDeltaRaw) * Number(result.attempt.result.nvdaxMultiplier!.value) / 1e8;
    expect(Number(record.receivedDisplay)).toBeLessThanOrEqual(exact);
    expect(exact - Number(record.receivedDisplay)).toBeLessThan(1e-8);
  });

  it("withdraws the opened record when the wallet rejects, and keeps it when the outcome is unknown", () => {
    const values = new Map<string, string>();
    const storage: ActivityStorage = { getItem: (name) => values.get(name) ?? null, setItem: (name, value) => void values.set(name, value), removeItem: (name) => void values.delete(name) };
    const store = createActivityStore({ storage: () => storage, now: () => AT });
    const ready = PURCHASE_FIXTURES.reviewReady.state;
    const awaiting = step(ready, { type: "approveRequested", now: FIXTURE_BUILT_AT + 5_000 });
    recordPurchaseActivity(activityWriteFor(ready, awaiting, AT)!, store);
    const rejected = activityWriteFor(PURCHASE_FIXTURES.awaitingWallet.state, PURCHASE_FIXTURES.reviewReadyRejected.state, AT)!;
    expect(rejected.phase).toBe("rejected");
    recordPurchaseActivity(rejected, store);
    expect(store.list()).toMatchObject({ status: "available", records: [] });
    // Approving the same preview again opens the record anew.
    recordPurchaseActivity(activityWriteFor(ready, awaiting, AT)!, store);
    recordPurchaseActivity(activityWriteFor(PURCHASE_FIXTURES.awaitingWallet.state, PURCHASE_FIXTURES.walletOutcomeUnknown.state, AT)!, store);
    expect(store.list()).toMatchObject({ status: "available", records: [{ phase: "outcome_unknown", signature: null }] });
    // A late rejection cannot remove a record whose outcome is unknown.
    recordPurchaseActivity(rejected, store);
    expect(store.list()).toMatchObject({ status: "available", records: [{ phase: "outcome_unknown" }] });
  });

  it("never throws into the purchase flow when Activity cannot store", () => {
    const store = createActivityStore({ storage: () => null });
    const ready = PURCHASE_FIXTURES.reviewReady.state;
    const awaiting = step(ready, { type: "approveRequested", now: FIXTURE_BUILT_AT + 5_000 });
    expect(() => recordPurchaseActivity(activityWriteFor(ready, awaiting, AT)!, store)).not.toThrow();
    const broken = { ...store, record: () => { throw new Error("boom"); } };
    expect(() => recordPurchaseActivity(activityWriteFor(ready, awaiting, AT)!, broken)).not.toThrow();
  });

});

describe("After sending (app IA 5.1 and change C5)", () => {
  it("says the screen may be left and Activity keeps the signature, in every locale", () => {
    for (const locale of PUBLIC_WEB_LOCALES) {
      const copy = PURCHASE_MESSAGES[locale].trail.keepOpen;
      for (const name of ["submitted", "confirmed"] as const) {
        const html = renderToStaticMarkup(<MemoryRouter><PurchasePanelView state={PURCHASE_FIXTURES[name].state} now={FIXTURE_BUILT_AT} locale={locale} handlers={HANDLERS} refs={refs()} announcement="" /></MemoryRouter>);
        expect(html, `${locale} ${name}`).toContain(copy);
      }
    }
    expect(PURCHASE_MESSAGES.en.trail.keepOpen).toBe("You can leave this screen. Benten keeps checking while Benten is open, and Activity keeps the signature. Do not buy again.");
    expect(PURCHASE_MESSAGES.en.trail.keepOpen).not.toMatch(/keep this page open/i);
  });

  it("shows the status line with a link to Activity only while a sent purchase is tracked", () => {
    expect([...STATUS_LINE_PHASES].sort()).toEqual(["confirmed", "finalized", "submitted"]);
    for (const locale of PUBLIC_WEB_LOCALES) {
      const html = renderToStaticMarkup(<PurchaseStatusLineView locale={locale} />);
      expect(html, locale).toContain('role="status"');
      expect(html, locale).toContain(PURCHASE_MESSAGES[locale].status.sent);
      expect(html, locale).toContain(`href="${locale === "en" ? "" : `/${locale}`}/activity"`);
    }
    expect(PURCHASE_MESSAGES.en.status).toEqual({ sent: "Purchase sent. Tracking until finalized.", view: "View" });
  });
});

describe("buy-flow link amount (MCP prepare_purchase)", () => {
  it("fills an empty amount field with a checked link amount and requests nothing", () => {
    const store = createPurchaseStore();
    const link = readDeepLink("?amount=5");
    expect(link).toEqual({ payToken: "USDC", amountText: "5.00" });
    expect(prefillPurchase(store, link!)).toBe(true);
    const state = store.getState();
    expect(state.payToken).toBe("USDC");
    expect(state.amountText).toBe("5.00");
    expect(state.amountError).toBeNull();
    expect(state.attempt.phase).toBe("editing");
    // Only approveOnce may ask the wallet, and only from reviewReady; a prefilled field is not there.
    const requestApproval = vi.fn(async (): Promise<ApprovalOutcome> => ({ kind: "rejected" }));
    expect(approveOnce(store, requestApproval)).toBe(false);
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it.each([
    ["?amount=0.02&pay=sol", "SOL", "0.02"],
    ["?amount=100&pay=skr", "SKR", "100.00"],
  ] as const)("selects the link's pay token and fills the amount in its units for %s, requesting nothing", (search, payToken, amountText) => {
    const store = createPurchaseStore();
    const link = readDeepLink(search);
    expect(link).toEqual({ payToken, amountText });
    expect(prefillPurchase(store, link!)).toBe(true);
    const state = store.getState();
    expect(state.payToken).toBe(payToken);
    expect(state.amountText).toBe(amountText);
    expect(state.amountError).toBeNull();
    expect(state.attempt.phase).toBe("editing");
    const requestApproval = vi.fn(async (): Promise<ApprovalOutcome> => ({ kind: "rejected" }));
    expect(approveOnce(store, requestApproval)).toBe(false);
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it("a plain amount link selects USDC again after another token was chosen with an empty field", () => {
    const store = createPurchaseStore();
    store.send({ type: "payTokenSelected", payToken: "SOL" });
    expect(prefillPurchase(store, readDeepLink("?amount=5")!)).toBe(true);
    expect(store.getState()).toMatchObject({ payToken: "USDC", amountText: "5.00" });
  });

  it("never replaces a typed amount or an attempt in progress", () => {
    const store = createPurchaseStore();
    store.send({ type: "amountEdited", text: "2" });
    expect(prefillPurchase(store, { payToken: "SOL", amountText: "0.02" })).toBe(false);
    expect(store.getState()).toMatchObject({ payToken: "USDC", amountText: "2" });
    const busy = createPurchaseStore(PURCHASE_FIXTURES.reviewReady.state);
    expect(prefillPurchase(busy, { payToken: "USDC", amountText: "5.00" })).toBe(false);
    expect(busy.getState()).toBe(PURCHASE_FIXTURES.reviewReady.state);
  });

  it("ignores link amounts outside the field's checks and invalid pay tokens", () => {
    for (const search of ["?amount=11", "?amount=0", "?amount=1e1", "?amount=-5", "?amount=5&amount=6", "?amount=abc"]) {
      expect(readDeepLink(search), search).toBeNull();
    }
    for (const search of ["?amount=1&pay=SOL", "?amount=1&pay=btc", "?amount=1&pay=sol&pay=skr", "?amount=1&pay="]) {
      expect(readDeepLink(search), search).toBeNull();
    }
  });
});

describe("buy flow per product (routes table)", () => {
  /** A fixture state moved onto `product`: the page's product, and the preview's or tracked attempt's. */
  function onProduct(state: PurchaseState, product: (typeof PRODUCT_TICKERS)[number]): PurchaseState {
    const attempt = state.attempt;
    const moved = "preview" in attempt
      ? { ...attempt, preview: { ...attempt.preview, product } }
      : "tracking" in attempt ? { ...attempt, tracking: { ...attempt.tracking, product } } : attempt;
    return { ...state, product, attempt: moved as PurchaseState["attempt"] };
  }

  it.each([...PRODUCT_TICKERS])("prerenders the %s frame with its own heading and pool", (ticker) => {
    const route = PRODUCT_ROUTES[ticker];
    for (const locale of PUBLIC_WEB_LOCALES) {
      const frame = createPurchaseFrame(locale, ticker);
      expect(frame.heading, locale).toBe(purchaseMessagesFor(locale, route.symbol).heading);
      expect(frame.heading, locale).toContain(route.symbol);
      expect(frame.pool).toBe(route.pool.toBase58());
    }
  });

  it.each([...PRODUCT_TICKERS])("names the %s route's own DEX in every locale's route line and two-leg note", (ticker) => {
    const route = PRODUCT_ROUTES[ticker];
    const dex = ROUTE_DEX_LABELS[route.dex];
    const other = Object.values(ROUTE_DEX_LABELS).filter((label) => label !== dex);
    for (const locale of PUBLIC_WEB_LOCALES) {
      const line = createPurchaseFrame(locale, ticker).routeLine;
      expect(line, locale).toContain(dex);
      for (const label of other) expect(line, locale).not.toContain(label);
      const note = purchaseMessagesFor(locale, route.symbol).pay.route("SOL", ROUTE_DEX_LABELS["meteora-dlmm"], dex);
      expect(note, locale).toContain(ROUTE_DEX_LABELS["meteora-dlmm"]);
      expect(note, locale).toContain(dex);
    }
  });

  it("keeps the sale on the NVDAx Meteora DLMM route line", () => {
    for (const locale of PUBLIC_WEB_LOCALES) expect(createSaleFrame(locale).routeLine, locale).toContain(ROUTE_DEX_LABELS[SELL_ROUTE.dex]);
    expect(SELL_ROUTE.dex).toBe("meteora-dlmm");
  });

  it("has no frame for a product without a route", () => {
    expect(() => createPurchaseFrame("en", "IBM")).toThrow(/no fixed route/);
    expect(() => createPurchaseFrame("en", "meta")).toThrow(/no fixed route/);
  });

  it("shows the attempt's product in the panel: its symbol, its pool and its amounts", () => {
    const meta = PRODUCT_ROUTES.META;
    const ready = onProduct(PURCHASE_FIXTURES.reviewReady.state, "META");
    const html = renderToStaticMarkup(<PurchasePanelView state={ready} now={PURCHASE_FIXTURES.reviewReady.now} locale="en" handlers={HANDLERS} refs={refs()} announcement="" />);
    expect(text(html)).toContain("Buy METAx");
    // The route line names the pool shortened (first and last characters).
    const short = (pool: string) => `${pool.slice(0, 4)}`;
    expect(text(html)).toContain(short(meta.pool.toBase58()));
    expect(text(html)).not.toContain(short(PRODUCT_ROUTES.NVDA.pool.toBase58()));
    expect(text(html)).toMatch(/METAx/);
    expect(text(html)).not.toMatch(/NVDAx/);
  });

  it("records a purchase of META with the META pool as its route and the META mint as its output", () => {
    const ready = onProduct(PURCHASE_FIXTURES.reviewReady.state, "META");
    const awaiting = purchaseReducer(ready, { type: "approveRequested", now: FIXTURE_BUILT_AT + 1_000 });
    const opened = activityWriteFor(ready, awaiting, FIXTURE_BUILT_AT + 1_000)!;
    expect(opened).toMatchObject({ phase: "opened", routeId: PRODUCT_ROUTES.META.pool.toBase58(), outputMint: PRODUCT_ROUTES.META.productMint.toBase58() });
    const submitted = purchaseReducer(awaiting, { type: "walletSigned", signature: "5".repeat(88), now: FIXTURE_BUILT_AT + 2_000 });
    expect(activityWriteFor(awaiting, submitted, FIXTURE_BUILT_AT + 2_000)).toMatchObject({ phase: "sent", routeId: PRODUCT_ROUTES.META.pool.toBase58(), outputMint: PRODUCT_ROUTES.META.productMint.toBase58() });
  });
});

