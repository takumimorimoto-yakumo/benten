/**
 * `prepare_purchase`: facts for a purchase the user explicitly asked for, of
 * one xStock Benten can buy (`ticker`, default NVDA), on that product's one
 * fixed route (the product for USDC in its pinned pool, at most the
 * per-transaction limit), paid with USDC, or with SOL or SKR through the
 * same fixed two-leg route as the buy page (the pay token to USDC in its
 * pinned pool, then that USDC to the product; the first leg's USDC is held
 * to the same limit). It returns a current quote read from the pinned pool,
 * when that quote stops being current, and a link to the product's Benten
 * buy flow with the amount filled in. The user opens the link, the page
 * reads a fresh quote, and the user's own wallet shows and signs the
 * transaction.
 *
 * Nothing here builds, signs or sends a transaction. The ticker is resolved
 * through the registry allowlist (`resolveTicker`) before the host's quote
 * reader sees it; the reader matches it exactly against its routes table
 * and answers `not_purchasable` for a product it has no route for. This
 * module checks the reader's answer against a strict schema and resolves
 * the output mint through the registry allowlist again: the answer must be
 * for the requested product before the link is built.
 */
import { z } from "zod";
import { resolveMint, resolveTicker } from "@benten/registry";
import { DISCLAIMER } from "../lib/envelope.js";
import { isValidSolanaAddress } from "../lib/solana-address.js";

export const PREPARE_PURCHASE_SCHEMA_VERSION = "prepare-purchase.v1";

export const PREPARE_PURCHASE_NOTE =
  "The quote is read from the pool at quoted_at and is not a binding price. The buy page reads a fresh quote "
  + "and your wallet shows the final transaction before you approve it. Benten does not sign or send anything.";

export const PREPARE_PURCHASE_ELIGIBILITY =
  "The issuer does not offer or sell xStocks to US persons, and transfers may only be made to non-US persons. "
  + "Benten does not check whether you are eligible.";

/**
 * The tickers the tool advertises as purchasable. SSOT exception, like the
 * pay tokens below: the host's quote reader owns the routes table
 * (`PRODUCT_TICKERS` of `@benten/purchase`, an exact match) and this package
 * does not depend on it; a public-api test asserts this list equals it.
 */
export const PREPARE_PURCHASE_TICKERS = ["NVDA", "META", "MSTR", "GOOGL", "CRCL", "TSLA", "SPY", "HOOD", "AMD", "COIN", "AMZN", "MSFT", "QQQ", "GLD", "BRK.B", "AVGO", "MCD", "KO", "INTC", "UNH", "XOM", "PLTR", "GME", "STRC", "WMT"] as const;
/** The product when the call names none (the original single route). */
export const DEFAULT_PURCHASE_TICKER = "NVDA";

const rawInteger = z.string().regex(/^\d+$/);
const decimalText = z.string().regex(/^\d+\.\d+$/);
/** A display amount or multiplier: plain decimal text, an integer part and optional fraction (no exponent). */
const displayDecimal = z.string().max(64).regex(/^\d+(?:\.\d+)?$/);

/**
 * The pay tokens the tool advertises. SSOT exception: the host's quote reader
 * owns the pay-token allowlist (`resolvePayToken` of `@benten/purchase`, an
 * exact match) and this package does not depend on it; a public-api test
 * asserts this list equals the purchase package's `PAY_TOKEN_IDS`.
 */
export const PREPARE_PURCHASE_PAY_TOKENS = ["USDC", "SOL", "SKR"] as const;
export const DEFAULT_PAY_TOKEN = "USDC";
/**
 * The DEX names a route may carry. SSOT exception, as for the pay tokens:
 * the purchase package's `ROUTE_DEX_LABELS`; a public-api test compares them.
 */
export const PREPARE_PURCHASE_DEXES = ["Meteora DLMM", "Raydium CLMM"] as const;

const routeSchema = z.strictObject({
  pool: z.string(),
  dex: z.enum(PREPARE_PURCHASE_DEXES),
  input_mint: z.string(),
  input_symbol: z.string(),
  input_decimals: z.number().int(),
  output_mint: z.string(),
  output_symbol: z.string(),
  output_decimals: z.number().int(),
});

const readerQuoteSchema = z.strictObject({
  consumedInputRaw: rawInteger,
  outputRaw: rawInteger,
  minimumOutputRaw: rawInteger,
  feeRaw: rawInteger,
  protocolFeeRaw: rawInteger,
  feeOnInput: z.boolean(),
  priceImpactPct: z.string().max(64),
});

/** The host quote reader's answer, checked strictly before anything reaches the caller. */
export const purchaseQuoteResultSchema = z.union([
  z.strictObject({
    ok: z.literal(true),
    /** Absent from a reader that only quotes USDC; then the pay token is USDC and the input is `amount_usdc`. */
    pay_token: z.string().max(16).optional(),
    amount_in: decimalText.optional(),
    amount_in_raw: rawInteger.optional(),
    amount_usdc: decimalText,
    amount_raw: rawInteger,
    max_amount_usdc: decimalText,
    slippage_bps: z.number().int().min(0).max(10_000),
    first_leg: z.strictObject({ route: routeSchema, quote: readerQuoteSchema }).nullable().optional(),
    route: routeSchema,
    quote: readerQuoteSchema,
    /**
     * The product output in display units at the Scaled UI multiplier in effect
     * (`null`: the mint carries none the reader could read). Absent from a
     * reader that does not report it.
     */
    product_display: z.strictObject({ multiplier: displayDecimal, output: displayDecimal, minimum_output: displayDecimal }).nullable().optional(),
    quoted_at_ms: z.number().int().positive(),
    expires_at_ms: z.number().int().positive(),
    // `?amount=<decimal>`, optionally followed by one `&<name>=<lower-case letters>` (the pay token).
    buy_query: z.string().regex(/^\?[a-z_]+=\d+\.\d+(?:&[a-z_]+=[a-z]{1,16})?$/),
  }),
  z.strictObject({
    ok: z.literal(false),
    reason: z.enum(["invalid_amount", "invalid_pay_token", "not_purchasable", "over_limit", "busy", "route_check", "upstream_unavailable"]),
    max_amount_usdc: decimalText,
    retryable: z.boolean(),
  }),
]);

export type PurchaseQuoteResult = z.infer<typeof purchaseQuoteResultSchema>;
/**
 * Reads one quote for an amount text in `payToken` units (omitted: USDC),
 * buying `ticker` (a registry ticker; omitted: NVDA). The reader applies the
 * route's amount checks, matches `payToken` exactly against its pay-token
 * allowlist and `ticker` exactly against its routes table.
 */
export type PurchaseQuoteReader = (amountText: string, payToken?: string, ticker?: string) => Promise<PurchaseQuoteResult>;

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
const amountArg = z.union([z.string().max(32), z.number().finite().positive()]);
export const preparePurchaseArgs = z.strictObject({
  amount_usdc: amountArg.optional().describe("USDC amount; only with pay_token USDC (the default). Give either amount_usdc or amount."),
  amount: amountArg.optional().describe("Amount in pay_token units (for example 0.02 SOL or 100 SKR). Give either amount or amount_usdc."),
  pay_token: z.string().max(16).optional().describe("Token to pay with; default USDC.").meta({ enum: [...PREPARE_PURCHASE_PAY_TOKENS] }),
  ticker: z.string().max(16).optional().describe("Registry ticker of the xStock to buy; default NVDA. Only the listed tickers have a fixed route.").meta({ enum: [...PREPARE_PURCHASE_TICKERS] }),
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
  amount: preparePurchaseArgs.shape.amount.catch(() => INVALID_ARGUMENT as never),
  pay_token: preparePurchaseArgs.shape.pay_token.catch(() => INVALID_ARGUMENT as never),
  ticker: preparePurchaseArgs.shape.ticker.catch(() => INVALID_ARGUMENT as never),
  wallet_address: preparePurchaseArgs.shape.wallet_address.catch(() => INVALID_ARGUMENT as never),
}).catchall(z.unknown()).meta({ additionalProperties: false });

const failureReason = z.enum([
  "invalid_amount", "invalid_pay_token", "invalid_ticker", "over_limit", "invalid_wallet_address", "not_purchasable", "rate_limited", "service_busy", "service_unavailable",
]);

export const preparePurchaseOutput = z.strictObject({
  schema_version: z.literal(PREPARE_PURCHASE_SCHEMA_VERSION),
  data: z.union([
    z.strictObject({
      prepared: z.literal(true),
      product: z.strictObject({ ticker: z.string(), symbol: z.string(), mint: z.string(), name: z.string() }),
      pay_token: z.string(),
      amount_in: z.string(),
      amount_in_raw: z.string(),
      amount_usdc: z.string(),
      amount_raw: z.string(),
      max_amount_usdc: z.string(),
      route: z.strictObject({
        pool: z.string(), dex: z.string(),
        input_mint: z.string(), input_symbol: z.string(), input_decimals: z.number().int(),
        output_mint: z.string(), output_symbol: z.string(), output_decimals: z.number().int(),
      }),
      first_leg: z.strictObject({
        route: z.strictObject({
          pool: z.string(), dex: z.string(),
          input_mint: z.string(), input_symbol: z.string(), input_decimals: z.number().int(),
          output_mint: z.string(), output_symbol: z.string(), output_decimals: z.number().int(),
        }),
        quote: z.strictObject({
          consumed_input_raw: z.string(),
          usdc_output_raw: z.string(),
          usdc_minimum_output_raw: z.string(),
          fee_raw: z.string(),
          protocol_fee_raw: z.string(),
          fee_on_input: z.boolean(),
          price_impact_pct: z.string(),
        }),
      }).nullable(),
      quote: z.strictObject({
        consumed_input_raw: z.string(),
        output_raw: z.string(),
        minimum_output_raw: z.string(),
        output_basis: z.literal("raw_token_units_before_display_multiplier"),
        /** The Token-2022 Scaled UI multiplier in effect at the quote, and the output and minimum output in display units at it; `null` when not read. */
        display_multiplier: z.string().nullable(),
        output_display: z.string().nullable(),
        minimum_output_display: z.string().nullable(),
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
  invalid_pay_token: "invalid_pay_token",
  not_purchasable: "not_purchasable",
  over_limit: "over_limit",
  busy: "service_busy",
  route_check: "service_unavailable",
  upstream_unavailable: "service_unavailable",
};

/** The buy flow of a product page: `/stock/<ticker>/buy` (public Web routes). */
export function buyFlowPath(ticker: string): string {
  return `/stock/${encodeURIComponent(ticker)}/buy`;
}

interface CheckedArgs {
  amountText: string;
  /** Exactly as given (the reader matches it exactly), or omitted for the default. */
  payToken: string | undefined;
  /** As given, or omitted for the default product; resolved through the registry before the reader sees it. */
  ticker: string | undefined;
  walletAddress: string | null;
}

/**
 * Check the tool arguments against `preparePurchaseArgs`. A wallet address
 * that does not match answers `invalid_wallet_address`, a ticker that is not
 * a short string `invalid_ticker`, then a pay token that is not a short
 * string `invalid_pay_token`; any other mismatch (a missing,
 * mistyped or doubled amount, `amount_usdc` with a pay token other than USDC,
 * an unknown argument) answers `invalid_amount`.
 */
function checkedArgs(args: unknown): CheckedArgs | FailureReason {
  const checked = preparePurchaseArgs.safeParse(args);
  if (!checked.success) {
    const fields = new Set(checked.error.issues.map((issue) => issue.path[0]));
    if (fields.has("wallet_address")) return "invalid_wallet_address";
    if (fields.has("ticker")) return "invalid_ticker";
    return fields.has("pay_token") ? "invalid_pay_token" : "invalid_amount";
  }
  const { amount_usdc: amountUsdc, amount, pay_token: payToken, ticker, wallet_address: walletAddress } = checked.data;
  if ((amountUsdc === undefined) === (amount === undefined)) return "invalid_amount";
  if (amountUsdc !== undefined && payToken !== undefined && payToken !== DEFAULT_PAY_TOKEN) {
    // `amount_usdc` is a USDC amount; an unknown token is still reported as such.
    return (PREPARE_PURCHASE_PAY_TOKENS as readonly string[]).includes(payToken) ? "invalid_amount" : "invalid_pay_token";
  }
  return { amountText: amountText((amountUsdc ?? amount)!), payToken, ticker, walletAddress: walletAddress ?? null };
}

type ReaderLeg = NonNullable<Extract<PurchaseQuoteResult, { ok: true }>["first_leg"]>;

function firstLegOutput(leg: ReaderLeg) {
  return {
    route: leg.route,
    quote: {
      consumed_input_raw: leg.quote.consumedInputRaw,
      usdc_output_raw: leg.quote.outputRaw,
      usdc_minimum_output_raw: leg.quote.minimumOutputRaw,
      fee_raw: leg.quote.feeRaw,
      protocol_fee_raw: leg.quote.protocolFeeRaw,
      fee_on_input: leg.quote.feeOnInput,
      price_impact_pct: leg.quote.priceImpactPct,
    },
  };
}

export async function preparePurchase(args: unknown, capability: PreparePurchaseCapability): Promise<PreparePurchaseResult> {
  if (capability.admit && !capability.admit()) return preparePurchaseFailure("rate_limited", true);
  const input = checkedArgs(args);
  if (typeof input === "string") return preparePurchaseFailure(input);
  const { walletAddress } = input;
  if (walletAddress !== null && !isValidSolanaAddress(walletAddress)) return preparePurchaseFailure("invalid_wallet_address");
  // The product is named only through the registry allowlist; the reader then matches the canonical ticker against its routes.
  const requested = resolveTicker(input.ticker ?? DEFAULT_PURCHASE_TICKER);
  if (!requested) return preparePurchaseFailure("invalid_ticker");
  let answer: PurchaseQuoteResult;
  try {
    const raw = input.ticker === undefined
      ? (input.payToken === undefined ? capability.quote(input.amountText) : capability.quote(input.amountText, input.payToken))
      : capability.quote(input.amountText, input.payToken, requested.ticker);
    answer = purchaseQuoteResultSchema.parse(await raw);
  } catch {
    return preparePurchaseFailure("service_unavailable", true);
  }
  if (!answer.ok) return preparePurchaseFailure(READER_FAILURE[answer.reason], answer.retryable, answer.max_amount_usdc);
  // The answer must be for the requested pay token, with the first leg exactly when it is not USDC.
  const payToken = answer.pay_token ?? DEFAULT_PAY_TOKEN;
  const firstLeg = answer.first_leg ?? null;
  if (payToken !== (input.payToken ?? DEFAULT_PAY_TOKEN) || (payToken === DEFAULT_PAY_TOKEN) !== (firstLeg === null)) {
    return preparePurchaseFailure("service_unavailable", true);
  }
  // The link names a product only through the registry allowlist; an unknown mint is not purchasable here.
  const product = resolveMint(answer.route.output_mint);
  if (!product || product.mint !== answer.route.output_mint) return preparePurchaseFailure("not_purchasable");
  // The answer must be for the requested product.
  if (product.ticker !== requested.ticker || product.mint !== requested.mint) return preparePurchaseFailure("service_unavailable", true);
  const path = `${buyFlowPath(product.ticker)}${answer.buy_query}`;
  return envelope({
    prepared: true,
    product: { ticker: product.ticker, symbol: product.symbol, mint: product.mint, name: product.name },
    pay_token: payToken,
    amount_in: answer.amount_in ?? answer.amount_usdc,
    amount_in_raw: answer.amount_in_raw ?? answer.amount_raw,
    amount_usdc: answer.amount_usdc,
    amount_raw: answer.amount_raw,
    max_amount_usdc: answer.max_amount_usdc,
    route: answer.route,
    first_leg: firstLeg === null ? null : firstLegOutput(firstLeg),
    quote: {
      consumed_input_raw: answer.quote.consumedInputRaw,
      output_raw: answer.quote.outputRaw,
      minimum_output_raw: answer.quote.minimumOutputRaw,
      output_basis: "raw_token_units_before_display_multiplier",
      display_multiplier: answer.product_display?.multiplier ?? null,
      output_display: answer.product_display?.output ?? null,
      minimum_output_display: answer.product_display?.minimum_output ?? null,
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
