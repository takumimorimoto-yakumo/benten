import { findCompany } from "@benten/registry";
import { CompanyPage } from "@/components/company-page";
import { companyMetadataFor, metadataFor } from "@/lib/i18n/metadata";
type CompanyParams = { params: { slug: string } };
export function generateMetadata({ params }: CompanyParams) {
  const company = findCompany(params?.slug);
  return company ? companyMetadataFor("en", company.display_name) : metadataFor("en");
}
export default function EnglishCompanyPage({ params }: CompanyParams) { return <CompanyPage slug={params.slug} locale="en" />; }
