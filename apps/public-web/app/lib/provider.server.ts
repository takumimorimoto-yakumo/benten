/**
 * Build-only projection from the reviewed provider artifact to one provider
 * instrument page. Runs in route loaders during prerendering; never reaches
 * the client graph. Unknown provider or identifier input throws: only exact
 * `findProviderAsset` matches are prerendered.
 */
import { companyForProviderAsset, findProviderAsset, providerAssets, providerAssetsManifest } from "@benten/registry";
import type { ProviderView } from "../features/references/provider-view";
import { utcDatePart } from "../i18n/format.js";

export function createProviderView(provider: string, id: string): ProviderView {
  const entry = findProviderAsset(provider, id);
  if (!entry || entry.provider !== provider || entry.provider_asset_id !== id) {
    throw new Error("provider view requires an exact reviewed provider instrument");
  }
  const company = companyForProviderAsset(entry.provider, entry.provider_asset_id);
  const cited = new Set([entry.source_digest, ...entry.company_binding.evidence_refs, ...entry.rights.evidence_refs]);
  const sources = providerAssets.sources
    .filter((source) => source.provider === entry.provider && cited.has(source.response_digest))
    .map((source) => ({ url: source.source_url, observedOn: utcDatePart(source.observed_at) }));
  if (sources.length === 0) throw new Error("provider instrument cites no artifact source");

  return {
    provider: entry.provider,
    providerAssetId: entry.provider_asset_id,
    symbol: entry.symbol,
    displayName: entry.display_name,
    mint: entry.mint_or_contract,
    externalUrl: entry.external_url,
    instrumentKind: entry.rights.instrument_kind,
    company: {
      name: entry.company_binding.company_name,
      bindingStatus: entry.company_binding.binding_status,
      page: company ? { slug: company.slug, displayName: company.display_name } : null,
    },
    rights: {
      status: entry.rights.status,
      equityOwnership: entry.rights.equity_ownership,
      votingRights: entry.rights.voting_rights,
      redemptionKind: entry.rights.redemption_kind,
      restrictions: [...entry.rights.restrictions],
      termsUrl: entry.rights.terms_url ?? null,
    },
    references: entry.references.map((reference) => ({
      kind: reference.kind,
      value: reference.value,
      currency: reference.currency,
      asOf: reference.provider_reported_as_of,
    })),
    supply: entry.supply_reference ? { value: entry.supply_reference.value, asOf: entry.supply_reference.provider_reported_as_of } : null,
    unknowns: entry.unknowns.map((unknown) => ({ code: unknown.code, blocks: [...unknown.blocks] })),
    sources,
    fetchedOn: utcDatePart(providerAssetsManifest.fetched_at),
  };
}
