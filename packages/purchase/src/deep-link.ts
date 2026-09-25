/**
 * The buy-flow link (`?amount=<amount>[&pay=<token>]`). SDK-free, so the page
 * reads it without loading any Solana code, and the server-side quote reader
 * writes it with the same rules.
 *
 * A link is only a suggestion for the pay-token choice and the amount field.
 * `pay` must be exactly one lower-case pay token id (`usdc`, `sol`, `skr`);
 * without it the link pays with USDC. The amount passes exactly the field's
 * own checks for that token (format, precision, non-zero, and for USDC the
 * per-transaction limit; a SOL or SKR amount is limited in USD terms when the
 * page quotes it). Anything else, a repeated parameter included, is ignored:
 * an invalid `pay` ignores the whole link, since its amount has no known unit.
 */

import { formatRawUnits, parsePayTokenInput } from "./amount";
import { PURCHASE_CONFIG } from "./config";
import { PAY_TOKEN_IDS, PAY_TOKEN_UNITS, type PayTokenId } from "./token-units";

export interface DeepLinkPurchase {
  /** The pay token the link selects; USDC when the link has no `pay` (its amount is then USDC). */
  payToken: PayTokenId;
  /** The normalized amount text in `payToken` units, or `null` when the link carries no valid amount. */
  amountText: string | null;
}

/** The link value of a pay token: its id in lower case. */
export function payTokenLinkValue(payToken: PayTokenId): string {
  return payToken.toLowerCase();
}

/** Exact match of a link value against the closed pay-token allowlist. */
function payTokenOfLinkValue(value: string): PayTokenId | null {
  return PAY_TOKEN_IDS.find((id) => payTokenLinkValue(id) === value) ?? null;
}

/** Normalized amount text of `text` in `payToken` units after the field's checks, or `null`. */
export function normalizedPayAmount(text: string, payToken: PayTokenId): string | null {
  const parsed = parsePayTokenInput(text, payToken);
  return parsed.ok ? formatRawUnits(parsed.raw, PAY_TOKEN_UNITS[payToken].decimals) : null;
}

/**
 * The pay token and amount a link suggests, or `null` to ignore the link: an
 * invalid `pay`, or no `pay` and no valid amount (a plain page visit leaves
 * the panel as it is).
 */
export function readDeepLink(search: string): DeepLinkPurchase | null {
  const params = new URLSearchParams(search);
  const payValues = params.getAll(PURCHASE_CONFIG.deepLinkPayParam);
  if (payValues.length > 1) return null;
  const payToken = payValues.length === 1 ? payTokenOfLinkValue(payValues[0]!) : "USDC";
  if (payToken === null) return null;
  const amounts = params.getAll(PURCHASE_CONFIG.deepLinkAmountParam);
  const amountText = amounts.length === 1 ? normalizedPayAmount(amounts[0]!, payToken) : null;
  // Without `pay` the link only suggests a USDC amount: no valid amount, nothing to apply.
  if (payValues.length === 0 && amountText === null) return null;
  return { payToken, amountText };
}

/**
 * The query string that carries one already-validated raw amount of
 * `payToken`. A USDC link keeps the original `?amount=` form; another token
 * adds `pay`.
 */
export function deepLinkQuery(raw: bigint, payToken: PayTokenId = "USDC"): string {
  const params = new URLSearchParams({ [PURCHASE_CONFIG.deepLinkAmountParam]: formatRawUnits(raw, PAY_TOKEN_UNITS[payToken].decimals) });
  if (payToken !== "USDC") params.set(PURCHASE_CONFIG.deepLinkPayParam, payTokenLinkValue(payToken));
  return `?${params.toString()}`;
}
