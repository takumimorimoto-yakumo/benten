/**
 * Light and dark themes: the three choices, where the choice is kept, and
 * the names the document head's boot script and the header menu share.
 * Browser-safe: the document head reads these on both server and client.
 */

import { PWA_COLORS } from "../pwa/pwa-config.js";

/** `system` follows the operating system's colour scheme, live; `light` and `dark` pin one. */
export const THEME_CHOICES = ["system", "light", "dark"] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];
export type ResolvedTheme = Exclude<ThemeChoice, "system">;

export const DEFAULT_THEME_CHOICE: ThemeChoice = "system";

/**
 * Everything the boot script needs, as plain data: it is serialized into the
 * prerendered `<head>`, so it must stay JSON.
 */
export type ThemeBootConfig = {
  /** localStorage key of the choice. */
  readonly storageKey: string;
  readonly choices: readonly ThemeChoice[];
  readonly fallback: ThemeChoice;
  /** The media query `system` follows. */
  readonly darkQuery: string;
  /** Class shadcn's dark tokens and `dark:` utilities key on. */
  readonly darkClass: string;
  /**
   * Attribute on `<html>` naming the applied choice. The boot script always
   * sets it; its absence means no script ran, and `static.css` then follows
   * `prefers-color-scheme` on its own.
   */
  readonly choiceAttribute: string;
  /** Name of the header menu's radio inputs. */
  readonly inputName: string;
  /** Attribute on each prerendered `theme-color` meta naming the colour scheme it was written for. */
  readonly metaSchemeAttribute: string;
  /** Attribute marking the `theme-color` meta the boot script adds for a pinned choice. */
  readonly metaOverrideAttribute: string;
  /** The `theme-color` of each resolved theme. */
  readonly colors: Readonly<Record<ResolvedTheme, string>>;
  /** Window property set once the boot script's listeners are installed. */
  readonly installedFlag: string;
};

export const THEME_BOOT_CONFIG: ThemeBootConfig = {
  storageKey: "benten:theme",
  choices: THEME_CHOICES,
  fallback: DEFAULT_THEME_CHOICE,
  darkQuery: "(prefers-color-scheme: dark)",
  darkClass: "dark",
  choiceAttribute: "data-theme-choice",
  inputName: "benten-theme",
  metaSchemeAttribute: "data-theme-scheme",
  metaOverrideAttribute: "data-theme-override",
  colors: { light: PWA_COLORS.background, dark: PWA_COLORS.darkBackground },
  installedFlag: "__bentenThemeInstalled",
};

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return typeof value === "string" && (THEME_CHOICES as readonly string[]).includes(value);
}
