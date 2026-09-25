import type { Config } from "@react-router/dev/config";
import { listProviderAssets, listPublicAssets } from "@benten/registry";
import { PURCHASE_FIXTURES } from "@benten/purchase/fixtures";
import { publishedCompanies } from "./app/lib/company.server.js";
import { DEV_CATALOG_ENABLED } from "./app/lib/dev-catalog-flag.js";
import { notFoundDocumentPaths } from "./app/lib/not-found.js";
import { PORTFOLIO_FIXTURE_PATHS } from "./app/lib/portfolio-fixture-names.js";
import { buildAppShellPrerenderPaths, buildDirectoryPrerenderPaths, buildProductSubpagePrerenderPaths, buildPublicWebPrerenderPaths, buildReferencePrerenderPaths, buildStaticPagePrerenderPaths } from "./app/lib/prerender-paths.server.js";
import { isPurchasableMint } from "@benten/purchase/route";

const catalog = listPublicAssets({});
const providers = listProviderAssets({});

if (!catalog.found) {
  throw new Error("public catalog is unavailable for static Web prerendering");
}

// `pnpm dev:catalog` only (a build with the flag fails): the purchase fixture
// pages have a loader, which `ssr: false` accepts only on listed paths.
const devCatalogPaths = DEV_CATALOG_ENABLED ? Object.keys(PURCHASE_FIXTURES).map((name) => `/_catalog/purchase/${name}`) : [];

export default {
  buildDirectory: process.env.BENTEN_PUBLIC_WEB_BUILD_DIRECTORY ?? "build",
  ssr: false,
  prerender: [
    ...buildPublicWebPrerenderPaths(catalog),
    ...buildReferencePrerenderPaths(providers, publishedCompanies()),
    ...buildAppShellPrerenderPaths(),
    ...buildDirectoryPrerenderPaths(),
    // Evidence pages and the buy flow frame; buyable only by exact mint equality with the pinned route.
    ...buildProductSubpagePrerenderPaths(catalog, providers, catalog.items.filter(({ identity }) => isPurchasableMint(identity.mint)).map(({ identity }) => identity.ticker)),
    // About, learn topics and legal documents.
    ...buildStaticPagePrerenderPaths(),
    // Served by the host only as 404 bodies; never as pages (see host/server.ts).
    ...notFoundDocumentPaths(),
    ...devCatalogPaths,
    // Holdings and Activity fixture pages, `pnpm dev:catalog` only (they have a loader, like the purchase fixtures).
    ...(DEV_CATALOG_ENABLED ? PORTFOLIO_FIXTURE_PATHS : []),
  ],
} satisfies Config;
