/**
 * Static read model for non-xStocks provider assets.
 *
 * The artifact records what PreStocks publicly reports about its own
 * instruments. Every entry is a provider claim, never a quote, a valuation,
 * an audited NAV, an eligibility determination or an xStock. A shared
 * `company_id` permits side-by-side navigation only; it never establishes
 * fungibility, equivalent issuer, rights, redemption or price basis.
 */
import providerAssetsJson from "./provider-assets-v1.json" with { type: "json" };
import providerAssetsManifestJson from "./provider-assets-manifest.json" with { type: "json" };
import {
  validateProviderAssets,
  validateProviderAssetsManifest,
  type ProviderAssetEntryV1,
  type ProviderAssetsArtifactV1,
  type ProviderAssetsManifestV1,
  type ProviderName,
} from "./provider-assets-validation.js";

export type {
  ProviderAssetEntryV1,
  ProviderAssetsArtifactV1,
  ProviderAssetsManifestV1,
  ProviderName,
} from "./provider-assets-validation.js";

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

/** Fail closed at module load, exactly like the xStocks snapshot artifacts. */
export const providerAssets: ProviderAssetsArtifactV1 = deepFreeze(
  validateProviderAssets(providerAssetsJson),
);
export const providerAssetsManifest: ProviderAssetsManifestV1 = deepFreeze(
  validateProviderAssetsManifest(providerAssetsManifestJson, providerAssets),
);

export type ProviderReadErrorReason = "invalid_input" | "asset_not_found";

export interface ProviderReadError {
  found: false;
  reason: ProviderReadErrorReason;
  requested_identifier: string | null;
  retryable: false;
}

export type ProviderCatalogReadResult = ProviderReadError | {
  found: true;
  items: ProviderAssetEntryV1[];
};

export interface ListProviderAssetsInput {
  provider?: ProviderName;
  provider_asset_id?: string;
  mint_or_contract?: string;
}

function readError(reason: ProviderReadErrorReason, requested: string | null): ProviderReadError {
  return { found: false, reason, requested_identifier: requested, retryable: false };
}

/** Exact provider and identifier lookup; no partial, prefix or fuzzy match. */
export function findProviderAsset(provider: unknown, id: unknown): ProviderAssetEntryV1 | undefined {
  if (typeof provider !== "string" || typeof id !== "string") return undefined;
  return providerAssets.entries.find(
    (entry) => entry.provider === provider && entry.provider_asset_id === id,
  );
}

/** Return provider-reported identity, rights claims and reference values only. */
export function listProviderAssets(input: unknown = {}): ProviderCatalogReadResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) return readError("invalid_input", null);
  const record = input as Record<string, unknown>;
  const allowed = new Set(["provider", "provider_asset_id", "mint_or_contract"]);
  if (Object.keys(record).some((key) => !allowed.has(key))) return readError("invalid_input", null);

  const hasProvider = Object.hasOwn(record, "provider");
  const hasId = Object.hasOwn(record, "provider_asset_id");
  const hasMint = Object.hasOwn(record, "mint_or_contract");
  if (hasProvider && record.provider !== "prestocks") {
    return readError("invalid_input", null);
  }
  if (hasId && (typeof record.provider_asset_id !== "string" || record.provider_asset_id.length === 0)) {
    return readError("invalid_input", null);
  }
  if (hasMint && (typeof record.mint_or_contract !== "string" || record.mint_or_contract.length === 0)) {
    return readError("invalid_input", null);
  }
  if (hasId && hasMint) return readError("invalid_input", null);

  const requested = hasId
    ? record.provider_asset_id as string
    : hasMint ? record.mint_or_contract as string : null;

  let items = providerAssets.entries as readonly ProviderAssetEntryV1[];
  if (hasProvider) items = items.filter((entry) => entry.provider === record.provider);
  if (hasId) items = items.filter((entry) => entry.provider_asset_id === record.provider_asset_id);
  if (hasMint) items = items.filter((entry) => entry.mint_or_contract === record.mint_or_contract);
  if ((hasId || hasMint) && items.length === 0) return readError("asset_not_found", requested);
  return { found: true, items: [...items] };
}
