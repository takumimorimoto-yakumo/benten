import { describe, expect, it } from "vitest";
import { PRICES_PATH } from "@benten/pricing/config";
import { classifyWebIngress } from "../ingress/classify.ts";

const paths = new Set<string>(["/"]);
const FEED = "b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593";

describe("public Web ingress: Pyth reference prices", () => {
  it("routes only the exact prices path to the prices decision and keeps the raw query", () => {
    expect(PRICES_PATH).toBe("/api/prices");
    expect(classifyWebIngress(`/api/prices?feed=${FEED}`, { staticPaths: paths })).toEqual({
      kind: "proxy_prices", pathname: "/api/prices", search: `?feed=${FEED}`,
    });
    expect(classifyWebIngress("/api/prices", { staticPaths: paths })).toEqual({ kind: "proxy_prices", pathname: "/api/prices", search: "" });
  });

  it("leaves near misses to the facts decision, where they are the unknown-path 404", () => {
    for (const nearMiss of ["/api/prices/extra", "/api/Prices", "/api/pricesx", "/api/price"]) {
      expect(classifyWebIngress(nearMiss, { staticPaths: paths }).kind, nearMiss).toBe("proxy_facts");
    }
    expect(classifyWebIngress("/api/prices/", { staticPaths: paths })).toEqual({ kind: "html_not_found", status: 404 });
    expect(classifyWebIngress("/api/pri%63es", { staticPaths: paths }).kind).toBe("proxy_facts");
  });
});
