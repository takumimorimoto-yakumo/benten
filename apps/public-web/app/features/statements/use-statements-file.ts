/**
 * Reads one ticker's statements file after hydration (the documents carry
 * only a summary). The file is same-origin and named by its digest, so one
 * read per page view is enough: a company page and its evidence page share
 * it, in every locale. A file that fails to load or does not fit the
 * expected shape is an error state with Try again; nothing partial is shown.
 */
import { useCallback, useEffect, useState } from "react";
import { parseStatementsFile, type CompanyStatements } from "./statement-data";

export type StatementsFileState =
  | { readonly kind: "loading" }
  | { readonly kind: "loaded"; readonly statements: CompanyStatements }
  | { readonly kind: "error" };

const reads = new Map<string, Promise<CompanyStatements>>();

async function readFile(path: string, ticker: string): Promise<CompanyStatements> {
  const response = await fetch(path, { credentials: "same-origin" });
  if (!response.ok) throw new Error(`statements file answered ${response.status}`);
  const statements = parseStatementsFile(await response.json(), ticker);
  if (!statements) throw new Error("statements file does not fit");
  return statements;
}

/** One read per path; a failed read is forgotten so Try again reads again. */
export function loadStatementsFile(path: string, ticker: string): Promise<CompanyStatements> {
  let read = reads.get(path);
  if (!read) {
    read = readFile(path, ticker);
    reads.set(path, read);
    read.catch(() => reads.delete(path));
  }
  return read;
}

/**
 * The file's state for a hydrated page. `enabled: false` (before hydration,
 * or the Living Catalog forcing a state) reads nothing.
 */
export function useStatementsFile(path: string, ticker: string, enabled: boolean): { state: StatementsFileState; retry: () => void } {
  const [state, setState] = useState<StatementsFileState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    setState({ kind: "loading" });
    loadStatementsFile(path, ticker).then(
      (statements) => { if (current) setState({ kind: "loaded", statements }); },
      () => { if (current) setState({ kind: "error" }); },
    );
    return () => { current = false; };
  }, [path, ticker, enabled, attempt]);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { state, retry };
}
