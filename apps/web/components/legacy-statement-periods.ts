import { createElement } from "react";
import type { LegacySnapshotBlock, StatementName } from "@benten/registry";

import type { Locale } from "@/lib/i18n/config";
import { legacyPeriodMessagesFor } from "@/lib/i18n/messages";
import { presentLegacyStatementPeriods } from "@/lib/period-presentation";

/** Presentation-only context for a legacy financial-statement response. */
export function LegacyStatementPeriods({
  recordAsOf,
  statements,
  selectedStatement,
  locale = "en",
  explanatoryNote,
}: {
  recordAsOf: string;
  statements: Partial<Record<StatementName, LegacySnapshotBlock | null>>;
  selectedStatement?: StatementName;
  locale?: Locale;
  explanatoryNote?: string;
}) {
  const copy = legacyPeriodMessagesFor(locale);
  const presentation = presentLegacyStatementPeriods(recordAsOf, statements, selectedStatement);

  return createElement("aside", { className: "notice", "aria-label": copy.context },
    createElement("p", null, createElement("strong", null, copy.recordLabel), " ", presentation.recordAsOf),
    explanatoryNote ? createElement("p", null, explanatoryNote) : null,
    presentation.statementPeriods.length > 0
      ? createElement("ul", null, presentation.statementPeriods.map(({ statement, label }) =>
        createElement("li", { key: statement }, copy.statementPeriod(label)),
      ))
      : null,
    presentation.hasSelectedPeriodMismatch ? createElement("p", null, copy.selectedPeriodMismatch) : null,
    presentation.hasMixedFiscalYears ? createElement("p", null, copy.periodsMixed) : null,
  );
}
