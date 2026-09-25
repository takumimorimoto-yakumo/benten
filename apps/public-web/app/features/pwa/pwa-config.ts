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
 * Every icon file, reduced at build time from its theme's master. The mark
 * already sits inside the maskable safe circle with a margin, so the
 * maskable icon is the same art as the `any` ones. Home-screen icons use the
 * dark master: manifests cannot switch icons by colour scheme reliably.
 */
export const APP_ICONS = {
  "icon-192.png": { size: 192, purpose: "any", theme: "dark" },
  "icon-512.png": { size: 512, purpose: "any", theme: "dark" },
  "icon-maskable-512.png": { size: 512, purpose: "maskable", theme: "dark" },
  "apple-touch-icon.png": { size: 180, purpose: "any", theme: "dark" },
  "favicon-light.png": { size: 64, purpose: "any", theme: "light" },
  "favicon-dark.png": { size: 64, purpose: "any", theme: "dark" },
} as const satisfies Record<string, { size: number; purpose: "any" | "maskable"; theme: AppIconTheme }>;

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
