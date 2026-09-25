import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicApiClientError, requestPublicFacts } from "../app/lib/public-api-client.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("public facts browser client", () => {
  it("uses only a same-origin facts path and exposes a structured API error", async () => {
    const fetchStub = vi.fn(async () => new Response(JSON.stringify({
      schema_version: "2.0",
      data: { found: false, reason: "unknown_ticker" },
    }), { status: 404, headers: { "content-type": "application/json" } }));
    globalThis.fetch = fetchStub as typeof fetch;

    await expect(requestPublicFacts("/api/v2/fundamentals?ticker=UNKNOWN")).rejects.toMatchObject({
      name: PublicApiClientError.name,
      status: 404,
      payload: { code: "unknown_ticker" },
    });
    expect(fetchStub).toHaveBeenCalledWith("/api/v2/fundamentals?ticker=UNKNOWN", expect.objectContaining({ method: "GET" }));
  });

  it.each(["https://foreign.invalid/api/v2/fundamentals", "//foreign.invalid/api/v2/fundamentals", "/stock/NVDA", "/api/v2/fundamentals#fragment"])(
    "rejects a caller-selected or non-facts target: %s",
    async (path) => {
      await expect(requestPublicFacts(path)).rejects.toThrow("same-origin /api/ path");
    },
  );
});
