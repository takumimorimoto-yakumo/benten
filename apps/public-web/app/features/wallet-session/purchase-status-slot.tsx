import { useAppSession } from "@/features/wallet-session/app-session";
import type { PublicWebLocale } from "@/i18n/locales";

/**
 * Where the shell shows the in-flight purchase status line (app IA 5.1). It
 * exists only after the purchase island was installed in this visit, so the
 * prerendered documents and a visit without a purchase render nothing here.
 */
export function PurchaseStatusSlot({ locale }: { locale: PublicWebLocale }) {
  const Status = useAppSession().purchase?.Status;
  return Status ? <Status locale={locale} /> : null;
}
