import { describe, expect, it } from "vitest";
import { readPublicFinancials, type LegacySnapshotBlock } from "@benten/registry";

import { presentLegacyStatementPeriods } from "@/lib/period-presentation";

function gmeStatements() {
  const result = readPublicFinancials({ ticker: "GME" }, { isValidMint: () => false });
  if (!result.found) throw new Error("Expected GME financial statements");
  return Object.fromEntries(
    Object.entries(result.statements).map(([statement, value]) => [statement, value?.legacy_snapshot ?? null]),
  ) as Partial<Record<"pl" | "bs" | "cf", LegacySnapshotBlock | null>>;
}

describe("presentLegacyStatementPeriods", () => {
  it("does not warn when NVDA statement periods are aligned", () => {
    const result = readPublicFinancials({ ticker: "NVDA" }, { isValidMint: () => false });
    if (!result.found) throw new Error("Expected NVDA financial statements");
    const statements = Object.fromEntries(
      Object.entries(result.statements).map(([statement, value]) => [statement, value?.legacy_snapshot ?? null]),
    ) as Partial<Record<"pl" | "bs" | "cf", LegacySnapshotBlock | null>>;

    expect(presentLegacyStatementPeriods("FY2025", statements)).toMatchObject({
      hasSelectedPeriodMismatch: false,
      hasMixedFiscalYears: false,
    });
  });

  it("does not invent a period when no statement snapshot is available", () => {
    expect(presentLegacyStatementPeriods("FY2025", {})).toEqual({
      recordAsOf: "FY2025",
      selectedFiscalYear: null,
      statementPeriods: [],
      hasSelectedPeriodMismatch: false,
      hasMixedFiscalYears: false,
    });
  });

  it("keeps the shared record label while showing the selected GME balance-sheet year", () => {
    const statements = gmeStatements();
    const presentation = presentLegacyStatementPeriods("FY2026", statements, "bs");

    expect(presentation.recordAsOf).toBe("FY2026");
    expect(presentation.selectedFiscalYear).toBe(2025);
    expect(presentation.statementPeriods).toEqual([{ statement: "bs", fiscalYear: 2025, label: "BS FY2025" }]);
    expect(presentation.hasSelectedPeriodMismatch).toBe(true);
    expect(presentation.hasMixedFiscalYears).toBe(false);
  });

  it("keeps each GME period visible and warns when an all-statements result is mixed", () => {
    const presentation = presentLegacyStatementPeriods("FY2026", gmeStatements());

    expect(presentation.recordAsOf).toBe("FY2026");
    expect(presentation.statementPeriods).toEqual([
      { statement: "pl", fiscalYear: 2026, label: "PL FY2026" },
      { statement: "bs", fiscalYear: 2025, label: "BS FY2025" },
      { statement: "cf", fiscalYear: 2026, label: "CF FY2026" },
    ]);
    expect(presentation.hasSelectedPeriodMismatch).toBe(false);
    expect(presentation.hasMixedFiscalYears).toBe(true);
  });
});
