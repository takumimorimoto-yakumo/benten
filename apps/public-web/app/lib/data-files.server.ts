/**
 * Build-only writer of the published data files (`data-files.ts`): turns a
 * file's value into its bytes and its digest-named address, so every kind is
 * named the same way. Used by the statements and price file sources; the
 * Vite build emits what they return.
 */
import { createHash } from "node:crypto";
import { dataFilePath, type DataFileKind } from "./data-files.js";

export type DataFileOutput = { readonly path: string; readonly body: string };

/** One data file of `kind` for `ticker`: its JSON bytes and the address named by their digest. */
export function dataFile(kind: DataFileKind, ticker: string, value: unknown): DataFileOutput {
  const body = JSON.stringify(value);
  return { path: dataFilePath(kind, ticker, createHash("sha256").update(body).digest("hex")), body };
}
