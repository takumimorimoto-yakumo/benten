import type { PublicWebLocale } from "@/i18n/locales";
import { THEME_BOOT_CONFIG } from "@/features/theme/theme-config";
import { APP_ICONS, appIconPath, FAVICONS, manifestPath } from "./pwa-config";

/**
 * The document head's install surface: the locale's manifest, the icons and
 * the browser UI colour. The tab icon follows the browser's colour scheme:
 * the light master on light tab strips, the dark master on dark ones.
 *
 * The browser UI colour has one meta per colour scheme. For a pinned app
 * theme the boot script adds its own meta ahead of these two
 * (`features/theme`); these stay as prerendered.
 */
export function PwaHead({ locale }: { locale: PublicWebLocale }) {
  return (
    <>
      <link rel="manifest" href={manifestPath(locale)} />
      {(["light", "dark"] as const).map((scheme) => (
        <link
          key={scheme}
          rel="icon"
          href={appIconPath(FAVICONS[scheme])}
          type="image/png"
          sizes={`${APP_ICONS[FAVICONS[scheme]].size}x${APP_ICONS[FAVICONS[scheme]].size}`}
          media={`(prefers-color-scheme: ${scheme})`}
        />
      ))}
      <link rel="apple-touch-icon" href={appIconPath("apple-touch-icon.png")} />
      {(["light", "dark"] as const).map((scheme) => (
        <meta
          key={scheme}
          name="theme-color"
          content={THEME_BOOT_CONFIG.colors[scheme]}
          media={`(prefers-color-scheme: ${scheme})`}
          {...{ [THEME_BOOT_CONFIG.metaSchemeAttribute]: scheme }}
        />
      ))}
    </>
  );
}
