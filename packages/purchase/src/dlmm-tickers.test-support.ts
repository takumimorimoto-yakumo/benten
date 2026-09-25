/**
 * Test support: the products bought through a Meteora DLMM pool. Tests of the
 * DLMM reader, builder and audit iterate these; the Raydium CLMM routes have
 * their own tests (`clmm-*.test.ts`).
 */
import { PRODUCT_ROUTES, PRODUCT_TICKERS, type ProductTicker } from "./routes-table";

export const DLMM_TICKERS: readonly ProductTicker[] = PRODUCT_TICKERS.filter((ticker) => PRODUCT_ROUTES[ticker].dex === "meteora-dlmm");
