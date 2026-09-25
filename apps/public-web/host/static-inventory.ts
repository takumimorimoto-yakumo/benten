import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { FAVICON_ICO } from "../app/features/pwa/pwa-config.js";
import { NOT_FOUND_DOCUMENT_PREFIX } from "../app/lib/not-found.js";
import { DATA_FILE_CACHE_CONTROL, DATA_FILE_CONTENT_TYPE, isDataFilePath } from "../app/lib/data-files.js";

/**
 * The servable inventory of a built static client directory. This is the one
 * definition of which built files are public and at which path: the loopback
 * host serves exactly these, and the hosted-output builder publishes exactly
 * these, so the two cannot drift.
 */

export type StaticEntry = {
  readonly file: string;
  readonly contentType: string;
  /** Sent with the file when set: the data files (statements and prices), named by their digest, are cached for a year. */
  readonly cacheControl?: string;
};

export type ClientInventory = {
  /** Every servable canonical path. */
  readonly pages: Map<string, StaticEntry>;
  /** Prerendered not-found bodies by their reserved path; served only with status 404. */
  readonly notFound: Map<string, StaticEntry>;
};

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".data": "application/json; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": FAVICON_ICO.contentType,
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  // Install surface (app IA section 3.4): manifests and app icons.
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};

/** Prerendered install files: each locale's manifest, the app icons and `/favicon.ico`. */
function isInstallFile(pathname: string): boolean {
  return pathname.endsWith("/manifest.webmanifest") || pathname.startsWith("/icons/") || pathname === FAVICON_ICO.path;
}

export function contentTypeFor(path: string): string {
  const extension = path.slice(path.lastIndexOf("."));
  return CONTENT_TYPES[extension] ?? "application/octet-stream";
}

async function files(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const output = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  }));
  return output.flat();
}

export async function staticInventory(clientDirectory: string): Promise<ClientInventory> {
  const inventory = new Map<string, StaticEntry>();
  const notFound = new Map<string, StaticEntry>();
  for (const file of await files(clientDirectory)) {
    const pathname = `/${relative(clientDirectory, file).replaceAll("\\", "/")}`;
    if (pathname === "/__spa-fallback.html" || pathname.startsWith("/.vite/")) continue;
    // Not-found bodies are never pages: they have no servable address of their own.
    if (pathname.startsWith(`${NOT_FOUND_DOCUMENT_PREFIX}/`) || pathname.startsWith(`${NOT_FOUND_DOCUMENT_PREFIX}.`)) {
      if (pathname.endsWith("/index.html")) notFound.set(pathname.slice(0, -"/index.html".length), { file, contentType: contentTypeFor(file) });
      continue;
    }

    if (pathname === "/index.html") {
      inventory.set("/", { file, contentType: contentTypeFor(file) });
    } else if (pathname.endsWith("/index.html")) {
      inventory.set(pathname.slice(0, -"/index.html".length), { file, contentType: contentTypeFor(file) });
    } else if (isDataFilePath(pathname)) {
      inventory.set(pathname, { file, contentType: DATA_FILE_CONTENT_TYPE, cacheControl: DATA_FILE_CACHE_CONTROL });
    } else if (pathname.endsWith(".data") || pathname.startsWith("/assets/") || isInstallFile(pathname)) {
      inventory.set(pathname, { file, contentType: contentTypeFor(file) });
    }
  }
  return { pages: inventory, notFound };
}
