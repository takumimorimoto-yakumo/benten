/**
 * The bundled per-statement artifacts. Plain JavaScript on purpose: the type
 * checker then sees only the declared `unknown` inputs instead of inferring a
 * literal type for several megabytes of JSON. Every consumer validates them.
 */
import pl from "./verified-statements-annual-v1-pl.json" with { type: "json" };
import bs from "./verified-statements-annual-v1-bs.json" with { type: "json" };
import cf from "./verified-statements-annual-v1-cf.json" with { type: "json" };
import perShare from "./verified-statements-annual-v1-per_share.json" with { type: "json" };

export const STATEMENT_HISTORY_INPUTS = { pl, bs, cf, per_share: perShare };
