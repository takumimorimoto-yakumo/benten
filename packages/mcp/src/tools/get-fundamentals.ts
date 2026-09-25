import { getFundamentalsSnapshot, resolveTicker } from "@benten/registry";
import { buildEnvelope, type Envelope } from "../lib/envelope.js";
import { REGISTRY_AS_OF } from "../lib/constants.js";

export interface GetFundamentalsInput {
  ticker: string;
}

export type NotFoundReason = "unknown_ticker" | "not_covered" | "no_data";

export interface FundamentalsNotFound {
  found: false;
  ticker: string;
  reason: NotFoundReason;
  fundamentals_available: boolean | null;
  exclusion_reason: string | null;
}

export type FundamentalsRow = { found: true } & Record<string, unknown>;

export async function getFundamentals(
  input: GetFundamentalsInput,
): Promise<Envelope<FundamentalsNotFound | FundamentalsRow>> {
  const entry = resolveTicker(input.ticker);

  if (!entry) {
    return buildEnvelope(
      { found: false, ticker: input.ticker, reason: "unknown_ticker", fundamentals_available: null, exclusion_reason: null },
      REGISTRY_AS_OF,
      "static registry",
    );
  }

  if (!entry.fundamentals_available) {
    return buildEnvelope(
      { found: false, ticker: entry.ticker, reason: "not_covered", fundamentals_available: false, exclusion_reason: entry.exclusion_reason },
      REGISTRY_AS_OF,
      "static registry",
    );
  }

  const record = getFundamentalsSnapshot(entry.ticker);
  if (!record) {
    return buildEnvelope(
      { found: false, ticker: entry.ticker, reason: "no_data", fundamentals_available: true, exclusion_reason: null },
      REGISTRY_AS_OF,
      "Benten financial snapshot",
    );
  }

  return buildEnvelope(
    { found: true, ...record.data },
    record.as_of,
    "Benten legacy financial snapshot; filing source, unit, and fact kind unverified",
  );
}
