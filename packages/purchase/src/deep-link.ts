/**
 * The amount carried by a buy-flow link (`?amount=<USDC>`). SDK-free, so the
 * page reads it without loading any Solana code, and the server-side quote
 * reader writes it with the same rules.
 *
 * A link amount is only a suggestion for the amount field. It passes exactly
 * the field's own checks (format, precision, non-zero, the per-transaction
 * limit); anything else, a repeated parameter included, is ignored.
 */

import { formatRawUnits, parseUsdcInput } from "./amount";
import { PURCHASE_CONFIG } from "./config";
import { USDC_DECIMALS } from "./token-units";

/** The normalized amount text of a valid link amount, or `null` to ignore the link. */
export function deepLinkAmountText(search: string): string | null {
  const values = new URLSearchParams(search).getAll(PURCHASE_CONFIG.deepLinkAmountParam);
  if (values.length !== 1) return null;
  const parsed = parseUsdcInput(values[0]!);
  return parsed.ok ? formatRawUnits(parsed.raw, USDC_DECIMALS) : null;
}

/** The query string that carries one already-validated raw USDC amount. */
export function deepLinkQuery(usdcRaw: bigint): string {
  return `?${new URLSearchParams({ [PURCHASE_CONFIG.deepLinkAmountParam]: formatRawUnits(usdcRaw, USDC_DECIMALS) }).toString()}`;
}
