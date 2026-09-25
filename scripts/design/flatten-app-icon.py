#!/usr/bin/env python3
"""Flatten a generated app-icon image to two exact colours (docs/ui-design/app-icon-design.md).

Usage: flatten-app-icon.py SOURCE.png OUT_DARK.png OUT_LIGHT.png

The generated image has the right shape but generation noise in both colours
and a 1254 px canvas. This reads its mark as a coverage mask (each pixel's
position on the line from the median ground colour to the median mark colour,
snapped to 0 or 1 within 6% of either end so flat areas become exactly flat),
reduces the mask to 1024 by area averaging, and composes the same mask in each
theme's two colours. Both outputs therefore draw the identical mark.
Standard library only; the outputs are 8-bit RGB PNGs with no metadata.

`mask_1024` is exported so transparent-app-icon.py (the transparent-background
variant, same directory) reduces the identical mask instead of recomputing it
independently.
"""

import statistics
import struct
import sys
import zlib

SIZE = 1024
THEMES = {"dark": ("#0C0C0C", "#E6B422"), "light": ("#FFFFFC", "#C47222")}
SNAP = 0.06


def read_png(path):
    data = open(path, "rb").read()
    assert data[:8] == b"\x89PNG\r\n\x1a\n", "not a PNG"
    offset, idat = 8, b""
    while offset < len(data):
        (length,) = struct.unpack(">I", data[offset:offset + 4])
        kind, body = data[offset + 4:offset + 8], data[offset + 8:offset + 8 + length]
        offset += 12 + length
        if kind == b"IHDR":
            width, height, depth, colour, _, _, interlace = struct.unpack(">IIBBBBB", body)
        elif kind == b"IDAT":
            idat += body
    assert depth == 8 and interlace == 0 and colour in (2, 6), "unsupported PNG layout"
    channels = 3 if colour == 2 else 4
    raw, stride = zlib.decompress(idat), width * channels
    rgb, previous = bytearray(width * height * 3), bytearray(stride)
    for y in range(height):
        kind = raw[y * (stride + 1)]
        line = bytearray(raw[y * (stride + 1) + 1:(y + 1) * (stride + 1)])
        for i in range(stride):
            left = line[i - channels] if i >= channels else 0
            up = previous[i]
            up_left = previous[i - channels] if i >= channels else 0
            if kind == 1:
                line[i] = (line[i] + left) & 255
            elif kind == 2:
                line[i] = (line[i] + up) & 255
            elif kind == 3:
                line[i] = (line[i] + ((left + up) >> 1)) & 255
            elif kind == 4:
                estimate = left + up - up_left
                a, b, c = abs(estimate - left), abs(estimate - up), abs(estimate - up_left)
                line[i] = (line[i] + (left if a <= b and a <= c else up if b <= c else up_left)) & 255
        previous = line
        for x in range(width):
            rgb[(y * width + x) * 3:(y * width + x) * 3 + 3] = line[x * channels:x * channels + 3]
    return width, height, rgb


def write_png(path, size, rgb):
    raw = b"".join(b"\x00" + bytes(rgb[y * size * 3:(y + 1) * size * 3]) for y in range(size))

    def chunk(kind, body):
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body) & 0xFFFFFFFF)

    header = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    open(path, "wb").write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def hex_rgb(value):
    return [int(value[i:i + 2], 16) for i in (1, 3, 5)]


def mask_1024(source):
    """The mark's coverage at each pixel of a 1024 square: 0 on the ground, 1 on
    the mark, reduced from the source by area averaging. Shared with
    transparent-app-icon.py so both scripts read the identical mask."""
    width, height, px = read_png(source)
    assert width == height, "the source must be square"
    count = width * height
    brightness = [px[i * 3] + px[i * 3 + 1] + px[i * 3 + 2] for i in range(count)]
    grounds = [i for i in range(0, count, 3) if brightness[i] < 100]
    marks = [i for i in range(0, count, 3) if brightness[i] > 300]
    ground = [statistics.median(px[i * 3 + k] for i in grounds) for k in range(3)]
    mark = [statistics.median(px[i * 3 + k] for i in marks) for k in range(3)]
    span = [mark[k] - ground[k] for k in range(3)]
    length = sum(value * value for value in span)
    coverage = []
    for i in range(count):
        t = sum((px[i * 3 + k] - ground[k]) * span[k] for k in range(3)) / length
        coverage.append(0.0 if t < SNAP else 1.0 if t > 1 - SNAP else t)
    step = width / SIZE
    reduced = [0.0] * (SIZE * SIZE)
    for oy in range(SIZE):
        y0, y1 = oy * step, (oy + 1) * step
        for ox in range(SIZE):
            x0, x1, total, yy = ox * step, (ox + 1) * step, 0.0, int(y0)
            while yy < y1:
                wy, xx = min(y1, yy + 1) - max(y0, yy), int(x0)
                while xx < x1:
                    total += coverage[yy * width + xx] * (min(x1, xx + 1) - max(x0, xx)) * wy
                    xx += 1
                yy += 1
            reduced[oy * SIZE + ox] = total / (step * step)
    return reduced


def main(source, out_dark, out_light):
    reduced = mask_1024(source)
    for path, (ground_hex, mark_hex) in ((out_dark, THEMES["dark"]), (out_light, THEMES["light"])):
        g, m = hex_rgb(ground_hex), hex_rgb(mark_hex)
        rgb = bytearray(SIZE * SIZE * 3)
        for i, t in enumerate(reduced):
            for k in range(3):
                rgb[i * 3 + k] = round(g[k] + (m[k] - g[k]) * t)
        write_png(path, SIZE, rgb)


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(*sys.argv[1:])
