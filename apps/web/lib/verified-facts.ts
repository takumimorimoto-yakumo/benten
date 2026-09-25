import type { VerifiedFact, VerifiedFacts } from "@/lib/public-result";
import { PREFERRED_FACTS } from "@/lib/site-copy";

export interface DisplayVerifiedFact {
  name: (typeof PREFERRED_FACTS)[number];
  fact: VerifiedFact;
  period: VerifiedFacts["periods"][string];
  source: VerifiedFacts["source_refs"][string];
}

/**
 * A source-verified row is displayable only when its own period and filing
 * context resolve. This prevents a present value from inheriting metadata.
 */
export function displayVerifiedFacts(facts: VerifiedFacts, limit?: number): DisplayVerifiedFact[] {
  return PREFERRED_FACTS.flatMap((name) => {
    const fact = facts.facts[name];
    const period = fact ? facts.periods[fact.period_ref] : undefined;
    const source = fact ? facts.source_refs[fact.source_ref] : undefined;
    return fact && period && source ? [{ name, fact, period, source }] : [];
  }).slice(0, limit);
}
