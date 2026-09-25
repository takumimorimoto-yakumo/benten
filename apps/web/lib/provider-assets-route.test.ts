import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as providerAssetsRoute } from "@/app/api/v2/provider-assets/route";
import { parseProviderQuery, providerResultStatus, getProviderAssetsV2 } from "@/lib/public-v2";

const BASE = "https://benten.test/api/v2/provider-assets";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("v2 provider-assets query contract", () => {
  it.each([
    ["unsupported parameter", "provider=tessera&debug=true"],
    ["repeated selector", "provider=tessera&provider=prestocks"],
    ["empty selector", "provider_asset_id="],
    ["over-long selector", `provider_asset_id=${"A".repeat(129)}`],
    ["over-long mint selector", `mint_or_contract=${"1".repeat(129)}`],
  ])("rejects %s before the artifact lookup", (_name, query) => {
    expect(parseProviderQuery(new URLSearchParams(query))).toEqual({ ok: false, reason: "invalid_input" });
  });

  it("accepts a selector at the 128-character ceiling", () => {
    const value = "A".repeat(128);
    expect(parseProviderQuery(new URLSearchParams(`provider_asset_id=${value}`)))
      .toEqual({ ok: true, selector: { provider_asset_id: value } });
  });

  it("accepts the three supported selectors", () => {
    expect(parseProviderQuery(new URLSearchParams("provider=tessera&provider_asset_id=tOpenAI")))
      .toEqual({ ok: true, selector: { provider: "tessera", provider_asset_id: "tOpenAI" } });
    expect(parseProviderQuery(new URLSearchParams("")))
      .toEqual({ ok: true, selector: {} });
  });

  it("maps provider read states onto the shared v2 status codes", () => {
    expect(providerResultStatus(getProviderAssetsV2({}))).toBe(200);
    expect(providerResultStatus(getProviderAssetsV2({ provider_asset_id: "NOPE" }))).toBe(404);
    expect(providerResultStatus(getProviderAssetsV2({ provider: "xstocks" }))).toBe(400);
  });
});

describe("v2 provider-assets route", () => {
  it("lists every provider asset without a network call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await providerAssetsRoute(new Request(BASE));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      schema_version: "provider-assets.v1",
      not_quote: true,
      disclaimer: "Factual data only. Not investment advice, a recommendation, or a valuation.",
    });
    expect(body.artifact.revision).toMatch(/^[a-f0-9]{64}$/);
    expect(body.data.items).toHaveLength(11);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("selects one entry by provider asset id and by mint", async () => {
    const byId = await providerAssetsRoute(new Request(`${BASE}?provider=tessera&provider_asset_id=tOpenAI`));
    expect(byId.status).toBe(200);
    const body = await byId.json();
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0]).toMatchObject({
      provider: "tessera",
      underlying_kind: "openai",
      evidence_state: "candidate_unverified",
      references: [],
      not_quote: true,
      not_authorization: true,
    });

    const byMint = await providerAssetsRoute(
      new Request(`${BASE}?mint_or_contract=${body.data.items[0].mint_or_contract}`),
    );
    expect(byMint.status).toBe(200);
    await expect(byMint.json()).resolves.toMatchObject({ data: { items: [body.data.items[0]] } });
  });

  it("filters by provider without promoting a claim", async () => {
    const response = await providerAssetsRoute(new Request(`${BASE}?provider=prestocks`));
    const body = await response.json();
    expect(body.data.items).toHaveLength(8);
    for (const item of body.data.items) {
      expect(item.rights).toMatchObject({ status: "provider_claim_only", equity_ownership: "unknown" });
      expect(item.references.every((reference: { currency: null }) => reference.currency === null)).toBe(true);
    }
  });

  it("returns 404 asset_not_found for an unknown identifier", async () => {
    const response = await providerAssetsRoute(new Request(`${BASE}?provider_asset_id=NOT_A_PROVIDER_ASSET`));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      data: { found: false, reason: "asset_not_found", requested_identifier: "NOT_A_PROVIDER_ASSET", retryable: false },
    });
  });

  it("returns 400 for an unknown or repeated query key", async () => {
    const unknownKey = await providerAssetsRoute(new Request(`${BASE}?ticker=NVDA`));
    const repeated = await providerAssetsRoute(new Request(`${BASE}?provider=tessera&provider=tessera`));
    const unknownProvider = await providerAssetsRoute(new Request(`${BASE}?provider=xstocks`));

    expect(unknownKey.status).toBe(400);
    await expect(unknownKey.json()).resolves.toMatchObject({ data: { reason: "invalid_input" } });
    expect(repeated.status).toBe(400);
    expect(unknownProvider.status).toBe(400);
    await expect(unknownProvider.json()).resolves.toMatchObject({
      data: { found: false, reason: "invalid_input", retryable: false },
    });
  });

  it("exposes GET only", async () => {
    const route = await import("@/app/api/v2/provider-assets/route");
    expect(Object.keys(route).sort()).toEqual(["GET", "runtime"]);
  });
});
