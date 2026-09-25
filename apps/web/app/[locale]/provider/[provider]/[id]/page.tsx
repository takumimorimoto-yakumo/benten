import { notFound } from "next/navigation";
import { findProviderAsset } from "@benten/registry";
import { ProviderPage } from "@/components/provider-page";
import { isLocale } from "@/lib/i18n/config";
import { messagesFor } from "@/lib/i18n/messages";
import { metadataFor, providerMetadataFor } from "@/lib/i18n/metadata";
type LocalizedProviderParams = { params: { locale: string; provider: string; id: string } };
export function generateMetadata({ params }: LocalizedProviderParams) {
  const locale = params?.locale;
  if (!isLocale(locale) || locale === "en") return {};
  const entry = findProviderAsset(params?.provider, params?.id);
  return entry ? providerMetadataFor(locale, entry.symbol, messagesFor(locale).providers.names[entry.provider]) : metadataFor(locale);
}
export default function LocalizedProviderPage({ params }: LocalizedProviderParams) {
  if (!isLocale(params?.locale) || params.locale === "en") notFound();
  return <ProviderPage provider={params.provider} id={params.id} locale={params.locale} />;
}
