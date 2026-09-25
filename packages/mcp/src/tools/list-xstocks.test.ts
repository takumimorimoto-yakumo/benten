import { describe, it, expect } from "vitest";
import { listXstocks } from "./list-xstocks.js";
import { DISCLAIMER } from "../lib/envelope.js";

describe("listXstocks", () => {
  it("returns the 152 product entries with no filter: the registry minus SPCX and VCX", () => {
    const result = listXstocks();
    expect(result.data).toHaveLength(152);
    const tickers = result.data.map((e) => e.ticker);
    expect(tickers).not.toContain("SPCX");
    expect(tickers).not.toContain("VCX");
    expect(result.data.some((e) => e.exclusion_reason === "private")).toBe(false);
  });

  it("returns nothing for the withheld private exclusion reason", () => {
    expect(listXstocks({ exclusion_reason: "private" }).data).toEqual([]);
  });

  it("returns all 129 structurally eligible entries when covered_only is true", () => {
    const result = listXstocks({ covered_only: true });
    expect(result.data).toHaveLength(129);
    expect(result.data.every((e) => e.fundamentals_available)).toBe(true);
  });

  it("returns only entries matching the given exclusion_reason", () => {
    const result = listXstocks({ exclusion_reason: "etf" });
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data.every((e) => e.exclusion_reason === "etf" && !e.fundamentals_available)).toBe(true);
  });

  it("includes as_of / source / disclaimer in the envelope", () => {
    const result = listXstocks();
    expect(result.as_of).toBeTruthy();
    expect(result.source).toBe("static registry");
    expect(result.disclaimer).toBe(DISCLAIMER);
  });
});
