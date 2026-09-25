/**
 * Browser-safe view model of one provider instrument page. The build-only
 * projection in `app/lib/provider.server.ts` fills it from the reviewed
 * provider artifact; components render it without reading the registry.
 * Every value is the provider's own report; nothing is converted, combined
 * with another provider's value, or ranked.
 */
import type {
  ProviderName,
  ProviderReferenceKind,
  ProviderRightsV1,
  ProviderUnknownBlock,
  ProviderUnknownCode,
} from "@benten/registry";

export type ProviderView = {
  readonly provider: ProviderName;
  readonly providerAssetId: string;
  readonly symbol: string;
  readonly displayName: string;
  /** The full mint, never shortened. */
  readonly mint: string;
  readonly externalUrl: string;
  readonly instrumentKind: ProviderRightsV1["instrument_kind"];
  readonly company: {
    /** The company the provider names (a provider claim). */
    readonly name: string;
    readonly bindingStatus: "public_source_verified" | "provider_claim_only" | "unknown";
    /** The reviewed company map's page for this instrument, if it maps one. */
    readonly page: { readonly slug: string; readonly displayName: string } | null;
  };
  readonly rights: {
    readonly status: ProviderRightsV1["status"];
    readonly equityOwnership: false | "unknown";
    readonly votingRights: false | "unknown";
    readonly redemptionKind: ProviderRightsV1["redemption_kind"];
    readonly restrictions: readonly string[];
    readonly termsUrl: string | null;
  };
  /** Provider references in artifact order; values stay decimal strings. */
  readonly references: readonly {
    readonly kind: ProviderReferenceKind;
    readonly value: string;
    readonly currency: string | null;
    readonly asOf: string | null;
  }[];
  readonly supply: { readonly value: string; readonly asOf: string | null } | null;
  readonly unknowns: readonly { readonly code: ProviderUnknownCode; readonly blocks: readonly ProviderUnknownBlock[] }[];
  /** Artifact sources this record cites, in artifact order, each with the UTC date it was observed. */
  readonly sources: readonly { readonly url: string; readonly observedOn: string }[];
  /** Calendar date (UTC) on which Benten fetched the provider artifact. */
  readonly fetchedOn: string;
};
