import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { PRODUCT_ROUTES, PRODUCT_TICKERS } from "../../../packages/purchase/src/routes-table.ts";
import { StockProductPage } from "../app/features/product/stock-product-page.tsx";
import { createStockProductView } from "../app/lib/product.server.ts";

const LIQUIDITY = /data-product-route-liquidity=""/g;

function render(view: Parameters<typeof StockProductPage>[0]["view"]): string {
  return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ["/stock/COIN"] }, createElement(StockProductPage, { view, locale: "en" })));
}

describe("product route liquidity", () => {
  it.each([...PRODUCT_TICKERS])("states the recorded liquidity beside the %s route", (ticker) => {
    const view = createStockProductView(ticker, "en");
    expect(view.route).not.toBeNull();
    expect(view.route!.pool).toBe(PRODUCT_ROUTES[ticker].pool.toBase58());
    expect(view.route!.liquidity).not.toBeNull();
    expect(view.route!.liquidity!.amount).toMatch(/^\$/);
  });

  it("leaves only the liquidity line out, and keeps the route, when a product has no recorded reading", () => {
    const view = createStockProductView("COIN", "en");
    const withReading = render(view);
    const without = render({ ...view, route: { ...view.route!, liquidity: null } });
    expect(withReading.match(LIQUIDITY)?.length).toBe(1);
    expect(without.match(LIQUIDITY)).toBeNull();
    // Everything else on the page, the route and the Buy link included, is unchanged.
    expect(withReading.replace(/<p[^>]*data-product-route-liquidity=""[^>]*>.*?<\/p>/, "")).toBe(without);
    expect(without).toContain('data-cta="buy"');
  });
});
