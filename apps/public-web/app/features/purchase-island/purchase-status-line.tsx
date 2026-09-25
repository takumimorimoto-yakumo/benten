/**
 * The in-flight purchase status line (app IA section 5.1): after the wallet
 * returned a signature, while Benten tracks it, a one-line notice outside
 * the buy flow says the purchase was sent and links to Activity, so leaving
 * the flow does not hide that a purchase is on its way. Below `md` it sits
 * above the tab bar (and above a product page's pinned buy action bar);
 * from `md` it sits under the header.
 *
 * Part of the purchase island chunk (its copy is the purchase catalog); the
 * shell shows it only once the island is installed.
 */
import { LoaderCircleIcon } from "lucide-react";
import type { Attempt } from "@benten/purchase/purchase-machine";
import { PageContainer } from "@/components/page-container";
import { activityPath, type PublicWebLocale } from "@/i18n/locales";
import { purchaseMessagesFor } from "@/i18n/purchase-messages";

/** Sent and not yet at a result: the flow is tracking the signature. */
export const STATUS_LINE_PHASES: ReadonlySet<Attempt["phase"]> = new Set(["submitted", "confirmed", "finalized"]);

export function PurchaseStatusLineView({ locale }: { locale: PublicWebLocale }) {
  const copy = purchaseMessagesFor(locale).status;
  return (
    <div
      data-purchase-status=""
      role="status"
      className="z-30 border-y bg-muted text-sm max-md:fixed max-md:inset-x-0 max-md:bottom-(--purchase-status-bottom) max-md:ps-(--safe-area-left) max-md:pe-(--safe-area-right) md:border-t-0"
    >
      <PageContainer className="flex min-h-(--touch-target-min) flex-wrap items-center gap-x-2 gap-y-1 py-1.5">
        <LoaderCircleIcon aria-hidden="true" className="size-4 shrink-0 motion-safe:animate-spin" />
        <span>{copy.sent}</span>
        <a href={activityPath(locale)} className="inline-flex min-h-(--touch-target-min) items-center font-medium underline underline-offset-4 md:min-h-0">{copy.view}</a>
      </PageContainer>
    </div>
  );
}
