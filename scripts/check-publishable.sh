#!/usr/bin/env bash
# Fail closed when git-tracked content is unsafe for this English-only public repository.
# An optional scan root is accepted only to support isolated detector tests.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${1:-$(cd "$SCRIPT_DIR/.." && pwd)}"

python3 - "$REPO_ROOT" <<'PY'
from __future__ import annotations

import os
from pathlib import PurePosixPath
import re
import subprocess
import sys
import binascii
import hashlib
import json
import struct
import zlib

repo = sys.argv[1]
self_path = "scripts/check-publishable.sh"
denylist_source = os.environ.get("DENYLIST_REGEX", "")
denylist_required = os.environ.get("DENYLIST_REQUIRED", "") == "1"

if denylist_required and not denylist_source:
    print("FAIL: required publication denylist is not configured")
    raise SystemExit(1)

try:
    denylist = re.compile(denylist_source, re.IGNORECASE) if denylist_source else None
except re.error:
    print("FAIL: DENYLIST_REGEX is not a valid regular expression")
    raise SystemExit(1)

listed = subprocess.run(
    ["git", "-C", repo, "ls-files", "-z"],
    check=True,
    stdout=subprocess.PIPE,
).stdout.split(b"\0")
paths = [item.decode("utf-8") for item in listed if item]

# Uploaded sources must never carry local build outputs: the hosted build
# regenerates every one of them, and a stale copy could be served instead.
required_vercel_ignores = {
    ".next/", "apps/public-api/dist/", "apps/public-web/.generated/",
    "apps/public-web/build/", "apps/public-web/build-capsule/", "apps/public-web/build-host/",
    "node_modules/", "packages/*/dist/", "CLAUDE.md", ".env", ".env.*"
}
try:
    vercel_ignore = subprocess.run(
        ["git", "-C", repo, "show", ":.vercelignore"],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
    ).stdout.decode("utf-8").splitlines()
except (subprocess.CalledProcessError, UnicodeDecodeError):
    vercel_ignore = []

cjk = re.compile(
    "[\u1100-\u11ff\u3040-\u30ff\u3130-\u318f\u3400-\u4dbf\u4e00-\u9fff"
    "\ua960-\ua97f\uac00-\ud7af\ud7b0-\ud7ff\uf900-\ufaff\uff65-\uff9f"
    "\U00020000-\U0002fa1f]"
)
absolute_path = re.compile(r"/Users/|/home/|[A-Za-z]:\\Users\\")
local_guidance_reference = re.compile(r"(?:^|[/`])(?:CLAUDE|AGENTS)\.md(?:$|[`\s)])")
retired_runtime_reference = re.compile(r"@benten/core|FUNDAMENTALS_DB_(?:URL|KEY)")
network_free_paths = {
    "packages/mcp/src/tools/get-fundamentals.ts",
    "packages/mcp/src/tools/get-financials.ts",
    "packages/mcp/src/lib/provider-assets.ts",
    "packages/mcp/src/lib/onchain-prices.ts",
    "packages/pricing/src/onchain-daily.ts",
    "packages/pricing/src/onchain-price.ts",
    "apps/web/app/api/fundamentals/[ticker]/route.ts",
    "apps/web/app/api/financials/[ticker]/route.ts",
    "apps/web/app/api/v2/fundamentals/route.ts",
    "apps/web/app/api/v2/financials/route.ts",
    "apps/web/app/api/v2/provider-assets/route.ts",
    "apps/public-api/src/app.ts",
    "apps/public-api/src/presenters/legacy-v1.ts",
    "apps/public-api/src/presenters/public-v2.ts",
    "apps/public-api/src/solana-address.ts",
}
runtime_network_primitive = re.compile(
    r"\bfetch\s*\(|next/headers|x-forwarded-proto|\.get\([\"']host[\"']\)|process\.env"
)
signing_identifiers = (
    b"sign" + b"Transaction",
    b"sign" + b"AllTransactions",
    b"send" + b"Transaction",
    b"Keypair.from" + b"SecretKey",
)
secret_byte_patterns = (
    re.compile(rb"\b(?:NEXT_PUBLIC_|VITE_)[A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD)[A-Z0-9_]*\b"),
    re.compile(rb"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b"),
    re.compile(rb"\bsb_secret_[A-Za-z0-9_-]+\b"),
    re.compile(rb"\bservice" + rb"_role\b", re.IGNORECASE),
    re.compile(rb"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(rb"[a-z][a-z0-9+.-]*://[^\s/:]+:[^\s/@]+@", re.IGNORECASE),
    *(re.compile(rb"\b" + re.escape(identifier) + rb"\b") for identifier in signing_identifiers),
)
# 2026-09-24 user decision (plan section 2): the browser purchase panel may ask
# the user's own wallet to sign and send through the Wallet Standard feature,
# and only from this one file. The identifier is blocked on every other path;
# the other signing identifiers above stay blocked on this path too.
wallet_send_identifier = b"signAndSend" + b"Transaction"
wallet_send_pattern = re.compile(rb"\b" + re.escape(wallet_send_identifier) + rb"\b")
wallet_send_exception_path = "packages/purchase/src/wallet-standard.ts"
detector_sources = {self_path, "scripts/check-secrets.sh"}
findings: list[tuple[str, str, int]] = []

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
PNG_MAX_BYTES = 20 * 1024 * 1024
PNG_MAX_TEXT_BYTES = 1024 * 1024
PNG_MAX_DECOMPRESSED_BYTES = 128 * 1024 * 1024
C2PA_UUID = bytes.fromhex("6332706100110010800000aa00389b71")
C2PA_BOX_TYPES = {b"jumb", b"jumd", b"cbor", b"bfdb", b"bidb"}

def index_blob(path: str) -> bytes | None:
    result = subprocess.run(
        ["git", "-C", repo, "show", f":{path}"],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
    )
    return result.stdout if result.returncode == 0 else None

def index_mode(path: str) -> str | None:
    result = subprocess.run(
        ["git", "-C", repo, "ls-files", "--stage", "-z", "--", path],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
    )
    records = [record for record in result.stdout.split(b"\0") if record]
    if result.returncode != 0 or len(records) != 1 or b"\t" not in records[0]:
        return None
    metadata, indexed_path = records[0].split(b"\t", 1)
    fields = metadata.split()
    if len(fields) != 3 or fields[2] != b"0" or indexed_path.decode("utf-8") != path:
        return None
    return fields[0].decode("ascii")

registered_pngs: dict[str, str] = {}
manifest_path = "docs/ui-design/generated-image-manifest.v1.json"
manifest_blob = index_blob(manifest_path)
if manifest_blob is not None:
    try:
        manifest = json.loads(manifest_blob)
        roots = manifest["asset_roots"]
        artifacts = manifest["artifacts"]
        if manifest.get("schema_version") != "yakumo.generated-image-manifest.v1":
            raise ValueError("unsupported manifest schema")
        if not isinstance(roots, list) or not roots or not all(isinstance(root, str) for root in roots):
            raise ValueError("invalid asset roots")
        if not isinstance(artifacts, list):
            raise ValueError("invalid artifacts")
        for artifact in artifacts:
            path = artifact.get("path")
            digest = artifact.get("sha256")
            if (
                not isinstance(path, str)
                or not isinstance(digest, str)
                or not re.fullmatch(r"[a-f0-9]{64}", digest)
                or path in registered_pngs
                or not path.endswith(".png")
                or not any(path.startswith(root.rstrip("/") + "/") for root in roots)
            ):
                raise ValueError("invalid artifact registration")
            registered_pngs[path] = digest
    except (UnicodeDecodeError, json.JSONDecodeError, KeyError, TypeError, ValueError):
        findings.append(("invalid-generated-image-manifest", manifest_path, 0))

localization_review_paths: set[str] = set()
# Each reviewed catalog is registered by its own app-local manifest. A manifest
# may register only its exact expected catalog, so no manifest can allowlist
# another path, and each catalog keeps the full hash/mode/content checks.
localization_manifests = {
    "apps/web/lib/i18n/catalog-manifest.json": {"apps/web/lib/i18n/messages.ts"},
    "apps/public-web/app/i18n/catalog-manifest.json": {
        "apps/public-web/app/i18n/messages.ts",
        "apps/public-web/app/i18n/purchase-messages.ts",
        "apps/public-web/app/i18n/shell-messages.ts",
        "apps/public-web/app/i18n/company-messages.ts",
        "apps/public-web/app/i18n/holdings-messages.ts",
        "apps/public-web/app/i18n/product-messages.ts",
        "apps/public-web/app/i18n/pages-messages.ts",
        "apps/public-web/app/i18n/pages-nav-messages.ts",
        "apps/public-web/app/i18n/charts-messages.ts",
        "apps/public-web/app/i18n/statements-messages.ts",
    },
}
for localization_manifest_path, expected_catalog_paths in localization_manifests.items():
    localization_manifest_blob = index_blob(localization_manifest_path)
    if localization_manifest_blob is not None:
        try:
            if index_mode(localization_manifest_path) != "100644":
                raise ValueError("localization manifest must be a regular non-executable blob")
            if b"\0" in localization_manifest_blob or any(byte > 0x7F for byte in localization_manifest_blob):
                raise ValueError("localization manifest must be ASCII JSON")
            localization_manifest = json.loads(localization_manifest_blob)
            if not isinstance(localization_manifest, dict) or set(localization_manifest) != {
                "schema_version", "default_locale", "locales", "catalogs"
            }:
                raise ValueError("invalid localization manifest keys")
            if localization_manifest["schema_version"] != "benten.localization-catalog-manifest.v1":
                raise ValueError("unsupported localization manifest schema")
            if localization_manifest["default_locale"] != "en":
                raise ValueError("invalid default locale")
            if localization_manifest["locales"] != ["en", "ja", "ko", "zh-Hans", "zh-Hant"]:
                raise ValueError("incomplete or unknown locale set")
            catalogs = localization_manifest["catalogs"]
            if not isinstance(catalogs, list):
                raise ValueError("invalid localization catalogs")
            registered_catalogs: dict[str, str] = {}
            for catalog in catalogs:
                if not isinstance(catalog, dict) or set(catalog) != {"path", "sha256"}:
                    raise ValueError("invalid localization catalog entry")
                catalog_path = catalog["path"]
                digest = catalog["sha256"]
                if (
                    not isinstance(catalog_path, str)
                    or not isinstance(digest, str)
                    or not re.fullmatch(r"[a-f0-9]{64}", digest)
                    or catalog_path in registered_catalogs
                    or PurePosixPath(catalog_path).is_absolute()
                    or ".." in PurePosixPath(catalog_path).parts
                ):
                    raise ValueError("invalid localization catalog registration")
                registered_catalogs[catalog_path] = digest
            if set(registered_catalogs) != expected_catalog_paths:
                raise ValueError("required localization catalog entry missing or unknown")
            registration_valid = True
            for catalog_path, digest in registered_catalogs.items():
                catalog_blob = index_blob(catalog_path)
                if catalog_blob is None:
                    findings.append(("missing-localization-catalog", catalog_path, 0))
                    registration_valid = False
                elif index_mode(catalog_path) != "100644":
                    findings.append(("localization-catalog-not-regular-file", catalog_path, 0))
                    registration_valid = False
                elif hashlib.sha256(catalog_blob).hexdigest() != digest:
                    findings.append(("localization-catalog-hash-mismatch", catalog_path, 0))
                    registration_valid = False
            if registration_valid:
                localization_review_paths.update(registered_catalogs)
        except (UnicodeDecodeError, json.JSONDecodeError, KeyError, TypeError, ValueError):
            findings.append(("invalid-localization-catalog-manifest", localization_manifest_path, 0))

def bounded_decompress(payload: bytes, maximum: int) -> bytes:
    decompressor = zlib.decompressobj()
    output = decompressor.decompress(payload, maximum + 1)
    if len(output) > maximum or decompressor.unconsumed_tail:
        raise ValueError("PNG compressed stream is too large")
    output += decompressor.flush(maximum + 1 - len(output))
    if (
        len(output) > maximum
        or not decompressor.eof
        or decompressor.unused_data
        or decompressor.unconsumed_tail
    ):
        raise ValueError("PNG compressed stream is incomplete or has trailing data")
    return output

def validate_keyword(keyword: bytes) -> str:
    if not 1 <= len(keyword) <= 79 or keyword[:1] == b" " or keyword[-1:] == b" " or b"  " in keyword:
        raise ValueError("invalid PNG text keyword")
    if any(value < 32 or 127 <= value <= 160 for value in keyword):
        raise ValueError("invalid PNG text keyword")
    return keyword.decode("latin-1")

def parse_jumd(payload: bytes) -> tuple[bytes, str]:
    if len(payload) < 19:
        raise ValueError("truncated JUMBF description box")
    content_type = payload[:16]
    toggles = payload[16]
    if toggles not in (0x03, 0x13):
        raise ValueError("unsupported JUMBF description layout")
    label_end = payload.find(b"\0", 17)
    if label_end <= 17:
        raise ValueError("missing JUMBF description label")
    label = payload[17:label_end].decode("utf-8")
    remainder = payload[label_end + 1:]
    if toggles == 0x03 and remainder:
        raise ValueError("unexpected JUMBF description fields")
    if toggles == 0x13 and (
        len(remainder) != 24
        or struct.unpack(">I", remainder[:4])[0] != 24
        or remainder[4:8] != b"c2sh"
    ):
        raise ValueError("invalid JUMBF content hash field")
    return content_type, label

def parse_boxes(payload: bytes, *, top_level: bool = False, depth: int = 0) -> list[tuple[bytes, bytes]]:
    if depth > 32:
        raise ValueError("C2PA box nesting is too deep")
    boxes: list[tuple[bytes, bytes]] = []
    offset = 0
    while offset < len(payload):
        if len(payload) - offset < 8:
            raise ValueError("truncated C2PA box")
        size = struct.unpack(">I", payload[offset:offset + 4])[0]
        kind = payload[offset + 4:offset + 8]
        header_size = 8
        if size == 1:
            if len(payload) - offset < 16:
                raise ValueError("truncated extended C2PA box")
            size = struct.unpack(">Q", payload[offset + 8:offset + 16])[0]
            header_size = 16
        if size == 0 or size < header_size or offset + size > len(payload) or kind not in C2PA_BOX_TYPES:
            raise ValueError("invalid or unsupported C2PA box")
        data = payload[offset + header_size:offset + size]
        boxes.append((kind, data))
        if kind == b"jumb":
            children = parse_boxes(data, depth=depth + 1)
            if not children or children[0][0] != b"jumd":
                raise ValueError("C2PA superbox lacks a description box")
        elif kind == b"jumd":
            parse_jumd(data)
        offset += size
    if not boxes or (top_level and (len(boxes) != 1 or boxes[0][0] != b"jumb")):
        raise ValueError("invalid C2PA box layout")
    return boxes

def cbor_text_values(payload: bytes) -> list[str]:
    texts: list[str] = []
    items = 0

    def read_length(offset: int, additional: int) -> tuple[int | None, int]:
        if additional < 24:
            return additional, offset
        byte_count = {24: 1, 25: 2, 26: 4, 27: 8}.get(additional)
        if byte_count is None:
            if additional == 31:
                return None, offset
            raise ValueError("invalid CBOR length")
        if offset + byte_count > len(payload):
            raise ValueError("truncated CBOR length")
        return int.from_bytes(payload[offset:offset + byte_count], "big"), offset + byte_count

    def parse_item(offset: int, depth: int = 0) -> int:
        nonlocal items
        items += 1
        if items > 100000 or depth > 64 or offset >= len(payload):
            raise ValueError("invalid or excessive CBOR structure")
        initial = payload[offset]
        offset += 1
        major, additional = initial >> 5, initial & 31
        length, offset = read_length(offset, additional)
        if major in (0, 1):
            if length is None: raise ValueError("indefinite CBOR integer")
            return offset
        if major in (2, 3):
            if length is None:
                pieces: list[bytes] = []
                while offset < len(payload) and payload[offset] != 0xFF:
                    initial = payload[offset]
                    offset += 1
                    chunk_major, chunk_additional = initial >> 5, initial & 31
                    if chunk_major != major or chunk_additional == 31:
                        raise ValueError("invalid indefinite CBOR string")
                    chunk_length, offset = read_length(offset, chunk_additional)
                    if chunk_length is None or offset + chunk_length > len(payload):
                        raise ValueError("truncated indefinite CBOR string")
                    pieces.append(payload[offset:offset + chunk_length])
                    offset += chunk_length
                if offset >= len(payload): raise ValueError("unterminated CBOR string")
                if major == 3:
                    texts.append(b"".join(pieces).decode("utf-8"))
                return offset + 1
            if offset + length > len(payload): raise ValueError("truncated CBOR string")
            if major == 3:
                texts.append(payload[offset:offset + length].decode("utf-8"))
            return offset + length
        if major in (4, 5):
            count = None if length is None else length * (2 if major == 5 else 1)
            if count is None:
                while offset < len(payload) and payload[offset] != 0xFF:
                    offset = parse_item(offset, depth + 1)
                if offset >= len(payload): raise ValueError("unterminated CBOR container")
                return offset + 1
            for _ in range(count):
                offset = parse_item(offset, depth + 1)
            return offset
        if major == 6:
            if length is None: raise ValueError("indefinite CBOR tag")
            return parse_item(offset, depth + 1)
        if major == 7:
            if additional == 31: raise ValueError("unexpected CBOR break")
            return offset
        raise ValueError("invalid CBOR major type")

    offset = 0
    while offset < len(payload):
        offset = parse_item(offset)
    return texts

def c2pa_text(payload: bytes) -> list[str]:
    top = parse_boxes(payload, top_level=True)
    top_children = parse_boxes(top[0][1])
    if parse_jumd(top_children[0][1])[0] != C2PA_UUID:
        raise ValueError("caBX is not a C2PA JUMBF superbox")
    texts: list[str] = []

    def inspect_boxes(boxes: list[tuple[bytes, bytes]], depth: int = 0) -> None:
        for kind, data in boxes:
            printable = [part.decode("ascii") for part in re.findall(rb"[\x20-\x7e]+", data)]
            texts.extend(printable)
            if kind == b"cbor":
                texts.extend(cbor_text_values(data))
            elif kind == b"jumd":
                texts.append(parse_jumd(data)[1])
            elif kind == b"jumb":
                inspect_boxes(parse_boxes(data, depth=depth + 1), depth + 1)

    inspect_boxes(top)
    return texts

def image_passes(width: int, height: int, interlace: int) -> list[tuple[int, int]]:
    if interlace == 0:
        return [(width, height)]
    passes = []
    for x_start, y_start, x_step, y_step in (
        (0, 0, 8, 8), (4, 0, 8, 8), (0, 4, 4, 8), (2, 0, 4, 4),
        (0, 2, 2, 4), (1, 0, 2, 2), (0, 1, 1, 2),
    ):
        pass_width = 0 if width <= x_start else (width - x_start + x_step - 1) // x_step
        pass_height = 0 if height <= y_start else (height - y_start + y_step - 1) // y_step
        if pass_width and pass_height:
            passes.append((pass_width, pass_height))
    return passes

def png_text_chunks(blob: bytes) -> list[str]:
    if len(blob) > PNG_MAX_BYTES or not blob.startswith(PNG_SIGNATURE):
        raise ValueError("invalid PNG signature or size")
    offset = len(PNG_SIGNATURE)
    chunks: list[tuple[bytes, bytes]] = []
    while offset < len(blob):
        if len(blob) - offset < 12:
            raise ValueError("truncated PNG chunk")
        length = struct.unpack(">I", blob[offset:offset + 4])[0]
        chunk_type = blob[offset + 4:offset + 8]
        end = offset + 12 + length
        if end > len(blob) or not re.fullmatch(rb"[A-Za-z]{4}", chunk_type):
            raise ValueError("invalid PNG chunk")
        data = blob[offset + 8:offset + 8 + length]
        expected_crc = struct.unpack(">I", blob[offset + 8 + length:end])[0]
        if (binascii.crc32(chunk_type + data) & 0xFFFFFFFF) != expected_crc:
            raise ValueError("invalid PNG CRC")
        chunks.append((chunk_type, data))
        offset = end
        if chunk_type == b"IEND":
            break
    if offset != len(blob) or not chunks or chunks[0][0] != b"IHDR" or chunks[-1][0] != b"IEND":
        raise ValueError("invalid PNG chunk order")
    if len(chunks[0][1]) != 13 or chunks[-1][1] or sum(kind == b"IHDR" for kind, _ in chunks) != 1:
        raise ValueError("invalid PNG structural chunk")
    width, height, bit_depth, color_type, compression, filtering, interlace = struct.unpack(">IIBBBBB", chunks[0][1])
    legal_depths = {0: {1, 2, 4, 8, 16}, 2: {8, 16}, 3: {1, 2, 4, 8}, 4: {8, 16}, 6: {8, 16}}
    if (
        width < 1 or height < 1 or width > 10000 or height > 10000
        or bit_depth not in legal_depths.get(color_type, set())
        or compression != 0 or filtering != 0 or interlace not in (0, 1)
    ):
        raise ValueError("invalid PNG dimensions or image data")

    allowed_chunks = {b"IHDR", b"PLTE", b"IDAT", b"IEND", b"tEXt", b"zTXt", b"iTXt", b"caBX"}
    if any(kind not in allowed_chunks or not 65 <= kind[2] <= 90 for kind, _ in chunks):
        raise ValueError("unsupported PNG chunk")
    idat_positions = [index for index, (kind, _) in enumerate(chunks) if kind == b"IDAT"]
    if not idat_positions or idat_positions != list(range(idat_positions[0], idat_positions[-1] + 1)):
        raise ValueError("PNG IDAT chunks must be consecutive")
    pltes = [(index, data) for index, (kind, data) in enumerate(chunks) if kind == b"PLTE"]
    if len(pltes) > 1 or (color_type == 3 and not pltes) or (color_type in (0, 4) and pltes):
        raise ValueError("invalid PNG palette")
    if pltes:
        plte_index, palette = pltes[0]
        entries = len(palette) // 3
        if plte_index > idat_positions[0] or len(palette) % 3 or not 1 <= entries <= 256 or (color_type == 3 and entries > 2 ** bit_depth):
            raise ValueError("invalid PNG palette")

    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[color_type]
    bits_per_pixel = channels * bit_depth
    layouts = []
    expected_size = 0
    for pass_width, pass_height in image_passes(width, height, interlace):
        row_bytes = (pass_width * bits_per_pixel + 7) // 8
        layouts.append((row_bytes, pass_height))
        expected_size += (row_bytes + 1) * pass_height
    if expected_size > PNG_MAX_DECOMPRESSED_BYTES:
        raise ValueError("PNG decompressed image is too large")
    image_data = bounded_decompress(b"".join(data for kind, data in chunks if kind == b"IDAT"), expected_size)
    if len(image_data) != expected_size:
        raise ValueError("invalid PNG scanline size")
    cursor = 0
    for row_bytes, pass_height in layouts:
        for _ in range(pass_height):
            if image_data[cursor] > 4:
                raise ValueError("invalid PNG scanline filter")
            cursor += row_bytes + 1

    texts: list[str] = []
    total_text_bytes = 0
    def add_text(*values: str) -> None:
        nonlocal total_text_bytes
        for value in values:
            total_text_bytes += len(value.encode("utf-8"))
            if total_text_bytes > PNG_MAX_TEXT_BYTES:
                raise ValueError("PNG text metadata is too large")
            texts.append(value)

    for kind, data in chunks:
        if kind == b"tEXt":
            if b"\0" not in data: raise ValueError("invalid PNG tEXt")
            keyword, text = data.split(b"\0", 1)
            add_text(validate_keyword(keyword), text.decode("latin-1"))
        elif kind == b"zTXt":
            parts = data.split(b"\0", 1)
            if len(parts) != 2 or not parts[1] or parts[1][0] != 0: raise ValueError("invalid PNG zTXt")
            add_text(validate_keyword(parts[0]), bounded_decompress(parts[1][1:], PNG_MAX_TEXT_BYTES).decode("latin-1"))
        elif kind == b"iTXt":
            if b"\0" not in data: raise ValueError("invalid PNG iTXt")
            keyword, remainder = data.split(b"\0", 1)
            if len(remainder) < 2 or remainder[0] not in (0, 1) or remainder[1] != 0:
                raise ValueError("invalid PNG iTXt")
            fields = remainder[2:].split(b"\0", 2)
            if len(fields) != 3:
                raise ValueError("invalid PNG iTXt")
            language = fields[0].decode("ascii")
            if any(ord(character) < 32 or ord(character) > 126 for character in language):
                raise ValueError("invalid PNG iTXt language")
            translated_keyword = fields[1].decode("utf-8")
            payload = bounded_decompress(fields[2], PNG_MAX_TEXT_BYTES) if remainder[0] == 1 else fields[2]
            add_text(validate_keyword(keyword), language, translated_keyword, payload.decode("utf-8"))
        elif kind == b"caBX":
            add_text(*c2pa_text(data))
    return texts

def scan_text(text: str, path: str) -> None:
    for line_number, line in enumerate(text.splitlines(), start=1):
        if path not in detector_sources and any(pattern.search(line.encode("utf-8")) for pattern in secret_byte_patterns):
            findings.append(("secret-or-private-key-pattern", path, line_number))
        if (
            path != wallet_send_exception_path
            and path not in detector_sources
            and wallet_send_pattern.search(line.encode("utf-8"))
        ):
            findings.append(("wallet-send-outside-exception", path, line_number))
        if cjk.search(line) and path not in localization_review_paths:
            findings.append(("cjk", path, line_number))
        if denylist is not None and denylist.search(line): findings.append(("denylist", path, line_number))
        if path != self_path and absolute_path.search(line): findings.append(("local-absolute-path", path, line_number))
        if path not in {self_path, ".gitignore", ".vercelignore"} and local_guidance_reference.search(line):
            findings.append(("local-guidance-reference", path, line_number))
        if path != self_path and retired_runtime_reference.search(line): findings.append(("retired-private-runtime", path, line_number))
        if path in network_free_paths and runtime_network_primitive.search(line):
            findings.append(("snapshot-runtime-network-access", path, line_number))

missing_vercel_ignores = required_vercel_ignores.difference(vercel_ignore)
if missing_vercel_ignores:
    findings.append(("incomplete-vercel-upload-exclusions", ".vercelignore", 0))

for path in paths:
    pure_path = PurePosixPath(path)
    basename = pure_path.name
    if basename in {"CLAUDE.md", "AGENTS.md"} or ".claude" in pure_path.parts or ".agents" in pure_path.parts:
        findings.append(("local-guidance-file", path, 0))

    if basename.startswith(".env") and basename != ".env.example":
        findings.append(("tracked-environment-file", path, 0))

    blob = index_blob(path)
    if blob is None:
        findings.append(("unreadable-index-entry", path, 0))
        continue
    if path.endswith(".png") or blob.startswith(PNG_SIGNATURE):
        expected_hash = registered_pngs.get(path)
        if expected_hash is None:
            findings.append(("unregistered-png", path, 0))
            continue
        if hashlib.sha256(blob).hexdigest() != expected_hash:
            findings.append(("generated-image-hash-mismatch", path, 0))
            continue
        try:
            metadata_text = png_text_chunks(blob)
        except (UnicodeDecodeError, ValueError, zlib.error):
            findings.append(("invalid-png", path, 0))
            continue
        for text in metadata_text:
            scan_text(text, path)
        continue
    if path in registered_pngs:
        findings.append(("registered-image-is-not-png", path, 0))
        continue
    if b"\0" in blob:
        findings.append(("unknown-binary", path, 0))
        continue
    if path not in detector_sources:
        for line_number, line in enumerate(blob.splitlines(), start=1):
            if any(pattern.search(line) for pattern in secret_byte_patterns):
                findings.append(("secret-or-private-key-pattern", path, line_number))
    try:
        text = blob.decode("utf-8")
    except UnicodeDecodeError:
        findings.append(("unknown-binary", path, 0))
        continue
    scan_text(text, path)

print(f"check-publishable: scanned {len(paths)} git-tracked files")
if not denylist:
    print("check-publishable: DENYLIST_REGEX not set; optional denylist check skipped")

if findings:
    for kind, path, line_number in findings:
        location = f"{path}:{line_number}" if line_number else path
        print(f"FAIL [{kind}]: {location}")
    print("check-publishable: FAILED")
    raise SystemExit(1)

print("check-publishable: PASSED")
PY
