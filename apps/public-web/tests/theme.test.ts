import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bootTheme, syncThemeInputs, themeBootScript, type ThemeBootWindow } from "@/features/theme/theme-boot";
import { DEFAULT_THEME_CHOICE, isThemeChoice, THEME_BOOT_CONFIG, THEME_CHOICES } from "@/features/theme/theme-config";
import { PWA_COLORS } from "@/features/pwa/pwa-config";
import { CHART_CONFIG } from "@/features/charts/chart-config";

/*
 * A small fake of the browser surface the boot script touches: <html>, the
 * two theme-color metas, the header menu's radios, localStorage and one
 * colour-scheme media query. Enough to run the real script, not a DOM.
 */

type Listener = (event: { target?: unknown; key?: string | null }) => void;

class FakeElement {
  readonly attributes = new Map<string, string>();
  readonly classes = new Set<string>();
  readonly style: { colorScheme?: string } = {};
  readonly classList = {
    toggle: (name: string, force: boolean) => (force ? this.classes.add(name) : this.classes.delete(name), force),
  };
  checked = false;
  constructor(readonly tag: string, attributes: Record<string, string> = {}) {
    for (const [name, value] of Object.entries(attributes)) this.attributes.set(name, value);
  }
  get name(): string { return this.attributes.get("name") ?? ""; }
  get value(): string { return this.attributes.get("value") ?? ""; }
  onRemove: (() => void) | null = null;
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
  remove(): void { this.onRemove?.(); }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
}

type Fake = {
  win: ThemeBootWindow;
  root: FakeElement;
  head: FakeElement[];
  radios: FakeElement[];
  storage: Map<string, string>;
  setSystemDark: (dark: boolean) => void;
  fire: (type: string, event?: Parameters<Listener>[0]) => void;
  listenerCount: () => number;
};

function fakeWindow({ systemDark = false, stored, storage: storageMode = "ok" }: { systemDark?: boolean; stored?: string; storage?: "ok" | "throws" } = {}): Fake {
  const root = new FakeElement("html");
  const head: FakeElement[] = (["light", "dark"] as const).map((scheme) => new FakeElement("meta", { name: "theme-color", content: THEME_BOOT_CONFIG.colors[scheme], [THEME_BOOT_CONFIG.metaSchemeAttribute]: scheme }));
  const radios = THEME_CHOICES.map((choice) => new FakeElement("input", { name: THEME_BOOT_CONFIG.inputName, value: choice }));
  const storage = new Map<string, string>();
  if (stored !== undefined) storage.set(THEME_BOOT_CONFIG.storageKey, stored);
  const listeners: Array<[string, Listener]> = [];
  const mediaListeners: Array<() => void> = [];
  const media = { matches: systemDark, addEventListener: (_type: string, listener: () => void) => mediaListeners.push(listener) };
  const document = {
    documentElement: root,
    head: {
      get firstChild() { return head[0] ?? null; },
      insertBefore: (node: FakeElement, before: FakeElement | null) => {
        head.splice(before ? head.indexOf(before) : head.length, 0, node);
        node.onRemove = () => head.splice(head.indexOf(node), 1);
      },
    },
    createElement: (tag: string) => new FakeElement(tag),
    querySelector: (selector: string) => {
      if (selector === `meta[${THEME_BOOT_CONFIG.metaOverrideAttribute}]`) return head.find((node) => node.attributes.has(THEME_BOOT_CONFIG.metaOverrideAttribute)) ?? null;
      throw new Error(`unexpected selector ${selector}`);
    },
    querySelectorAll: (selector: string) => {
      if (selector === `input[name="${THEME_BOOT_CONFIG.inputName}"]`) return radios;
      throw new Error(`unexpected selector ${selector}`);
    },
    addEventListener: (type: string, listener: Listener) => listeners.push([type, listener]),
  };
  const localStorage = {
    getItem: (key: string) => { if (storageMode === "throws") throw new Error("SecurityError"); return storage.get(key) ?? null; },
    setItem: (key: string, value: string) => { if (storageMode === "throws") throw new Error("QuotaExceededError"); storage.set(key, value); },
  };
  const win = {
    document,
    localStorage,
    matchMedia: (query: string) => { expect(query).toBe(THEME_BOOT_CONFIG.darkQuery); return media; },
    addEventListener: (type: string, listener: Listener) => listeners.push([type, listener]),
  } as unknown as ThemeBootWindow;
  return {
    win, root, head, radios, storage,
    setSystemDark: (dark) => { media.matches = dark; for (const listener of mediaListeners) listener(); },
    fire: (type, event = {}) => { for (const [name, listener] of listeners) if (name === type) listener(event); },
    listenerCount: () => listeners.length + mediaListeners.length,
  };
}

function state(fake: Fake) {
  return {
    dark: fake.root.classes.has("dark"),
    colorScheme: fake.root.style.colorScheme,
    choice: fake.root.getAttribute(THEME_BOOT_CONFIG.choiceAttribute),
    // The browser UI colour per OS scheme: the first theme-color meta whose media matches (no media matches both).
    metas: (["light", "dark"] as const).map((scheme) => fake.head.find((meta) => { const media = meta.getAttribute("media"); return !media && !meta.getAttribute(THEME_BOOT_CONFIG.metaSchemeAttribute) || meta.getAttribute(THEME_BOOT_CONFIG.metaSchemeAttribute) === scheme; })?.getAttribute("content")),
    prerendered: fake.head.filter((meta) => meta.getAttribute(THEME_BOOT_CONFIG.metaSchemeAttribute)).map((meta) => meta.getAttribute("content")),
    checked: fake.radios.filter((radio) => radio.checked).map((radio) => radio.value),
  };
}

const LIGHT = PWA_COLORS.background;
const DARK = PWA_COLORS.darkBackground;

describe("theme choice", () => {
  it("is System, Light or Dark, System by default", () => {
    expect(THEME_CHOICES).toEqual(["system", "light", "dark"]);
    expect(DEFAULT_THEME_CHOICE).toBe("system");
    expect(isThemeChoice("dark")).toBe(true);
    expect(isThemeChoice("Dark")).toBe(false);
    expect(isThemeChoice(null)).toBe(false);
  });
});

describe("theme boot script", () => {
  it("follows the operating system when nothing is stored", () => {
    const light = fakeWindow({ systemDark: false });
    bootTheme(THEME_BOOT_CONFIG, light.win);
    expect(state(light)).toEqual({ dark: false, colorScheme: "light", choice: "system", metas: [LIGHT, DARK], checked: ["system"], prerendered: [LIGHT, DARK] });
    const dark = fakeWindow({ systemDark: true });
    bootTheme(THEME_BOOT_CONFIG, dark.win);
    expect(state(dark)).toEqual({ dark: true, colorScheme: "dark", choice: "system", metas: [LIGHT, DARK], checked: ["system"], prerendered: [LIGHT, DARK] });
  });

  it("applies a stored choice over the operating system, and points both browser UI colours at it", () => {
    const dark = fakeWindow({ systemDark: false, stored: "dark" });
    bootTheme(THEME_BOOT_CONFIG, dark.win);
    expect(state(dark)).toEqual({ dark: true, colorScheme: "dark", choice: "dark", metas: [DARK, DARK], checked: ["dark"], prerendered: [LIGHT, DARK] });
    const light = fakeWindow({ systemDark: true, stored: "light" });
    bootTheme(THEME_BOOT_CONFIG, light.win);
    expect(state(light)).toEqual({ dark: false, colorScheme: "light", choice: "light", metas: [LIGHT, LIGHT], checked: ["light"], prerendered: [LIGHT, DARK] });
  });

  it.each(["purple", "", "DARK", " dark", "null"])("treats the stored value %j as System", (stored) => {
    const fake = fakeWindow({ systemDark: true, stored });
    bootTheme(THEME_BOOT_CONFIG, fake.win);
    expect(state(fake)).toMatchObject({ dark: true, choice: "system" });
  });

  it("works when storage throws: System on load, and a choice still applies for the page", () => {
    const fake = fakeWindow({ systemDark: true, storage: "throws" });
    expect(() => bootTheme(THEME_BOOT_CONFIG, fake.win)).not.toThrow();
    expect(state(fake)).toMatchObject({ dark: true, choice: "system" });
    fake.fire("change", { target: fake.radios[1] });
    expect(state(fake)).toMatchObject({ dark: false, choice: "light", checked: ["light"] });
    // It survives an OS change while pinned: the in-page choice is kept.
    fake.setSystemDark(false);
    fake.setSystemDark(true);
    expect(state(fake)).toMatchObject({ dark: false, choice: "light" });
  });

  it("follows the operating system live, only while the choice is System", () => {
    const fake = fakeWindow({ systemDark: false });
    bootTheme(THEME_BOOT_CONFIG, fake.win);
    fake.setSystemDark(true);
    expect(state(fake)).toMatchObject({ dark: true, choice: "system", colorScheme: "dark" });
    fake.fire("change", { target: fake.radios[1] }); // Light
    fake.setSystemDark(false);
    fake.setSystemDark(true);
    expect(state(fake)).toMatchObject({ dark: false, choice: "light" });
  });

  it("stores a choice made in the header menu and ignores other inputs and unknown values", () => {
    const fake = fakeWindow({ systemDark: false });
    bootTheme(THEME_BOOT_CONFIG, fake.win);
    fake.fire("change", { target: fake.radios[2] }); // Dark
    expect(fake.storage.get(THEME_BOOT_CONFIG.storageKey)).toBe("dark");
    expect(state(fake)).toEqual({ dark: true, colorScheme: "dark", choice: "dark", metas: [DARK, DARK], checked: ["dark"], prerendered: [LIGHT, DARK] });
    fake.fire("change", { target: new FakeElement("input", { name: "q", value: "light" }) });
    fake.fire("change", { target: new FakeElement("input", { name: THEME_BOOT_CONFIG.inputName, value: "sepia" }) });
    fake.fire("change", { target: null });
    expect(fake.storage.get(THEME_BOOT_CONFIG.storageKey)).toBe("dark");
    expect(state(fake).choice).toBe("dark");
    fake.fire("change", { target: fake.radios[0] }); // System
    expect(state(fake)).toMatchObject({ dark: false, choice: "system", metas: [LIGHT, DARK] });
    expect(fake.head).toHaveLength(2);
  });

  it("follows a choice stored in another tab", () => {
    const fake = fakeWindow({ systemDark: false });
    bootTheme(THEME_BOOT_CONFIG, fake.win);
    fake.storage.set(THEME_BOOT_CONFIG.storageKey, "dark");
    fake.fire("storage", { key: "unrelated" });
    expect(state(fake).dark).toBe(false);
    fake.fire("storage", { key: THEME_BOOT_CONFIG.storageKey });
    expect(state(fake)).toMatchObject({ dark: true, choice: "dark" });
  });

  it("checks the radios again once the body exists, and installs its listeners once", () => {
    const fake = fakeWindow({ stored: "light" });
    bootTheme(THEME_BOOT_CONFIG, fake.win);
    const count = fake.listenerCount();
    for (const radio of fake.radios) radio.checked = false;
    fake.fire("DOMContentLoaded");
    expect(state(fake).checked).toEqual(["light"]);
    bootTheme(THEME_BOOT_CONFIG, fake.win);
    expect(fake.listenerCount()).toBe(count);
  });

  it("is the same function once serialized into the document head", () => {
    const script = themeBootScript();
    expect(script.startsWith("(function")).toBe(true);
    expect(script).toContain(JSON.stringify(THEME_BOOT_CONFIG));
    const fake = fakeWindow({ systemDark: false, stored: "dark" });
    new Function("window", script)(fake.win);
    expect(state(fake)).toEqual({ dark: true, colorScheme: "dark", choice: "dark", metas: [DARK, DARK], checked: ["dark"], prerendered: [LIGHT, DARK] });
  });

  it("re-checks fresh radios after a page change from the applied choice", () => {
    const fake = fakeWindow({ stored: "dark" });
    bootTheme(THEME_BOOT_CONFIG, fake.win);
    for (const radio of fake.radios) radio.checked = false;
    syncThemeInputs(fake.win.document);
    expect(state(fake).checked).toEqual(["dark"]);
  });
});

/*
 * static.css: every colour the app paints with has a dark value, and the
 * main pairs keep their contrast in both themes.
 */

const CSS = readFileSync(new URL("../app/static.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

type Blocks = { light: Map<string, string>; dark: Map<string, string>; generated: Map<string, string>; generatedDark: Map<string, string> };

/** The custom properties of the top-level `:root` blocks, and of the `@variant dark` blocks inside them. */
function rootBlocks(): Blocks {
  const light = new Map<string, string>();
  const dark = new Map<string, string>();
  let generated: Map<string, string> | null = null;
  let generatedDark: Map<string, string> | null = null;
  let depth = 0;
  let index = 0;
  while (index < CSS.length) {
    const open = CSS.indexOf("{", index);
    if (open < 0) break;
    const close = CSS.indexOf("}", index);
    if (close >= 0 && close < open) { depth -= 1; index = close + 1; continue; }
    const selector = CSS.slice(Math.max(CSS.lastIndexOf("}", open), CSS.lastIndexOf(";", open), CSS.lastIndexOf("{", open - 1)) + 1, open).trim();
    if (depth === 0 && selector === ":root") {
      // Walk this block: declarations at its own level are light, inside `@variant dark` they are dark.
      let level = 1;
      let cursor = open + 1;
      let target = light;
      const own = new Map<string, string>();
      const ownDark = new Map<string, string>();
      while (level > 0) {
        const nextOpen = CSS.indexOf("{", cursor);
        const nextClose = CSS.indexOf("}", cursor);
        const end = nextOpen >= 0 && nextOpen < nextClose ? nextOpen : nextClose;
        const chunk = CSS.slice(cursor, end);
        for (const match of chunk.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
          target.set(match[1], match[2].trim());
          (target === dark ? ownDark : own).set(match[1], match[2].trim());
        }
        if (end === nextOpen) {
          const inner = CSS.slice(Math.max(CSS.lastIndexOf(";", nextOpen), CSS.lastIndexOf("{", nextOpen - 1), CSS.lastIndexOf("}", nextOpen)) + 1, nextOpen).trim();
          expect(inner, "only @variant dark nests in :root").toBe("@variant dark");
          level += 1;
          target = dark;
        } else {
          level -= 1;
          target = light;
        }
        cursor = end + 1;
      }
      if (!generated) {
        generated = own;
      } else if (!generatedDark && ownDark.size > 0) {
        generatedDark = ownDark;
      }
      index = cursor;
      continue;
    }
    depth += 1;
    index = open + 1;
  }
  return { light, dark, generated: generated ?? new Map(), generatedDark: generatedDark ?? new Map() };
}

const BLOCKS = rootBlocks();

/** A colour token: a literal colour, or `var()`/`color-mix()` of colour tokens. */
function isColor(name: string, seen = new Set<string>()): boolean {
  const value = BLOCKS.light.get(name) ?? BLOCKS.dark.get(name);
  if (!value || seen.has(name)) return false;
  if (/oklch\(|#[0-9a-f]{3,8}\b/i.test(value)) return true;
  const references = [...value.matchAll(/var\((--[\w-]+)\)/g)].map((match) => match[1]);
  return references.length > 0 && references.every((reference) => isColor(reference, new Set([...seen, name])));
}

/** True when the token has a dark value, or is built only from tokens that do (no literal colour of its own). */
function resolvesInDark(name: string): boolean {
  if (BLOCKS.dark.has(name)) return true;
  const value = BLOCKS.light.get(name) ?? "";
  if (/oklch\(|#[0-9a-f]{3,8}\b/i.test(value)) return false;
  const references = [...value.matchAll(/var\((--[\w-]+)\)/g)].map((match) => match[1]);
  return references.length > 0 && references.every(resolvesInDark);
}

describe("dark tokens", () => {
  it("the dark variant is `.dark` on <html>, or the OS dark scheme when no boot script ran", () => {
    const variant = /@custom-variant dark\s*\{([\s\S]*?\n)\}/.exec(CSS)?.[1] ?? "";
    expect(variant).toContain("&:is(.dark, .dark *)");
    expect(variant).toContain("@media (prefers-color-scheme: dark)");
    expect(variant).toContain(`:root:not([${THEME_BOOT_CONFIG.choiceAttribute}])`);
    expect(CSS).not.toMatch(/^\.dark\s*\{/m);
  });

  it("every generated token has its generated dark value", () => {
    const names = [...BLOCKS.generated.keys()].filter((name) => name !== "--radius");
    expect(names.length).toBeGreaterThan(30);
    expect([...BLOCKS.generatedDark.keys()].sort()).toEqual(names.sort());
  });

  it("every colour token Benten names resolves in dark", () => {
    const benten = [...BLOCKS.light.keys()].filter((name) => !BLOCKS.generated.has(name) && isColor(name));
    for (const name of ["--verified", "--verified-surface", "--attention-surface", "--control-border", "--focus-ring-color", "--disabled-surface", "--disabled-ink", "--chart-price", "--chart-price-halo", "--chart-revenue", "--chart-revenue-edge", "--chart-net-income", "--chart-before-listing", "--chart-seam", "--chart-statement-quiet", "--chart-statement-quiet-edge", "--chart-statement-middle", "--chart-statement-strong", "--scrim"]) {
      expect(benten, name).toContain(name);
    }
    expect(benten.filter((name) => !resolvesInDark(name))).toEqual([]);
    // Literal colours need their own dark value.
    for (const name of benten.filter((token) => /oklch\(/.test(BLOCKS.light.get(token) ?? ""))) expect(BLOCKS.dark.has(name), name).toBe(true);
  });

  it("paints the chart and scrim through the role tokens, not the generated chart numbers", () => {
    const island = readFileSync(new URL("../app/features/chart-island/index.tsx", import.meta.url), "utf8");
    const section = readFileSync(new URL("../app/features/charts/chart-section.tsx", import.meta.url), "utf8");
    const statements = ["chart-island/statement-plot.tsx", "statements/statement-chart.tsx", "statements/statement-config.ts"].map((path) => readFileSync(new URL(`../app/features/${path}`, import.meta.url), "utf8"));
    for (const source of [island, section, ...statements]) expect(source).not.toMatch(/chart-[1-5]\b/);
    expect(island).toContain("var(--chart-revenue-edge)");
    expect(island).toContain("var(--chart-price-halo)");
  });

  it("edges the price line with the page background, 2 to 3 px on each side, in both themes", () => {
    const edge = (CHART_CONFIG.priceHaloWidth - CHART_CONFIG.priceStrokeWidth) / 2;
    expect(edge).toBeGreaterThanOrEqual(2);
    expect(edge).toBeLessThanOrEqual(3);
    for (const theme of ["light", "dark"] as const) expect(resolve("--chart-price-halo", theme)).toBe(resolve("--background", theme));
  });
});

/** `oklch(L C h)` or `oklch(L C h / A%)` on an opaque backdrop, to relative luminance. */
function luminance(value: string): number {
  const match = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(value.trim());
  if (!match) throw new Error(`not an opaque oklch value: ${value}`);
  const [lightness, chroma, hue] = match.slice(1).map(Number);
  const a = chroma * Math.cos((hue * Math.PI) / 180);
  const b = chroma * Math.sin((hue * Math.PI) / 180);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((channel) => Math.min(1, Math.max(0, channel)));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function resolve(name: string, theme: "light" | "dark"): string {
  const value = (theme === "dark" ? BLOCKS.dark.get(name) : undefined) ?? BLOCKS.light.get(name);
  if (!value) throw new Error(`no ${name}`);
  const reference = /^var\((--[\w-]+)\)$/.exec(value);
  return reference ? resolve(reference[1], theme) : value;
}

function contrast(foreground: string, background: string, theme: "light" | "dark"): number {
  const [x, y] = [luminance(resolve(foreground, theme)), luminance(resolve(background, theme))];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe("contrast in both themes", () => {
  const TEXT: Array<[string, string]> = [
    ["--foreground", "--background"], ["--card-foreground", "--card"], ["--popover-foreground", "--popover"],
    ["--muted-foreground", "--background"], ["--muted-foreground", "--card"], ["--muted-foreground", "--muted"],
    ["--primary-foreground", "--primary"], ["--secondary-foreground", "--secondary"], ["--accent-foreground", "--accent"],
    ["--disabled-ink", "--disabled-surface"], ["--foreground", "--verified-surface"], ["--destructive", "--card"],
  ];
  const NON_TEXT: Array<[string, string]> = [
    ["--focus-ring-color", "--background"], ["--focus-ring-color", "--card"], ["--focus-ring-color", "--muted"],
    ["--control-border", "--card"], ["--verified", "--card"], ["--verified", "--background"], ["--primary-foreground", "--verified"],
    ["--chart-price", "--background"], ["--chart-revenue-edge", "--background"], ["--chart-net-income", "--background"], ["--chart-seam", "--chart-before-listing"],
    ["--chart-statement-quiet-edge", "--background"], ["--chart-statement-middle", "--background"], ["--chart-statement-strong", "--background"],
  ];
  it.each(["light", "dark"] as const)("%s: text 4.5:1, and 5.14:1 for disabled ink", (theme) => {
    for (const [foreground, background] of TEXT) expect(contrast(foreground, background, theme), `${foreground} on ${background}`).toBeGreaterThanOrEqual(foreground === "--disabled-ink" ? 5.14 : 4.5);
  });
  it.each(["light", "dark"] as const)("%s: every statements chart mark keeps 3:1 on the page, and the middle series stays apart from the quiet edge", (theme) => {
    for (const mark of ["--chart-statement-quiet-edge", "--chart-statement-middle", "--chart-statement-strong", "--foreground"]) {
      expect(contrast(mark, "--background", theme), `${mark} on --background`).toBeGreaterThanOrEqual(3);
      expect(contrast(mark, "--card", theme), `${mark} on --card`).toBeGreaterThanOrEqual(3);
    }
    expect(contrast("--chart-statement-middle", "--chart-statement-quiet-edge", theme)).toBeGreaterThan(1.3);
  });
  it("dark: the statements' middle and strong series are at least oklch 0.708 and 0.87", () => {
    const lightness = (name: string) => Number(/^oklch\(([\d.]+)/.exec(resolve(name, "dark"))![1]);
    expect(lightness("--chart-statement-middle")).toBeGreaterThanOrEqual(0.708);
    expect(lightness("--chart-statement-strong")).toBeGreaterThanOrEqual(0.87);
    expect(resolve("--chart-statement-quiet-edge", "dark")).toBe(resolve("--chart-2", "dark"));
  });
  it.each(["light", "dark"] as const)("%s: non-text and focus ring 3:1", (theme) => {
    for (const [foreground, background] of NON_TEXT) expect(contrast(foreground, background, theme), `${foreground} on ${background}`).toBeGreaterThanOrEqual(3);
  });
});
