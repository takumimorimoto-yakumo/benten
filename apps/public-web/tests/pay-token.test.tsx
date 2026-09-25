import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PURCHASE_FIXTURES, type PurchaseFixtureName } from "../../../packages/purchase/src/fixtures.ts";
import { PurchasePanelView, type PanelHandlers, type PanelRefs } from "../app/features/purchase-island/purchase-panel-view.tsx";
import { PUBLIC_WEB_LOCALES, type PublicWebLocale } from "../app/i18n/locales.ts";
import { purchaseMessagesFor } from "../app/i18n/purchase-messages.ts";

const HANDLERS: PanelHandlers = {
  onConnect: () => undefined, onDisconnect: () => undefined, onAmountChange: () => undefined, onAmountBlur: () => undefined,
  onPreview: () => undefined, onApprove: () => undefined, onCheckAgain: () => undefined, onStartNew: () => undefined, onPayTokenChange: () => undefined,
};

function refs(): PanelRefs {
  return { previewHeading: createRef(), errorTitle: createRef(), resultHeading: createRef(), amountInput: createRef() };
}

function render(name: PurchaseFixtureName, locale: PublicWebLocale = "en"): string {
  const fixture = PURCHASE_FIXTURES[name];
  return renderToStaticMarkup(<PurchasePanelView state={fixture.state} now={fixture.now} locale={locale} handlers={HANDLERS} refs={refs()} announcement="" />);
}

function text(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ");
}

describe("pay token choice in the purchase panel", () => {
  it("offers USDC, SOL and SKR in step 1 and marks the current one pressed", () => {
    const html = render("editing");
    expect(html).toContain('data-purchase-pay-token="USDC"');
    expect((html.match(/aria-pressed="true"/g) ?? []).length).toBe(1);
    expect((html.match(/aria-pressed="false"/g) ?? []).length).toBe(2);
    expect(render("payWithSol")).toContain('data-purchase-pay-token="SOL"');
  });

  it("labels the SOL field in SOL, shows the balance in SOL and the fee reserve", () => {
    const body = text(render("payWithSol"));
    expect(body).toContain("SOL to pay");
    expect(body).toContain("Balance 0.25 SOL");
    expect(body).toContain("0.01 SOL stays in your wallet");
    expect(body).toContain("50000000 raw units. SOL uses 9 decimals.");
  });

  it("measures over-balance against the spendable SOL (balance minus the reserve)", () => {
    expect(text(render("payWithSolOverBalance"))).toContain("more than the 0.24 SOL you can use");
  });

  it("shows the two-leg route, the first pool quote as the USD basis of the limit, and the USDC into the NVDAx pool", () => {
    const body = text(render("payWithSolReviewReady"));
    expect(body).toContain("0.05 SOL = 5.859129 USDC");
    expect(body).toContain("Limit check: the first pool expects to return 5.859129 USDC for this amount. The limit is 10.00 USDC per transaction.");
    expect(body).toContain("5.800537 USDC");
    expect(body).toContain("Any USDC above it stays in your wallet.");
    expect(body).toContain("raw 2549654");
    expect(text(render("payWithSkrReviewReady"))).toContain("200.00 SKR = 4.075567 USDC");
  });

  it("shows the first pool's fee on its row and labels the fee and price impact rows as the NVDAx pool's", () => {
    const html = render("payWithSolReviewReady");
    const firstLegRow = text(html.match(/data-row="firstLeg"[\s\S]*?data-row="usdcIn"/)?.[0] ?? "");
    expect(firstLegRow).toContain("Pool fee 0.000020273 SOL");
    expect(text(render("payWithSkrReviewReady"))).toContain("Pool fee 0.544498 SKR");
    const body = text(html);
    expect(body).toContain("NVDAx pool fee");
    expect(body).toContain("NVDAx pool price impact");
    const single = text(render("reviewReady"));
    expect(single).toContain("Pool fee");
    expect(single).not.toContain("NVDAx pool fee");
  });

  it("notes on a two-leg preview that USDC and wrapped SOL accounts may also be created", () => {
    expect(text(render("payWithSolReviewReady"))).toContain("NVDAx, USDC, and wrapped SOL when paying with SOL");
    expect(text(render("reviewReady"))).not.toContain("wrapped SOL");
  });

  it("explains a quote above the limit with the quoted USDC", () => {
    const body = text(render("payWithSolOverLimit"));
    expect(body).toContain("Above the per-transaction limit");
    expect(body).toContain("12.226665 USDC");
  });

  it("shows SOL paid (with its note) and the USDC left in the wallet on the result", () => {
    const body = text(render("payWithSolResult"));
    expect(body).toContain("SOL paid");
    expect(body).toContain("0.052045 SOL");
    expect(body).toContain("USDC left in your wallet");
    expect(body).toContain("0.058592 USDC");
    expect(body).toContain("includes the network fee");
  });

  it("renders every pay-token fixture in every locale with its own copy", () => {
    for (const locale of PUBLIC_WEB_LOCALES) {
      const copy = purchaseMessagesFor(locale);
      expect(text(render("payWithSol", locale))).toContain(copy.pay.label);
      const review = text(render("payWithSolReviewReady", locale));
      expect(review).toContain(copy.pay.firstLeg);
      expect(review).toContain(copy.pay.nvdaxPoolFee);
      expect(review).toContain(copy.pay.nvdaxPoolImpact);
      expect(review).toContain(copy.pay.accountCreation);
    }
  });
});
