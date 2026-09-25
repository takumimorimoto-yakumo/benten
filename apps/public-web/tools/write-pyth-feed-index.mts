/**
 * Writes `app/features/pricing/pyth-feed-index.json` from the reviewed Pyth
 * feed map. Run after the feed map changes:
 *
 *   node apps/public-web/tools/write-pyth-feed-index.mts
 *
 * The drift test (`tests/pyth-reference-price.test.ts`) fails until the
 * committed index equals this derivation from the validated feed map.
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { derivePythFeedIndex, type FeedMapEntryLike } from "../app/features/pricing/pyth-feed-index-source.ts";

const feedMapUrl = new URL("../../../packages/pricing/src/pyth-feeds-v1.json", import.meta.url);
const indexUrl = new URL("../app/features/pricing/pyth-feed-index.json", import.meta.url);

const feedMap = JSON.parse(await readFile(feedMapUrl, "utf8")) as { revision: string; entries: FeedMapEntryLike[] };
const index = derivePythFeedIndex(feedMap.revision, feedMap.entries);
await writeFile(indexUrl, `${JSON.stringify(index, null, 2)}\n`);
console.info(`wrote ${fileURLToPath(indexUrl)} (${index.entries.length} products)`);
