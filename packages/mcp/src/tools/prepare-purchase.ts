/**
 * `prepare_purchase`: facts for a purchase the user explicitly asked for, on
 * the one fixed route (NVDAx for USDC, at most the route's per-transaction
 * limit). It returns a current quote read from the pinned pool, when that
 * quote stops being current, and a link to the Benten buy flow with the
 * amount filled in. The user opens the link, the page reads a fresh quote,
 * and the user's own wallet shows and signs the transaction.
 *
 * Nothing here builds, signs or sends a transaction. The quote reader is
 * provided by the host (it reads the upstream RPC); this module only checks
 * its answer against a strict schema and resolves the output mint through
 * the registry allowlist before building the link.
 */
import { z } from "zod";
import { resolveMint } from "@benten/registry";
import { DISCLAIMER } from "../lib/envelope.js";
import { isValidSolanaAddress } from "../lib/solana-address.js";

export const PREPARE_PURCHASE_SCHEMA_VERSION = "prepare-purchase.v1";

export const PREPARE_PURCHASE_NOTE =
  "The quote is read from the pool at quoted_at and is not a binding price. The buy page reads a fresh quote "
  + "and your wallet shows the final transaction before you approve it. Benten does not sign or send anything.";

export const PREPARE_PURCHASE_ELIGIBILITY =
  "The issuer does not offer or sell NVDAx to US persons, and transfers may only be made to non-US persons. "
  + "Benten does not check whether you are eligible.";

const rawInteger = z.string().regex(/^\d+$/);
const decimalText = z.string().regex(/^\d+\.\d+$/);

/** The host quote reader's answer, checked strictly before anything reaches the caller. */
export const purchaseQuoteResultSchema = z.union([
  z.strictObject({
    ok: z.literal(true),
    amount_usdc: decimalText,
    amount_raw: rawInteger,
    max_amount_usdc: decimalText,
    slippage_bps: z.number().int().min(0).max(10_000),
    route: z.strictObject({
      pool: z.string(),
      dex: z.literal("Meteora DLMM"),
      input_mint: z.string(),
      input_symbol: z.string(),
      input_decimals: z.number().int(),
      output_mint: z.string(),
      output_symbol: z.string(),
      output_decimals: z.number().int(),
    }),
    quote: z.strictObject({
      consumedInputRaw: rawInteger,
      outputRaw: rawInteger,
      minimumOutputRaw: rawInteger,
      feeRaw: rawInteger,
      protocolFeeRaw: rawInteger,
      feeOnInput: z.boolean(),
      priceImpactPct: z.string().max(64),
    }),
    quoted_at_ms: z.number().int().positive(),
    expires_at_ms: z.number().int().positive(),
    buy_query: z.string().regex(/^\?[a-z_]+=\d+\.\d+$/),
  }),
  z.strictObject({
    ok: z.literal(false),
    reason: z.enum(["invalid_amount", "over_limit", "busy", "route_check", "upstream_unavailable"]),
    max_amount_usdc: decimalText,
    retryable: z.boolean(),
  }),
]);

export type PurchaseQuoteResult = z.infer<typeof purchaseQuoteResultSchema>;
/** Reads one quote for a USDC amount text; the reader applies the route's amount checks. */
export type PurchaseQuoteReader = (amountText: string) => Promise<PurchaseQuoteResult>;

export interface PreparePurchaseCapability {
  quote: PurchaseQuoteReader;
  /** The site origin the buy-flow link points at, for example `https://benten.example`; `null` gives a site-relative link. */
  siteOrigin: string | null;
  /**
   * Takes one call from the caller's `prepare_purchase` budget; `false` when
   * it is spent. Called once per tool call, before anything else.
   */
  admit?: () => boolean;
}

/** The accepted arguments, checked inside the tool so a mismatch still gets the tool's own result. */
export const preparePurchaseArgs = z.strictObject({
  amount_usdc: z.union([z.string().max(32), z.number().finite().positive()]),
  wallet_address: z.string().max(64).optional(),
});

/** Marks an argument the advertised schema does not accept; the tool answers it with its own failure. */
const INVALID_ARGUMENT = Symbol("invalid argument");

/**
 * The input schema registered with the MCP server. It advertises exactly
 * `preparePurchaseArgs` (the same types, `required` and
 * `additionalProperties: false`), but never fails: a mismatching argument
 * becomes `INVALID_ARGUMENT` and an unknown one is kept, so the call reaches
 * `preparePurchase`, which rejects both with its own result instead of a
 * protocol error without the disclaimer.
 */
export const preparePurchaseInput = z.object({
  amount_usdc: preparePurchaseArgs.shape.amount_usdc.catch(() => INVALID_ARGUMENT as never),
  wallet_address: preparePurchaseArgs.shape.wallet_address.catch(() => INVALID_ARGUMENT as never),
}).catchall(z.unknown()).meta({ additionalProperties: false });

const failureReason = z.enum([
  "invalid_amount", "over_limit", "invalid_wallet_address", "not_purchasable", "rate_limited", "service_busy", "service_unavailable",
]);

export const preparePurchaseOutput = z.strictObject({
  schema_version: z.literal(PREPARE_PURCHASE_SCHEMA_VERSION),
  data: z.union([
    z.strictObject({
      prepared: z.literal(true),
      product: z.strictObject({ ticker: z.string(), symbol: z.string(), mint: z.string(), name: z.string() }),
      amount_usdc: z.string(),
      amount_raw: z.string(),
      max_amount_usdc: z.string(),
      route: z.strictObject({
        pool: z.string(), dex: z.string(),
        input_mint: z.string(), input_symbol: z.string(), input_decimals: z.number().int(),
        output_mint: z.string(), output_symbol: z.string(), output_decimals: z.number().int(),
      }),
      quote: z.strictObject({
        consumed_input_raw: z.string(),
        output_raw: z.string(),
        minimum_output_raw: z.string(),
        output_basis: z.literal("raw_token_units_before_display_multiplier"),
        slippage_bps: z.number().int(),
        fee_raw: z.string(),
        protocol_fee_raw: z.string(),
        fee_on_input: z.boolean(),
        price_impact_pct: z.string(),
        quoted_at: z.string(),
        expires_at: z.string(),
      }),
      wallet_address: z.string().nullable(),
      purchase_url: z.string(),
      next_step: z.string(),
    }),
    z.strictObject({
      prepared: z.literal(false),
      reason: failureReason,
      max_amount_usdc: z.string().nullable(),
      retryable: z.boolean(),
    }),
  ]),
  eligibility: z.literal(PREPARE_PURCHASE_ELIGIBILITY),
  note: z.literal(PREPARE_PURCHASE_NOTE),
  disclaimer: z.literal(DISCLAIMER),
});

export type PreparePurchaseResult = z.infer<typeof preparePurchaseOutput>;
type FailureReason = z.infer<typeof failureReason>;

const NEXT_STEP = "Open purchase_url, connect your own wallet, check the fresh quote and approve in your wallet only if you want to buy.";

function envelope(data: PreparePurchaseResult["data"]): PreparePurchaseResult {
  return {
    schema_version: PREPARE_PURCHASE_SCHEMA_VERSION,
    data,
    eligibility: PREPARE_PURCHASE_ELIGIBILITY,
    note: PREPARE_PURCHASE_NOTE,
    disclaimer: DISCLAIMER,
  };
}

export function preparePurchaseFailure(reason: FailureReason, retryable = false, maxAmountUsdc: string | null = null): PreparePurchaseResult {
  return envelope({ prepared: false, reason, max_amount_usdc: maxAmountUsdc, retryable });
}

/** A number argument becomes its plain decimal text; exponent forms fail the reader's format check. */
function amountText(value: string | number): string {
  return typeof value === "number" ? String(value) : value;
}

const READER_FAILURE: Record<Extract<PurchaseQuoteResult, { ok: false }>["reason"], FailureReason> = {
  invalid_amount: "invalid_amount",
  over_limit: "over_limit",
  busy: "service_busy",
  route_check: "service_unavailable",
  upstream_unavailable: "service_unavailable",
};

/** The buy flow of a product page: `/stock/<ticker>/buy` (public Web routes). */
export function buyFlowPath(ticker: string): string {
  return `/stock/${encodeURIComponent(ticker)}/buy`;
}

/**
 * Check the tool arguments against `preparePurchaseArgs`. A wallet address
 * that does not match answers `invalid_wallet_address`; any other mismatch
 * (a missing or mistyped amount, an unknown argument) answers `invalid_amount`.
 */
function checkedArgs(args: unknown): z.infer<typeof preparePurchaseArgs> | FailureReason {
  const checked = preparePurchaseArgs.safeParse(args);
  if (checked.success) return checked.data;
  return checked.error.issues.some((issue) => issue.path[0] === "wallet_address") ? "invalid_wallet_address" : "invalid_amount";
}

export async function preparePurchase(args: unknown, capability: PreparePurchaseCapability): Promise<PreparePurchaseResult> {
  if (capability.admit && !capability.admit()) return preparePurchaseFailure("rate_limited", true);
  const input = checkedArgs(args);
  if (typeof input === "string") return preparePurchaseFailure(input);
  const walletAddress = input.wallet_address ?? null;
  if (walletAddress !== null && !isValidSolanaAddress(walletAddress)) return preparePurchaseFailure("invalid_wallet_address");
  let answer: PurchaseQuoteResult;
  try {
    answer = purchaseQuoteResultSchema.parse(await capability.quote(amountText(input.amount_usdc)));
  } catch {
    return preparePurchaseFailure("service_unavailable", true);
  }
  if (!answer.ok) return preparePurchaseFailure(READER_FAILURE[answer.reason], answer.retryable, answer.max_amount_usdc);
  // The link names a product only through the registry allowlist; an unknown mint is not purchasable here.
  const product = resolveMint(answer.route.output_mint);
  if (!product || product.mint !== answer.route.output_mint) return preparePurchaseFailure("not_purchasable");
  const path = `${buyFlowPath(product.ticker)}${answer.buy_query}`;
  return envelope({
    prepared: true,
    product: { ticker: product.ticker, symbol: product.symbol, mint: product.mint, name: product.name },
    amount_usdc: answer.amount_usdc,
    amount_raw: answer.amount_raw,
    max_amount_usdc: answer.max_amount_usdc,
    route: answer.route,
    quote: {
      consumed_input_raw: answer.quote.consumedInputRaw,
      output_raw: answer.quote.outputRaw,
      minimum_output_raw: answer.quote.minimumOutputRaw,
      output_basis: "raw_token_units_before_display_multiplier",
      slippage_bps: answer.slippage_bps,
      fee_raw: answer.quote.feeRaw,
      protocol_fee_raw: answer.quote.protocolFeeRaw,
      fee_on_input: answer.quote.feeOnInput,
      price_impact_pct: answer.quote.priceImpactPct,
      quoted_at: new Date(answer.quoted_at_ms).toISOString(),
      expires_at: new Date(answer.expires_at_ms).toISOString(),
    },
    wallet_address: walletAddress,
    purchase_url: capability.siteOrigin ? `${capability.siteOrigin}${path}` : path,
    next_step: NEXT_STEP,
  });
}
