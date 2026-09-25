import { findProviderAsset } from "@benten/registry";
import { ProviderPage } from "@/components/provider-page";
import { messagesFor } from "@/lib/i18n/messages";
import { metadataFor, providerMetadataFor } from "@/lib/i18n/metadata";
type ProviderParams = { params: { provider: string; id: string } };
export function generateMetadata({ params }: ProviderParams) {
  const entry = findProviderAsset(params?.provider, params?.id);
  return entry ? providerMetadataFor("en", entry.symbol, messagesFor("en").providers.names[entry.provider]) : metadataFor("en");
}
export default function EnglishProviderPage({ params }: ProviderParams) { return <ProviderPage provider={params.provider} id={params.id} locale="en" />; }
