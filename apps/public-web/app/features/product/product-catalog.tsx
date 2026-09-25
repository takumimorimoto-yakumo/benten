/**
 * Living Catalog specimens for the product pages, the Pyth reference price
 * and the buy flow (development only: imported by `routes/dev-catalog.tsx`
 * alone). Fixture values are placeholders, not market data; nothing reads
 * the network or a wallet.
 */
import { PURCHASE_FIXTURES, type PurchaseFixtureName } from "@benten/purchase/fixtures";
import { flowStepText } from "@/features/buy-flow/flow-steps";
import type { PythPriceResult } from "@/features/pricing/price-format";
import { priceDisplayState } from "@/features/pricing/price-format";
import { PythReferencePriceView } from "@/features/pricing/pyth-reference-price";
import { pythFeedForTicker } from "@/features/pricing/pyth-feeds";
import type { PythPriceView } from "@/features/pricing/use-pyth-price";
import { PurchasePanelFixture } from "@/features/purchase-island/purchase-panel-fixture";
import type { PublicWebLocale } from "@/i18n/locales";
import { productMessagesFor } from "@/i18n/product-messages";
import { BuyCapability, CapabilityNote } from "./product-parts";

/** A fixed specimen time, so the catalog renders the same states every day. */
const NOW = Date.UTC(2000, 0, 3, 15, 0, 0);
const FEED = pythFeedForTicker("NVDA")!;

function specimen(publishedSecondsAgo: number, status: "fresh" | "stale"): PythPriceResult {
  const published = NOW / 1000 - publishedSecondsAgo;
  return {
    kind: "pyth_reference", feed_id: FEED.feed_id, pyth_symbol: FEED.pyth_symbol, role: FEED.role, observed_at: new Date(NOW).toISOString(),
    status, price: "123.45678", confidence: "0.04321", exponent: -5, price_raw: "12345678", confidence_raw: "4321", currency: "USD",
    publish_time: new Date(published * 1000).toISOString(), publish_time_unix: published, stale_after_seconds: 60,
    source: { network: "solana-mainnet", program: "11111111111111111111111111111111", account: "11111111111111111111111111111111", shard: 0, posted_slot: "1", verification: "full" },
    not_quote: true,
  };
}

function ready(result: PythPriceResult | null): PythPriceView {
  return { kind: "ready", feed: FEED, read: { result, readAtMs: NOW }, display: priceDisplayState(result, NOW), nowMs: NOW };
}

const PRICE_STATES: ReadonlyArray<[string, PythPriceView]> = [
  ["loading (prerender)", { kind: "loading", feed: FEED }],
  ["live", ready(specimen(5, "fresh"))],
  ["stale: weekend, shown with its last update", ready(specimen(62 * 3600, "stale"))],
  ["too old to show", ready(specimen(100 * 3600, "stale"))],
  ["no feed", { kind: "noFeed" }],
  ["unavailable", ready(null)],
];

const FLOW_FIXTURES: readonly PurchaseFixtureName[] = ["walletDisconnected", "editing", "reviewReady", "previewExpired", "awaitingWallet", "submitted", "result", "notFinalized"];

export function ProductCatalogSpecimens({ locale }: { locale: PublicWebLocale }) {
  const copy = productMessagesFor(locale).product.capability;
  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Pyth reference price (every display state, fixture values)</h2>
        <div className="grid gap-6 md:grid-cols-2">
          {PRICE_STATES.map(([label, view]) => (
            <div key={label} className="flex flex-col gap-2 rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <PythReferencePriceView view={view} locale={locale} onRetry={() => undefined} />
              <PythReferencePriceView view={view} locale={locale} size="sm" onRetry={() => undefined} />
            </div>
          ))}
        </div>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Product capability</h2>
        <div className="grid gap-6 md:grid-cols-3">
          <div className="[&_[data-product-capability]]:static!"><BuyCapability symbol="EXAMPLEx" href="#" locale={locale} /></div>
          <CapabilityNote kind="not-buyable" heading={copy.notBuyableHeading} body={copy.notBuyableBody} />
          <CapabilityNote kind="compare-only" heading={copy.compareOnlyHeading} body={copy.compareOnlyBody("EXAMPLE")} />
        </div>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Buy flow panel (reducer fixtures in the flow chrome; no RPC, no wallet)</h2>
        <div className="grid items-start gap-6 md:grid-cols-[repeat(auto-fill,minmax(min(100%,var(--purchase-panel-width)),1fr))]">
          {FLOW_FIXTURES.map((name) => (
            <div key={name} className="flex max-h-[40rem] flex-col overflow-y-auto rounded-lg border">
              <PurchasePanelFixture name={name} locale={locale} flow={{ leading: <span className="px-2 text-sm">{productMessagesFor(locale).flow.close}</span>, step: flowStepText(PURCHASE_FIXTURES[name].state.attempt.phase, locale) }} />
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
