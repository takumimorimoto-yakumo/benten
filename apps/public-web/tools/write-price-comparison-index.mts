/**
 * Writes `app/features/price-comparison/comparison-index.json` from the
 * reviewed Pyth feed map and a saved copy of Pyth's key-free feed metadata
 * list (`GET https://hermes.pyth.network/v2/price_feeds`, one or more files,
 * for example `?asset_type=equity` and `?asset_type=crypto`). Run after the
 * feed map changes or to refresh the schedules:
 *
 *   node apps/public-web/tools/write-price-comparison-index.mts <checked-at YYYY-MM-DD> <metadata.json>...
 *
 * The drift test (`tests/price-comparison.test.ts`) fails until the
 * committed index equals this derivation from the validated feed map.
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { derivePriceComparisonIndex, type ComparisonFeedMapEntry } from "../app/features/price-comparison/comparison-index-source.ts";

const [checkedAt, ...metadataFiles] = process.argv.slice(2);
if (!checkedAt || !/^\d{4}-\d{2}-\d{2}$/.test(checkedAt) || metadataFiles.length === 0) throw new Error("usage: write-price-comparison-index.mts <YYYY-MM-DD> <metadata.json>...");

const feedMapUrl = new URL("../../../packages/pricing/src/pyth-feeds-v1.json", import.meta.url);
const indexUrl = new URL("../app/features/price-comparison/comparison-index.json", import.meta.url);

const feedMap = JSON.parse(await readFile(feedMapUrl, "utf8")) as { revision: string; entries: ComparisonFeedMapEntry[] };
const schedules = new Map<string, { symbol: string | undefined; schedule: string }>();
for (const file of metadataFiles) {
  const list = JSON.parse(await readFile(file, "utf8")) as Array<{ id: string; attributes: { symbol?: string; schedule?: string } }>;
  for (const feed of list) if (typeof feed.attributes.schedule === "string") schedules.set(feed.id, { symbol: feed.attributes.symbol, schedule: feed.attributes.schedule });
}
// A schedule is taken only from the metadata of the same feed id, and only when Pyth names it with the feed map's symbol.
const index = derivePriceComparisonIndex({
  revision: feedMap.revision,
  entries: feedMap.entries,
  scheduleOf: (feedId, pythSymbol) => {
    const found = schedules.get(feedId);
    return found && found.symbol === pythSymbol ? found.schedule : undefined;
  },
  scheduleSource: { checked_at: checkedAt },
});
await writeFile(indexUrl, `${JSON.stringify(index, null, 2)}\n`);
console.info(`wrote ${fileURLToPath(indexUrl)} (${index.entries.length} xStocks, ${index.schedules.length} schedules)`);
