import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HomePage } from "@/components/home-page";
import { listCompanies } from "@benten/registry";
import { LOCALES, localizedPath } from "@/lib/i18n/config";
import { messagesFor } from "@/lib/i18n/messages";

const html = renderToStaticMarkup(createElement(HomePage, { locale: "en" as const }));
const [xstocksRegion, providerRegion] = (() => {
  const marker = html.indexOf('id="provider-references"');
  return [html.slice(0, marker), html.slice(marker)];
})();

describe("home other-provider references section", () => {
  it("renders a separate section below the xStocks registry", () => {
    expect(html).toContain('id="provider-references"');
    expect(html.indexOf('id="registry"')).toBeLessThan(html.indexOf('id="provider-references"'));
    expect(providerRegion).toContain(messagesFor("en").providers.home.heading);
    expect(providerRegion).toContain(messagesFor("en").providers.home.note);
  });

  it("lists all eleven provider instruments in its own table", () => {
    expect([...providerRegion.matchAll(/<\/tr>/g)]).toHaveLength(12);
    expect([...providerRegion.matchAll(/href="\/provider\//g)]).toHaveLength(11);
  });

  it("keeps every provider row out of the xStocks table", () => {
    expect(xstocksRegion).not.toContain("/provider/");
    expect(xstocksRegion).not.toContain("PreStocks");
    expect(xstocksRegion).not.toContain("Tessera");
    expect(providerRegion).not.toContain("badge--covered");
    expect(providerRegion).not.toContain("badge--excluded");
  });

  it("labels the reference column and the observation date without calling either a price", () => {
    expect(providerRegion).toContain("provider reference");
    expect(providerRegion).toContain("No reference available");
    expect(providerRegion).toContain("fetched ");
    // The fetch date must never be read as the value's as-of.
    expect(providerRegion).toContain(messagesFor("en").providers.home.referenceUnknowns);
    expect(providerRegion).not.toMatch(/\bprice\b/i);
  });

  it("links the home provider section to every company page, localized", () => {
    for (const locale of LOCALES) {
      const html = renderToStaticMarkup(createElement(HomePage, { locale }));
      const region = html.slice(html.indexOf('id="provider-references"'));
      expect(region).toContain(messagesFor(locale).providers.home.byCompany);
      for (const { slug } of listCompanies()) expect(region).toContain(`href="${localizedPath(locale, `/company/${slug}`)}"`);
      // One link per company in the index line plus one per provider row.
      expect([...region.matchAll(new RegExp(`href="${localizedPath(locale, "/company/openai")}"`, "g"))]).toHaveLength(3);
    }
  });
});
