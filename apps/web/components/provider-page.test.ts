import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { findProviderAsset } from "@benten/registry";

import { ProviderPage } from "@/components/provider-page";
import { LOCALES, type Locale } from "@/lib/i18n/config";
import { messagesFor } from "@/lib/i18n/messages";

function render(provider: string, id: string, locale: Locale = "en") {
  return renderToStaticMarkup(createElement(ProviderPage, { provider, id, locale }));
}
function headings(html: string): string[] {
  return [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/g)].map((match) => match[1]);
}
const ACQUISITION_WORDS = ["Buy", "Swap", "Connect", "Sell", "Trade"];

describe("provider reference page", () => {
  it("renders the PreStocks entry in the fixed section order", () => {
    const html = render("prestocks", "ANDURIL");
    const copy = messagesFor("en").providers.page;
    expect(headings(html)).toEqual([
      copy.identityHeading, copy.companyHeading, copy.rightsHeading, copy.referencesHeading,
      copy.supplyHeading, copy.unknownsHeading,
    ]);
    expect(html).toContain("PresTj4Yc2bAR197Er7wz4UUKSfqt6FryBEdAriBoQB");
    expect(html).toContain("151.87236312");
    expect(html).toContain("132,471,475,478");
    expect(html).toContain("Not an xStocks token.");
    expect(html).toContain("Provider-reported reference values. Not an executable quote, NAV, valuation, or price target.");
    expect(html).toContain("Benten has no SEC filing coverage for this private company.");
    expect(html).toContain("https://www.prestocks.com/anduril");
  });

  it("reports unknown rights for PreStocks and never asserts ownership", () => {
    const html = render("prestocks", "ANDURIL");
    expect(html).toContain("Provider claim only");
    expect(html).not.toMatch(/>yes</);
    for (const word of ACQUISITION_WORDS) expect(html).not.toContain(word);
  });

  it("renders the Tessera entry with its underlying kind and no reference value", () => {
    const html = render("tessera", "tOpenAI");
    const copy = messagesFor("en").providers.page;
    expect(headings(html)).toEqual([
      copy.identityHeading, copy.companyHeading, copy.rightsHeading, copy.referencesHeading,
      copy.supplyHeading, copy.unknownsHeading,
    ]);
    expect(html).toContain("oPAiAikWTaFj9RYoRFD35ccfwhnMcB3ThgBZRHSkjTZ");
    expect(html).toContain("OpenAI");
    expect(html).toContain("This provider publishes no reference value for this instrument.");
    // No reference table is rendered at all, so its currency column cannot label supply.
    expect(html).not.toContain(copy.valueColumn);
    expect(html).not.toContain(copy.currencyColumn);
    expect(html).toContain(copy.supplyHeading);
    expect(html).toContain("684.758613947");
    expect(html).toContain("Loan participation token");
    expect(html).toContain("https://terms.tessera.pe");
    expect(html).toContain("Not an xStocks token.");
    for (const word of ACQUISITION_WORDS) expect(html).not.toContain(word);
  });

  it("shows every artifact unknown with the surfaces it blocks", () => {
    const entry = findProviderAsset("tessera", "tOpenAI");
    const copy = messagesFor("en").providers;
    const html = render("tessera", "tOpenAI");
    for (const unknown of entry!.unknowns) expect(html).toContain(copy.unknownCodes[unknown.code]);
    expect(html).toContain("blocks promotion to verified: display, comparison");
    expect(html).toContain("blocks promotion to verified: comparison, release");
  });

  it("renders in every supported locale", () => {
    for (const locale of LOCALES) {
      const html = render("prestocks", "OPENAI", locale);
      expect(html).toContain(findProviderAsset("prestocks", "OPENAI")!.mint_or_contract);
      expect(html).toContain(messagesFor(locale).providers.page.referencesNote);
      expect(html).toContain(messagesFor(locale).providers.page.notXStock);
      for (const word of ACQUISITION_WORDS) expect(html).not.toContain(word);
    }
  });

  it("falls through to notFound for an unknown provider or identifier", () => {
    expect(() => render("prestocks", "NOPE")).toThrow();
    expect(() => render("xstocks", "NVDA")).toThrow();
    expect(() => render("prestocks", "anduril")).toThrow();
    expect(() => render("tessera", "topenai")).toThrow();
  });
});
