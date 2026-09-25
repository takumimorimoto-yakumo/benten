/**
 * Presenter for the static provider-assets artifact.
 *
 * Everything here is provider-reported: identity, rights claims and reference
 * values published by PreStocks about its own instruments. It is
 * never a quote, an executable price, a NAV, an audited valuation, an
 * authorization or an xStock, and it never reaches the network.
 */
import { listProviderAssets, providerAssets } from "@benten/registry";
import { DISCLAIMER } from "./envelope.js";

export interface ProviderAssetsInput {
  provider?: "prestocks";
  provider_asset_id?: string;
  mint_or_contract?: string;
}

export interface ProviderAssetsResult {
  [key: string]: unknown;
  schema_version: "provider-assets.v1";
  artifact: { revision: string; fetched_at: string };
  data: Record<string, unknown>;
  not_quote: true;
  disclaimer: typeof DISCLAIMER;
}

function providerResult(data: object): ProviderAssetsResult {
  return {
    schema_version: "provider-assets.v1",
    artifact: { revision: providerAssets.revision, fetched_at: providerAssets.fetched_at },
    data: data as Record<string, unknown>,
    not_quote: true,
    disclaimer: DISCLAIMER,
  };
}

function selector(input: ProviderAssetsInput): Record<string, unknown> {
  return {
    ...(input.provider !== undefined ? { provider: input.provider } : {}),
    ...(input.provider_asset_id !== undefined ? { provider_asset_id: input.provider_asset_id } : {}),
    ...(input.mint_or_contract !== undefined ? { mint_or_contract: input.mint_or_contract } : {}),
  };
}

export function listProviderAssetsV2(input: ProviderAssetsInput = {}): ProviderAssetsResult {
  return providerResult(listProviderAssets(selector(input)));
}

export function providerServiceUnavailable(): ProviderAssetsResult {
  return providerResult({
    found: false,
    reason: "service_unavailable",
    requested_identifier: null,
    retryable: true,
  });
}
