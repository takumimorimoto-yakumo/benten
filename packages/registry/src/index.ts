import xstocksData from "./xstocks.json" with { type: "json" };
import type { XStockEntry } from "./types.js";
import { productXStockEntries, resolveTicker } from "./registry-lookup.js";

export type { XStockEntry, ExclusionReason } from "./types.js";
export {
  isWithheldFromProduct,
  normalizeTickerIdentifier,
  productXStockEntries,
  resolveMint,
  resolveTicker,
} from "./registry-lookup.js";
export {
  FINANCIAL_STATEMENT_FIELDS,
  FUNDAMENTALS_FIELDS,
  STATEMENT_NAMES,
  isStatementName,
  projectFields,
} from "./public-financial-fields.js";
export type { FundamentalsField, StatementName } from "./public-financial-fields.js";
export {
  getFinancialsSnapshot,
  getFundamentalsSnapshot,
  isValidSnapshotAsOf,
  validateFinancialsSnapshot,
} from "./financials-snapshot.js";
export type { FinancialsSnapshotRecord, SnapshotRecord } from "./financials-snapshot.js";
export { isValidLegacySnapshotAsOf, validateLegacyFinancialsSnapshot } from "./legacy-validation.js";
export type { LegacyFinancialsSnapshot } from "./legacy-validation.js";
export { resolveFinancialRequest } from "./financial-request.js";
export type {
  FinancialRequestOptions,
  FinancialRequestResolution,
  RequestedAssetIdentifier,
} from "./financial-request.js";
export {
  ARTIFACT_REVISION,
  REGISTRY_AS_OF,
  REGISTRY_SOURCE_URL,
  RELEASE_PROFILE,
  getAssetIdentity,
  getCoverageState,
  getLegacyFundamentals,
  getLegacyStatements,
  getLegacyStatementsAsOf,
  getVerifiedFundamentals,
  getVerifiedStatements,
  resolveAssetIdentifier,
  ANNUAL_FIRST_FISCAL_YEAR,
  validateSnapshotManifest,
  validateVerifiedAnnualHistory,
  validateVerifiedStatementHistories,
  validateVerifiedOverlay,
} from "./public-data-v2.js";
export type {
  AssetIdentifierInput,
  AssetIdentity,
  CoverageState,
  LegacyBsField,
  LegacyCfField,
  LegacyFundamentalsField,
  LegacyPlField,
  LegacyScalar,
  LegacySnapshotBlock,
  ReleaseProfile,
} from "./public-data-v2.js";
export type {
  FilingSource,
  SnapshotManifestV2,
  VerifiedFactName,
  VerifiedFactSet,
  VerifiedOverlayRecord,
  VerifiedOverlayV2,
  VerifiedPeriod,
  VerifiedReportedFact,
} from "./artifact-validation.js";
export { listPublicAssets, readPublicFinancials, readPublicFundamentals } from "./public-read-model.js";
export {
  annualHistoryBlock,
  getAnnualFactSeries,
  getAnnualHistory,
  parseAnnualYearRange,
} from "./annual-history-read-model.js";
export type {
  AnnualFactPoint,
  AnnualFactStatus,
  AnnualHistoryBlock,
  AnnualRestatementPoint,
  AnnualSeriesOptions,
  AnnualYearRange,
  AnnualYearRead,
} from "./annual-history-read-model.js";
export {
  getStatementRows,
  getStatementSeries,
  statementHistoryBlock,
  statementHistoryHasYears,
} from "./statement-history-read-model.js";
export type {
  CalculatedInputRef,
  CalculatedStatementCell,
  ReportedStatementCell,
  StatementCell,
  StatementCellUnit,
  StatementFilingRef,
  StatementHistoryBlock,
  StatementReportedStatus,
  StatementReportedUnit,
  StatementRowDefinition,
  StatementSeries,
  StatementYearColumn,
} from "./statement-history-read-model.js";
export { STATEMENT_DETAIL_NAMES } from "./statement-history-validation.js";
export type { StatementDetailName } from "./statement-history-validation.js";
export {
  ANNUAL_FACT_NAMES,
  ANNUAL_FACT_STATEMENT,
  fiscalYearForPeriodEnd,
} from "./annual-history-validation.js";
export type {
  AnnualExclusionReason,
  AnnualFilingSource,
  AnnualForm,
  AnnualProvenance,
  UnverifiedReason,
  VerifiedAnnualHistoryV1,
} from "./annual-history-validation.js";
export type { CatalogReadResult, FinancialsReadResult, FundamentalsReadResult, PublicReadError } from "./public-read-model.js";
export {
  findProviderAsset,
  listProviderAssets,
  providerAssets,
  providerAssetsManifest,
} from "./provider-read-model.js";
export type {
  ListProviderAssetsInput,
  ProviderAssetEntryV1,
  ProviderAssetsArtifactV1,
  ProviderAssetsManifestV1,
  ProviderCatalogReadResult,
  ProviderName,
  ProviderReadError,
  ProviderReadErrorReason,
} from "./provider-read-model.js";
export {
  companyForProviderAsset,
  companyForXStock,
  companyMap,
  findCompany,
  listCompanies,
  listedCompanyMap,
} from "./company-read-model.js";
export type {
  CompanyExclusionReason,
  CompanyInstrument,
  CompanyListItem,
  CompanyListingStatus,
  CompanyMapReview,
  ListCompaniesInput,
  ListedCompanyDisplayNameBasis,
  ListedCompanyExclusionReason,
  ListedCompanyExclusionV1,
  ListedCompanyInstrumentV1,
  ListedCompanyMapV1,
  ListedCompanyV1,
  CompanyMapCompanyV1,
  CompanyMapExclusionV1,
  CompanyMapInstrumentV1,
  CompanyMapIssuerProductCheckV1,
  CompanyMapV1,
  CompanyRecord,
  CompanyReference,
  CompanySlug,
} from "./company-read-model.js";
export type {
  ProviderAssetKind,
  ProviderEvidenceState,
  ProviderReferenceKind,
  ProviderReferenceV1,
  ProviderRightsV1,
  ProviderSourceV1,
  ProviderSupplyReferenceV1,
  ProviderUnknownBlock,
  ProviderUnknownCode,
  ProviderUnknownV1,
} from "./provider-assets-validation.js";

/**
 * Full xStocks registry (154 tokens): universe membership + fundamentals coverage.
 * This is registry data, not a product list: it still holds the rows that
 * `isWithheldFromProduct` withholds. Product surfaces use `productXStocks`.
 */
export const xstocks: XStockEntry[] = xstocksData as XStockEntry[];

/** Registry rows a product surface may list (152): the registry minus withheld rows. */
export const productXStocks: readonly XStockEntry[] = productXStockEntries;

/** Tokens eligible for SEC-derived financial snapshot coverage (128). */
export const coveredXStocks: XStockEntry[] = xstocks.filter((e) => e.fundamentals_available);

/** Tokens structurally ineligible for SEC-derived coverage (25), with exclusion reasons. */
export const excludedXStocks: XStockEntry[] = xstocks.filter((e) => !e.fundamentals_available);

/** Look up a registry entry by underlying equity ticker (e.g. "NVDA"); registry data, not the product allowlist. */
export function findByTicker(ticker: string): XStockEntry | undefined {
  return xstocks.find((e) => e.ticker === ticker);
}

/** Look up a registry entry by Solana mint address; registry data, not the product allowlist. */
export function findByMint(mint: string): XStockEntry | undefined {
  return xstocks.find((e) => e.mint === mint);
}

/**
 * Allowlist guard layer.
 *
 * These functions are the only sanctioned way for downstream packages
 * to turn untrusted user input into a registry
 * entry. They perform strict equality lookups only (no partial match,
 * no prefix match, no regex) so that inputs containing SQL/PostgREST
 * metacharacters (e.g. `NVDA' OR '1'='1`, `NVDA,eq.x`) can never resolve
 * to a valid entry and therefore never reach a downstream query.
 */

/** Whether the given input resolves to a known ticker in the registry. */
export function isKnownTicker(input: string): boolean {
  return resolveTicker(input) !== null;
}
