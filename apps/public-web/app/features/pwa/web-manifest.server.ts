/**
 * One Web App Manifest per locale (app IA section 3.4). Build-only: the
 * static build prerenders `/manifest.webmanifest` and
 * `/{locale}/manifest.webmanifest` from this module.
 */

import { companyMessagesFor } from "../../i18n/company-messages.js";
import { homePath, isPublicWebLocale, type PublicWebLocale } from "../../i18n/locales.js";
import { APP_ICONS, APP_NAME, appIconPath, PWA_COLORS, type AppIconFile } from "./pwa-config.js";

/** Icons listed in the manifest; the apple-touch icon is linked from the document instead. */
const MANIFEST_ICONS: readonly AppIconFile[] = ["icon-192.png", "icon-512.png", "icon-maskable-512.png"];

export type WebManifest = {
  readonly id: string;
  readonly name: string;
  readonly short_name: string;
  readonly description: string;
  readonly lang: PublicWebLocale;
  readonly dir: "ltr";
  readonly start_url: string;
  readonly scope: "/";
  readonly display: "standalone";
  readonly theme_color: string;
  readonly background_color: string;
  readonly icons: ReadonlyArray<{ src: string; sizes: string; type: "image/png"; purpose: "any" | "maskable" }>;
};

/**
 * Every locale is the same installed app (`id` is the root), so installing
 * from Japanese and from English does not create two apps; `start_url`
 * opens the locale the user installed from.
 */
export function webManifestFor(locale: unknown): WebManifest {
  if (!isPublicWebLocale(locale)) throw new Error("web manifest has an unsupported locale");
  return {
    id: "/",
    name: APP_NAME,
    short_name: APP_NAME,
    description: companyMessagesFor(locale).explore.description,
    lang: locale,
    dir: "ltr",
    start_url: homePath(locale),
    scope: "/",
    display: "standalone",
    theme_color: PWA_COLORS.background,
    background_color: PWA_COLORS.background,
    icons: MANIFEST_ICONS.map((file) => ({
      src: appIconPath(file),
      sizes: `${APP_ICONS[file].size}x${APP_ICONS[file].size}`,
      type: "image/png",
      purpose: APP_ICONS[file].purpose,
    })),
  };
}
