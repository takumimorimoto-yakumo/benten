#!/usr/bin/env python3
"""Transparent-background app icon masters (docs/ui-design/app-icon-design.md).

Usage: transparent-app-icon.py SOURCE.png OUT_KONJIKI.png OUT_KINCHA.png

Reads SOURCE.png (the same 1254 px dark Codex generation flatten-app-icon.py
reads) as a coverage mask, reducing it to 1024 by the identical area-averaging
arithmetic (`flatten-app-icon.py`'s `mask_1024`, imported read-only so both
scripts always agree on the mask). Instead of compositing that mask over a
ground colour, this writes it straight to the alpha channel: each output is a
single flat mark colour with no ground fill, konjiki (gold, `#E6B422`) or
kincha (gold-brown, `#C47222`). Both are the tab-icon and header-mark art
(app-icon-design.md's usage table); the opaque masters
(`flatten-app-icon.py`'s output) stay the manifest and home-screen icons.
Standard library only; the outputs are 8-bit RGBA PNGs with no metadata, and
running this again reproduces both masters byte for byte.
"""

import importlib.util
import struct
import sys
import zlib
from pathlib import Path

_FLATTEN_PATH = Path(__file__).with_name("flatten-app-icon.py")
_spec = importlib.util.spec_from_file_location("flatten_app_icon", _FLATTEN_PATH)
flatten = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(flatten)

SIZE = flatten.SIZE
# Mark colours only (docs/ui-design/app-icon-design.md's Colours table); no ground.
MARKS = {"konjiki": "#E6B422", "kincha": "#C47222"}


def write_rgba_png(path, size, rgba):
    raw = b"".join(b"\x00" + bytes(rgba[y * size * 4:(y + 1) * size * 4]) for y in range(size))

    def chunk(kind, body):
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body) & 0xFFFFFFFF)

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    open(path, "wb").write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def main(source, out_konjiki, out_kincha):
    mask = flatten.mask_1024(source)
    for path, hex_value in ((out_konjiki, MARKS["konjiki"]), (out_kincha, MARKS["kincha"])):
        colour = flatten.hex_rgb(hex_value)
        rgba = bytearray(SIZE * SIZE * 4)
        for i, t in enumerate(mask):
            rgba[i * 4:i * 4 + 3] = bytes(colour)
            rgba[i * 4 + 3] = round(255 * t)
        write_rgba_png(path, SIZE, rgba)


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(*sys.argv[1:])
