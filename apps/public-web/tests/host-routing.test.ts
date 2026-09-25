import { describe, expect, it } from "vitest";
import { publishedCompanies } from "../app/lib/company.server.ts";
import { listPublicAssets } from "../../../packages/registry/src/public-read-model.ts";
import { listProviderAssets } from "../../../packages/registry/src/index.ts";
import { buildPublicWebPrerenderPaths, buildReferencePrerenderPaths } from "../app/lib/prerender-paths.server.ts";
import { classifyWebIngress } from "../ingress/classify.ts";

function staticPaths() {
  const catalog = listPublicAssets({});
  if (!catalog.found) throw new Error("the reviewed public catalog must be available at build time");
  return new Set(buildPublicWebPrerenderPaths(catalog));
}

describe("public Web ingress classifier", () => {
  it("uses generated static paths before alias handling", () => {
    const paths = staticPaths();
    paths.add("/stock/NVDA.data");

    expect(classifyWebIngress("/stock/NVDA", { staticPaths: paths })).toEqual({
      kind: "static", pathname: "/stock/NVDA", search: "",
    });
    expect(classifyWebIngress("/stock/ASML", { staticPaths: paths })).toEqual({
      kind: "static", pathname: "/stock/ASML", search: "",
    });
    expect(classifyWebIngress("/stock/NVDA.data", { staticPaths: paths })).toEqual({
      kind: "static", pathname: "/stock/NVDA.data", search: "",
    });
    expect(classifyWebIngress("/stock/UNKNOWN.data", { staticPaths: paths })).toEqual({
      kind: "html_not_found", status: 404,
    });
  });

  it("routes API prefixes before static fallback and preserves the complete URL", () => {
    const paths = staticPaths();

    expect(classifyWebIngress("/api/acquisition/quotes?raw=100", { staticPaths: paths })).toEqual({
      kind: "proxy_acquisition", pathname: "/api/acquisition/quotes", search: "?raw=100",
    });
    expect(classifyWebIngress("/api/v2/financials?ticker=NVDA", { staticPaths: paths })).toEqual({
      kind: "proxy_facts", pathname: "/api/v2/financials", search: "?ticker=NVDA",
    });
  });

  it("routes only the exact Solana RPC relay path to the relay decision", () => {
    const paths = staticPaths();

    expect(classifyWebIngress("/api/solana-rpc", { staticPaths: paths })).toEqual({
      kind: "proxy_solana_rpc", pathname: "/api/solana-rpc", search: "",
    });
    expect(classifyWebIngress("/api/solana-rpc?cluster=x", { staticPaths: paths })).toEqual({
      kind: "proxy_solana_rpc", pathname: "/api/solana-rpc", search: "?cluster=x",
    });
    expect(classifyWebIngress("/api/solana-rpc/", { staticPaths: paths })).toEqual({ kind: "html_not_found", status: 404 });
    for (const nearMiss of ["/api/solana-rpc/extra", "/api/Solana-RPC", "/api/solana-rpcx"]) {
      expect(classifyWebIngress(nearMiss, { staticPaths: paths }).kind, nearMiss).toBe("proxy_facts");
    }
    expect(classifyWebIngress("/api/solana%2drpc", { staticPaths: paths })).toEqual({
      kind: "proxy_facts", pathname: "/api/solana%2drpc", search: "",
    });
  });

  it("redirects only a validated casing or percent-encoding alias to its exact dossier URL", () => {
    const paths = staticPaths();

    expect(classifyWebIngress("/stock/nvda?ref=catalog", { staticPaths: paths })).toEqual({
      kind: "canonical_redirect", status: 308, location: "/stock/NVDA?ref=catalog",
    });
    expect(classifyWebIngress("/ja/stock/%4eVDA", { staticPaths: paths })).toEqual({
      kind: "canonical_redirect", status: 308, location: "/ja/stock/NVDA",
    });
  });

  it.each([
    "/en",
    "/en/stock/NVDA",
    "/stock/UNKNOWN",
    "/stock/NVDA/",
    "/stock/%20NVDA",
    "/stock/NV%00DA",
    "/stock/NV%7fDA",
    "/stock/../stock/NVDA",
    "/stock/%2e%2e/stock/NVDA",
    "/stock/NV%2fDA",
    "/stock/%254eVDA",
    "/stock\\NVDA",
    "/ja/stock/NVDA%20",
    " /stock/NVDA",
    "/stock/NVDA ",
    "/stock/NVDA?ref=a b",
    "/stock/NVDA?ref=a%0ab",
    "/api/a%0ab",
    "//foreign.invalid/stock/NVDA",
    "https://foreign.invalid/stock/NVDA",
    "http://%",
  ])("returns an HTML 404 for unavailable or malformed public paths: %s", (path) => {
    expect(classifyWebIngress(path, { staticPaths: staticPaths() })).toEqual({
      kind: "html_not_found", status: 404,
    });
  });

  it("serves provider and company pages only at their exact paths: casing variants are 404, never redirects", () => {
    const paths = new Set([...staticPaths(), ...buildReferencePrerenderPaths(listProviderAssets({}), publishedCompanies())]);
    for (const path of ["/company/openai", "/ja/company/figure-ai", "/provider/prestocks/OPENAI", "/zh-Hant/provider/prestocks/KALSHI"]) {
      expect(classifyWebIngress(path, { staticPaths: paths })).toEqual({ kind: "static", pathname: path, search: "" });
    }
    for (const path of ["/company/OpenAI", "/company/OPENAI", "/company/figureai", "/company/openai/", "/en/company/openai", "/provider/prestocks/openai", "/provider/PreStocks/OPENAI", "/provider/other/OPENAI"]) {
      expect(classifyWebIngress(path, { staticPaths: paths }), path).toEqual({ kind: "html_not_found", status: 404 });
    }
  });
});
