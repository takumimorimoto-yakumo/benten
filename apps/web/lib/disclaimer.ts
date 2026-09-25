/**
 * Single source of truth for this app's disclaimer wording.
 *
 * The wording is kept identical to the MCP response envelope
 * (`packages/mcp/src/lib/envelope.ts`) and to DISCLAIMER.md. Every surface
 * that returns or renders data must reference this constant rather than
 * re-typing the sentence.
 */
export const DISCLAIMER =
  "Factual data only. Not investment advice, a recommendation, or a valuation.";
