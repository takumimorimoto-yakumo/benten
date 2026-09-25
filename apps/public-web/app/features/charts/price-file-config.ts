/**
 * The schema of the daily on-chain price files. The files are published
 * data files (`app/lib/data-files.ts`): one static JSON file per ticker,
 * `/data/prices/{TICKER}.{digest}.json`, written into the client build next
 * to the prerendered documents (see `vite.config.ts`). The page carries only
 * the file's address; the chart section reads the days after hydration, so
 * no document or loader data embeds a daily series.
 *
 * Dependency-free: the browser-side reader (`price-file.ts`) imports it.
 */

export const PRICE_FILE_SCHEMA_VERSION = "benten.public-web.price-series.v1";
