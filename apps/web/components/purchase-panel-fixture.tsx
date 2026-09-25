"use client";

import { useEffect, useState } from "react";

import { PurchasePanelView, usePanelRefs, type PanelHandlers } from "@/components/purchase-panel";
import type { Locale } from "@/lib/i18n/config";
import { PURCHASE_FIXTURES, type PurchaseFixtureName } from "@benten/purchase/fixtures";

const NO_OP_HANDLERS: PanelHandlers = {
  onConnect: () => undefined,
  onDisconnect: () => undefined,
  onAmountChange: () => undefined,
  onAmountBlur: () => undefined,
  onPreview: () => undefined,
  onApprove: () => undefined,
  onCheckAgain: () => undefined,
  onStartNew: () => undefined,
};

/**
 * Living Catalog specimen: the real panel view rendered from a reducer
 * fixture. No RPC, no wallet, and every action is a no-op, so nothing can be
 * signed or sent. Rendered after mount so fixture times use the viewer's
 * clock format without a hydration mismatch.
 */
export function PurchasePanelFixture({ name, locale }: { name: PurchaseFixtureName; locale: Locale }) {
  const [mounted, setMounted] = useState(false);
  const refs = usePanelRefs();
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const fixture = PURCHASE_FIXTURES[name];
  return <PurchasePanelView state={fixture.state} now={fixture.now} locale={locale} handlers={NO_OP_HANDLERS} refs={refs} announcement="" />;
}
