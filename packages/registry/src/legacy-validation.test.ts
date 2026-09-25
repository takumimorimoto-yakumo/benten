import { describe, expect, it } from "vitest";
import snapshot from "./financials-snapshot.json" with { type: "json" };
import xstocks from "./xstocks.json" with { type: "json" };
import { validateFinancialsSnapshot } from "./financials-snapshot.js";
import { validateLegacyFinancialsSnapshot } from "./legacy-validation.js";

const eligible = new Set(xstocks.filter((entry) => entry.fundamentals_available).map((entry) => entry.ticker));

describe("shared legacy validator", () => {
  it("is the runtime validator and accepts the bundled snapshot", () => {
    expect(validateLegacyFinancialsSnapshot(snapshot, eligible)).toEqual(validateFinancialsSnapshot(snapshot));
  });

  it("accepts the supported month-qualified fiscal label", () => {
    const copy: any = structuredClone(snapshot);
    copy.fundamentals.ABNB.as_of = "FY2025 M12 FY";
    copy.financials.ABNB.as_of = "FY2025 M12 FY";
    expect(() => validateLegacyFinancialsSnapshot(copy, eligible)).not.toThrow();
    expect(() => validateFinancialsSnapshot(copy)).not.toThrow();
  });

  it.each([
    ["numeric string", (copy: any) => { copy.fundamentals.ABNB.data.revenue = "12241000000"; }],
    ["overlong company", (copy: any) => { copy.fundamentals.ABNB.data.company_name = "x".repeat(513); }],
    ["object statement date", (copy: any) => { copy.financials.ABNB.as_of = {}; }],
    ["invalid region", (copy: any) => { copy.financials.ABNB.statements.pl.region = "EU"; }],
    ["invalid month", (copy: any) => { copy.financials.ABNB.statements.pl.fiscal_month = 13; }],
  ])("rejects %s identically", (_name, mutate) => {
    const copy: any = structuredClone(snapshot);
    mutate(copy);
    expect(() => validateLegacyFinancialsSnapshot(copy, eligible)).toThrow(TypeError);
    expect(() => validateFinancialsSnapshot(copy)).toThrow(TypeError);
  });
});
