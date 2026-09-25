import { describe, expect, it } from "vitest";
import { createStaticFoundationDocument } from "../app/lib/static-document.server.ts";

describe("static foundation document data", () => {
  it("contains only route identity for a canonical Home or dossier", () => {
    expect(createStaticFoundationDocument({ pathname: "/", route: "home" })).toEqual({
      kind: "static-foundation-v1", route: "home", locale: "en", canonicalPath: "/",
    });
    expect(createStaticFoundationDocument({
      pathname: "/ja/stock/NVDA", route: "dossier", locale: "ja", ticker: "NVDA",
    })).toEqual({
      kind: "static-foundation-v1", route: "dossier", locale: "ja", canonicalPath: "/ja/stock/NVDA", ticker: "NVDA",
    });
  });

  it.each([
    { pathname: "/en", route: "home" as const, locale: "en" },
    { pathname: "/stock/nvda", route: "dossier" as const, ticker: "nvda" },
    { pathname: "/stock/UNKNOWN", route: "dossier" as const, ticker: "UNKNOWN" },
    { pathname: "/stock/NVDA", route: "dossier" as const },
    { pathname: "/fr", route: "home" as const, locale: "fr" },
  ])("fails closed for a noncanonical public document: %#", (input) => {
    expect(() => createStaticFoundationDocument(input)).toThrow();
  });
});
