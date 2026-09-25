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
import { isPurchasableMint, NVDAX_DECIMALS, NVDAX_MINT, NVDAX_SYMBOL, NVDAX_USDC_POOL, PAY_TOKENS, USDC_DECIMALS, USDC_MINT, USDC_SYMBOL } from "@benten/purchase/route";
import type { ActivityCatalog } from "../features/activity/activity-catalog";
import type { HoldingsProduct } from "../features/holdings/holdings-model";
import { buyPath, dossierPath, providerPath, type PublicWebLocale } from "../i18n/locales.js";

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
    };
  });
}

export function createActivityCatalog(locale: PublicWebLocale): ActivityCatalog {
  const nvdax = NVDAX_MINT.toBase58();
  const product = SUPPORTED_PRODUCTS.get(nvdax);
  if (!product || product.kind !== "xstock") throw new Error("the route's output mint is not a supported xStock");
  return {
    tokens: [
      { mint: USDC_MINT.toBase58(), symbol: USDC_SYMBOL, decimals: USDC_DECIMALS, scaledUi: false },
      { mint: nvdax, symbol: NVDAX_SYMBOL, decimals: NVDAX_DECIMALS, scaledUi: true },
      // Other pay tokens, so records bought with SOL or SKR show their amounts.
      ...(["SOL", "SKR"] as const).map((id) => ({ mint: PAY_TOKENS[id].mint.toBase58(), symbol: PAY_TOKENS[id].symbol, decimals: PAY_TOKENS[id].decimals, scaledUi: false })),
    ],
    productHrefs: { [nvdax]: dossierPath(locale, product.ticker) },
    routeId: NVDAX_USDC_POOL.toBase58(),
  };
}
