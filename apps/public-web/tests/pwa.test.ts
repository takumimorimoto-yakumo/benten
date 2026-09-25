import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { APP_ICON_COLORS, APP_ICON_MASTERS, APP_ICON_TRANSPARENT_MASTERS, appIconMaster, appIconPixels, appIconPng, decodePng, readRepositoryFile } from "@/features/pwa/app-icon.server";
import { installFiles } from "@/features/pwa/install-files.server";
import { APP_ICONS, FAVICON_ICO, manifestPath, PWA_COLORS, type AppIconFile, type AppIconTheme } from "@/features/pwa/pwa-config";
import { webManifestFor } from "@/features/pwa/web-manifest.server";
import { companyMessagesFor } from "@/i18n/company-messages";
import { homePath, PUBLIC_WEB_LOCALES } from "@/i18n/locales";

/** `oklch(L C h)` to sRGB hex (Björn Ottosson's OKLab matrices). */
function oklchToHex(value: string): string {
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
  ];
  return `#${linear
    .map((channel) => {
      const clamped = Math.min(1, Math.max(0, channel));
      const encoded = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
      return Math.round(encoded * 255).toString(16).padStart(2, "0");
    })
    .join("")}`;
}

function rootToken(name: string): string {
  const css = readFileSync(new URL("../app/static.css", import.meta.url), "utf8");
  const root = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
  const value = new RegExp(`--${name}:\\s*([^;]+);`).exec(root)?.[1];
  if (!value) throw new Error(`static.css has no :root --${name}`);
  return value;
}

type Chunk = { kind: string; data: Buffer };

function pngChunks(png: Buffer): Chunk[] {
  expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const chunks: Chunk[] = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    chunks.push({ kind: png.toString("ascii", offset + 4, offset + 8), data: png.subarray(offset + 8, offset + 8 + length) });
    offset += 12 + length;
  }
  return chunks;
}

/** The generated dark value of a token: the first `:root` block that holds `@variant dark`. */
function darkToken(name: string): string {
  const css = readFileSync(new URL("../app/static.css", import.meta.url), "utf8");
  const dark = /:root\s*\{\s*@variant dark\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
  const value = new RegExp(`--${name}:\\s*([^;]+);`).exec(dark)?.[1];
  if (!value) throw new Error(`static.css has no dark --${name}`);
  return value;
}

describe("PWA colours", () => {
  it("are the shadcn background tokens of static.css, light and dark", () => {
    expect(PWA_COLORS.background).toBe(oklchToHex(rootToken("background")));
    expect(PWA_COLORS.darkBackground).toBe(oklchToHex(darkToken("background")));
  });
});

describe("Web App Manifest", () => {
  it.each(PUBLIC_WEB_LOCALES)("%s is one installable app that opens its locale's home", (locale) => {
    const manifest = webManifestFor(locale);
    expect(manifest).toMatchObject({
      id: "/",
      name: "Benten",
      short_name: "Benten",
      lang: locale,
      start_url: homePath(locale),
      scope: "/",
      display: "standalone",
      theme_color: PWA_COLORS.background,
      background_color: PWA_COLORS.background,
      description: companyMessagesFor(locale).explore.description,
    });
    expect("prefer_related_applications" in manifest).toBe(false);
    // Chrome's install criteria: a 192 and a 512 icon; Android masks the maskable one.
    expect(manifest.icons.map(({ sizes, purpose }) => `${sizes} ${purpose}`)).toEqual(["192x192 any", "512x512 any", "512x512 maskable"]);
  });

  it("rejects a locale Benten does not publish", () => {
    expect(() => webManifestFor("en-US")).toThrow();
  });

  it("is emitted once per locale, English unprefixed, next to the icons", () => {
    const paths = installFiles().map(({ path }) => path);
    expect(paths).toEqual([
      "/manifest.webmanifest",
      "/ja/manifest.webmanifest",
      "/ko/manifest.webmanifest",
      "/zh-Hans/manifest.webmanifest",
      "/zh-Hant/manifest.webmanifest",
      "/icons/icon-192.png",
      "/icons/icon-512.png",
      "/icons/icon-maskable-512.png",
      "/icons/apple-touch-icon.png",
      "/icons/favicon-light.png",
      "/icons/favicon-dark.png",
      "/favicon.ico",
    ]);
    expect(manifestPath("en")).toBe("/manifest.webmanifest");
    for (const file of installFiles().filter(({ path }) => path.endsWith(".webmanifest"))) {
      expect(JSON.parse(String(file.body))).toEqual(webManifestFor(file.path === "/manifest.webmanifest" ? "en" : file.path.split("/")[1]));
    }
  });
});

type ManifestArtifact = {
  product: string; page: string; theme: string; path: string; sha256: string;
  recorded_at: string; sequence: number; verification_status: string;
};

function hexBytes(hex: string): number[] {
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
}

const THEMES: readonly AppIconTheme[] = ["dark", "light"];

/** Coverage of the mark at one pixel: 0 on the ground, 1 on the mark, projected on the ground-to-mark colour line. */
function coverage(pixels: Uint8Array, index: number, theme: AppIconTheme): number {
  const ground = hexBytes(APP_ICON_COLORS[theme].ground);
  const mark = hexBytes(APP_ICON_COLORS[theme].mark);
  let dot = 0;
  let length = 0;
  for (let channel = 0; channel < 3; channel += 1) {
    const span = mark[channel] - ground[channel];
    dot += (pixels[index * 4 + channel] - ground[channel]) * span;
    length += span * span;
  }
  return dot / length;
}

/** Coverage read straight from a transparent master's alpha: 0 fully clear, 1 fully the mark colour. */
function transparentCoverage(pixels: Uint8Array, index: number): number {
  return pixels[index * 4 + 3] / 255;
}

/**
 * Worst-case gap between the two independent quantisations of the same
 * coverage value: the opaque master rounds each of the three RGB channels to
 * a byte, and `coverage()` recovers an estimate by projecting that rounded
 * colour back onto the ground-to-mark line (up to `sum(|span|) * 0.5 / length`
 * off); the transparent master rounds coverage straight to one alpha byte (up
 * to `0.5 / 255` off). The two errors are independent and can both land at
 * their worst case on the same pixel, so the bound is their sum, not `1/255`.
 */
function quantisationBound(theme: AppIconTheme): number {
  const ground = hexBytes(APP_ICON_COLORS[theme].ground);
  const mark = hexBytes(APP_ICON_COLORS[theme].mark);
  const span = mark.map((value, index) => value - ground[index]);
  const length = span.reduce((sum, value) => sum + value * value, 0);
  const rgbBound = (span.reduce((sum, value) => sum + Math.abs(value), 0) * 0.5) / length;
  return rgbBound + 0.5 / 255;
}

describe("app icon masters", () => {
  const manifest = JSON.parse(readRepositoryFile("docs/ui-design/generated-image-manifest.v1.json").toString("utf8")) as { artifacts: ManifestArtifact[] };

  function expectRegistered(path: string) {
    const artifact = manifest.artifacts.find((entry) => entry.path === path);
    expect(artifact).toBeDefined();
    expect(createHash("sha256").update(readRepositoryFile(path)).digest("hex")).toBe(artifact!.sha256);
    expect(artifact!.verification_status).toBe("verified");
    // The generated-image manifest checker selects the latest recorded minute, then the sequence; the build must read that one.
    const minute = (entry: ManifestArtifact) => entry.recorded_at.slice(0, 16);
    const latest = manifest.artifacts
      .filter((entry) => entry.product === artifact!.product && entry.page === artifact!.page && entry.theme === artifact!.theme)
      .sort((a, b) => minute(a).localeCompare(minute(b)) || a.sequence - b.sequence)
      .at(-1);
    expect(latest?.path).toBe(path);
  }

  it.each(THEMES)("the %s opaque master is the current registered image of its identity, byte for byte", (theme) => {
    expectRegistered(APP_ICON_MASTERS[theme]);
  });

  it.each(THEMES)("the %s transparent master is the current registered image of its identity, byte for byte", (theme) => {
    expectRegistered(APP_ICON_TRANSPARENT_MASTERS[theme]);
  });

  it.each(THEMES)("the %s master is an opaque 1024 square of its two flat colours", (theme) => {
    const { width, height, rgba } = appIconMaster(theme);
    expect([width, height]).toEqual([1024, 1024]);
    const ground = hexBytes(APP_ICON_COLORS[theme].ground);
    const mark = hexBytes(APP_ICON_COLORS[theme].mark);
    // Count natively: one expect per pixel over a megapixel takes seconds.
    let flat = 0;
    let translucent = 0;
    for (let index = 0; index < width * height; index += 1) {
      const [red, green, blue, alpha] = rgba.subarray(index * 4, index * 4 + 4);
      if (alpha !== 255) translucent += 1;
      if ((red === ground[0] && green === ground[1] && blue === ground[2]) || (red === mark[0] && green === mark[1] && blue === mark[2])) flat += 1;
    }
    expect(translucent).toBe(0);
    // Only anti-aliased edge pixels are between the two colours: no gradient, gloss or shadow.
    expect(flat / (width * height)).toBeGreaterThan(0.98);
    expect([...rgba.subarray(0, 3)]).toEqual(ground);
  });

  it.each(THEMES)("the %s transparent master is a 1024 square of one flat mark colour, alpha only", (theme) => {
    const { width, height, rgba } = appIconMaster(theme, "transparent");
    expect([width, height]).toEqual([1024, 1024]);
    const mark = hexBytes(APP_ICON_COLORS[theme].mark);
    let flat = 0;
    let offMark = 0;
    for (let index = 0; index < width * height; index += 1) {
      const [red, green, blue, alpha] = rgba.subarray(index * 4, index * 4 + 4);
      // No ground fill: fully transparent pixels carry no colour information, so only check RGB where alpha > 0.
      if (alpha > 0 && !(red === mark[0] && green === mark[1] && blue === mark[2])) offMark += 1;
      if (alpha === 0 || alpha === 255) flat += 1;
    }
    expect(offMark).toBe(0);
    // Only anti-aliased edge pixels have partial alpha: no gradient, gloss or shadow.
    expect(flat / (width * height)).toBeGreaterThan(0.98);
    // Full bleed to the transparent side: the corners carry no coverage.
    expect(rgba[3]).toBe(0);
  });

  it("both opaque masters draw the same mark", () => {
    const dark = appIconMaster("dark").rgba;
    const light = appIconMaster("light").rgba;
    let largest = 0;
    for (let index = 0; index < dark.length / 4; index += 1) {
      largest = Math.max(largest, Math.abs(coverage(dark, index, "dark") - coverage(light, index, "light")));
    }
    expect(largest).toBeLessThan(0.02);
  });

  it.each(THEMES)("the %s transparent master draws the same mark as its opaque master", (theme) => {
    const opaque = appIconMaster(theme, "opaque").rgba;
    const transparent = appIconMaster(theme, "transparent").rgba;
    let largest = 0;
    for (let index = 0; index < opaque.length / 4; index += 1) {
      largest = Math.max(largest, Math.abs(coverage(opaque, index, theme) - transparentCoverage(transparent, index)));
    }
    // Both are rounded from the identical mask independently (one to a composited byte per RGB channel, one straight to alpha): bounded quantisation, not a drawing mismatch (see quantisationBound).
    expect(largest).toBeLessThanOrEqual(quantisationBound(theme) + 1e-9);
  });

  it("decodes a filtered RGB PNG to RGBA", () => {
    // A 2x1 RGB PNG with a Sub-filtered row: red, then red plus (0, 255, 0) = yellow.
    const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000020000000108020000007b40e8dd0000000f4944415478da63fccfc0c0f09f0100080602005f5bead80000000049454e44ae426082", "hex");
    const raster = decodePng(png);
    expect([raster.width, raster.height, ...raster.rgba]).toEqual([2, 1, 255, 0, 0, 255, 255, 255, 0, 255]);
  });
});

describe("app icons", () => {
  it.each(Object.keys(APP_ICONS) as AppIconFile[])("%s is an RGBA PNG of its size with no metadata", (file) => {
    const { size, theme, background } = APP_ICONS[file];
    const png = appIconPng(file);
    const chunks = pngChunks(png);
    expect(chunks.map(({ kind }) => kind)).toEqual(["IHDR", "IDAT", "IEND"]);
    const header = chunks[0].data;
    expect([header.readUInt32BE(0), header.readUInt32BE(4), ...header.subarray(8)]).toEqual([size, size, 8, 6, 0, 0, 0]);
    // The IDAT decodes to exactly the reduced master (filter byte 0 per row).
    const scanlines = inflateSync(chunks[1].data);
    const pixels = appIconPixels(file);
    const stride = size * 4 + 1;
    expect(scanlines.length).toBe(stride * size);
    const filters = Array.from({ length: size }, (_, row) => scanlines[row * stride]);
    expect(filters.every((filter) => filter === 0)).toBe(true);
    // Compare the pixel bytes natively: a deep toEqual over a 1 MiB buffer walks it element by element.
    const drawn = Buffer.concat(Array.from({ length: size }, (_, row) => scanlines.subarray(row * stride + 1, (row + 1) * stride)));
    expect(drawn.equals(pixels)).toBe(true);
    if (background === "opaque") {
      // Full bleed: the corners are the ground colour, fully opaque.
      expect([...pixels.subarray(0, 4)]).toEqual([...hexBytes(APP_ICON_COLORS[theme].ground), 255]);
      expect(pixels.every((value, index) => index % 4 !== 3 || value === 255)).toBe(true);
    } else {
      // No ground fill: every pixel (drawn or not) is the flat mark colour, and the corners carry no coverage.
      const mark = hexBytes(APP_ICON_COLORS[theme].mark);
      expect(pixels[3]).toBe(0);
      for (let index = 0; index < pixels.length / 4; index += 1) {
        expect([...pixels.subarray(index * 4, index * 4 + 3)]).toEqual(mark);
      }
    }
  });

  it("writes the same bytes on every build", () => {
    expect(appIconPng("icon-512.png").equals(appIconPng("icon-512.png"))).toBe(true);
  });

  it("home-screen icons are the dark master and the tab icons follow the colour scheme", () => {
    for (const file of ["icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"] as const) expect(APP_ICONS[file].theme).toBe("dark");
    expect([APP_ICONS["favicon-light.png"].theme, APP_ICONS["favicon-dark.png"].theme]).toEqual(["light", "dark"]);
  });

  it("keeps the maskable mark inside the 80% safe circle with at least a 5% margin", () => {
    const size = APP_ICONS["icon-maskable-512.png"].size;
    const pixels = appIconPixels("icon-maskable-512.png");
    // Safe circle radius 40% of the icon; the mark stays within 35%.
    const markRadius = size * 0.35;
    let markPixels = 0;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (coverage(pixels, y * size + x, "dark") > 0.02) {
          markPixels += 1;
          expect(Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2)).toBeLessThan(markRadius);
        }
      }
    }
    expect(markPixels).toBeGreaterThan(0);
  });
});

describe("/favicon.ico", () => {
  it("wraps the official tab icon's PNG in one ICO entry", () => {
    const file = installFiles().find(({ path }) => path === FAVICON_ICO.path)!;
    const body = Buffer.from(file.body as Uint8Array);
    const png = appIconPng(FAVICON_ICO.source);
    expect(file.contentType).toBe("image/x-icon");
    expect([body.readUInt16LE(0), body.readUInt16LE(2), body.readUInt16LE(4)]).toEqual([0, 1, 1]);
    expect([body.readUInt8(6), body.readUInt8(7), body.readUInt16LE(12)]).toEqual([APP_ICONS[FAVICON_ICO.source].size, APP_ICONS[FAVICON_ICO.source].size, 32]);
    expect([body.readUInt32LE(14), body.readUInt32LE(18)]).toEqual([png.length, 22]);
    expect(body.subarray(22).equals(png)).toBe(true);
    expect(APP_ICONS[FAVICON_ICO.source].theme).toBe("dark");
  });
});
