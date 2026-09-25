import { notFound } from "next/navigation";
import { HomePage } from "@/components/home-page";
import { isLocale } from "@/lib/i18n/config";
import { metadataFor } from "@/lib/i18n/metadata";
type LocalizedParams = { params: { locale: string } };
export function generateMetadata(context: LocalizedParams) { const locale = context?.params?.locale; return isLocale(locale) && locale !== "en" ? metadataFor(locale) : {}; }
export default function LocalizedHomePage({ params }: LocalizedParams) { if (!isLocale(params?.locale) || params.locale === "en") notFound(); return <HomePage locale={params.locale} />; }
