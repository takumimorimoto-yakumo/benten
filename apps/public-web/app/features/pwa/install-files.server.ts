/**
 * The install files of the static build (app IA section 3.4): one Web App
 * Manifest per locale and the app icons. Build-only. The Vite config emits
 * them into the client output, so they are plain files next to the
 * prerendered documents, and serves the same bytes in development.
 */

import { PUBLIC_WEB_LOCALES } from "../../i18n/locales.js";
import { appIconPng, icoFromPng } from "./app-icon.server.js";
import { APP_ICONS, appIconPath, FAVICON_ICO, MANIFEST_CONTENT_TYPE, manifestPath, type AppIconFile } from "./pwa-config.js";
import { webManifestFor } from "./web-manifest.server.js";

export type InstallFile = {
  /** The URL path, starting with `/`. */
  readonly path: string;
  readonly contentType: string;
  readonly body: Uint8Array | string;
};

export function installFiles(): readonly InstallFile[] {
  return [
    ...PUBLIC_WEB_LOCALES.map((locale) => ({
      path: manifestPath(locale),
      contentType: MANIFEST_CONTENT_TYPE,
      body: `${JSON.stringify(webManifestFor(locale), null, 2)}\n`,
    })),
    ...(Object.keys(APP_ICONS) as AppIconFile[]).map((file) => ({ path: appIconPath(file), contentType: "image/png", body: appIconPng(file) })),
    { path: FAVICON_ICO.path, contentType: FAVICON_ICO.contentType, body: icoFromPng(appIconPng(FAVICON_ICO.source), APP_ICONS[FAVICON_ICO.source].size) },
  ];
}
