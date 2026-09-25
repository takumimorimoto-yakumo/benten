import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { readPublicFinancials, type LegacySnapshotBlock } from "@benten/registry";

import { LegacyStatementPeriods } from "@/components/legacy-statement-periods";

function gmeStatements() {
  const result = readPublicFinancials({ ticker: "GME" }, { isValidMint: () => false });
  if (!result.found) throw new Error("Expected GME financial statements");
  return Object.fromEntries(
    Object.entries(result.statements).map(([statement, value]) => [statement, value?.legacy_snapshot ?? null]),
  ) as Partial<Record<"pl" | "bs" | "cf", LegacySnapshotBlock | null>>;
}

describe("LegacyStatementPeriods", () => {
  it("renders the selected balance-sheet year separately from the shared record label", () => {
    const html = renderToStaticMarkup(createElement(LegacyStatementPeriods, {
      locale: "en", recordAsOf: "FY2026 M1 FY", statements: gmeStatements(), selectedStatement: "bs",
    }));

    expect(html).toContain("FY2026 M1 FY");
    expect(html).toContain("BS FY2025");
    expect(html).toContain("differs from the record label");
    expect(html).not.toContain("Periods differ across statements");
  });

  it("warns when all GME statement periods mix fiscal years", () => {
    const html = renderToStaticMarkup(createElement(LegacyStatementPeriods, {
      locale: "en", recordAsOf: "FY2026 M1 FY", statements: gmeStatements(),
    }));

    expect(html).toContain("PL FY2026");
    expect(html).toContain("BS FY2025");
    expect(html).toContain("CF FY2026");
    expect(html).toContain("Periods differ across statements");
  });
});
