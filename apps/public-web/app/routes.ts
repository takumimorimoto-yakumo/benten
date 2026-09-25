import { index, route, type RouteConfig } from "@react-router/dev/routes";
import { DEV_CATALOG_ENABLED } from "./lib/dev-catalog-flag.js";

const publicRoutes = [
  index("routes/home.tsx"),
  // Product pages; the buy flow is the product page's child, so it opens over the page (app IA section 5.1).
  route("stock/:ticker", "routes/dossier.tsx", [route("buy", "routes/buy.tsx"), route("sell", "routes/sell.tsx")]),
  route(":locale", "routes/locale-home.tsx"),
  route(":locale/stock/:ticker", "routes/locale-dossier.tsx", [route("buy", "routes/locale-buy.tsx"), route("sell", "routes/locale-sell.tsx")]),
  route("provider/:provider/:id", "routes/provider.tsx"),
  route(":locale/provider/:provider/:id", "routes/locale-provider.tsx"),
  // Evidence pages (app IA section 4.6).
  route("stock/:ticker/evidence", "routes/stock-evidence.tsx"),
  route(":locale/stock/:ticker/evidence", "routes/locale-stock-evidence.tsx"),
  route("provider/:provider/:id/evidence", "routes/provider-evidence.tsx"),
  route(":locale/provider/:provider/:id/evidence", "routes/locale-provider-evidence.tsx"),
  route("company/:slug", "routes/company.tsx"),
  route(":locale/company/:slug", "routes/locale-company.tsx"),
  // The companies list (static segment ranks above `:locale`).
  route("companies", "routes/companies.tsx"),
  route(":locale/companies", "routes/locale-companies.tsx"),
  // App shell tabs (static segments rank above `:locale`).
  route("holdings", "routes/holdings.tsx"),
  route(":locale/holdings", "routes/locale-holdings.tsx"),
  route("activity", "routes/activity.tsx"),
  route(":locale/activity", "routes/locale-activity.tsx"),
  // Static information pages (app IA section 4.1; static segments rank above `:locale`).
  route("about", "routes/about.tsx"),
  route(":locale/about", "routes/locale-about.tsx"),
  route("learn/:topic", "routes/learn.tsx"),
  route(":locale/learn/:topic", "routes/locale-learn.tsx"),
  route("legal/:document", "routes/legal.tsx"),
  route(":locale/legal/:document", "routes/locale-legal.tsx"),
  // Prerendered 404 bodies; the host serves them only with status 404 (see app/lib/not-found.ts).
  route("__not-found/:locale/:scope", "routes/not-found.tsx"),
] satisfies RouteConfig;

// Holdings and Activity fixture pages and the charts and statements pages of the Living Catalog (development only, like the lines below).
const portfolioCatalogRoutes = [route("_catalog/portfolio/:fixture", "routes/dev-portfolio-fixture.tsx"), route("_catalog/charts", "routes/dev-catalog-charts.tsx"), route("_catalog/statements", "routes/dev-catalog-statements.tsx"), route("_catalog/price-comparison", "routes/dev-catalog-price-comparison.tsx")];

// The Living Catalog and its purchase fixture pages exist only in `pnpm dev:catalog`. It is never part of a
// build: it is not in the route manifest, the client graph, or the prerender list.
export default (DEV_CATALOG_ENABLED
  ? [route("_catalog", "routes/dev-catalog.tsx"), route("_catalog/shell", "routes/dev-catalog-shell.tsx"), route("_catalog/purchase/:fixture", "routes/dev-purchase-fixture.tsx"), ...portfolioCatalogRoutes, ...publicRoutes]
  : publicRoutes) satisfies RouteConfig;
