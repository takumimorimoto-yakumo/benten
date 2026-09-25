/**
 * The theme's only controller. It runs as a small inline script at the top
 * of every prerendered `<head>`, before the stylesheet and before the first
 * paint, so a dark page is dark from its first frame. It reads the stored
 * choice (a missing, unreadable or unknown value is `system`), then:
 * - puts `.dark` on `<html>` (shadcn's switch) or takes it off, sets
 *   `color-scheme`, and names the choice in `data-theme-choice`;
 * - for a pinned choice, puts one `theme-color` meta of its own first in the
 *   head, in that theme's colour (for `system` it removes it, and the
 *   prerendered pair follows the operating system by their `media`);
 * - checks the matching radio of the header's theme menu.
 * It stays installed for the page's life: it follows the operating system
 * while the choice is `system`, stores a choice made in the header menu
 * (the radios' `change` event), and follows a choice made in another tab.
 * It needs no React, so the menu also works in documents that do not hydrate.
 *
 * `bootTheme` is serialized with `Function.prototype.toString`, so it must
 * not reference anything outside its parameters and browser globals.
 */

import { THEME_BOOT_CONFIG, type ThemeBootConfig } from "./theme-config.js";

/** The browser surface the boot script touches; tests pass a fake. */
export type ThemeBootWindow = {
  readonly document: Document;
  readonly localStorage: Storage;
  matchMedia(query: string): MediaQueryList;
  addEventListener(type: "storage", listener: (event: StorageEvent) => void): void;
  [flag: string]: unknown;
};

export function bootTheme(config: ThemeBootConfig, win: ThemeBootWindow): void {
  const doc = win.document;
  const root = doc.documentElement;
  let media: MediaQueryList | null = null;
  try {
    media = win.matchMedia(config.darkQuery);
  } catch {
    media = null;
  }

  function valid(value: unknown): value is ThemeBootConfig["fallback"] {
    return typeof value === "string" && config.choices.indexOf(value as ThemeBootConfig["fallback"]) >= 0;
  }

  function stored(): ThemeBootConfig["fallback"] {
    try {
      const value = win.localStorage.getItem(config.storageKey);
      return valid(value) ? value : config.fallback;
    } catch {
      return config.fallback;
    }
  }

  function apply(choice: ThemeBootConfig["fallback"]): void {
    const dark = choice === "dark" || (choice === "system" && media !== null && media.matches);
    const scheme = dark ? "dark" : "light";
    root.classList.toggle(config.darkClass, dark);
    root.style.colorScheme = scheme;
    root.setAttribute(config.choiceAttribute, choice);
    // A pinned choice adds one theme-color meta of its own, first in the head so it wins over the
    // prerendered per-scheme pair (which stays untouched for hydration); System removes it.
    let override = doc.querySelector(`meta[${config.metaOverrideAttribute}]`);
    if (choice === "system") {
      if (override) override.remove();
    } else {
      if (!override) {
        override = doc.createElement("meta");
        override.setAttribute("name", "theme-color");
        override.setAttribute(config.metaOverrideAttribute, "");
        doc.head.insertBefore(override, doc.head.firstChild);
      }
      override.setAttribute("content", config.colors[scheme]);
    }
    const inputs = doc.querySelectorAll(`input[name="${config.inputName}"]`);
    for (let index = 0; index < inputs.length; index += 1) {
      const input = inputs[index] as HTMLInputElement;
      input.checked = input.value === choice;
    }
  }

  let current = stored();
  apply(current);

  if (win[config.installedFlag]) return;
  win[config.installedFlag] = true;
  // The operating system changed its scheme: only `system` follows it.
  if (media !== null) {
    const follow = () => apply(current);
    if (typeof media.addEventListener === "function") media.addEventListener("change", follow);
    else if (typeof media.addListener === "function") media.addListener(follow);
  }
  // Another tab stored a choice.
  win.addEventListener("storage", (event) => {
    if (event.key === config.storageKey) {
      current = stored();
      apply(current);
    }
  });
  // A choice made in the header menu. Stored when storage is available; applied either way.
  doc.addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement | null;
    if (!input || input.name !== config.inputName || !valid(input.value)) return;
    current = input.value;
    try {
      win.localStorage.setItem(config.storageKey, current);
    } catch {
      // Storage unavailable: the choice lasts for this page.
    }
    apply(current);
  });
  // The body (and the menu's radios) did not exist yet when the head ran.
  doc.addEventListener("DOMContentLoaded", () => apply(current));
}

/** The inline script for the document head: `bootTheme` applied to the shared config. */
export function themeBootScript(config: ThemeBootConfig = THEME_BOOT_CONFIG): string {
  return `(${bootTheme.toString()})(${JSON.stringify(config)},window)`;
}

/**
 * Re-checks the radio of the applied choice. The header re-renders on every
 * page change, and its fresh radios start unchecked; the boot script only
 * checks radios when it applies a choice.
 */
export function syncThemeInputs(doc: Document, config: ThemeBootConfig = THEME_BOOT_CONFIG): void {
  const choice = doc.documentElement.getAttribute(config.choiceAttribute) ?? config.fallback;
  const inputs = doc.querySelectorAll<HTMLInputElement>(`input[name="${config.inputName}"]`);
  for (const input of inputs) input.checked = input.value === choice;
}
