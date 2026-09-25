import type { ReactNode } from "react";

/**
 * How a column renders once the table stacks into one card per row below 52rem:
 * - `rowheader`: the card header (`th scope="row"`), exactly one per table;
 * - `aside`: shown beside the row header in the card header, without a label;
 * - `field`: a labelled row inside the card.
 */
export type RecordTableColumn = { label: string; role: "rowheader" | "aside" | "field" };
export type RecordTableRow = { key: string; cells: readonly ReactNode[] };

/**
 * A semantic table that stays a plain table at 52rem and wider and becomes one
 * full-width card per row below it, so no column is hidden behind a horizontal
 * scroll. `display: block` drops implicit table semantics in Chromium and
 * WebKit, so every element carries its explicit ARIA role.
 */
export function RecordTable({ caption, columns, rows, variant }: {
  caption: string;
  columns: readonly RecordTableColumn[];
  rows: readonly RecordTableRow[];
  variant?: "instruments";
}) {
  if (columns.filter((column) => column.role === "rowheader").length !== 1) {
    throw new TypeError("RecordTable needs exactly one row header column");
  }
  for (const row of rows) {
    if (row.cells.length !== columns.length) throw new TypeError("RecordTable row does not match its columns");
  }
  return <div className={variant ? `record-table record-table--${variant}` : "record-table"}>
    <table role="table">
      <caption className="sr-only">{caption}</caption>
      <thead role="rowgroup"><tr role="row">
        {columns.map((column) => <th key={column.label} scope="col" role="columnheader">{column.label}</th>)}
      </tr></thead>
      <tbody role="rowgroup">{rows.map((row) => <tr key={row.key} role="row">
        {row.cells.map((cell, index) => {
          const column = columns[index];
          if (column.role === "rowheader") {
            return <th key={column.label} scope="row" role="rowheader" className="record-table__header">{cell}</th>;
          }
          return <td key={column.label} role="cell" className={column.role === "aside" ? "record-table__aside" : undefined}>
            {column.role === "field" ? <span className="record-table__label" aria-hidden="true">{column.label}</span> : null}
            {cell}
          </td>;
        })}
      </tr>)}</tbody>
    </table>
  </div>;
}
