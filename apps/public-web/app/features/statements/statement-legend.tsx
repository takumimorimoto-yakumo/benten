/**
 * The legend of how each statement value is known, each entry written in its
 * own table style: shared by the company page section and the evidence page
 * (which must not import the section, so it never reaches the chart island).
 */
import { useId } from "react";
import { EMPTY_VALUE } from "@/i18n/format";
import type { PublicWebLocale } from "@/i18n/locales";
import { statementsMessagesFor } from "@/i18n/statements-messages";
import { CELL_STATUS_CLASSES } from "./statement-table";

/** The three ways a value is known, each written in its own table style, and the empty mark. */
export function StatusLegend({ locale }: { locale: PublicWebLocale }) {
  const copy = statementsMessagesFor(locale).legend;
  const labelId = useId();
  return (
    <div className="flex flex-col gap-1 text-sm">
      <p className="text-muted-foreground" id={labelId}>{copy.label}</p>
      <ul aria-labelledby={labelId} data-statements-legend="" className="flex flex-wrap gap-x-5 gap-y-1">
        <li data-statement-status="verified" className={CELL_STATUS_CLASSES.verified}>{copy.verified}</li>
        <li data-statement-status="unverified" className={CELL_STATUS_CLASSES.unverified}>{copy.unverified}</li>
        <li data-statement-status="calculated" className={CELL_STATUS_CLASSES.calculated}>{copy.calculated}</li>
        <li data-statement-status="empty"><span aria-hidden="true" className={CELL_STATUS_CLASSES.empty}>{EMPTY_VALUE}</span> {copy.empty}</li>
      </ul>
    </div>
  );
}

