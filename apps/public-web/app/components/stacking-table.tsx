import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * How a column renders once rows stack below `md`:
 * - `rowheader`: the row's first line (`th scope="row"`), exactly one per table and first in order;
 * - `inline`: on the row header's line, without a label;
 * - `aside`: on the row header's line, without a label, pushed to the end of that line
 *   (for example the provider name at the top right of a record card);
 * - `field`: its own labelled line, after the row header's line.
 */
export type StackingTableColumn = { readonly key: string; readonly label: string; readonly role: "rowheader" | "inline" | "aside" | "field" };
/** A `null` cell is empty; on narrow screens its line is omitted. */
export type StackingTableRow = { readonly key: string; readonly cells: readonly (ReactNode | null)[]; readonly attributes?: Readonly<Record<`data-${string}`, string>> };
/**
 * Below `md`: `rows` keeps each record as a divided block with label/value
 * lines; `cards` makes each record a bordered card whose labelled fields are
 * separated by hairlines, for records with long, multi-line values.
 */
export type StackingTableLayout = "rows" | "cards";

const ROW_CLASSES: Record<StackingTableLayout, string> = {
  rows: "max-md:flex max-md:flex-wrap max-md:items-baseline max-md:gap-x-3 max-md:gap-y-1 max-md:py-3",
  // `!` overrides the shadcn body rule that removes the last row's border.
  cards: "hover:bg-transparent max-md:flex max-md:flex-wrap max-md:items-baseline max-md:gap-x-3 max-md:gap-y-3 max-md:rounded-lg max-md:border! max-md:bg-card max-md:p-4",
};

const FIELD_CLASSES: Record<StackingTableLayout, string> = {
  rows: "max-md:order-1 max-md:grid max-md:basis-full max-md:grid-cols-(--stacked-label-columns) max-md:gap-x-3",
  cards: "max-md:order-1 max-md:flex max-md:basis-full max-md:flex-col max-md:gap-1 max-md:border-t max-md:pt-3",
};

const FIELD_LABEL_CLASSES: Record<StackingTableLayout, string> = {
  rows: "text-muted-foreground md:hidden",
  cards: "text-xs font-medium text-muted-foreground md:hidden",
};

/**
 * The shadcn Table from `md`, and one stacked block per row below it, so no
 * column hides behind a horizontal scroll at 390px. `display: block` drops
 * implicit table semantics in Chromium and WebKit, so every element carries
 * its explicit ARIA role.
 */
export function StackingTable({ caption, columns, rows, className, layout = "rows" }: {
  caption: string;
  columns: readonly StackingTableColumn[];
  rows: readonly StackingTableRow[];
  className?: string;
  layout?: StackingTableLayout;
}) {
  if (columns.filter((column) => column.role === "rowheader").length !== 1 || columns[0]?.role !== "rowheader") {
    throw new TypeError("StackingTable needs exactly one row header column, first");
  }
  for (const row of rows) {
    if (row.cells.length !== columns.length) throw new TypeError("StackingTable row does not match its columns");
  }
  return (
    <Table role="table" data-stacking-layout={layout} className={cn("max-md:block", className)}>
      <caption className="sr-only">{caption}</caption>
      <TableHeader role="rowgroup" className="max-md:sr-only">
        <TableRow role="row" className="hover:bg-transparent">
          {columns.map((column) => (
            <TableHead key={column.key} scope="col" role="columnheader" className={cn(layout === "cards" && "align-bottom whitespace-normal")}>{column.label}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody role="rowgroup" className={cn("max-md:block", layout === "cards" && "max-md:flex max-md:flex-col max-md:gap-4")}>
        {rows.map((row) => (
          <TableRow key={row.key} role="row" {...row.attributes} className={ROW_CLASSES[layout]}>
            {row.cells.map((cell, index) => {
              const column = columns[index]!;
              if (column.role === "rowheader") {
                return (
                  <TableHead key={column.key} scope="row" role="rowheader" className={cn("h-auto py-2.5 align-top whitespace-normal max-md:p-0", layout === "cards" && "max-md:min-w-0 max-md:flex-1")}>
                    {cell}
                  </TableHead>
                );
              }
              return (
                <TableCell
                  key={column.key}
                  role="cell"
                  className={cn(
                    "py-2.5 align-top whitespace-normal max-md:p-0",
                    column.role === "aside" && "max-md:ms-auto max-md:shrink-0 max-md:text-end",
                    column.role === "field" && FIELD_CLASSES[layout],
                    cell === null && "max-md:hidden",
                  )}
                >
                  {column.role === "field" && cell !== null ? <span className={FIELD_LABEL_CLASSES[layout]} aria-hidden="true">{column.label}</span> : null}
                  {cell === null ? null : <div className="min-w-0">{cell}</div>}
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
