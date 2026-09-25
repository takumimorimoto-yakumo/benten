import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { InfoIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useWalletSessionState } from "@/features/wallet-session/app-session";
import { usePythPrices } from "@/features/pricing";
import { WalletMenu } from "@/features/wallet-session/wallet-menu";
import type { PublicWebLocale } from "@/i18n/locales";
import { shellMessagesFor } from "@/i18n/shell-messages";
import { useHydrated } from "@/lib/use-hydrated";
import { buildHoldingsView, valuationFeeds, type HoldingsProduct } from "./holdings-model";
import { browserHoldingsStore } from "./holdings-reader";
import type { HoldingsStore } from "./holdings-store";
import { HoldingsConnected, holdingsStateName, type HoldingsScreen } from "./holdings-view";

const NO_PRODUCTS: readonly HoldingsProduct[] = [];

/**
 * The connected wallet's holdings (app IA section 6.4): exactly one address,
 * the connected one. Opening the tab reads it once automatically when this
 * visit has no read of it yet; after that only Refresh reads. Switching to
 * another address shows it unread until Refresh. Prices are read, through
 * the shared Pyth reference price client, for each new observation (and on
 * a row's Try again), never on a timer.
 */
function ConnectedHoldings({ locale, address, products, store, autoRead }: {
  locale: PublicWebLocale;
  address: string;
  products: ReadonlyMap<string, HoldingsProduct>;
  store: HoldingsStore;
  /** The first address this page shows: read once if this visit has no read of it. */
  autoRead: boolean;
}) {
  const entry = useSyncExternalStore(store.subscribe, () => store.entry(address), () => store.entry(address));
  const readThisMount = useRef(new Set<string>());
  useEffect(() => {
    if (autoRead && !store.entry(address).observation) {
      readThisMount.current.add(address);
      store.refresh(address);
    }
    // Once per mount: the page remounts this for each address.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const refresh = () => {
    readThisMount.current.add(address);
    store.refresh(address);
  };

  const observation = entry.observation;
  const read = observation && observation.status !== "unavailable" ? observation : null;
  const feeds = useMemo(() => (read ? valuationFeeds(read.holdings) : []), [read]);
  const [priceAttempt, setPriceAttempt] = useState(0);
  const prices = usePythPrices(feeds, read ? `${address}:${read.observedAt}:${priceAttempt}` : null);

  let screen: HoldingsScreen;
  if (!observation) {
    screen = { kind: "not-read", reading: entry.reading };
  } else if (observation.status === "unavailable") {
    screen = { kind: "unavailable", reason: observation.reason, reading: entry.reading };
  } else {
    const nowMs = prices.nowMs || Date.now();
    screen = {
      kind: "read",
      observation,
      view: buildHoldingsView(observation, products, prices.reads, nowMs),
      prices: prices.loading ? "loading" : "loaded",
      stale: !readThisMount.current.has(address),
      reading: entry.reading,
    };
  }
  return <HoldingsConnected locale={locale} address={address} screen={screen} onRefresh={refresh} onRetryPrices={() => setPriceAttempt((attempt) => attempt + 1)} nowMs={prices.nowMs || Date.now()} />;
}

/**
 * The Holdings tab (app IA section 6). The prerendered document is the
 * not-connected state; its connect control needs JavaScript and says so
 * without it. `products` are the reviewed labels of every supported product,
 * built at prerender.
 */
export function HoldingsPage({ locale, products = NO_PRODUCTS, store = browserHoldingsStore }: { locale: PublicWebLocale; products?: readonly HoldingsProduct[]; store?: HoldingsStore }) {
  const copy = shellMessagesFor(locale);
  const state = useWalletSessionState();
  const hydrated = useHydrated();
  const byMint = useMemo(() => new Map(products.map((product) => [product.mint, product])), [products]);
  const connection = state.connection;
  // The first connected address of this page visit; a later one (a wallet switch here) waits for Refresh.
  const firstAddress = useRef<string | null>(null);
  if (connection.kind === "connected" && hydrated && firstAddress.current === null) firstAddress.current = connection.address;
  const noWallet = connection.kind === "disconnected" && state.detection === "done" && state.wallets.length === 0;
  const kind = connection.kind === "connected" ? "connected" : noWallet ? "no-wallet" : "not-connected";
  return (
    <div className="flex max-w-4xl flex-col gap-4" data-holdings-state={kind}>
      <h1 className="text-3xl font-semibold tracking-tight">{copy.holdings.heading}</h1>
      {connection.kind === "connected" && hydrated ? (
        <ConnectedHoldings key={connection.address} locale={locale} address={connection.address} products={byMint} store={store} autoRead={firstAddress.current === connection.address} />
      ) : noWallet ? (
        <Alert role="note">
          <InfoIcon aria-hidden="true" />
          <AlertTitle><h2>{copy.wallet.notDetectedTitle}</h2></AlertTitle>
          <AlertDescription><p>{copy.wallet.notDetectedBody}</p></AlertDescription>
        </Alert>
      ) : (
        <>
          <p>{copy.holdings.notConnected}</p>
          <div><WalletMenu locale={locale} variant="page" /></div>
          <noscript><p className="text-sm text-muted-foreground" data-holdings-noscript="">{copy.wallet.needsJavaScript}</p></noscript>
        </>
      )}
    </div>
  );
}

export { holdingsStateName };
