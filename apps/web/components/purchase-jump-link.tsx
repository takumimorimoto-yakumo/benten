"use client";

import type { MouseEvent } from "react";

/**
 * Mobile-only jump from the stock title to the purchase panel. Its text equals
 * the panel heading so the action keeps one name; focus moves to that heading.
 */
export function PurchaseJumpLink({ label }: { label: string }) {
  function jump(event: MouseEvent<HTMLAnchorElement>) {
    const heading = document.getElementById("purchase-heading");
    if (!heading) return;
    event.preventDefault();
    heading.scrollIntoView({ block: "start" });
    heading.focus({ preventScroll: true });
    window.history.replaceState(null, "", "#purchase");
  }
  return <p className="purchase-jump"><a href="#purchase" onClick={jump}>{label}</a></p>;
}
