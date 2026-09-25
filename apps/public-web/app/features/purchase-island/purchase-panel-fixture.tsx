import { PURCHASE_FIXTURES, type PurchaseFixtureName } from "@benten/purchase/fixtures";
import type { PublicWebLocale } from "@/i18n/locales";
import { usePanelRefs } from "./purchase-island";
import type { PurchaseFlowChrome } from "./purchase-panel-shell";
import { PurchasePanelView, type PanelHandlers } from "./purchase-panel-view";

const NO_OP_HANDLERS: PanelHandlers = {
  onConnect: () => undefined,
  onDisconnect: () => undefined,
  onAmountChange: () => undefined,
  onAmountBlur: () => undefined,
  onPreview: () => undefined,
  onApprove: () => undefined,
  onCheckAgain: () => undefined,
  onStartNew: () => undefined,
  onPayTokenChange: () => undefined,
};

/**
 * Living Catalog specimen: the real panel view rendered from a reducer
 * fixture. No RPC, no wallet, and every action is a no-op, so nothing can be
 * signed or sent.
 */
export function PurchasePanelFixture({ name, locale, flow }: { name: PurchaseFixtureName; locale: PublicWebLocale; flow?: PurchaseFlowChrome }) {
  const refs = usePanelRefs();
  const fixture = PURCHASE_FIXTURES[name];
  return <PurchasePanelView state={fixture.state} now={fixture.now} locale={locale} handlers={NO_OP_HANDLERS} refs={refs} announcement="" flow={flow} />;
}
