import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type FactListItem = {
  readonly label: ReactNode;
  readonly value: ReactNode;
  /** Full identifiers (mints, addresses, accession numbers) wrap anywhere and use tabular monospace. */
  readonly identifier?: boolean;
};

/**
 * Labeled label/value rows. The list stacks each label above its value and
 * becomes two columns only when its own width reaches the
 * `fact-list-split` container size. The width is the list's, not the
 * viewport's, so a narrow column (the Dossier facts beside the purchase rail)
 * or 200% text keeps the stacked form and a value never shrinks to nothing.
 */
export function FactList({ items, className }: { items: readonly FactListItem[]; className?: string }) {
  return (
    <div className="@container">
      <dl className={cn("grid gap-x-6 gap-y-3 text-sm @fact-list-split:grid-cols-(--fact-list-columns)", className)}>
        {items.map((item, index) => (
          <div key={index} className="flex flex-col gap-0.5 @fact-list-split:contents">
            <dt className="text-muted-foreground">{item.label}</dt>
            <dd className={cn("min-w-0", item.identifier ? "font-mono break-all tabular-nums" : "break-words")}>{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
