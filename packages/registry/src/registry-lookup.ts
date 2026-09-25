import xstocksData from "./xstocks.json" with { type: "json" };
import type { XStockEntry } from "./types.js";

const registry = xstocksData as XStockEntry[];
const ASCII_TICKER = /^[A-Za-z0-9.-]{1,16}$/;

/**
 * Registry rows Benten withholds from every product surface.
 *
 * The selected PreStocks track rule reads "projects that integrate any
 * non-PreStocks pre-IPO tokens will be ineligible". The xStocks registry marks
 * two rows with the exclusion reason `private`: SPCX (SpaceX xStock) and VCX
 * (Fundrise Innovation Fund xStock). Both give pre-IPO company exposure that
 * PreStocks does not issue. Benten therefore keeps both rows in the bundled
 * registry data unchanged, so its digests and counts still describe the
 * registry, and never resolves, lists, links or renders them: the allowlist
 * lookups below skip them, and every Web, API and MCP surface reads through
 * those lookups or through `productXStockEntries`.
 *
 * The rule is the registry's own classification, so a new `private` row is
 * withheld without a code change.
 */
export function isWithheldFromProduct(entry: Pick<XStockEntry, "exclusion_reason">): boolean {
  return entry.exclusion_reason === "private";
}

/** Registry rows a product surface may resolve, list or render, in registry order. */
export const productXStockEntries: readonly XStockEntry[] = Object.freeze(
  registry.filter((entry) => !isWithheldFromProduct(entry)),
);

/** Normalize an untrusted ticker without Unicode case folding. */
export function normalizeTickerIdentifier(input: string): string | undefined {
  const trimmed = input.trim();
  return ASCII_TICKER.test(trimmed) ? trimmed.toUpperCase() : undefined;
}

/** Resolve untrusted ticker input against the product allowlist. */
export function resolveTicker(input: string): XStockEntry | null {
  const normalized = normalizeTickerIdentifier(input);
  return normalized === undefined
    ? null
    : productXStockEntries.find((entry) => entry.ticker === normalized) ?? null;
}

/** Resolve untrusted base58 mint input using case-sensitive exact matching. */
export function resolveMint(input: string): XStockEntry | null {
  const normalized = input.trim();
  return productXStockEntries.find((entry) => entry.mint === normalized) ?? null;
}
