import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

describe("locale middleware", () => {
  it("derives locale from the path instead of accepting a spoofed header", () => {
    const response = middleware(new NextRequest("http://localhost/ko/stock/NVDA", { headers: { "x-benten-locale": "ja" } }));
    expect(response.headers.get("x-middleware-request-x-benten-locale")).toBe("ko");
    expect(response.headers.get("x-middleware-request-x-benten-pathname")).toBe("/ko/stock/NVDA");
  });
  it("sets English for unsupported or case-incorrect locale paths", () => {
    const response = middleware(new NextRequest("http://localhost/ZH-Hans", { headers: { "x-benten-locale": "zh-Hans" } }));
    expect(response.headers.get("x-middleware-request-x-benten-locale")).toBe("en");
  });
});

  it("does not exclude a longer dev path from pathname sanitization", () => {
    const response = middleware(new NextRequest("http://localhost/dev/ui-catalogue", { headers: { "x-benten-locale": "zh-Hant" } }));
    expect(response.headers.get("x-middleware-request-x-benten-locale")).toBe("en");
    expect(response.headers.get("x-middleware-request-x-benten-pathname")).toBe("/dev/ui-catalogue");
  });

  it("sanitizes root 404 and API-path requests too", () => {
    for (const pathname of ["/api/nonexistent", "/_next/nonexistent"]) {
      const response = middleware(new NextRequest(`http://localhost${pathname}`, { headers: { "x-benten-locale": "zh-Hant", "x-benten-pathname": "/zh-Hant/stock/NVDA" } }));
      expect(response.headers.get("x-middleware-request-x-benten-locale")).toBe("en");
      expect(response.headers.get("x-middleware-request-x-benten-pathname")).toBe(pathname);
    }
  });

  it("rewrites invalid public routes to a localized SSR 404 page", () => {
    const response = middleware(new NextRequest("http://localhost/ja/stock/THIS_IS_UNKNOWN"));
    expect(response.status).toBe(404);
    expect(response.headers.get("x-middleware-rewrite")).toContain("/benten-not-found");
    expect(response.headers.get("x-middleware-request-x-benten-locale")).toBe("ja");
  });

  it("keeps the English URL canonical and accepts only decoded allowlisted tickers", () => {
    expect(middleware(new NextRequest("http://localhost/en")).status).toBe(404);
    expect(middleware(new NextRequest("http://localhost/en/stock/NVDA")).status).toBe(404);
    expect(middleware(new NextRequest("http://localhost/ja/stock/%4eVDA")).status).toBe(200);
    expect(middleware(new NextRequest("http://localhost/stock/NVDA%20")).status).toBe(404);
  });

  it("renders a 404 for the internal target without trusting a caller marker", () => {
    const response = middleware(new NextRequest("http://localhost/benten-not-found", { headers: { "x-benten-not-found-internal": "1" } }));
    expect(response.status).toBe(404);
    expect(response.headers.get("x-middleware-request-x-benten-not-found-internal")).toBe("1");
  });

  it("accepts only exact provider asset routes", () => {
    expect(middleware(new NextRequest("http://localhost/provider/prestocks/ANDURIL")).status).toBe(200);
    expect(middleware(new NextRequest("http://localhost/ja/provider/tessera/tOpenAI")).status).toBe(200);
    expect(middleware(new NextRequest("http://localhost/provider/prestocks/anduril")).status).toBe(404);
    expect(middleware(new NextRequest("http://localhost/provider/prestocks/NOPE")).status).toBe(404);
    expect(middleware(new NextRequest("http://localhost/provider/xstocks/NVDA")).status).toBe(404);
    expect(middleware(new NextRequest("http://localhost/provider/prestocks")).status).toBe(404);
    expect(middleware(new NextRequest("http://localhost/provider/prestocks/ANDURIL/extra")).status).toBe(404);
    expect(middleware(new NextRequest("http://localhost/en/provider/prestocks/ANDURIL")).status).toBe(404);
  });
