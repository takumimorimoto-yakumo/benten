import { describe, expect, it } from "vitest";
import { listPublicAssets } from "../../../packages/registry/src/public-read-model.ts";
import {
  buildPublicWebPrerenderPaths,
  PUBLIC_WEB_LOCALES,
} from "../app/lib/prerender-paths.server.ts";

function catalog() {
  const result = listPublicAssets({});
  if (!result.found) throw new Error("the reviewed public catalog must be available at build time");
  return result;
}

describe("public Web prerender paths", () => {
  it("derives every locale Home and exact dossier path from the public registry", () => {
    const source = catalog();
    const paths = buildPublicWebPrerenderPaths(source);

    expect(paths).toHaveLength(PUBLIC_WEB_LOCALES.length * (source.items.length + 1));
    expect(paths).toHaveLength(765);
    for (const withheld of ["SPCX", "VCX"]) expect(paths.some((path) => path.endsWith(`/stock/${withheld}`))).toBe(false);
    expect(new Set(paths)).toHaveLength(paths.length);
    expect(paths).toContain("/");
    expect(paths).toContain("/ja");
    expect(paths).toContain("/stock/NVDA");
    expect(paths).toContain("/stock/ASML");
    expect(paths).toContain("/zh-Hant/stock/BRK.B");
    expect(paths).not.toContain("/en");
    expect(paths).not.toContain("/en/stock/NVDA");
    expect(Object.hasOwn(source.items[0], "verified_facts")).toBe(false);
    expect(Object.hasOwn(source.items[0], "legacy_snapshot")).toBe(false);
  });

  it("fails the build boundary when the catalog is not a successful public identity result", () => {
    expect(() => buildPublicWebPrerenderPaths({ found: false, items: [] })).toThrow("public catalog");
  });

  it("fails closed on a duplicate or noncanonical ticker instead of emitting an ambiguous URL", () => {
    expect(() => buildPublicWebPrerenderPaths({
      found: true,
      items: [
        { identity: { ticker: "NVDA" } },
        { identity: { ticker: "NVDA" } },
      ],
    })).toThrow("duplicate");
    expect(() => buildPublicWebPrerenderPaths({
      found: true,
      items: [{ identity: { ticker: " nvda " } }],
    })).toThrow("canonical ticker");
  });
});
