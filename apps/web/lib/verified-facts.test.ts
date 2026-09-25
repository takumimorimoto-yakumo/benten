import { describe, expect, it } from "vitest";
import { getVerifiedFundamentals } from "@benten/registry";
import { displayVerifiedFacts } from "@/lib/verified-facts";

describe("displayVerifiedFacts", () => {
  it("keeps verified values fact-scoped and limits the homepage preview", () => {
    const facts = getVerifiedFundamentals("NVDA");
    if (!facts) throw new Error("NVDA fixture must be source verified");

    const rows = displayVerifiedFacts(facts, 3);
    expect(rows.map(({ name }) => name)).toEqual(["revenue", "net_income_parent", "total_assets"]);
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.fact.currency).toBe("USD");
      expect(row.period.period_end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(row.source.filing_url).toMatch(/^https:\/\//);
    }
  });

  it("omits a value whose own source context is absent", () => {
    const verified = getVerifiedFundamentals("NVDA");
    if (!verified) throw new Error("NVDA fixture must be source verified");
    const facts = structuredClone(verified);
    delete facts.periods[facts.facts.revenue!.period_ref];
    expect(displayVerifiedFacts(facts).map(({ name }) => name)).not.toContain("revenue");
  });
});
