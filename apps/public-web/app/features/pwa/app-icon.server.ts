/**
 * The Benten app icon: the biwa-and-wave mark (docs/ui-design/app-icon-design.md).
 * Build-only. Each theme has one reviewed 1024 master PNG in
 * `docs/ui-design/assets/`, registered with its SHA-256 in the generated-image
 * manifest; the static build reads it and writes every icon size from it, so
 * the repository keeps only the registered masters and every build writes the
 * same bytes.
 *
 * The master is decoded and reduced here in plain Node (`node:zlib`): no image
 * dependency, and the same output on every machine.
 */

import { readFileSync } from "node:fs";
import { crc32, deflateSync, inflateSync } from "node:zlib";
import { APP_ICONS, type AppIconBackground, type AppIconFile, type AppIconTheme } from "./pwa-config.js";

/** Repository-relative paths of the opaque masters (a flat ground behind the mark); each must be the current image of its manifest identity. */
export const APP_ICON_MASTERS: Readonly<Record<AppIconTheme, string>> = {
  dark: "docs/ui-design/assets/2609242333_benten_app-icon_roiro-konjiki.png",
  light: "docs/ui-design/assets/2609242333_benten_app-icon_gofun-kincha.png",
};

/**
 * Repository-relative paths of the transparent masters: the same mark, same
 * colours, no ground fill (alpha = the opaque masters' coverage). Generated
 * by `scripts/design/transparent-app-icon.py` from the same source as the
 * opaque masters, so both draw the identical mark
 * (docs/ui-design/app-icon-design.md).
 */
export const APP_ICON_TRANSPARENT_MASTERS: Readonly<Record<AppIconTheme, string>> = {
  dark: "docs/ui-design/assets/2609251422_benten_app-icon_konjiki-transparent.png",
  light: "docs/ui-design/assets/2609251422_benten_app-icon_kincha-transparent.png",
};

/**
 * The two flat colours of each master (sRGB). Dark is the official icon:
 * roiro (lacquer black) ground, konjiki (gold) mark. Light: gofun (shell
 * white) ground, kincha (gold-brown) mark, darker than konjiki so the mark keeps 3:1 on white.
 * The transparent masters draw the same mark colours with no ground.
 */
export const APP_ICON_COLORS = {
  dark: { ground: "#0c0c0c", mark: "#e6b422" },
  light: { ground: "#fffffc", mark: "#c47222" },
} as const satisfies Record<AppIconTheme, { ground: string; mark: string }>;

const REPOSITORY_ROOT = new URL("../../../../../", import.meta.url);

export function readRepositoryFile(path: string): Buffer {
  return readFileSync(new URL(path, REPOSITORY_ROOT));
}

export type Raster = { readonly width: number; readonly height: number; readonly rgba: Uint8Array };

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const toLeft = Math.abs(estimate - left);
  const toUp = Math.abs(estimate - up);
  const toUpLeft = Math.abs(estimate - upLeft);
  if (toLeft <= toUp && toLeft <= toUpLeft) return left;
  return toUp <= toUpLeft ? up : upLeft;
}

/** Decodes an 8-bit, non-interlaced RGB or RGBA PNG (the masters' format) to RGBA. */
export function decodePng(png: Buffer): Raster {
  if (!png.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error("not a PNG");
  let width = 0;
  let height = 0;
  let channels = 0;
  const data: Buffer[] = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    const kind = png.toString("ascii", offset + 4, offset + 8);
    const body = png.subarray(offset + 8, offset + 8 + length);
    if (kind === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const [depth, colour, , , interlace] = body.subarray(8);
      if (depth !== 8 || interlace !== 0 || (colour !== 2 && colour !== 6)) throw new Error("unsupported PNG layout");
      channels = colour === 2 ? 3 : 4;
    } else if (kind === "IDAT") {
      data.push(body);
    }
    offset += 12 + length;
  }
  const scanlines = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  if (scanlines.length !== (stride + 1) * height) throw new Error("PNG image data has the wrong length");
  const rgba = new Uint8Array(width * height * 4);
  let previous = new Uint8Array(stride);
  for (let row = 0; row < height; row += 1) {
    const filter = scanlines[row * (stride + 1)];
    const line = Uint8Array.from(scanlines.subarray(row * (stride + 1) + 1, (row + 1) * (stride + 1)));
    if (filter > 4) throw new Error("unknown PNG filter");
    for (let index = 0; filter !== 0 && index < stride; index += 1) {
      const left = index >= channels ? line[index - channels] : 0;
      const up = previous[index];
      const upLeft = index >= channels ? previous[index - channels] : 0;
      const predictor = filter === 1 ? left : filter === 2 ? up : filter === 3 ? (left + up) >> 1 : paeth(left, up, upLeft);
      line[index] = (line[index] + predictor) & 0xff;
    }
    for (let x = 0; x < width; x += 1) {
      const target = (row * width + x) * 4;
      rgba.set(line.subarray(x * channels, x * channels + 3), target);
      rgba[target + 3] = channels === 4 ? line[x * channels + 3] : 255;
    }
    previous = line;
  }
  return { width, height, rgba };
}

/** For each output index, the source indices it covers and their area weights (a box filter). */
function boxWeights(source: number, target: number): Array<Array<[number, number]>> {
  const step = source / target;
  return Array.from({ length: target }, (_, index) => {
    const start = index * step;
    const end = start + step;
    const weights: Array<[number, number]> = [];
    for (let cell = Math.floor(start); cell < end; cell += 1) {
      weights.push([cell, (Math.min(end, cell + 1) - Math.max(start, cell)) / step]);
    }
    return weights;
  });
}

/** Area-average reduction of a square raster to `size`: each output pixel is the mean of the source area it covers. */
export function reduceRaster(raster: Raster, size: number): Uint8Array {
  if (raster.width !== raster.height || size > raster.width) throw new Error("the master must be square and at least the icon size");
  const source = raster.width;
  const weights = boxWeights(source, size);
  const rows = new Float64Array(source * size * 4);
  for (let y = 0; y < source; y += 1) {
    for (let x = 0; x < size; x += 1) {
      for (const [cell, weight] of weights[x]) {
        for (let channel = 0; channel < 4; channel += 1) rows[(y * size + x) * 4 + channel] += raster.rgba[(y * source + cell) * 4 + channel] * weight;
      }
    }
  }
  const output = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      for (let channel = 0; channel < 4; channel += 1) {
        let sum = 0;
        for (const [cell, weight] of weights[y]) sum += rows[(cell * size + x) * 4 + channel] * weight;
        output[(y * size + x) * 4 + channel] = Math.round(sum);
      }
    }
  }
  return output;
}

function pngChunk(kind: string, data: Uint8Array): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length, 0);
  header.write(kind, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([header.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([header, data, crc]);
}

/** An 8-bit RGBA PNG with only IHDR, IDAT and IEND: no text or other metadata. */
export function encodePng(size: number, pixels: Uint8Array): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const rowBytes = size * 4;
  const scanlines = Buffer.alloc((rowBytes + 1) * size);
  for (let row = 0; row < size; row += 1) {
    scanlines[row * (rowBytes + 1)] = 0;
    scanlines.set(pixels.subarray(row * rowBytes, (row + 1) * rowBytes), row * (rowBytes + 1) + 1);
  }
  return Buffer.concat([PNG_SIGNATURE, pngChunk("IHDR", header), pngChunk("IDAT", deflateSync(scanlines, { level: 9 })), pngChunk("IEND", new Uint8Array())]);
}

const masters = new Map<string, Raster>();

/** Decoded raster of one theme's master, opaque by default (the manifest icons' art) or transparent (the tab icon and header mark's art). Cached per theme and background. */
export function appIconMaster(theme: AppIconTheme, background: AppIconBackground = "opaque"): Raster {
  const key = `${background}:${theme}`;
  let raster = masters.get(key);
  if (!raster) {
    const path = background === "opaque" ? APP_ICON_MASTERS[theme] : APP_ICON_TRANSPARENT_MASTERS[theme];
    raster = decodePng(readRepositoryFile(path));
    masters.set(key, raster);
  }
  return raster;
}

/** RGBA pixels of one icon file, reduced from its theme's master (opaque or transparent, per the file's `background`). */
export function appIconPixels(file: AppIconFile): Uint8Array {
  const { size, theme, background } = APP_ICONS[file];
  return reduceRaster(appIconMaster(theme, background), size);
}

export function appIconPng(file: AppIconFile): Buffer {
  return encodePng(APP_ICONS[file].size, appIconPixels(file));
}

/** ICO header and one directory entry, in bytes (ICONDIR and ICONDIRENTRY). */
const ICO_HEADER_BYTES = 6;
const ICO_ENTRY_BYTES = 16;
/** ICO stores a 256-pixel side as 0; larger PNGs cannot be described. */
const ICO_MAX_SIDE = 256;

/**
 * Wraps one square PNG in an ICO container (one entry holding the PNG bytes,
 * a form every current browser reads), so `/favicon.ico` serves the same
 * image as the tab icon.
 */
export function icoFromPng(png: Buffer, side: number): Buffer {
  if (!Number.isInteger(side) || side < 1 || side > ICO_MAX_SIDE) throw new Error("ICO side must be 1 to 256 pixels");
  const header = Buffer.alloc(ICO_HEADER_BYTES + ICO_ENTRY_BYTES);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const byte = side === ICO_MAX_SIDE ? 0 : side;
  header.writeUInt8(byte, 6);
  header.writeUInt8(byte, 7);
  header.writeUInt8(0, 8);
  header.writeUInt8(0, 9);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(ICO_HEADER_BYTES + ICO_ENTRY_BYTES, 18);
  return Buffer.concat([header, png]);
}
