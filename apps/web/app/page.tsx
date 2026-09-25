import { HomePage } from "@/components/home-page";
import { metadataFor } from "@/lib/i18n/metadata";
export const metadata = metadataFor("en");
export default function Page() { return <HomePage locale="en" />; }
