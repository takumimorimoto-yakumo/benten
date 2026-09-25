/**
 * One statement as a table: items down the side, fiscal years across,
 * oldest to newest. The item column stays in place while the years scroll
 * sideways inside the table (never the page); once interactive the table
 * opens scrolled to the newest year.
 *
 * Interactive (after hydration) it is a grid with one tab stop: arrow keys,
 * Home and End move between values, and the focused value is the selected
 * one, so a keyboard, a tap and a click all fill the same readout. Before
 * hydration it is a plain table with the same values.
 *
 * How each value is known shows in the cell itself, not by colour alone:
 * reported values are plain, values not verified against the filing are
 * muted with a dotted underline, calculated values are italic; an absent
 * value is an em dash, never 0.
 *
 * A company can have about fifty lines over ten years, prerendered in five
 * locales, so the cells carry no utility classes: `static.css` styles them
 * by their data attributes (the shadcn table look, in fewer bytes).
 */
import { AccountingTerm } from "./accounting-term";
import { useEffect, useRef, type KeyboardEvent } from "react";
import { EMPTY_VALUE } from "@/i18n/format";
import { fiscalYearLabel } from "@/i18n/fiscal-year";
import type { PublicWebLocale } from "@/i18n/locales";
import { statementsMessagesFor } from "@/i18n/statements-messages";
import { STATEMENTS_CONFIG } from "./statement-config";
import type { CellStatus, CompanyStatements, StatementCell, StatementTab } from "./statement-data";
import { lineLabel, shortValueText } from "./statement-format";

export type StatementSelection = { readonly line: string; readonly index: number };

/** The look of a value by how it is known: shared by the legend, the readout and the evidence page (the table cells get it from `static.css`). */
export const CELL_STATUS_CLASSES: Record<CellStatus | "empty", string> = {
  verified: "",
  unverified: "text-muted-foreground underline decoration-dotted decoration-muted-foreground underline-offset-4",
  calculated: "italic",
  empty: "text-muted-foreground",
};

function cellKey(line: string, index: number): string {
  return `${line}/${index}`;
}

function StatusSuffix({ cell, locale }: { cell: StatementCell | null; locale: PublicWebLocale }) {
  const legend = statementsMessagesFor(locale).legend;
  if (cell?.status === "verified") return null;
  const text = !cell ? legend.empty : cell.status === "unverified" ? legend.unverified : legend.calculated;
  return <span className="sr-only">{`, ${text}`}</span>;
}

/** The next selection for a navigation key, or `null` for any other key. */
export function moveSelection(key: string, current: StatementSelection, lines: readonly string[], years: number): StatementSelection | null {
  const row = Math.max(0, lines.indexOf(current.line));
  switch (key) {
    case "ArrowLeft": return { line: current.line, index: Math.max(0, current.index - 1) };
    case "ArrowRight": return { line: current.line, index: Math.min(years - 1, current.index + 1) };
    case "ArrowUp": return { line: lines[Math.max(0, row - 1)]!, index: current.index };
    case "ArrowDown": return { line: lines[Math.min(lines.length - 1, row + 1)]!, index: current.index };
    case "Home": return { line: current.line, index: 0 };
    case "End": return { line: current.line, index: years - 1 };
    default: return null;
  }
}

export function StatementTable({ statements, tab, locale, selection, onSelect, interactive }: {
  statements: CompanyStatements;
  tab: StatementTab;
  locale: PublicWebLocale;
  selection: StatementSelection | null;
  onSelect: (selection: StatementSelection) => void;
  /** Hydrated: a grid with a roving tab stop. Before hydration: a plain table. */
  interactive: boolean;
}) {
  const copy = statementsMessagesFor(locale);
  const lines = statements.tabs[tab] ?? [];
  const items = lines.map((line) => line.item);
  const years = statements.years;
  const scroller = useRef<HTMLDivElement>(null);
  // The roving tab stop: the selected value, or the newest year of the first line.
  const stop = selection && items.includes(selection.line) ? selection : { line: items[0] ?? "", index: years.length - 1 };

  useEffect(() => {
    const element = scroller.current;
    if (interactive && element) element.scrollLeft = element.scrollWidth;
  }, [interactive]);

  const onKeyDown = (event: KeyboardEvent<HTMLTableElement>) => {
    const next = moveSelection(event.key, stop, items, years.length);
    if (!next) return;
    event.preventDefault();
    onSelect(next);
    scroller.current?.querySelector<HTMLElement>(`[data-statement-cell="${cellKey(next.line, next.index)}"]`)?.focus();
  };

  const tabName = copy.tabs[tab];
  return (
    <div
      ref={scroller}
      role="region"
      aria-label={copy.table.scroll(tabName)}
      // Before hydration no value is focusable, so the scroll area itself takes the tab stop.
      tabIndex={interactive ? undefined : 0}
      data-statement-scroll=""
      className="relative w-full overflow-x-auto overscroll-x-contain rounded-lg border"
    >
      <table
        data-statement-table={tab}
        role={interactive ? "grid" : undefined}
        aria-readonly={interactive ? true : undefined}
        onKeyDown={interactive ? onKeyDown : undefined}
        className="w-full border-separate border-spacing-0 text-sm"
      >
        <caption className="sr-only"><AccountingTerm>{copy.table.caption(tabName)}</AccountingTerm></caption>
        <thead>
          <tr>
            <th scope="col" data-statement-item="">{copy.table.item}</th>
            {years.map((year) => (
              <th key={year.fiscal_year} scope="col" data-statement-year={year.fiscal_year}>
                <abbr title={fiscalYearLabel(year.period_end, locale)}>{fiscalYearLabel(year.period_end, locale, "axis")}</abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.item} data-statement-line={line.item} data-statement-total={STATEMENTS_CONFIG.totals.has(line.item) ? "" : undefined}>
              <th scope="row" data-statement-item=""><AccountingTerm>{lineLabel(line.item, line.fallback_label, locale)}</AccountingTerm></th>
              {line.cells.map((cell, index) => {
                const selected = selection?.line === line.item && selection.index === index;
                return (
                  <td
                    key={years[index]!.fiscal_year}
                    data-statement-cell={cellKey(line.item, index)}
                    data-statement-status={cell?.status ?? "empty"}
                    role={interactive ? "gridcell" : undefined}
                    aria-selected={interactive ? selected : undefined}
                    tabIndex={interactive ? (stop.line === line.item && stop.index === index ? 0 : -1) : undefined}
                    onFocus={interactive ? () => { if (!selected) onSelect({ line: line.item, index }); } : undefined}
                    onClick={interactive ? () => onSelect({ line: line.item, index }) : undefined}
                  >
                    {cell ? <data value={cell.value}>{shortValueText(cell.value, line.unit, locale)}</data> : <span aria-hidden="true">{EMPTY_VALUE}</span>}
                    <StatusSuffix cell={cell} locale={locale} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
