/**
 * Common response envelope shared by every Benten MCP tool.
 *
 * `as_of` must always describe the point in time the underlying DATA
 * reflects (e.g. a filing date, a fiscal year, a price date, an on-chain
 * block time) — never `new Date()` / "now". A tool that stamps "now" as
 * `as_of` misrepresents how fresh the underlying fact actually is.
 */

export const DISCLAIMER =
  "Factual data only. Not investment advice, a recommendation, or a valuation.";

export interface Envelope<T> {
  data: T;
  as_of: string;
  source: string;
  disclaimer: typeof DISCLAIMER;
}

export function buildEnvelope<T>(data: T, as_of: string, source: string): Envelope<T> {
  return { data, as_of, source, disclaimer: DISCLAIMER };
}
