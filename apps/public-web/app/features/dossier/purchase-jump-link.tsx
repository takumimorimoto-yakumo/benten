import type { MouseEvent } from "react";
import { messagesFor } from "@/i18n/messages";
import type { PublicWebLocale } from "@/i18n/locales";
import { PURCHASE_HEADING_ID } from "@/features/purchase-island/purchase-panel-shell";
import { PURCHASE_SLOT_ID } from "./purchase-slot";

/**
 * Narrow-screen jump from the title to the purchase panel, shown only for the
 * fixed-route token. Its text equals the panel heading so the action keeps one
 * name. The link targets the slot; its heading is prerendered with the
 * frame, so focus moves to it before and after the island has loaded.
 */
export function PurchaseJumpLink({ locale }: { locale: PublicWebLocale }) {
  const label = messagesFor(locale).dossier.purchase.jumpLink;
  function jump(event: MouseEvent<HTMLAnchorElement>) {
    const heading = document.getElementById(PURCHASE_HEADING_ID);
    if (!heading) return;
    event.preventDefault();
    heading.scrollIntoView({ block: "start" });
    heading.focus({ preventScroll: true });
    window.history.replaceState(null, "", `#${PURCHASE_SLOT_ID}`);
  }
  return (
    <p className="lg:hidden">
      <a
        href={`#${PURCHASE_SLOT_ID}`}
        onClick={jump}
        data-purchase-jump=""
        className="inline-flex min-h-(--touch-target-min) items-center text-sm font-medium underline underline-offset-4 hover:text-muted-foreground"
      >
        {label}
      </a>
    </p>
  );
}
