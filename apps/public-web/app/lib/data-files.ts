/**
 * The published per-ticker data files: where they live, how they are named
 * and how they are cached. One definition shared by the build (which writes
 * them), the pages (which read them after hydration), the loopback host and
 * the hosted output (which serve them), so the four cannot drift.
 * Browser-safe and dependency-free.
 *
 * Two kinds, one file per ticker each, the same bytes for every locale:
 *
 * - statements: `/data/statements/{TICKER}.{digest}.json` (app IA 4.9);
 * - prices: `/data/prices/{TICKER}.{digest}.json`, the daily on-chain trade
 *   price series (app IA 4.8).
 *
 * The digest is the first `DATA_FILE_DIGEST_LENGTH` hex digits of the
 * SHA-256 of the file's bytes. A changed file gets a new name and a document
 * always names the file it was built with, so every data file is served as
 * JSON and cached for a year.
 */

export const DATA_FILE_DIRECTORIES = { statements: "/data/statements/", prices: "/data/prices/" } as const;
export type DataFileKind = keyof typeof DATA_FILE_DIRECTORIES;

export const DATA_FILE_DIGEST_LENGTH = 16;
export const DATA_FILE_CONTENT_TYPE = "application/json; charset=utf-8";
export const DATA_FILE_CACHE_CONTROL = "public, max-age=31536000, immutable";

/** The registry ticker shape a data file may be named by (exact, upper case). */
const TICKER = /^[A-Z0-9][A-Z0-9.-]{0,15}$/;
const DIGEST = new RegExp(`^[0-9a-f]{${DATA_FILE_DIGEST_LENGTH}}`);

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const FILE = new RegExp(
  `^(?:${Object.values(DATA_FILE_DIRECTORIES).map(escapeRegExp).join("|")})[A-Z0-9][A-Z0-9.-]{0,15}\\.[0-9a-f]{${DATA_FILE_DIGEST_LENGTH}}\\.json$`,
);

/**
 * The address of one ticker's data file of `kind`, from the hex SHA-256 of
 * its bytes. Throws on a ticker or digest that could not name a file.
 */
export function dataFilePath(kind: DataFileKind, ticker: string, sha256Hex: string): string {
  if (!TICKER.test(ticker)) throw new Error(`not a data file ticker: ${ticker}`);
  if (!DIGEST.test(sha256Hex)) throw new Error(`not a data file digest: ${sha256Hex}`);
  return `${DATA_FILE_DIRECTORIES[kind]}${ticker}.${sha256Hex.slice(0, DATA_FILE_DIGEST_LENGTH)}.json`;
}

/** True for a path shaped like a data file of any kind (the host serves only the built ones). */
export function isDataFilePath(pathname: string): boolean {
  return FILE.test(pathname);
}
