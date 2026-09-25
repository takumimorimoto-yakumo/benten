/**
 * A standard accounting name (a statement line such as Gross profit or
 * Return on equity (ROE), or a statement's own name) as it appears on the
 * page. The mark is the vocabulary rule's one exception (app IA section
 * 7.3): inside it a standard accounting name may carry a word the rule keeps
 * off the page elsewhere ("profit", "return"); outside it the rule applies
 * unchanged. Only line and statement names from the statements catalog go
 * inside, never a sentence of Benten's own.
 */
import type { ReactNode } from "react";

export const ACCOUNTING_TERM = "accounting-line-item";

export function AccountingTerm({ children }: { children: ReactNode }) {
  return <span data-term={ACCOUNTING_TERM}>{children}</span>;
}
