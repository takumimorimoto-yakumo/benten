import { productXStocks, type ExclusionReason } from "@benten/registry";
import { buildEnvelope, type Envelope } from "../lib/envelope.js";
import { REGISTRY_AS_OF } from "../lib/constants.js";

export interface ListXstocksInput {
  covered_only?: boolean;
  exclusion_reason?: Exclude<ExclusionReason, null>;
}

export interface XstockListItem {
  symbol: string;
  ticker: string;
  name: string;
  mint: string;
  issuer_verified: boolean;
  fundamentals_available: boolean;
  exclusion_reason: ExclusionReason;
}

/**
 * List the xStocks universe from the static registry only. Never makes a
 * network call — everything it returns is already loaded in-process from
 * `@benten/registry`.
 *
 * The list is `productXStocks`: the registry minus the rows Benten withholds
 * from every product surface (`isWithheldFromProduct`). The PreStocks track
 * rule makes a project ineligible when it integrates a non-PreStocks pre-IPO
 * token, so SPCX and VCX, which the registry marks `private`, are never listed.
 */
export function listXstocks(input: ListXstocksInput = {}): Envelope<XstockListItem[]> {
  let entries = productXStocks;

  if (input.covered_only) {
    entries = entries.filter((e) => e.fundamentals_available);
  }
  if (input.exclusion_reason) {
    entries = entries.filter((e) => e.exclusion_reason === input.exclusion_reason);
  }

  const data: XstockListItem[] = entries.map((e) => ({
    symbol: e.symbol,
    ticker: e.ticker,
    name: e.name,
    mint: e.mint,
    issuer_verified: e.issuer_verified,
    fundamentals_available: e.fundamentals_available,
    exclusion_reason: e.exclusion_reason,
  }));

  return buildEnvelope(data, REGISTRY_AS_OF, "static registry");
}
