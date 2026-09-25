/**
 * Build-only labels for the Holdings and Activity tabs: every supported
 * product mint with its reviewed name, symbol and this locale's links, and
 * the fixed purchase route's tokens. Runs in the route loaders during
 * prerendering; the browser receives only this projection. Every value is
 * copied from an allowlisted registry record, the company map or the pinned
 * route constants; nothing is derived from a name.
 */
import { companyForProviderAsset, companyForXStock, listProviderAssets, listPublicAssets } from "@benten/registry";
import { SUPPORTED_PRODUCTS } from "@benten/solana/supported-products";
import { DEFAULT_PRODUCT, isPurchasableMint, PAY_TOKENS, PRODUCT_ROUTES, PRODUCT_TICKERS, USDC_DECIMALS, USDC_MINT, USDC_SYMBOL } from "@benten/purchase/route";
import { SELL_ROUTE } from "@benten/purchase/routes-table";
import type { ActivityCatalog } from "../features/activity/activity-catalog";
import type { HoldingsProduct } from "../features/holdings/holdings-model";
import { buyPath, dossierPath, providerPath, sellPath, type PublicWebLocale } from "../i18n/locales.js";

export function createHoldingsProducts(locale: PublicWebLocale): HoldingsProduct[] {
  const catalog = listPublicAssets({});
  if (!catalog.found) throw new Error("public catalog is unavailable for the Holdings labels");
  const providers = listProviderAssets({});
  if (!providers.found) throw new Error("provider catalog is unavailable for the Holdings labels");
  const identities = new Map(catalog.items.map(({ identity }) => [identity.mint, identity]));
  const providerEntries = new Map(providers.items.map((entry) => [entry.mint_or_contract, entry]));

  return [...SUPPORTED_PRODUCTS.values()].map((product): HoldingsProduct => {
    if (product.kind === "xstock") {
      const identity = identities.get(product.mint);
      if (!identity) throw new Error(`supported xStock ${product.ticker} has no public catalog record`);
      return {
        mint: product.mint,
        symbol: product.symbol,
        name: companyForXStock(product.ticker)?.display_name ?? identity.underlying_company ?? identity.token_name,
        href: dossierPath(locale, product.ticker),
        buyHref: isPurchasableMint(product.mint) ? buyPath(locale, product.ticker) : null,
        // Selling is NVDAx only: the one sale route's mint, compared exactly.
        sellHref: product.mint === SELL_ROUTE.productMint.toBase58() ? sellPath(locale, product.ticker) : null,
      };
    }
    const entry = providerEntries.get(product.mint);
    if (!entry) throw new Error(`supported provider instrument ${product.providerAssetId} has no provider record`);
    return {
      mint: product.mint,
      symbol: product.symbol,
      name: companyForProviderAsset(entry.provider, entry.provider_asset_id)?.display_name ?? entry.company_binding.company_name,
      href: providerPath(locale, entry.provider, entry.provider_asset_id),
      buyHref: null,
      sellHref: null,
    };
  });
}

export function createActivityCatalog(locale: PublicWebLocale): ActivityCatalog {
  // Every product of the routes table, in table order: its mint, symbol and decimals, and its page.
  const products = PRODUCT_TICKERS.map((ticker) => {
    const route = PRODUCT_ROUTES[ticker];
    const product = SUPPORTED_PRODUCTS.get(route.productMint.toBase58());
    if (!product || product.kind !== "xstock" || product.ticker !== ticker) throw new Error(`the route's output mint of ${ticker} is not that supported xStock`);
    return { route, product };
  });
  return {
    tokens: [
      { mint: USDC_MINT.toBase58(), symbol: USDC_SYMBOL, decimals: USDC_DECIMALS, scaledUi: false },
      ...products.map(({ route }) => ({ mint: route.productMint.toBase58(), symbol: route.symbol, decimals: route.decimals, scaledUi: true })),
      // Other pay tokens, so records bought with SOL or SKR show their amounts.
      ...(["SOL", "SKR"] as const).map((id) => ({ mint: PAY_TOKENS[id].mint.toBase58(), symbol: PAY_TOKENS[id].symbol, decimals: PAY_TOKENS[id].decimals, scaledUi: false })),
    ],
    productHrefs: Object.fromEntries(products.map(({ route, product }) => [route.productMint.toBase58(), dossierPath(locale, product.ticker)])),
    // The default product's pool: the route of fixture records (each real record keeps its own route).
    routeId: PRODUCT_ROUTES[DEFAULT_PRODUCT].pool.toBase58(),
  };
}
