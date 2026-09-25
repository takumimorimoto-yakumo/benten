import { describe, expect, it } from "vitest";
import { resolveTicker } from "./registry-lookup.js";
import { listPublicAssets, readPublicFinancials, readPublicFundamentals } from "./public-read-model.js";

const isValidMint = (mint: string): boolean => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint);

describe("shared public read model", () => {
  it("converges exact ticker and mint on the same verified public result", () => {
    const mint = resolveTicker("NVDA")!.mint;
    expect(readPublicFundamentals({ ticker: " nvda " }, { isValidMint }))
      .toEqual(readPublicFundamentals({ mint }, { isValidMint }));
  });

  it("keeps a legacy-only record distinct from source-verified facts", () => {
    expect(readPublicFundamentals({ ticker: "TSM" }, { isValidMint })).toMatchObject({
      found: true,
      identity: { ticker: "TSM", underlying_company: null },
      coverage: { source_status: "legacy_snapshot" },
      verified_facts: null,
      legacy_snapshot: { kind: "legacy_snapshot", currency: null, unit: null },
    });
  });

  it("separates no-data, ineligible, and unknown from malformed input", () => {
    expect(readPublicFundamentals({ ticker: "ASML" }, { isValidMint })).toMatchObject({
      found: false, reason: "no_data", identity: { ticker: "ASML" },
    });
    expect(readPublicFundamentals({ ticker: "SPY" }, { isValidMint })).toMatchObject({
      found: false, reason: "not_eligible", coverage: { exclusion_reason: "etf" },
    });
    expect(readPublicFundamentals({ mint: "11111111111111111111111111111111" }, { isValidMint }))
      .toMatchObject({ found: false, reason: "unknown_mint" });
    expect(readPublicFundamentals({ mint: "bad" }, { isValidMint }))
      .toMatchObject({ found: false, reason: "invalid_input" });
  });

  it.each([
    {},
    { ticker: "NVDA", mint: resolveTicker("NVDA")!.mint },
    { ticker: "NVDA", extra: true },
    { ticker: 12 },
    null,
  ])("rejects malformed fundamental selector %#", (input) => {
    expect(readPublicFundamentals(input, { isValidMint })).toMatchObject({
      found: false, reason: "invalid_input", identity: null, coverage: null,
    });
  });

  it("preserves financial selector and statement precedence", () => {
    expect(readPublicFinancials({ ticker: "NOPE", statement: "quarterly" }, { isValidMint }))
      .toMatchObject({ found: false, reason: "unknown_ticker" });
    expect(readPublicFinancials({ ticker: "SPY", statement: "quarterly" }, { isValidMint }))
      .toMatchObject({ found: false, reason: "not_eligible" });
    expect(readPublicFinancials({ ticker: "NVDA", statement: "quarterly" }, { isValidMint }))
      .toMatchObject({ found: false, reason: "invalid_statement" });
  });

  it("does not fabricate a missing statement", () => {
    expect(readPublicFinancials({ ticker: "SLMT", statement: "bs" }, { isValidMint }))
      .toMatchObject({
        found: true,
        statements: { bs: { availability: "no_data", verified_facts: null, legacy_snapshot: null } },
      });
  });

  it("returns a slim, deterministic allowlisted catalog", () => {
    const all = listPublicAssets({});
    expect(all).toMatchObject({ found: true });
    if (!all.found) throw new Error("catalog unexpectedly unavailable");
    expect(all.items).toHaveLength(152);
    expect(all.items[0]).toEqual({
      identity: expect.objectContaining({ mint: expect.any(String), ticker: expect.any(String) }),
      coverage: expect.objectContaining({ snapshot_status: expect.any(String) }),
    });
    expect("verified_facts" in all.items[0]).toBe(false);
    expect(listPublicAssets({ ticker: " NVDA " })).toMatchObject({
      found: true, items: [{ identity: { ticker: "NVDA" } }],
    });
    expect(listPublicAssets({ ticker: "NOPE" })).toEqual({ found: true, items: [] });
  });

  it("fails closed on unsupported catalog filters", () => {
    expect(listPublicAssets({ ticker: "NVDA", mint: resolveTicker("NVDA")!.mint }))
      .toMatchObject({ found: false, reason: "invalid_input" });
    expect(listPublicAssets({ covered_only: "yes" }))
      .toMatchObject({ found: false, reason: "invalid_input" });
    expect(listPublicAssets({ debug: true }))
      .toMatchObject({ found: false, reason: "invalid_input" });
    expect(listPublicAssets({ ticker: undefined }))
      .toMatchObject({ found: false, reason: "invalid_input" });
    expect(listPublicAssets({ exclusion_reason: null }))
      .toMatchObject({ found: false, reason: "invalid_input" });
  });
});
