import { readFileSync } from "node:fs";
import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PURCHASE_FIXTURES, type PurchaseFixtureName } from "../../../packages/purchase/src/fixtures.ts";
import type { ApprovalOutcome } from "../../../packages/purchase/src/wallet-standard.ts";
import { DossierPage } from "../app/features/dossier/dossier-page.tsx";
import { PurchasePanelView, type PanelHandlers, type PanelRefs } from "../app/features/purchase-island/purchase-panel-view.tsx";
import { approveOnce, createPurchaseStore } from "../app/features/purchase-island/purchase-store.ts";
import { PUBLIC_WEB_LOCALES, type PublicWebLocale } from "../app/i18n/locales.ts";
import { MESSAGES } from "../app/i18n/messages.ts";
import { PURCHASE_MESSAGES, purchaseMessagesFor } from "../app/i18n/purchase-messages.ts";
import { createDossierView } from "../app/lib/dossier.server.ts";
import { createPurchaseFrame } from "../app/lib/purchase-frame.server.ts";

const HANDLERS: PanelHandlers = {
  onConnect: () => undefined, onDisconnect: () => undefined, onAmountChange: () => undefined, onAmountBlur: () => undefined,
  onPreview: () => undefined, onApprove: () => undefined, onCheckAgain: () => undefined, onStartNew: () => undefined,
};

function refs(): PanelRefs {
  return { previewHeading: createRef(), errorTitle: createRef(), resultHeading: createRef(), amountInput: createRef() };
}

function render(name: PurchaseFixtureName, locale: PublicWebLocale): string {
  const fixture = PURCHASE_FIXTURES[name];
  return renderToStaticMarkup(<PurchasePanelView state={fixture.state} now={fixture.now} locale={locale} handlers={HANDLERS} refs={refs()} announcement="" />);
}

function text(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&lt;/g, "<").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ");
}

function leafStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "function") {
    const sample = (value as (...args: unknown[]) => unknown)("X", "Y");
    return typeof sample === "string" ? [sample, String((value as (...args: unknown[]) => unknown)(true))] : [];
  }
  if (value && typeof value === "object") return Object.values(value).flatMap(leafStrings);
  return [];
}

function shape(value: unknown): unknown {
  if (typeof value === "function") return `fn/${value.length}`;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, shape(nested)]));
  return typeof value;
}

/** Filled primary buttons carry the generated default variant. */
function primaryCount(html: string): number {
  return (html.match(/data-variant="default"/g) ?? []).length;
}

const NAMES = Object.keys(PURCHASE_FIXTURES) as PurchaseFixtureName[];
/**
 * Advice, ranking and quote/NAV vocabulary that must never appear in purchase
 * copy (design contract section 1). Non-English terms are escapes so this
 * file stays ASCII.
 */
const FORBIDDEN: Record<PublicWebLocale, RegExp> = {
  en: /\b(quote|quotes|quoted|NAV|best|recommend\w*|popular|advisable)\b|1 NVDAx =/i,
  ja: /\u898b\u7a4d|\u6c17\u914d|\u57fa\u6e96\u4fa1\u984d|\u63a8\u5968|\u304a\u3059\u3059\u3081|\u304a\u52e7\u3081|\u6700\u9069|\u6700\u826f|\u4eba\u6c17|NAV/,
  ko: /\uacac\uc801|\uc2dc\uc138|\ud638\uac00|\uc21c\uc790\uc0b0\uac00\uce58|\ucd94\ucc9c|\uad8c\uc7a5|\ucd5c\uc801|\ucd5c\uace0|\uc778\uae30|NAV/,
  "zh-Hans": /\u62a5\u4ef7|\u5831\u50f9|\u51c0\u503c|\u63a8\u8350|\u5efa\u8bae\u8d2d\u4e70|\u6700\u4f73|\u6700\u4f18|\u70ed\u95e8|NAV/,
  "zh-Hant": /\u5831\u50f9|\u62a5\u4ef7|\u6de8\u503c|\u63a8\u85a6|\u5efa\u8b70\u8cfc\u8cb7|\u6700\u4f73|\u6700\u512a|\u71b1\u9580|NAV/,
};

describe("purchase catalog", () => {
  it("has one purchase catalog per locale with an identical key structure", () => {
    expect(Object.keys(PURCHASE_MESSAGES)).toEqual([...PUBLIC_WEB_LOCALES]);
    const english = shape(PURCHASE_MESSAGES.en);
    for (const locale of PUBLIC_WEB_LOCALES) expect(shape(PURCHASE_MESSAGES[locale]), locale).toEqual(english);
  });

  it.each(PUBLIC_WEB_LOCALES)("keeps quote, NAV, advice and ranking words out of the %s purchase copy", (locale) => {
    for (const line of leafStrings(purchaseMessagesFor(locale))) expect(line).not.toMatch(FORBIDDEN[locale]);
    for (const line of leafStrings(MESSAGES[locale].dossier.purchase)) expect(line).not.toMatch(FORBIDDEN[locale]);
  });

  it("uses 'price' in English only for the standard price impact row (and its NVDAx pool label on two-leg purchases)", () => {
    expect(leafStrings(PURCHASE_MESSAGES.en).filter((line) => /price/i.test(line))).toEqual(["NVDAx pool price impact", "Price impact"]);
  });

  it("names the jump link exactly like the panel heading in every locale", () => {
    for (const locale of PUBLIC_WEB_LOCALES) {
      expect(MESSAGES[locale].dossier.purchase.jumpLink("NVDAx"), locale).toBe(PURCHASE_MESSAGES[locale].heading);
      expect(MESSAGES[locale].dossier.purchase.jumpLink("METAx"), locale).toBe(purchaseMessagesFor(locale, "METAx").heading);
      expect(PURCHASE_MESSAGES[locale].jumpLink, locale).toBe(PURCHASE_MESSAGES[locale].heading);
    }
  });

  it("states that the wallet, not Benten, signs and sends", () => {
    expect(MESSAGES.en.footer.walletNotice).toBe("Benten never signs or sends transactions. Purchases are approved and sent by your own wallet.");
    expect(PURCHASE_MESSAGES.en.preview.networkFee).toBe("Your wallet shows the network fee in SOL. Benten asks your wallet to send once and never resends.");
  });

  it("states the 10 USDC per-transaction limit", () => {
    expect(text(render("editingOverLimit", "en"))).toContain("The limit is 10.00 USDC per transaction.");
  });
});

describe("purchase panel rendering (every fixture, every locale)", () => {
  it.each(PUBLIC_WEB_LOCALES)("shows the four notice sentences in every state, carries its locale, and no forbidden words (%s)", (locale) => {
    const notice = purchaseMessagesFor(locale).notice;
    for (const name of NAMES) {
      const html = render(name, locale);
      const rendered = text(html);
      for (const sentence of [notice.heading, notice.usPersons, notice.noEligibilityCheck, notice.noAvailabilityGuarantee, notice.notAdvice]) expect(rendered, name).toContain(sentence);
      expect(rendered, name).not.toMatch(FORBIDDEN[locale]);
      expect(html, name).toContain(`lang="${locale}"`);
    }
  });

  it("puts the notice right after the route line, before the wallet step and everything else", () => {
    for (const name of NAMES) {
      const html = render(name, "en");
      const route = html.indexOf("data-purchase-route");
      const notice = html.indexOf("data-purchase-notice");
      expect(route, name).toBeGreaterThan(-1);
      expect(notice, name).toBeGreaterThan(route);
      for (const later of ["data-purchase-wallet", "data-purchase-field", "data-purchase-stage", "data-purchase-actions"]) {
        const index = html.indexOf(later);
        if (index !== -1) expect(index, `${name}: ${later}`).toBeGreaterThan(notice);
      }
    }
  });

  it("has at most one filled primary button, and none where the contract shows none", () => {
    for (const name of NAMES) expect(primaryCount(render(name, "en")), name).toBeLessThanOrEqual(1);
    for (const name of ["submitted", "confirmed", "finalized", "result", "failedOnChain", "dropped", "walletOutcomeUnknown", "routeCheck", "walletDisconnectedTwo", "walletNotDetected"] as const) {
      expect(primaryCount(render(name, "en")), name).toBe(0);
    }
    for (const name of ["walletDisconnected", "editing", "reviewReady", "previewExpired", "relayBusy", "notFinalized", "resultUnreadable", "awaitingWallet", "previewing"] as const) {
      expect(primaryCount(render(name, "en")), name).toBe(1);
    }
    expect(render("result", "en")).toContain('data-variant="outline"');
  });

  it("keeps busy buttons inert and announced", () => {
    for (const name of ["awaitingWallet", "previewing", "walletConnecting"] as const) {
      const html = render(name, "en");
      expect(html, name).toMatch(/<button[^>]*aria-disabled="true"[^>]*aria-busy="true"/);
    }
  });

  it("shows raw integers beside every preview amount and the fixed slippage", () => {
    const rendered = text(render("reviewReady", "en"));
    for (const raw of ["raw 1000000", "raw 441982", "raw 437562"]) expect(rendered).toContain(raw);
    expect(rendered).toContain("1.00 USDC");
    expect(rendered).toContain("0.00442733 NVDAx");
    expect(rendered).toContain("1.00%");
    expect(rendered).toContain("<0.01%");
    expect(rendered).toContain("Approve in wallet");
  });

  it("falls back to raw units when the multiplier could not be read", () => {
    const rendered = text(render("reviewReadyRawOnly", "en"));
    expect(rendered).toContain("441982 raw units");
    expect(rendered).toContain(PURCHASE_MESSAGES.en.preview.multiplierUnavailable);
  });

  it("dims an expired preview without striking it through, and disables approve", () => {
    const html = render("previewExpired", "en");
    expect(html).toContain('data-purchase-terms="expired"');
    expect(html).not.toMatch(/<s>|<del|line-through/);
    expect(html).toMatch(/<button[^>]*aria-disabled="true"[^>]*>Approve in wallet<\/button>/);
    expect(text(html)).toContain("This preview expired");
  });

  it("keeps an expired preview to its values and expiry time", () => {
    const rendered = text(render("previewExpired", "en"));
    const copy = PURCHASE_MESSAGES.en.preview;
    expect(rendered).toContain("0.00442733 NVDAx");
    expect(rendered).not.toContain("raw 441982");
    expect(rendered).not.toContain(copy.minimumNote);
    expect(rendered).not.toContain(copy.networkFee);
    expect(rendered).toMatch(/Expired at \d{2}:\d{2}:\d{2}/);
    expect(text(render("reviewReady", "en"))).toContain("raw 441982");
  });

  it("names an expired preview as expired in every locale", () => {
    for (const locale of PUBLIC_WEB_LOCALES) {
      const copy = purchaseMessagesFor(locale).preview;
      expect(text(render("previewExpired", locale)), locale).toContain(copy.headingExpired);
      expect(text(render("reviewReady", locale)), locale).not.toContain(copy.headingExpired);
    }
  });

  it("marks only completed trail steps with a check", () => {
    expect(render("awaitingWallet", "en").match(/data-trail-check/g)).toHaveLength(1);
    expect(render("result", "en").match(/data-trail-check/g)).toHaveLength(5);
    expect(text(render("result", "en"))).toContain("Finalized , done");
  });

  it("shows the received figure from the measured result and the Solana Explorer link", () => {
    const html = render("result", "en");
    expect(text(html)).toContain("+0.00442733 NVDAx");
    expect(text(html)).toContain("raw +441982");
    expect(html).toContain("https://explorer.solana.com/tx/");
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("offers Check again with the full signature when tracking stopped", () => {
    const html = render("notFinalized", "en");
    const signature = PURCHASE_FIXTURES.notFinalized.state.attempt.phase === "notFinalized" ? PURCHASE_FIXTURES.notFinalized.state.attempt.tracking.signature : "";
    expect(text(html)).toContain("Not finalized yet");
    expect(text(html)).toContain("Check again");
    expect(text(html)).toContain("Not seen yet");
    expect(text(html)).toContain(signature);
  });

  it("uses an alert notice with an icon for every error state", () => {
    for (const name of ["notEnoughSol", "simulationFailed", "routeCheck", "relayBusy", "relayUnavailable", "previewExpired", "failedOnChain", "dropped", "notFinalized", "walletOutcomeUnknown", "reviewReadyRejected"] as const) {
      const html = render(name, "en");
      expect(html, name).toMatch(/role="alert"[^>]*data-purchase-alert=""|data-purchase-alert=""[^>]*role="alert"/);
      expect(html, name).toContain("lucide-circle-alert");
    }
    expect(text(render("notEnoughSol", "en"))).toContain("network fee and the token account deposit");
  });

  it("offers no approval after an unknown wallet outcome and points to the wallet on Solana Explorer", () => {
    const fixture = PURCHASE_FIXTURES.walletOutcomeUnknown;
    const address = fixture.state.connection.kind === "connected" ? fixture.state.connection.address : "";
    for (const locale of PUBLIC_WEB_LOCALES) {
      const copy = purchaseMessagesFor(locale);
      const html = render("walletOutcomeUnknown", locale);
      expect(text(html), locale).not.toContain(copy.action.approve);
      expect(text(html), locale).not.toContain(copy.action.refresh);
      expect(text(html), locale).toContain(copy.error.walletUnknown.explorer);
      expect(html, locale).toContain(`https://explorer.solana.com/address/${address}`);
      expect(text(html), locale).toContain(copy.action.startNew);
    }
  });

  it("warns on a new preview that an earlier request may have been sent, without an alert", () => {
    for (const locale of PUBLIC_WEB_LOCALES) {
      const copy = purchaseMessagesFor(locale);
      const html = render("reviewReadyAfterUnknown", locale);
      expect(text(html), locale).toContain(copy.error.earlierRequest.title);
      expect(html, locale).toMatch(/role="note"[^>]*data-purchase-alert/);
      expect(text(html), locale).toContain(copy.action.approve);
      expect(text(render("reviewReady", locale)), locale).not.toContain(copy.error.earlierRequest.title);
    }
  });

  it("does not offer a retry after a route check failure", () => {
    expect(text(render("routeCheck", "en"))).not.toMatch(/Try again|Refresh preview/);
  });

  it("lets programmatically focused headings drop the outline and wraps ja and ko by phrase and word", () => {
    const css = readFileSync(new URL("../app/static.css", import.meta.url), "utf8");
    expect(css).toContain('[data-purchase-panel] [tabindex="-1"]:focus');
    // One document-wide rule per language; the panel carries the document locale in its own lang attribute.
    expect(css).toContain("html:lang(ja) body { word-break: auto-phrase; }");
    expect(css).toContain("html:lang(ko) body { word-break: keep-all; }");
    for (const locale of PUBLIC_WEB_LOCALES) expect(render("reviewReady", locale)).toMatch(new RegExp(`data-purchase-panel=""[^>]*lang="${locale}"`));
    for (const id of ["purchase-heading"]) expect(render("reviewReady", "en")).toMatch(new RegExp(`id="${id}" tabindex="-1"`));
  });
});

describe("send once", () => {
  function readyStore() {
    const fixture = PURCHASE_FIXTURES.reviewReady;
    return { store: createPurchaseStore(fixture.state), now: () => fixture.now };
  }

  it("asks the wallet exactly once for one preview, however often approve is pressed", async () => {
    const { store, now } = readyStore();
    let resolveRequest: (outcome: ApprovalOutcome) => void = () => undefined;
    const request = vi.fn(() => new Promise<ApprovalOutcome>((resolve) => { resolveRequest = resolve; }));
    const made = [approveOnce(store, request, now), approveOnce(store, request, now), approveOnce(store, request, now)];
    expect(made).toEqual([true, false, false]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(store.getState().attempt.phase).toBe("awaitingWallet");
    resolveRequest({ kind: "rejected" });
    await Promise.resolve();
    expect(store.getState().attempt.phase).toBe("reviewReady");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("returns to review after a structured rejection and allows one new request", async () => {
    const { store, now } = readyStore();
    const request = vi.fn(async (): Promise<ApprovalOutcome> => ({ kind: "rejected" }));
    approveOnce(store, request, now);
    await vi.waitFor(() => expect(store.getState().attempt.phase).toBe("reviewReady"));
    const attempt = store.getState().attempt;
    expect(attempt.phase === "reviewReady" && attempt.notice).toBe("rejected");
    expect(approveOnce(store, request, now)).toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("treats any other failure, or a thrown request, as an unknown outcome and never offers the preview again", async () => {
    for (const request of [vi.fn(async (): Promise<ApprovalOutcome> => ({ kind: "failed" })), vi.fn(async (): Promise<ApprovalOutcome> => { throw new Error("User rejected the request."); })]) {
      const { store, now } = readyStore();
      approveOnce(store, request, now);
      await vi.waitFor(() => expect(store.getState().attempt.phase).toBe("walletOutcomeUnknown"));
      expect(approveOnce(store, request, now)).toBe(false);
      expect(request).toHaveBeenCalledTimes(1);
    }
  });

  it("never asks the wallet for an expired preview", () => {
    const fixture = PURCHASE_FIXTURES.reviewReady;
    const preview = fixture.state.attempt.phase === "reviewReady" ? fixture.state.attempt.preview : null;
    const store = createPurchaseStore(fixture.state);
    const request = vi.fn(async (): Promise<ApprovalOutcome> => ({ kind: "rejected" }));
    expect(approveOnce(store, request, () => preview!.expiresAt)).toBe(false);
    expect(request).not.toHaveBeenCalled();
    expect(store.getState().attempt.phase).toBe("previewExpired");
  });

  it("tracks a returned signature", async () => {
    const { store, now } = readyStore();
    approveOnce(store, async () => ({ kind: "signed", signature: "5".repeat(88) }), now);
    await vi.waitFor(() => expect(store.getState().attempt.phase).toBe("submitted"));
  });
});

describe("purchase placement on the Dossier", () => {
  /** The Dossier as the route renders it: the fixed-route token gets the prerendered frame from loader data. */
  function page(ticker: string, locale: PublicWebLocale): string {
    const view = createDossierView(ticker);
    return renderToStaticMarkup(<DossierPage view={view} locale={locale} purchaseFrame={view.purchase === "fixed_route" ? createPurchaseFrame(locale) : null} />);
  }

  /** From the panel section through the end of the notice: the part the frame and the island share. */
  function panelTop(html: string): string {
    const start = html.indexOf('<section id="purchase"');
    const notice = html.indexOf("data-purchase-notice", start);
    return html.slice(start, html.indexOf("</ul></div>", notice)).replace(/ data-phase="[^"]*"/, "");
  }

  it("prerenders the frame (heading, route line, four sentences) first, a jump link under the title, and the registry before the purchase area", () => {
    for (const locale of PUBLIC_WEB_LOCALES) {
      const html = page("NVDA", locale);
      expect(html, locale).toMatch(/<div id="purchase-slot"[^>]* data-purchase-slot="fixed_route" data-purchase-mint="[1-9A-HJ-NP-Za-km-z]{32,44}"><section id="purchase"[^>]* data-phase="frame"/);
      const frame = html.slice(html.indexOf('id="purchase-slot"'), html.indexOf("</aside>"));
      const notice = PURCHASE_MESSAGES[locale].notice;
      for (const sentence of [PURCHASE_MESSAGES[locale].heading, notice.heading, notice.usPersons, notice.noEligibilityCheck, notice.noAvailabilityGuarantee, notice.notAdvice]) expect(text(frame), locale).toContain(sentence);
      expect(frame, locale).toContain(`lang="${locale}"`);
      expect(frame, locale).toContain("data-purchase-route");
      // Only the route line's Copy is a control; wallet and amount controls come with the island.
      expect(frame.match(/<button/g)?.length, locale).toBe(1);
      expect(frame, locale).not.toContain("data-purchase-wallet");
      const jump = html.indexOf("data-purchase-jump");
      const title = html.indexOf("<h1");
      const registry = html.indexOf('id="registry-record-heading"');
      const slot = html.indexOf('id="purchase-slot"');
      expect(jump, locale).toBeGreaterThan(title);
      expect(registry, locale).toBeGreaterThan(jump);
      expect(slot, locale).toBeGreaterThan(registry);
      expect(html, locale).toContain('href="#purchase-slot"');
      expect(text(html), locale).toContain(PURCHASE_MESSAGES[locale].heading);
      expect(html, locale).toContain("data-sticky-aside");
    }
  });

  /** The prerendered frame keeps "Copy address" in place but hidden until hydration; this is the frame once hydrated. */
  function hydratedFrame(html: string): string {
    return html.replace(/<span aria-hidden="true" data-purchase-copy-pending="" class="invisible">(<span class="inline-flex">[\s\S]*?<\/button><span class="sr-only"[^>]*><\/span><\/span>)<\/span>/, "$1");
  }

  /** The wallet step's reserved area: its invisible no-wallet copy, whose height every pre-connection state keeps. */
  function reserveGhost(html: string): string | undefined {
    return /<div data-purchase-reserve=""[^>]*><div aria-hidden="true" class="invisible[^"]*">[\s\S]*?<\/div>/.exec(html)?.[0];
  }

  it("renders the frame exactly like the island's first state, so the island replaces it without moving it", () => {
    for (const locale of PUBLIC_WEB_LOCALES) {
      const frame = page("NVDA", locale);
      expect(hydratedFrame(frame), locale).not.toBe(frame);
      expect(panelTop(hydratedFrame(frame)), locale).toBe(panelTop(render("walletDetecting", locale)));
    }
  });

  it("reserves the no-wallet height in the frame and in every state before a wallet is connected", () => {
    for (const locale of PUBLIC_WEB_LOCALES) {
      const ghost = reserveGhost(page("NVDA", locale));
      const wallet = PURCHASE_MESSAGES[locale].wallet;
      expect(ghost, locale).toBeDefined();
      expect(text(ghost!).replace(/\s+/g, ""), locale).toBe(`${wallet.notDetectedTitle}${wallet.notDetectedBody}`.replace(/\s+/g, ""));
      for (const fixture of ["walletDetecting", "walletNotDetected", "walletDisconnected"] as const) expect(reserveGhost(render(fixture, locale)), `${locale} ${fixture}`).toBe(ghost);
      expect(reserveGhost(render("editing", locale)), locale).toBeUndefined();
    }
  });

  it("says without JavaScript that buying needs JavaScript and a wallet, and hides Copy until hydration", () => {
    for (const locale of PUBLIC_WEB_LOCALES) {
      const frame = page("NVDA", locale);
      expect(frame, locale).toContain(`<noscript><p data-purchase-noscript="" class="text-sm text-muted-foreground">${PURCHASE_MESSAGES[locale].noScript}</p></noscript>`);
      expect(frame, locale).toMatch(/<span aria-hidden="true" data-purchase-copy-pending="" class="invisible"><span class="inline-flex"><button/);
      expect(render("walletDetecting", locale), locale).not.toContain("data-purchase-copy-pending");
      expect(render("walletDetecting", locale), locale).not.toContain("<noscript");
    }
  });

  it("gives other tokens the quiet unavailable notice in the same slot and no jump link", () => {
    const html = page("AMZN", "en");
    expect(html).toContain('data-purchase-slot="unsupported"');
    expect(html).not.toContain("data-purchase-jump");
    expect(text(html)).toContain("Purchase not available for AMZNx");
    const slot = html.slice(html.indexOf('id="purchase-slot"'));
    expect(slot.slice(0, slot.indexOf("</aside>"))).not.toMatch(/<a |<button/);
  });
});
