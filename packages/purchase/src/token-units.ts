/**
 * Decimals of the route tokens and the accepted pay tokens, with no Solana SDK import, so modules
 * that only need units (the amount model, and through it the SDK-free
 * holdings reader) do not pull the SDK into a page's graph. `route.ts`
 * re-exports these; they are the same pinned values it documents.
 */

/** Decimals the route is verified for; a mint read back with other decimals stops the flow. */
export const USDC_DECIMALS = 6;
export const NVDAX_DECIMALS = 8;
/** Decimals of the accepted pay tokens other than USDC (native SOL in lamports, and SKR). */
export const SOL_DECIMALS = 9;
export const SKR_DECIMALS = 6;

/** The tokens the purchase panel accepts as payment, in display order. A closed allowlist. */
export const PAY_TOKEN_IDS = ["USDC", "SOL", "SKR"] as const;
export type PayTokenId = (typeof PAY_TOKEN_IDS)[number];

/** Units of each pay token: decimals, and whether it is native SOL (a lamport balance, wrapped for the swap). */
export const PAY_TOKEN_UNITS: Readonly<Record<PayTokenId, { readonly decimals: number; readonly native: boolean }>> = {
  USDC: { decimals: USDC_DECIMALS, native: false },
  SOL: { decimals: SOL_DECIMALS, native: true },
  SKR: { decimals: SKR_DECIMALS, native: false },
};

/** Exact-match allowlist gate for a pay token id from outside (UI, query). `null` for anything else. */
export function resolvePayToken(value: unknown): PayTokenId | null {
  return typeof value === "string" && (PAY_TOKEN_IDS as readonly string[]).includes(value) ? (value as PayTokenId) : null;
}
