/**
 * Web App Manifest and app icon addresses and colours (app IA section 3.4).
 * Browser-safe: the document head reads these on both server and client.
 */

import { localePrefix, type PublicWebLocale } from "../../i18n/locales.js";

/** The installed app's name on every locale's manifest and home screen. */
export const APP_NAME = "Benten";

/** Each locale's manifest sits under that locale's prefix; English is unprefixed. */
export function manifestPath(locale: PublicWebLocale): string {
  return `${localePrefix(locale)}/manifest.webmanifest`;
}

export const MANIFEST_CONTENT_TYPE = "application/manifest+json";

/**
 * The shadcn `--background` token in `static.css` as sRGB hex, light
 * (`:root`) and dark (the `dark` variant), because manifests and
 * `theme-color` do not accept `oklch()` everywhere. SSOT exception: derived
 * copies; `tests/pwa.test.ts` converts both tokens from `static.css` and
 * fails when these drift.
 *
 * The `theme-color` metas paint the browser UI around the page: one per
 * operating-system colour scheme, and the boot script points both at the
 * app's chosen theme (`features/theme`). The manifest's `theme_color` and
 * `background_color` (the launch splash) cannot follow a scheme, so they stay
 * the light background. The icon carries its own ground colour.
 */
export const PWA_COLORS = {
  background: "#ffffff",
  darkBackground: "#0a0a0a",
} as const;

/** The two icon masters: dark (roiro and konjiki) is the official icon, light (gofun and kincha) is for light browser and app chrome. */
export type AppIconTheme = "dark" | "light";

/**
 * Whether an icon file is reduced from the opaque master (a flat ground
 * behind the mark) or the transparent one (the mark colour only, alpha =
 * coverage, no ground fill). Home-screen icons stay opaque: a manifest icon
 * cannot rely on the app's own background showing through on every platform's
 * home screen. The tab icon and header mark use the transparent master so no
 * square shows behind the mark (docs/ui-design/app-icon-design.md).
 */
export type AppIconBackground = "opaque" | "transparent";

/**
 * Every icon file, reduced at build time from its theme's master. The mark
 * already sits inside the maskable safe circle with a margin, so the
 * maskable icon is the same art as the `any` ones. Home-screen icons use the
 * dark master: manifests cannot switch icons by colour scheme reliably.
 */
export const APP_ICONS = {
  "icon-192.png": { size: 192, purpose: "any", theme: "dark", background: "opaque" },
  "icon-512.png": { size: 512, purpose: "any", theme: "dark", background: "opaque" },
  "icon-maskable-512.png": { size: 512, purpose: "maskable", theme: "dark", background: "opaque" },
  "apple-touch-icon.png": { size: 180, purpose: "any", theme: "dark", background: "opaque" },
  "favicon-light.png": { size: 64, purpose: "any", theme: "light", background: "transparent" },
  "favicon-dark.png": { size: 64, purpose: "any", theme: "dark", background: "transparent" },
} as const satisfies Record<string, { size: number; purpose: "any" | "maskable"; theme: AppIconTheme; background: AppIconBackground }>;

export type AppIconFile = keyof typeof APP_ICONS;

/** Browser-tab icons by colour scheme; the header mark uses the same files. */
export const FAVICONS = { light: "favicon-light.png", dark: "favicon-dark.png" } as const satisfies Record<AppIconTheme, AppIconFile>;

/**
 * `/favicon.ico`, which browsers, feed readers and crawlers request without
 * reading the document's icon links: the official (dark) tab icon wrapped in
 * an ICO container, so the address answers instead of a 404.
 */
export const FAVICON_ICO = { path: "/favicon.ico", source: FAVICONS.dark, contentType: "image/x-icon" } as const;

export const APP_ICON_DIRECTORY = "/icons";

export function appIconPath(file: AppIconFile): string {
  return `${APP_ICON_DIRECTORY}/${file}`;
}
