import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import {
  FINANCIAL_STATEMENT_FIELDS,
  FUNDAMENTALS_FIELDS,
} from "@benten/registry";
import {
  getFinancialsV2,
  getFundamentalsV2,
  getWalletHoldingsV2,
  listXstocksV2,
  requestedRange,
  serviceUnavailable,
  type ToolPresentation,
} from "./lib/public-v2.js";
import {
  listProviderAssetsV2,
  providerServiceUnavailable,
  type ProviderAssetsResult,
} from "./lib/provider-assets.js";
import {
  ONCHAIN_PRICES_NOTE,
  ONCHAIN_PRICES_SCHEMA_VERSION,
  ONCHAIN_PRICES_SOURCE,
  getOnchainPriceHistory,
  onchainPricesServiceUnavailable,
  type OnchainPricesResult,
} from "./lib/onchain-prices.js";
import { UNAVAILABLE_REASONS } from "@benten/pricing/onchain-daily";
import {
  preparePurchase,
  preparePurchaseFailure,
  preparePurchaseInput,
  preparePurchaseOutput,
  type PreparePurchaseCapability,
  type PreparePurchaseResult,
} from "./tools/prepare-purchase.js";

const exclusionReason = z.enum(["etf", "non_sec_listing", "private", "preferred"]);
const fiscalYear = z.number().int().min(1900).max(3000);
const identifier = z.strictObject({
  ticker: z.string().optional(),
  mint: z.string().optional(),
  fiscal_year_from: fiscalYear.optional(),
  fiscal_year_to: fiscalYear.optional(),
});
const listInput = z.strictObject({
  covered_only: z.boolean().optional(),
  exclusion_reason: exclusionReason.optional(),
  ticker: z.string().optional(),
  mint: z.string().optional(),
});
const financialInput = z.strictObject({
  ticker: z.string().optional(),
  mint: z.string().optional(),
  statement: z.string().optional(),
  fiscal_year_from: fiscalYear.optional(),
  fiscal_year_to: fiscalYear.optional(),
});
const walletInput = z.strictObject({
  address: z.string(),
});
const onchainPricesInput = z.strictObject({
  ticker: z.string().optional(),
  mint: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});
const providerAssetsInput = z.strictObject({
  provider: z.enum(["prestocks"]).optional(),
  provider_asset_id: z.string().optional(),
  mint_or_contract: z.string().optional(),
});

const identity = z.strictObject({
  symbol: z.string(),
  ticker: z.string(),
  token_name: z.string(),
  underlying_company: z.string().nullable(),
  underlying_company_source_ref: z.string().nullable(),
  mint: z.string(),
  issuer: z.string(),
  issuer_verified: z.boolean(),
  token_program: z.enum(["spl-token", "token-2022", "unknown"]),
  registry_as_of: z.string(),
  registry_source_url: z.string(),
});
const coverage = z.strictObject({
  filing_eligibility: z.enum(["eligible", "not_eligible"]),
  snapshot_status: z.enum(["available", "no_data"]),
  source_status: z.enum(["source_verified", "legacy_snapshot", "not_applicable"]),
  capabilities: z.strictObject({
    fundamentals: z.enum(["available", "no_data"]),
    pl: z.enum(["available", "no_data"]),
    bs: z.enum(["available", "no_data"]),
    cf: z.enum(["available", "no_data"]),
  }),
  exclusion_reason: exclusionReason.nullable(),
});
const period = z.strictObject({
  period_ref: z.string(),
  fiscal_year: z.number().int(),
  fiscal_month: z.number().int(),
  period_kind: z.literal("FY"),
  fact_period_type: z.enum(["duration", "instant"]),
  period_start: z.string().nullable(),
  period_end: z.string(),
});
const filingSource = z.strictObject({
  source_ref: z.string(),
  form: z.string(),
  accession_number: z.string(),
  filed_at: z.string(),
  filing_url: z.string(),
  source_authority: z.literal("SEC EDGAR"),
});
const verifiedFact = z.strictObject({
  kind: z.literal("verified_reported"),
  value: z.number().int(),
  currency: z.string(),
  unit: z.literal("currency"),
  scale: z.number(),
  period_ref: z.string(),
  source_ref: z.string(),
  source_concept: z.string(),
});
const verifiedSet = z.strictObject({
  kind: z.literal("source_verified"),
  periods: z.record(z.string(), period),
  source_refs: z.record(z.string(), filingSource),
  facts: z.strictObject({
    revenue: verifiedFact.optional(),
    net_income_parent: verifiedFact.optional(),
    total_assets: verifiedFact.optional(),
    total_liabilities: verifiedFact.optional(),
    operating_cf: verifiedFact.optional(),
  }),
});
const annualPoint = z.strictObject({
  fiscal_year: z.number().int(),
  fiscal_month: z.number().int(),
  period_start: z.string().nullable(),
  period_end: z.string(),
  metric: z.enum(["revenue", "net_income_parent", "total_assets", "total_liabilities", "operating_cf"]),
  statement: z.enum(["pl", "bs", "cf"]),
  value: z.number().int(),
  unit: z.literal("USD"),
  scale: z.literal(1),
  status: z.enum(["verified_reported", "unverified_or_derived"]),
  source_concept: z.string().nullable(),
  provenance: z.enum(["annual_report", "restated_in_later_report", "reported_in_later_report"]).nullable(),
  reason: z.string().nullable(),
  accession: z.string(),
  form: z.enum(["10-K", "20-F", "40-F"]),
  filed: z.string(),
  filing_url: z.string(),
  restatement: z.strictObject({
    original_value: z.number().int(),
    original_source_concept: z.string(),
    original_accession: z.string(),
    original_filed: z.string(),
    original_filing_url: z.string(),
  }).nullable(),
});
const annualHistory = z.strictObject({
  first_fiscal_year: z.number().int(),
  fiscal_year_from: z.number().int().nullable(),
  fiscal_year_to: z.number().int().nullable(),
  points: z.array(annualPoint),
});
const statementName = z.enum(["pl", "bs", "cf", "per_share"]);
const reportedStatus = z.enum(["verified_reported", "unverified_or_derived"]);
const statementRow = z.strictObject({
  item: z.string(),
  label: z.string(),
  statement: statementName,
  kind: z.enum(["reported", "calculated"]),
  unit: z.enum(["USD", "USD_per_share", "shares", "ratio"]),
  period_type: z.enum(["duration", "instant", "cover_instant"]).nullable(),
  formula: z.string().nullable(),
  inputs: z.tuple([z.string(), z.string()]).nullable(),
});
const reportedCell = z.strictObject({
  item: z.string(),
  kind: z.literal("reported"),
  status: reportedStatus,
  value: z.number(),
  unit: z.enum(["USD", "USD_per_share", "shares"]),
  period_start: z.string().nullable(),
  period_end: z.string(),
  as_of: z.string().nullable(),
  source_concept: z.string().nullable(),
  provenance: z.enum(["annual_report", "restated_in_later_report", "reported_in_later_report"]).nullable(),
  reason: z.string().nullable(),
  filing: z.strictObject({
    accession: z.string(),
    form: z.enum(["10-K", "20-F", "40-F"]),
    filed: z.string(),
    filing_url: z.string(),
  }),
  restatement: z.strictObject({
    original_value: z.number(),
    original_source_concept: z.string(),
    original_accession: z.string(),
    original_filed: z.string(),
    original_filing_url: z.string(),
  }).nullable(),
});
const calculatedInput = z.strictObject({
  item: z.string(),
  value: z.number(),
  status: reportedStatus,
  accession: z.string(),
  filing_url: z.string(),
});
const calculatedCell = z.strictObject({
  item: z.string(),
  kind: z.literal("calculated"),
  status: z.literal("calculated"),
  input_status: reportedStatus,
  value: z.number(),
  unit: z.enum(["USD", "ratio"]),
  period_start: z.string().nullable(),
  period_end: z.string(),
  formula: z.string(),
  inputs: z.tuple([calculatedInput, calculatedInput]),
});
const statementTable = z.strictObject({
  rows: z.array(statementRow),
  years: z.array(z.strictObject({
    fiscal_year: z.number().int(),
    fiscal_month: z.number().int(),
    period_start: z.string().nullable(),
    period_end: z.string(),
    annual_report: filingSource.nullable(),
    cells: z.record(z.string(), z.union([reportedCell, calculatedCell])),
    excluded: z.record(z.string(), z.enum(["not_in_source", "unsafe_value", "no_annual_report_to_cite"])),
  })),
});
const statementHistory = z.strictObject({
  first_fiscal_year: z.number().int(),
  fiscal_year_from: z.number().int().nullable(),
  fiscal_year_to: z.number().int().nullable(),
  statements: z.strictObject({
    pl: statementTable.optional(),
    bs: statementTable.optional(),
    cf: statementTable.optional(),
    per_share: statementTable.optional(),
  }),
});
const legacyScalar = z.union([z.string(), z.number(), z.null()]);
const strictValues = (keys: readonly string[]) => z.strictObject(
  Object.fromEntries(keys.map((key) => [key, legacyScalar])),
);
const legacySet = (keys: readonly string[]) => z.strictObject({
  kind: z.literal("legacy_snapshot"),
  legacy_as_of: z.string(),
  observed_period: z.strictObject({
    fiscal_year: z.number().int().nullable(),
    fiscal_month: z.number().int().nullable(),
    period_kind: z.literal("FY").nullable(),
    period_start: z.null(),
    period_end: z.null(),
  }),
  currency: z.null(),
  unit: z.null(),
  fact_kind: z.literal("unknown"),
  source_refs: z.tuple([]),
  values: strictValues(keys),
});
const publicError = z.strictObject({
  found: z.literal(false),
  reason: z.enum(["invalid_input", "unknown_ticker", "unknown_mint", "not_eligible", "no_data", "invalid_statement", "service_unavailable"]),
  requested_identifier: z.string().nullable(),
  identity: identity.nullable(),
  coverage: coverage.nullable(),
  retryable: z.boolean(),
});
const statementResult = (legacyFields: readonly string[]) => z.strictObject({
  availability: z.enum(["available", "no_data"]),
  verified_facts: verifiedSet.nullable(),
  legacy_snapshot: legacySet(legacyFields).nullable(),
});
const baseOutput = <T extends z.ZodTypeAny>(data: T) => z.strictObject({
  schema_version: z.literal("2.0"),
  artifact_revision: z.string(),
  release_profile: z.enum(["mint_core", "wallet_enhanced"]),
  data,
  disclaimer: z.literal("Factual data only. Not investment advice, a recommendation, or a valuation."),
});
const listOutput = baseOutput(z.union([
  z.strictObject({ found: z.literal(true), items: z.array(z.strictObject({ identity, coverage })) }),
  publicError,
]));
const fundamentalsOutput = baseOutput(z.union([
  z.strictObject({
    found: z.literal(true), identity, coverage,
    verified_facts: verifiedSet.nullable(), legacy_snapshot: legacySet(FUNDAMENTALS_FIELDS).nullable(),
    annual_history: annualHistory.optional(),
  }),
  publicError,
]));
const financialsOutput = baseOutput(z.union([
  z.strictObject({
    found: z.literal(true), identity, coverage,
    statements: z.strictObject({
      pl: statementResult(FINANCIAL_STATEMENT_FIELDS.pl).optional(),
      bs: statementResult(FINANCIAL_STATEMENT_FIELDS.bs).optional(),
      cf: statementResult(FINANCIAL_STATEMENT_FIELDS.cf).optional(),
    }),
    annual_history: annualHistory.optional(),
    statement_history: statementHistory.optional(),
  }),
  publicError,
]));
const walletOutput = baseOutput(z.union([
  z.strictObject({
    available: z.literal(false),
    reason: z.literal("wallet_correctness_unverified"),
    retryable: z.literal(false),
    release_profile: z.literal("mint_core"),
  }),
  z.strictObject({
    available: z.literal(true),
    owner: z.string(),
    slot: z.number().int(),
    commitment: z.literal("confirmed"),
    holdings: z.array(z.strictObject({
      identity,
      raw_amount: z.string(),
      decimals: z.number().int(),
      display_amount: z.string(),
      display_basis: z.enum(["rpc_scaled", "computed_scaled", "unscaled"]),
      multiplier: z.string().nullable(),
      multiplier_effective_at: z.string().nullable(),
    })),
  }),
  publicError,
]));

const providerReference = z.strictObject({
  kind: z.enum([
    "prestock_mark_reference",
    "prestock_token_reference",
    "prestock_implied_valuation_reference",
  ]),
  value: z.string(),
  currency: z.string().nullable(),
  provider_reported_as_of: z.string().nullable(),
});
const providerAssetEntry = z.strictObject({
  provider: z.enum(["prestocks"]),
  provider_asset_id: z.string(),
  asset_kind: z.enum(["prestock_provider_instrument"]),
  symbol: z.string(),
  display_name: z.string(),
  mint_or_contract: z.string(),
  evidence_state: z.enum(["candidate_unverified", "verified_reference"]),
  company_binding: z.strictObject({
    company_id: z.string(),
    company_name: z.string(),
    binding_status: z.enum(["public_source_verified", "provider_claim_only", "unknown"]),
    evidence_refs: z.array(z.string()),
  }),
  rights: z.strictObject({
    status: z.enum(["public_source_verified", "provider_terms_observed", "provider_claim_only", "unknown"]),
    instrument_kind: z.enum([
      "tracker_certificate", "economic_exposure_instrument", "unknown",
    ]),
    equity_ownership: z.union([z.literal(false), z.literal("unknown")]),
    voting_rights: z.union([z.literal(false), z.literal("unknown")]),
    redemption_kind: z.enum(["provider_terms", "conditional", "none", "unknown"]),
    restrictions: z.array(z.string()),
    evidence_refs: z.array(z.string()),
    provider_statement: z.string(),
    terms_url: z.string().optional(),
  }),
  references: z.array(providerReference),
  supply_reference: z.strictObject({
    value: z.string(),
    basis: z.literal("provider_reported_supply"),
    provider_reported_as_of: z.string().nullable(),
  }).optional(),
  external_url: z.string(),
  source_digest: z.string(),
  unknowns: z.array(z.strictObject({
    code: z.enum([
      "source_as_of_unknown", "currency_unknown", "rights_unknown", "company_binding_unknown",
      "chain_identity_unknown", "provider_catalog_mismatch", "redistribution_pending",
      "execution_quote_unavailable", "asset_not_found",
    ]),
    blocks: z.array(z.enum(["display", "comparison", "release"])),
  })),
  not_quote: z.literal(true),
  not_authorization: z.literal(true),
});
const providerAssetsOutput = z.strictObject({
  schema_version: z.literal("provider-assets.v1"),
  artifact: z.strictObject({ revision: z.string(), fetched_at: z.string() }),
  data: z.union([
    z.strictObject({ found: z.literal(true), items: z.array(providerAssetEntry) }),
    z.strictObject({
      found: z.literal(false),
      reason: z.enum(["invalid_input", "asset_not_found", "service_unavailable"]),
      requested_identifier: z.string().nullable(),
      retryable: z.boolean(),
    }),
  ]),
  not_quote: z.literal(true),
  disclaimer: z.literal("Factual data only. Not investment advice, a recommendation, or a valuation."),
});

const onchainPoint = z.strictObject({
  date: z.string(),
  session_close_utc: z.string(),
  status: z.enum(["observed", "unavailable"]),
  usdc_per_unscaled_token: z.string().nullable(),
  usdc_per_underlying_share: z.string().nullable(),
  reason: z.enum(UNAVAILABLE_REASONS).nullable(),
  source: z.strictObject({
    signature: z.string(),
    pool: z.string(),
    slot: z.number().int(),
    block_time: z.string(),
    usdc_raw: z.string(),
    xstock_raw: z.string(),
  }).nullable(),
});
const onchainPricesOutput = z.strictObject({
  schema_version: z.literal(ONCHAIN_PRICES_SCHEMA_VERSION),
  artifact: z.strictObject({ revision: z.string(), generated_at: z.string() }),
  data: z.union([
    z.strictObject({
      found: z.literal(true),
      identity: z.strictObject({ ticker: z.string(), symbol: z.string(), mint: z.string() }),
      pool: z.strictObject({ address: z.string(), dex: z.string(), program: z.string() }),
      period: z.strictObject({
        from: z.string().nullable(),
        to: z.string().nullable(),
        series_first_date: z.string(),
        series_last_date: z.string(),
      }),
      price_basis: z.strictObject({
        canonical: z.literal("usdc_per_unscaled_token"),
        canonical_statement: z.string(),
        per_share: z.literal("usdc_per_underlying_share"),
        per_share_statement: z.string(),
        multiplier_known_from: z.string().nullable(),
        known_multiplier: z.string().nullable(),
        session_close: z.string(),
      }),
      coverage: z.strictObject({ sessions: z.number().int(), observed: z.number().int(), unavailable: z.number().int() }),
      points: z.array(onchainPoint),
    }),
    z.strictObject({
      found: z.literal(false),
      reason: z.enum(["invalid_input", "unknown_ticker", "unknown_mint", "not_covered", "service_unavailable"]),
      requested_identifier: z.string().nullable(),
      covered_tickers: z.array(z.string()),
      retryable: z.boolean(),
    }),
  ]),
  source: z.literal(ONCHAIN_PRICES_SOURCE),
  note: z.literal(ONCHAIN_PRICES_NOTE),
  not_quote: z.literal(true),
  disclaimer: z.literal("Factual data only. Not investment advice, a recommendation, or a valuation."),
});

function asToolResult(presentation: ToolPresentation, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(presentation.text) }],
    structuredContent: presentation.structured,
    ...(isError ? { isError: true } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function expandedFacts(factSet: unknown): unknown[] {
  if (factSet === null || factSet === undefined) return [];
  if (!isRecord(factSet) || !isRecord(factSet.facts)
      || !isRecord(factSet.periods) || !isRecord(factSet.source_refs)) {
    throw new TypeError("Invalid verified fact set in structured result");
  }
  return Object.entries(factSet.facts).map(([name, fact]) => {
    if (!isRecord(fact)
        || typeof fact.period_ref !== "string" || !Object.hasOwn(factSet.periods, fact.period_ref)
        || typeof fact.source_ref !== "string" || !Object.hasOwn(factSet.source_refs, fact.source_ref)) {
      throw new TypeError("Unresolved verified fact reference in structured result");
    }
    return {
      name,
      value: fact.value,
      currency: fact.currency,
      unit: fact.unit,
      scale: fact.scale,
      source_concept: fact.source_concept,
      period: factSet.periods[fact.period_ref],
      source: factSet.source_refs[fact.source_ref],
    };
  });
}

/** Guard the semantic fields that MCP outputSchema cannot compare across surfaces. */
export function validateToolPresentation(presentation: ToolPresentation): void {
  if (!isRecord(presentation.structured) || !isRecord(presentation.text)) {
    throw new TypeError("Invalid tool presentation");
  }
  // This is also the serialization gate for cycles, BigInt, and custom invalid values.
  JSON.stringify(presentation.structured);
  JSON.stringify(presentation.text);
  const metadata = presentation.text._benten_v2;
  const data = presentation.structured.data;
  if (!isRecord(metadata) || !isRecord(data)
      || metadata.artifact_revision !== presentation.structured.artifact_revision
      || metadata.release_profile !== presentation.structured.release_profile) {
    throw new TypeError("Tool presentation revision mismatch");
  }
  if (Object.hasOwn(data, "identity") && !isDeepStrictEqual(metadata.identity, data.identity)) {
    throw new TypeError("Tool presentation identity mismatch");
  }
  if (Object.hasOwn(data, "coverage") && !isDeepStrictEqual(metadata.coverage, data.coverage)) {
    throw new TypeError("Tool presentation coverage mismatch");
  }
  if (!isRecord(metadata.verified_subset) || !isRecord(metadata.verified_subset.statements)) {
    throw new TypeError("Tool presentation verified subset is missing");
  }
  const expectedFundamentals = Object.hasOwn(data, "verified_facts")
    ? expandedFacts(data.verified_facts)
    : [];
  const expectedStatements: Record<string, unknown[]> = { pl: [], bs: [], cf: [] };
  if (isRecord(data.statements)) {
    for (const name of ["pl", "bs", "cf"] as const) {
      const statement = data.statements[name];
      if (isRecord(statement)) expectedStatements[name] = expandedFacts(statement.verified_facts);
    }
  }
  if (!isDeepStrictEqual(metadata.verified_subset.fundamentals, expectedFundamentals)
      || !isDeepStrictEqual(metadata.verified_subset.statements, expectedStatements)) {
    throw new TypeError("Tool presentation verified subset mismatch");
  }
  // The multi-year block is copied, never re-summarized: both surfaces carry it or neither does.
  if (Object.hasOwn(data, "annual_history") !== Object.hasOwn(metadata, "annual_history")
      || (Object.hasOwn(data, "annual_history") && !isDeepStrictEqual(metadata.annual_history, data.annual_history))) {
    throw new TypeError("Tool presentation annual history mismatch");
  }
  if (Object.hasOwn(data, "annual_history")) {
    const points = (data.annual_history as { points?: unknown }).points;
    if (!Array.isArray(points) || points.some((point) => !isRecord(point)
        || typeof point.accession !== "string" || typeof point.filing_url !== "string" || typeof point.filed !== "string")) {
      throw new TypeError("Annual history point without a filing source");
    }
  }
  if (Object.hasOwn(data, "statement_history") !== Object.hasOwn(metadata, "statement_history")
      || (Object.hasOwn(data, "statement_history") && !isDeepStrictEqual(metadata.statement_history, data.statement_history))) {
    throw new TypeError("Tool presentation statement history mismatch");
  }
  if (Object.hasOwn(data, "statement_history")) {
    const tables = (data.statement_history as { statements?: unknown }).statements;
    if (!isRecord(tables)) throw new TypeError("Statement history without statements");
    for (const table of Object.values(tables)) {
      if (!isRecord(table) || !Array.isArray(table.years)) throw new TypeError("Invalid statement history table");
      for (const year of table.years) {
        if (!isRecord(year) || !isRecord(year.cells)) throw new TypeError("Invalid statement history year");
        for (const cell of Object.values(year.cells)) {
          // Every reported cell names its filing; every calculated cell names the filings of its inputs.
          const cited = isRecord(cell) && (cell.kind === "reported"
            ? isRecord(cell.filing) && typeof cell.filing.filing_url === "string" && typeof cell.filing.accession === "string"
            : cell.kind === "calculated" && typeof cell.formula === "string" && Array.isArray(cell.inputs)
              && cell.inputs.length === 2 && cell.inputs.every((input: unknown) => isRecord(input) && typeof input.filing_url === "string"));
          if (!cited) throw new TypeError("Statement history cell without a filing source");
        }
      }
    }
  }
}

function toRange(args: { fiscal_year_from?: number; fiscal_year_to?: number }) {
  return requestedRange(args);
}

function toIdentifier(args: { ticker?: string; mint?: string }) {
  return {
    ...(args.ticker !== undefined ? { ticker: args.ticker } : {}),
    ...(args.mint !== undefined ? { mint: args.mint } : {}),
  };
}

/**
 * Static-artifact surfaces (provider assets, on-chain price series) carry
 * their own artifact identity rather than the xStocks snapshot revision, so
 * they do not share the v2 presentation guard. Their results must keep the
 * `not_quote` label; any failure returns the surface's own unavailable result.
 */
function safeStaticToolResult<T extends { [key: string]: unknown; not_quote: true }>(handler: () => T, fallback: () => T) {
  try {
    const result = handler();
    const text = JSON.stringify(result);
    if (result.not_quote !== true) throw new TypeError("Static artifact result dropped its not_quote label");
    return { content: [{ type: "text" as const, text }], structuredContent: result };
  } catch {
    const unavailable = fallback();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(unavailable) }],
      structuredContent: unavailable,
      isError: true,
    };
  }
}

export function safeProviderToolResult(handler: () => ProviderAssetsResult) {
  return safeStaticToolResult(handler, providerServiceUnavailable);
}

export function safeOnchainPricesToolResult(handler: () => OnchainPricesResult) {
  return safeStaticToolResult(handler, onchainPricesServiceUnavailable);
}

export async function safeToolResult(handler: () => ToolPresentation | Promise<ToolPresentation>) {
  try {
    const presentation = await handler();
    validateToolPresentation(presentation);
    return asToolResult(presentation);
  } catch {
    return asToolResult(serviceUnavailable(), true);
  }
}

/** Host-provided capabilities. The stdio server has none; the remote host adds the purchase quote reader. */
export interface ServerOptions {
  /** When present, `prepare_purchase` is registered and reads its quote through it. */
  readonly purchase?: PreparePurchaseCapability;
}

export const PREPARE_PURCHASE_DESCRIPTION =
  "Use only when the user explicitly asks to buy NVDAx (the NVIDIA xStock) with USDC; never suggest a purchase yourself. "
  + "Returns facts for that one fixed route: a current quote read from the pinned NVDAx/USDC pool for amount_usdc "
  + "(a decimal USDC amount above 0 and at most the per-transaction limit, 10 USDC), when the quote stops being current, "
  + "and purchase_url, a Benten buy page with the amount filled in. Benten does not sign or send anything: the user opens "
  + "the link, connects their own wallet, checks a fresh quote and approves in the wallet. This tool does not recommend, "
  + "evaluate or predict anything; relay its facts without advice. The issuer does not offer or sell NVDAx to US persons, "
  + "and transfers may only be made to non-US persons; Benten does not check eligibility.";

/** Every failure, including an invalid answer from the host reader, returns the tool's own unavailable result. */
export async function safePurchaseToolResult(handler: () => Promise<PreparePurchaseResult>) {
  let result: PreparePurchaseResult;
  let isError = false;
  try {
    result = preparePurchaseOutput.parse(await handler());
  } catch {
    result = preparePurchaseFailure("service_unavailable", true);
    isError = true;
  }
  if (!result.data.prepared) isError = true;
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
    structuredContent: result,
    ...(isError ? { isError: true } : {}),
  };
}

export function createServer(options: ServerOptions = {}): McpServer {
  const server = new McpServer({ name: "benten", version: "0.0.1" });
  server.registerTool("list_xstocks", {
    title: "List xStocks",
    description: "List or select xStocks identities and coverage from immutable public snapshots.",
    inputSchema: listInput,
    outputSchema: listOutput,
  }, async (args) => safeToolResult(() => listXstocksV2(args)));
  server.registerTool("get_fundamentals", {
    title: "Get fundamentals",
    description: "Resolve a ticker or Solana mint and return separated verified and legacy fundamentals. "
      + "Pass fiscal_year_from and/or fiscal_year_to (FY2016 onward) to add annual_history: one point per fiscal year "
      + "and metric, each with its period, status (verified_reported or unverified_or_derived) and SEC filing accession, date and URL.",
    inputSchema: identifier,
    outputSchema: fundamentalsOutput,
  }, async (args) => safeToolResult(() => getFundamentalsV2(toIdentifier(args), toRange(args))));
  server.registerTool("get_financials", {
    title: "Get financials",
    description: "Resolve a ticker or Solana mint and return PL, BS, or CF with explicit missing states. "
      + "Pass fiscal_year_from and/or fiscal_year_to (FY2016 onward) to add annual_history for the selected statements, "
      + "each point with its period, status and SEC filing accession, date and URL, and statement_history: "
      + "fiscal-year x line-item tables (PL, BS, CF, and per_share when no statement is selected) whose reported cells "
      + "carry status, XBRL concept and SEC filing, and whose calculated cells carry their formula and inputs.",
    inputSchema: financialInput,
    outputSchema: financialsOutput,
  }, async (args) => safeToolResult(() => getFinancialsV2({
    ...toIdentifier(args),
    ...(args.statement !== undefined ? { statement: args.statement } : {}),
  }, toRange(args))));
  server.registerTool("get_wallet_holdings", {
    title: "Get wallet holdings",
    description: "Report Profile A wallet correctness unavailability without making an RPC request.",
    inputSchema: walletInput,
    outputSchema: walletOutput,
  }, async ({ address }) => safeToolResult(() => getWalletHoldingsV2(address)));
  server.registerTool("list_provider_assets", {
    title: "List other-provider assets",
    description: "List PreStocks instruments from a reviewed static artifact. "
      + "Every value is a provider-reported reference and a provider rights claim, not a quote, "
      + "an executable price, a NAV, an audited company valuation or an authorization. "
      + "These are not xStocks and they are not interchangeable with an xStock of the same company.",
    inputSchema: providerAssetsInput,
    outputSchema: providerAssetsOutput,
  }, async (args) => safeProviderToolResult(() => listProviderAssetsV2(args)));
  server.registerTool("get_onchain_price_history", {
    title: "Get on-chain price history",
    description: "Return the daily series of executed xStock/USDC swap prices read from the Solana ledger: "
      + "for each NYSE session, the single swap in one reviewed pool nearest the session close, with its "
      + "transaction signature, pool, slot and block time, or the reason no swap is given. "
      + "Select by ticker or mint, optionally from/to (YYYY-MM-DD, inclusive). "
      + "These are executed trade prices, not quotes; per-share values appear only where the Scaled UI multiplier is known.",
    inputSchema: onchainPricesInput,
    outputSchema: onchainPricesOutput,
  }, async (args) => safeOnchainPricesToolResult(() => getOnchainPriceHistory({
    ...toIdentifier(args),
    ...(args.from !== undefined ? { from: args.from } : {}),
    ...(args.to !== undefined ? { to: args.to } : {}),
  })));
  const purchase = options.purchase;
  if (purchase) {
    server.registerTool("prepare_purchase", {
      title: "Prepare an NVDAx purchase",
      description: PREPARE_PURCHASE_DESCRIPTION,
      inputSchema: preparePurchaseInput,
      outputSchema: preparePurchaseOutput,
    }, async (args) => safePurchaseToolResult(() => preparePurchase(args, purchase)));
  }
  return server;
}
