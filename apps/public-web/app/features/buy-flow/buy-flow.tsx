/**
 * The buy flow at `/stock/NVDA/buy` (app IA section 5.1): the purchase panel
 * as a full-screen task below `md` (header and tab bar covered) and as a
 * right-side sheet over the dimmed product page from `md`.
 *
 * It is a modal dialog rendered in place, not in a portal, so the
 * prerendered document already contains its frame (heading, step, route
 * line, the four "Before you buy" sentences) and works without JavaScript:
 * Close is a link to the product page. The product page behind it is made
 * `inert` by its route (`routes/dossier.tsx`).
 *
 * The purchase itself is the app shell's installed purchase island: this
 * component only shows it. A link may carry a suggested amount and pay token
 * (`?amount=5.00`, or `?amount=0.02&pay=sol`, written by the MCP
 * `prepare_purchase` tool); once the island is installed it selects that pay
 * token and fills an empty amount field in its units after the field's own
 * checks. It never requests a preview or asks the wallet. Closing the flow, switching tabs or coming back
 * never cancels a wallet request or stops tracking.
 */
import { useEffect, useRef } from "react";
import { readDeepLink } from "@benten/purchase/deep-link";
import { XIcon } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router";
import { buttonVariants } from "@/components/ui/button";
import { PURCHASE_HEADING_ID, PurchasePanelShell, WalletStepReserve, type PurchaseFrame } from "@/features/purchase-island/purchase-panel-shell";
import { useAppSession } from "@/features/wallet-session/app-session";
import type { PublicWebLocale } from "@/i18n/locales";
import { productMessagesFor } from "@/i18n/product-messages";
import { useHydrated } from "@/lib/use-hydrated";
import { cn } from "@/lib/utils";
import { flowStepText } from "./flow-steps";

/** Set by the product page's Buy link: the entry before the flow is its product page, so Close goes back to it. */
export type BuyFlowEntryState = { readonly fromProduct: true };

function fromProduct(state: unknown): boolean {
  return typeof state === "object" && state !== null && (state as { fromProduct?: unknown }).fromProduct === true;
}

export function BuyFlow({ locale, frame, productHref }: { locale: PublicWebLocale; frame: PurchaseFrame; productHref: string }) {
  const copy = productMessagesFor(locale).flow;
  const { purchase, installPurchase } = useAppSession();
  const hydrated = useHydrated();
  const navigate = useNavigate();
  const location = useLocation();
  const openedFromProduct = fromProduct(location.state);

  // The island installs into the shell once per visit, exactly as on the product page before.
  useEffect(() => {
    if (purchase) return;
    let active = true;
    void import("@/features/purchase-island").then((module) => {
      if (active) installPurchase(module.createInstalledPurchase);
    });
    return () => {
      active = false;
    };
    // Once per mount; an installed island is kept by the shell.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A link pay token and amount fill the panel once per visit of this URL; an invalid link is ignored.
  const prefilledKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!purchase || prefilledKeyRef.current === location.key) return;
    prefilledKeyRef.current = location.key;
    const link = readDeepLink(location.search);
    if (link) purchase.prefillPurchase(link);
  }, [purchase, location.key, location.search]);

  function close() {
    // Back to the entry the flow was opened from, or to the product page when the flow was opened directly.
    if (openedFromProduct) void navigate(-1);
    else void navigate(productHref, { replace: true, preventScrollReset: true });
  }

  // Focus starts on the flow's heading, and stays there when the island replaces the prerendered frame.
  const Panel = purchase?.Panel;
  const islandShown = Boolean(Panel);
  useEffect(() => {
    const active = document.activeElement;
    if (!active || active === document.body || !active.closest("[data-buy-flow]") || active.id === PURCHASE_HEADING_ID) {
      document.getElementById(PURCHASE_HEADING_ID)?.focus({ preventScroll: true });
    }
  }, [islandShown]);

  // Escape closes.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented) close();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openedFromProduct, productHref]);

  const leading = (
    <Link
      to={productHref}
      replace
      preventScrollReset
      data-buy-flow-close=""
      onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        close();
      }}
      className={cn(buttonVariants({ variant: "ghost" }), "h-(--touch-target-min) gap-1 px-2")}
    >
      <XIcon aria-hidden="true" />
      {copy.close}
    </Link>
  );
  return (
    <div data-buy-flow="" role="dialog" aria-modal="true" aria-labelledby={PURCHASE_HEADING_ID} lang={locale} className="fixed inset-0 z-50 flex md:justify-end">
      {/* The dimmed product page beside the sheet; a pointer tap on it closes, like Close. */}
      <Link to={productHref} replace preventScrollReset tabIndex={-1} aria-hidden="true" data-buy-flow-backdrop="" onClick={(event) => { event.preventDefault(); close(); }} className="hidden flex-1 bg-(color:--scrim)/30 md:block" />
      <div data-buy-flow-sheet="" className="h-full w-full overflow-y-auto overscroll-contain bg-background md:w-(--purchase-panel-width) md:border-s md:shadow-xl">
        {Panel ? (
          <Panel locale={locale} flow={{ leading }} />
        ) : (
          <PurchasePanelShell frame={frame} locale={locale} phase="frame" copyable={hydrated} flow={{ leading, step: flowStepText("frame", locale) }}>
            <WalletStepReserve reserve={frame.walletReserve}>
              <noscript><p data-purchase-noscript="" className="text-sm text-muted-foreground">{frame.noScript}</p></noscript>
            </WalletStepReserve>
          </PurchasePanelShell>
        )}
      </div>
    </div>
  );
}
