import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createRef } from "react";
import { resolveTicker, xstocks } from "@benten/registry";

import { PurchasePanelView, type PanelHandlers, type PanelRefs } from "@/components/purchase-panel";
import { PurchaseUnavailable } from "@/components/purchase-unavailable";
import { LOCALES, type Locale } from "@/lib/i18n/config";
import { MESSAGES, messagesFor } from "@/lib/i18n/messages";
import { PURCHASE_FIXTURES, type PurchaseFixtureName } from "@benten/purchase/fixtures";
import { isPurchasableMint, NVDAX_MINT } from "@benten/purchase/route";

const HANDLERS: PanelHandlers = {
  onConnect: () => undefined, onDisconnect: () => undefined, onAmountChange: () => undefined, onAmountBlur: () => undefined,
  onPreview: () => undefined, onApprove: () => undefined, onCheckAgain: () => undefined, onStartNew: () => undefined,
};

function refs(): PanelRefs {
  return { previewHeading: createRef(), errorTitle: createRef(), resultHeading: createRef(), amountInput: createRef() };
}

function render(name: PurchaseFixtureName, locale: Locale): string {
  const fixture = PURCHASE_FIXTURES[name];
  return renderToStaticMarkup(<PurchasePanelView state={fixture.state} now={fixture.now} locale={locale} handlers={HANDLERS} refs={refs()} announcement="" />);
}

function text(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ");
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

const NAMES = Object.keys(PURCHASE_FIXTURES) as PurchaseFixtureName[];
/** Advice, ranking and "quote/NAV" vocabulary (non-English terms as escapes, so this file stays ASCII) that must never appear in purchase copy (design contract section 1). */
const FORBIDDEN: Record<Locale, RegExp> = {
  en: /\b(quote|quotes|quoted|NAV|best|recommend\w*|popular|advisable)\b|1 NVDAx =/i,
  ja: /\u898b\u7a4d|\u6c17\u914d|\u57fa\u6e96\u4fa1\u984d|\u63a8\u5968|\u304a\u3059\u3059\u3081|\u304a\u52e7\u3081|\u6700\u9069|\u6700\u826f|\u4eba\u6c17|NAV/,
  ko: /\uacac\uc801|\uc2dc\uc138|\ud638\uac00|\uc21c\uc790\uc0b0\uac00\uce58|\ucd94\ucc9c|\uad8c\uc7a5|\ucd5c\uc801|\ucd5c\uace0|\uc778\uae30|NAV/,
  "zh-Hans": /\u62a5\u4ef7|\u5831\u50f9|\u51c0\u503c|\u63a8\u8350|\u5efa\u8bae\u8d2d\u4e70|\u6700\u4f73|\u6700\u4f18|\u70ed\u95e8|NAV/,
  "zh-Hant": /\u5831\u50f9|\u62a5\u4ef7|\u6de8\u503c|\u63a8\u85a6|\u5efa\u8b70\u8cfc\u8cb7|\u6700\u4f73|\u6700\u512a|\u71b1\u9580|NAV/,
};

describe("purchase copy vocabulary", () => {
  it.each(LOCALES)("keeps quote, NAV, advice and ranking words out of the %s purchase namespace", (locale) => {
    for (const line of leafStrings(messagesFor(locale).purchase)) expect(line).not.toMatch(FORBIDDEN[locale]);
  });

  it("uses 'price' in English only for the standard price impact row", () => {
    const lines = leafStrings(MESSAGES.en.purchase).filter((line) => /price/i.test(line));
    expect(lines).toEqual(["Price impact"]);
  });

  it("no longer says wallet connection is outside the release, in any locale", () => {
    expect(MESSAGES.en.footer.walletUnavailable).toBe("Benten never signs or sends transactions. Purchases are approved and sent by your own wallet.");
    for (const locale of LOCALES) expect(messagesFor(locale).footer.walletUnavailable).not.toBe("");
  });
});

describe("purchase panel rendering (every fixture, every locale)", () => {
  it.each(LOCALES)("shows the four notice sentences in every state and no forbidden words (%s)", (locale) => {
    const notice = messagesFor(locale).purchase.notice;
    for (const name of NAMES) {
      const rendered = text(render(name, locale));
      for (const sentence of [notice.usPersons, notice.noEligibilityCheck, notice.noAvailabilityGuarantee, notice.notAdvice]) expect(rendered, name).toContain(sentence);
      expect(rendered, name).not.toMatch(FORBIDDEN[locale]);
    }
  });

  it("puts the notice right after the route line, before any wallet step", () => {
    for (const name of NAMES) {
      const html = render(name, "en");
      const route = html.indexOf("purchase-panel__route");
      const notice = html.indexOf("purchase-notice");
      expect(route, name).toBeGreaterThan(-1);
      expect(notice, name).toBeGreaterThan(route);
      for (const later of ["purchase-wallet", "purchase-field", "purchase-panel__stage", "purchase-actions"]) {
        const index = html.indexOf(later);
        if (index !== -1) expect(index, `${name}: ${later}`).toBeGreaterThan(notice);
      }
    }
  });

  it("has at most one filled primary button, and none while the transaction is being tracked", () => {
    for (const name of NAMES) {
      const primaries = (render(name, "en").match(/button--primary/g) ?? []).length;
      expect(primaries, name).toBeLessThanOrEqual(1);
    }
    for (const name of ["submitted", "confirmed", "finalized", "result", "failedOnChain", "dropped", "walletOutcomeUnknown", "routeCheck", "walletDisconnectedTwo"] as const) {
      expect(render(name, "en"), name).not.toContain("button--primary");
    }
    expect(render("result", "en")).toContain("button--outline");
  });

  it("shows raw integers beside every preview amount and the fixed slippage", () => {
    const rendered = text(render("reviewReady", "en"));
    for (const raw of ["raw 1000000", "raw 441982", "raw 437562"]) expect(rendered).toContain(raw);
    expect(rendered).toContain("1.00 USDC");
    expect(rendered).toContain("0.00442733 NVDAx");
    expect(rendered).toContain("1.00%");
    expect(render("reviewReady", "en")).toContain("&lt;0.01%");
    expect(rendered).toContain("Approve in wallet");
  });

  it("falls back to raw units when the multiplier could not be read", () => {
    const rendered = text(render("reviewReadyRawOnly", "en"));
    expect(rendered).toContain("441982 raw units");
    expect(rendered).toContain(MESSAGES.en.purchase.preview.multiplierUnavailable);
  });

  it("dims an expired preview without striking it through and disables approve", () => {
    const html = render("previewExpired", "en");
    expect(html).toContain("purchase-terms--expired");
    expect(html).not.toMatch(/<s>|<del|line-through/);
    expect(html).toMatch(/button--disabled[^>]*aria-disabled="true"|aria-disabled="true"[^>]*button--disabled/);
    expect(text(html)).toContain("This preview expired");
  });

  it("keeps an expired preview to its values and expiry time", () => {
    const rendered = text(render("previewExpired", "en"));
    const copy = MESSAGES.en.purchase.preview;
    expect(rendered).toContain("0.00442733 NVDAx");
    expect(rendered).not.toContain("raw 441982");
    expect(rendered).not.toContain(copy.minimumNote);
    expect(rendered).not.toContain(copy.networkFee);
    expect(rendered).toMatch(/Expired at \d{2}:\d{2}:\d{2}/);
    expect(text(render("reviewReady", "en"))).toContain("raw 441982");
  });

  it("names an expired preview as expired in every locale", () => {
    for (const locale of LOCALES) {
      const copy = messagesFor(locale).purchase.preview;
      expect(text(render("previewExpired", locale)), locale).toContain(copy.headingExpired);
      expect(text(render("reviewReady", locale)), locale).not.toContain(copy.headingExpired);
    }
  });

  it("marks only completed trail steps with a check", () => {
    const html = render("awaitingWallet", "en");
    expect(html.match(/purchase-trail__check/g)).toHaveLength(1);
    expect(render("result", "en").match(/purchase-trail__check/g)).toHaveLength(5);
  });

  it("shows the received figure from the measured result and the explorer link", () => {
    const html = render("result", "en");
    expect(text(html)).toContain("+0.00442733 NVDAx");
    expect(text(html)).toContain("raw +441982");
    expect(html).toContain("https://explorer.solana.com/tx/");
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("offers Check again with the full signature when tracking stopped", () => {
    const html = render("notFinalized", "en");
    expect(text(html)).toContain("Not finalized yet");
    expect(text(html)).toContain("Check again");
    expect(text(html)).toContain("Not seen yet");
  });

  it("uses an alert notice with an icon for every error state", () => {
    for (const name of ["notEnoughSol", "simulationFailed", "routeCheck", "relayBusy", "relayUnavailable", "previewExpired", "failedOnChain", "dropped", "notFinalized", "walletOutcomeUnknown"] as const) {
      const html = render(name, "en");
      expect(html, name).toContain('class="alert-notice" role="alert"');
      expect(html, name).toContain("alert-notice__icon");
    }
    expect(text(render("notEnoughSol", "en"))).toContain("network fee and the token account deposit");
  });

  it("offers no approval after an unknown wallet outcome and points to the wallet on Solana Explorer", () => {
    const fixture = PURCHASE_FIXTURES.walletOutcomeUnknown;
    const address = fixture.state.connection.kind === "connected" ? fixture.state.connection.address : "";
    for (const locale of LOCALES) {
      const copy = messagesFor(locale).purchase;
      const html = render("walletOutcomeUnknown", locale);
      expect(text(html), locale).not.toContain(copy.action.approve);
      expect(text(html), locale).not.toContain(copy.action.refresh);
      expect(text(html), locale).toContain(copy.error.walletUnknown.explorer);
      expect(html, locale).toContain(`https://explorer.solana.com/address/${address}`);
      expect(text(html), locale).toContain(copy.action.startNew);
    }
  });

  it("warns on a new preview that an earlier request may have been sent", () => {
    for (const locale of LOCALES) {
      const copy = messagesFor(locale).purchase;
      const html = render("reviewReadyAfterUnknown", locale);
      expect(text(html), locale).toContain(copy.error.earlierRequest.title);
      expect(text(html), locale).toContain(copy.action.approve);
      expect(text(render("reviewReady", locale)), locale).not.toContain(copy.error.earlierRequest.title);
    }
  });

  it("does not offer a retry after a route check failure", () => {
    const html = render("routeCheck", "en");
    expect(text(html)).not.toMatch(/Try again|Refresh preview/);
  });
});

describe("purchase slot on other stock pages", () => {
  it("offers purchase only for the exact pinned NVDAx mint", () => {
    const purchasable = xstocks.filter((entry) => isPurchasableMint(entry.mint));
    expect(purchasable.map((entry) => entry.ticker)).toEqual(["NVDA"]);
    expect(resolveTicker("NVDA")?.mint).toBe(NVDAX_MINT.toBase58());
    expect(isPurchasableMint(NVDAX_MINT.toBase58().toLowerCase())).toBe(false);
    expect(isPurchasableMint(` ${NVDAX_MINT.toBase58()}`)).toBe(false);
  });

  it("renders a quiet notice with no button and no link", () => {
    const html = renderToStaticMarkup(<PurchaseUnavailable symbol="TSLAx" locale="en" />);
    expect(text(html)).toContain("Purchase not available for TSLAx");
    expect(html).not.toMatch(/<a |<button/);
  });
});
