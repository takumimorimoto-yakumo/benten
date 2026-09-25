import type { LegacySnapshotBlock, StatementName } from "@benten/registry";

const statementOrder: readonly StatementName[] = ["pl", "bs", "cf"];

export type LegacyStatementPeriod = {
  statement: StatementName;
  fiscalYear: number | null;
  label: string;
};

export type LegacyStatementPeriodPresentation = {
  recordAsOf: string;
  selectedFiscalYear: number | null;
  statementPeriods: readonly LegacyStatementPeriod[];
  hasSelectedPeriodMismatch: boolean;
  hasMixedFiscalYears: boolean;
};

/**
 * Presentation-only period metadata. It intentionally derives no values and
 * does not alter the public snapshot/API contract.
 */
export function presentLegacyStatementPeriods(
  recordAsOf: string,
  statements: Partial<Record<StatementName, LegacySnapshotBlock | null>>,
  selectedStatement?: StatementName,
): LegacyStatementPeriodPresentation {
  const names = selectedStatement ? [selectedStatement] : statementOrder;
  const statementPeriods = names.flatMap((statement) => {
    const snapshot = statements[statement];
    if (!snapshot) return [];
    const fiscalYear = snapshot.observed_period.fiscal_year;
    return [{
      statement,
      fiscalYear,
      label: `${statement.toUpperCase()}${fiscalYear === null ? "" : ` FY${fiscalYear}`}`,
    }];
  });
  const fiscalYears = new Set(statementPeriods.flatMap(({ fiscalYear }) => fiscalYear === null ? [] : [fiscalYear]));
  const recordFiscalYears = new Set(
    [...recordAsOf.matchAll(/FY(\d{4})/g)].map((match) => Number(match[1])),
  );
  const selectedFiscalYear = statementPeriods.length === 1 ? statementPeriods[0].fiscalYear : null;

  return {
    recordAsOf,
    selectedFiscalYear,
    statementPeriods,
    hasSelectedPeriodMismatch: selectedFiscalYear !== null
      && recordFiscalYears.size > 0
      && !recordFiscalYears.has(selectedFiscalYear),
    hasMixedFiscalYears: fiscalYears.size > 1,
  };
}
