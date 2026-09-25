import { notFound } from "next/navigation";
import { findCompany } from "@benten/registry";
import { CompanyPage } from "@/components/company-page";
import { isLocale } from "@/lib/i18n/config";
import { companyMetadataFor, metadataFor } from "@/lib/i18n/metadata";
type LocalizedCompanyParams = { params: { locale: string; slug: string } };
export function generateMetadata({ params }: LocalizedCompanyParams) {
  const locale = params?.locale;
  if (!isLocale(locale) || locale === "en") return {};
  const company = findCompany(params?.slug);
  return company ? companyMetadataFor(locale, company.display_name) : metadataFor(locale);
}
export default function LocalizedCompanyPage({ params }: LocalizedCompanyParams) {
  if (!isLocale(params?.locale) || params.locale === "en") notFound();
  return <CompanyPage slug={params.slug} locale={params.locale} />;
}
