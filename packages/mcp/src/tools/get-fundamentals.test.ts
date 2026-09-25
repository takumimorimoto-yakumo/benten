import { afterEach, describe, expect, it, vi } from "vitest";
import {
  coveredXStocks,
  FUNDAMENTALS_FIELDS,
  isValidSnapshotAsOf,
  projectFields,
  validateFinancialsSnapshot,
} from "@benten/registry";
import snapshot from "../../../registry/src/financials-snapshot.json" with { type: "json" };
import { DISCLAIMER } from "../lib/envelope.js";
import { getFundamentals } from "./get-fundamentals.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getFundamentals — static public snapshot boundary", () => {
  it.each(["FAKE", "NVDA' OR '1'='1", "*", ""])(
    "rejects unlisted ticker without network access: %s",
    async (ticker) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const result = await getFundamentals({ ticker });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.data).toMatchObject({ found: false, reason: "unknown_ticker" });
    },
  );

  it("rejects a registered but ineligible ticker without network access", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await getFundamentals({ ticker: "BDWAP" });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({
      found: false,
      reason: "not_covered",
      exclusion_reason: "non_sec_listing",
    });
  });

  it("returns every eligible ticker with a valid bundled row without fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const results = await Promise.all(
      coveredXStocks
        .filter((entry) => entry.ticker !== "ASML")
        .map((entry) => getFundamentals({ ticker: entry.ticker })),
    );

    expect(results.every((result) => result.data.found)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports no_data for an eligible SEC filer without a valid snapshot row", async () => {
    const result = await getFundamentals({ ticker: "ASML" });

    expect(result.data).toMatchObject({
      found: false,
      ticker: "ASML",
      reason: "no_data",
      fundamentals_available: true,
      exclusion_reason: null,
    });
  });

  it("returns only the explicit public field contract", async () => {
    const result = await getFundamentals({ ticker: "NVDA" });

    expect(result.data.found).toBe(true);
    expect(Object.keys(result.data).sort()).toEqual(["found", ...FUNDAMENTALS_FIELDS].sort());
    expect(result.data).not.toHaveProperty("price");
    expect(result.data).not.toHaveProperty("sector");
    expect(result.source).toBe("Benten legacy financial snapshot; filing source, unit, and fact kind unverified");
    expect(result.disclaimer).toBe(DISCLAIMER);
  });

  it.each([
    ["nested object", { secret: "nested" }],
    ["array", ["nested"]],
    ["non-finite number", Number.POSITIVE_INFINITY],
    ["boolean", true],
    ["numeric string", "1000"],
  ])("rejects a %s in a projected public field", (_name, invalidValue) => {
    expect(() => projectFields(
      { revenue: invalidValue },
      ["revenue"],
    )).toThrow(/invalid value/i);
  });

  it("drops non-allowlisted source fields", () => {
    expect(projectFields(
      { revenue: 1000, source_doc_id: "must-not-escape" },
      ["revenue"],
    )).toEqual({ revenue: 1000 });
  });

  it("bounds public string fields", () => {
    expect(() => projectFields(
      { company_name: "x".repeat(513) },
      ["company_name"],
    )).toThrow(/invalid value/i);
  });

  it.each([
    ["region", "EU"],
    ["period_kind", "Q1"],
    ["ticker", "lowercase"],
    ["fiscal_year", 1899],
    ["fiscal_year", 2025.5],
    ["fiscal_month", 0],
    ["fiscal_month", 13],
  ])("rejects an invalid %s field", (field, invalidValue) => {
    expect(() => projectFields(
      { [field]: invalidValue },
      [field],
    )).toThrow(/invalid value/i);
  });

  it.each([
    ["ticker mismatch", (copy: any) => { copy.financials.NVDA.statements.pl.ticker = "AAPL"; }],
  ])("rejects snapshot statement %s", (_name, mutate) => {
    const copy = structuredClone(snapshot);
    mutate(copy);
    expect(() => validateFinancialsSnapshot(copy)).toThrow(/does not match/i);
  });

  it.each([
    ["FY2026", true],
    ["FY2026 M1 FY", true],
    ["FY2026 M12 FY", true],
    ["2026-09-13", false],
    ["FY2026 M13 FY", false],
    ["FY2026 M1 Q1", false],
  ])("validates snapshot as_of format: %s", (value, expected) => {
    expect(isValidSnapshotAsOf(value)).toBe(expected);
  });
});
