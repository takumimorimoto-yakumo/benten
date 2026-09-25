from __future__ import annotations

import binascii
import hashlib
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile
import unittest
import zlib


ROOT = Path(__file__).resolve().parent.parent
SCANNER = ROOT / "scripts" / "check-publishable.sh"
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
C2PA_UUID = bytes.fromhex("6332706100110010800000aa00389b71")
LOCALIZED_TEXT = "".join(chr(value) for value in (0x516C, 0x958B, 0x60C5, 0x5831))
HANGUL_TEXT = "".join(chr(value) for value in (0xACF5, 0xAC1C, 0xC815, 0xBCF4))
LOCALIZED_CATALOG = f"export const messages = {{ ja: '{LOCALIZED_TEXT}' }};\n".encode()
# The repository's own upload exclusions, so a fixture repository scans like this one.
VERCEL_IGNORE = (ROOT / ".vercelignore").read_text()


def chunk(kind: bytes, payload: bytes) -> bytes:
    return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", binascii.crc32(kind + payload) & 0xFFFFFFFF)


def box(kind: bytes, payload: bytes) -> bytes:
    return struct.pack(">I", len(payload) + 8) + kind + payload


def c2pa(payload: bytes = b"") -> bytes:
    description = box(b"jumd", C2PA_UUID + b"\x03c2pa\0")
    content = box(b"cbor", b"\x60" if not payload else bytes([0x60 + len(payload)]) + payload)
    return box(b"jumb", description + content)


def cbor_text(value: str) -> bytes:
    raw = value.encode("utf-8")
    if len(raw) >= 24:
        raise ValueError("test fixture text is too long")
    return bytes([0x60 + len(raw)]) + raw


def c2pa_with_cbor(cbor: bytes, *, label: bytes = b"c2pa") -> bytes:
    description = box(b"jumd", C2PA_UUID + b"\x03" + label + b"\0")
    return box(b"jumb", description + box(b"cbor", cbor))


def make_png(
    *,
    metadata: tuple[tuple[bytes, bytes], ...] = (),
    ihdr: bytes | None = None,
    idat: bytes | None = None,
    split_idat: bool = False,
    between_idat: tuple[bytes, bytes] | None = None,
    include_plte: bool = False,
) -> bytes:
    header = ihdr or struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    compressed = zlib.compress(b"\x00\x00\x00\x00") if idat is None else idat
    parts = [PNG_SIGNATURE, chunk(b"IHDR", header)]
    parts.extend(chunk(kind, payload) for kind, payload in metadata)
    if include_plte:
        parts.append(chunk(b"PLTE", b"\x00\x00\x00"))
    if split_idat:
        midpoint = max(1, len(compressed) // 2)
        parts.append(chunk(b"IDAT", compressed[:midpoint]))
        if between_idat is not None:
            parts.append(chunk(*between_idat))
        parts.append(chunk(b"IDAT", compressed[midpoint:]))
    else:
        parts.append(chunk(b"IDAT", compressed))
    parts.append(chunk(b"IEND", b""))
    return b"".join(parts)


def text_chunk(text: str) -> tuple[bytes, bytes]:
    return b"tEXt", b"Comment\0" + text.encode("latin-1")


def ztxt_chunk(payload: bytes) -> tuple[bytes, bytes]:
    return b"zTXt", b"Comment\0\0" + payload


def itxt_chunk(text: str, *, compressed: bool, language: str = "", translated_keyword: str = "") -> tuple[bytes, bytes]:
    raw = text.encode("utf-8")
    payload = zlib.compress(raw) if compressed else raw
    flag = b"\x01" if compressed else b"\x00"
    return (
        b"iTXt",
        b"Comment\0" + flag + b"\x00" + language.encode("ascii") + b"\0"
        + translated_keyword.encode("utf-8") + b"\0" + payload,
    )


class PublishablePngTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.repo = Path(self.temp.name)
        (self.repo / "scripts").mkdir()
        shutil.copy2(SCANNER, self.repo / "scripts" / "check-publishable.sh")
        (self.repo / ".vercelignore").write_text(VERCEL_IGNORE)
        subprocess.run(["git", "init", "-q", str(self.repo)], check=True)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def stage_image(self, image: bytes, *, registered: bool = True, digest: str | None = None) -> None:
        path = "docs/ui-design/assets/proof.png"
        target = self.repo / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(image)
        if registered:
            manifest = {
                "schema_version": "yakumo.generated-image-manifest.v1",
                "asset_roots": ["docs/ui-design/assets"],
                "artifacts": [{"path": path, "sha256": digest or hashlib.sha256(image).hexdigest()}],
            }
            (self.repo / "docs/ui-design/generated-image-manifest.v1.json").write_text(json.dumps(manifest))
        subprocess.run(["git", "-C", str(self.repo), "add", "."], check=True)

    def stage_localization_catalog(
        self,
        content: bytes = LOCALIZED_CATALOG,
        *,
        manifest: object | None = None,
        include_manifest: bool = True,
        include_catalog: bool = True,
        catalog_path: str = "apps/web/lib/i18n/messages.ts",
        manifest_location: str = "apps/web/lib/i18n/catalog-manifest.json",
    ) -> None:
        if include_catalog:
            target = self.repo / catalog_path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
        if include_manifest:
            manifest_path = self.repo / manifest_location
            manifest_path.parent.mkdir(parents=True, exist_ok=True)
            value = manifest if manifest is not None else {
                "schema_version": "benten.localization-catalog-manifest.v1",
                "default_locale": "en",
                "locales": ["en", "ja", "ko", "zh-Hans", "zh-Hant"],
                "catalogs": [{
                    "path": catalog_path,
                    "sha256": hashlib.sha256(content).hexdigest(),
                }],
            }
            if isinstance(value, bytes):
                manifest_path.write_bytes(value)
            else:
                manifest_path.write_text(json.dumps(value))
        subprocess.run(["git", "-C", str(self.repo), "add", "."], check=True)

    def scan(self, denylist: str | None = None, *, denylist_required: bool = False) -> subprocess.CompletedProcess[str]:
        env = {**os.environ}
        if denylist is not None:
            env["DENYLIST_REGEX"] = denylist
        else:
            env.pop("DENYLIST_REGEX", None)
        if denylist_required:
            env["DENYLIST_REQUIRED"] = "1"
        else:
            env.pop("DENYLIST_REQUIRED", None)
        return subprocess.run(
            ["bash", "scripts/check-publishable.sh"], cwd=self.repo, env=env,
            text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        )

    def assert_invalid_png(self, image: bytes) -> None:
        self.stage_image(image)
        result = self.scan()
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn("invalid-png", result.stdout)

    def test_registered_structurally_valid_png_passes(self) -> None:
        self.stage_image(make_png())
        result = self.scan()
        self.assertEqual(result.returncode, 0, result.stdout)

    def test_unregistered_png_fails_closed(self) -> None:
        self.stage_image(make_png(), registered=False)
        self.assertIn("unregistered-png", self.scan().stdout)

    def test_manifest_hash_mismatch_fails(self) -> None:
        self.stage_image(make_png(), digest="0" * 64)
        self.assertIn("generated-image-hash-mismatch", self.scan().stdout)

    def test_malformed_registered_png_fails(self) -> None:
        self.assert_invalid_png(make_png()[:-3])

    def test_png_text_metadata_is_scanned(self) -> None:
        private_path = "/" + "Users/example/private"
        self.stage_image(make_png(metadata=(text_chunk(private_path),)))
        self.assertIn("local-absolute-path", self.scan().stdout)

    def test_denylist_still_applies_to_png_text_metadata(self) -> None:
        self.stage_image(make_png(metadata=(text_chunk("internal-marker"),)))
        self.assertIn("denylist", self.scan("internal-marker").stdout)

    def test_denylist_configuration_fails_closed(self) -> None:
        self.stage_image(make_png())
        self.assertIn("required publication denylist", self.scan(denylist_required=True).stdout)
        self.assertIn("not a valid regular expression", self.scan("[").stdout)

    def test_registered_localization_catalog_allows_reviewed_cjk(self) -> None:
        self.stage_localization_catalog()
        result = self.scan()
        self.assertEqual(result.returncode, 0, result.stdout)

    def test_localization_catalog_without_manifest_keeps_cjk_blocked(self) -> None:
        self.stage_localization_catalog(include_manifest=False)
        self.assertIn("cjk", self.scan().stdout)

    def test_unregistered_cjk_remains_blocked(self) -> None:
        self.stage_localization_catalog()
        path = self.repo / "apps/web/lib/i18n/extra.ts"
        path.write_text(f"export const extra = '{LOCALIZED_TEXT}';\n")
        subprocess.run(["git", "-C", str(self.repo), "add", "."], check=True)
        self.assertIn("FAIL [cjk]: apps/web/lib/i18n/extra.ts", self.scan().stdout)

    def test_unregistered_hangul_remains_blocked(self) -> None:
        self.stage_localization_catalog()
        path = self.repo / "apps/web/lib/i18n/extra.ts"
        path.write_text(f"export const extra = '{HANGUL_TEXT}';\n")
        subprocess.run(["git", "-C", str(self.repo), "add", "."], check=True)
        self.assertIn("FAIL [cjk]: apps/web/lib/i18n/extra.ts", self.scan().stdout)

    PUBLIC_WEB_CATALOGS = (
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
        "apps/public-web/app/i18n/comparison-messages.ts",
    )

    def stage_public_web_catalogs(self, registered: tuple[str, ...]) -> None:
        catalogs = self.PUBLIC_WEB_CATALOGS
        for catalog_path in catalogs:
            target = self.repo / catalog_path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(LOCALIZED_CATALOG)
        manifest = {
            "schema_version": "benten.localization-catalog-manifest.v1",
            "default_locale": "en",
            "locales": ["en", "ja", "ko", "zh-Hans", "zh-Hant"],
            "catalogs": [{"path": path, "sha256": hashlib.sha256(LOCALIZED_CATALOG).hexdigest()} for path in registered],
        }
        (self.repo / "apps/public-web/app/i18n/catalog-manifest.json").write_text(json.dumps(manifest))
        subprocess.run(["git", "-C", str(self.repo), "add", "."], check=True)

    def test_public_web_catalogs_are_registered_by_their_own_manifest(self) -> None:
        self.stage_public_web_catalogs(self.PUBLIC_WEB_CATALOGS)
        result = self.scan()
        self.assertEqual(result.returncode, 0, result.stdout)

    def test_public_web_manifest_must_register_every_catalog(self) -> None:
        self.stage_public_web_catalogs(("apps/public-web/app/i18n/messages.ts", "apps/public-web/app/i18n/purchase-messages.ts"))
        output = self.scan().stdout
        self.assertIn("FAIL [invalid-localization-catalog-manifest]: apps/public-web/app/i18n/catalog-manifest.json", output)
        self.assertIn("FAIL [cjk]: apps/public-web/app/i18n/shell-messages.ts", output)

    def test_public_web_catalog_without_its_manifest_keeps_cjk_blocked(self) -> None:
        self.stage_localization_catalog(
            catalog_path="apps/public-web/app/i18n/messages.ts",
            manifest_location="apps/public-web/app/i18n/catalog-manifest.json",
            include_manifest=False,
        )
        self.assertIn("FAIL [cjk]: apps/public-web/app/i18n/messages.ts", self.scan().stdout)

    def test_a_manifest_cannot_register_another_apps_catalog(self) -> None:
        self.stage_localization_catalog(
            catalog_path="apps/public-web/app/i18n/messages.ts",
            manifest_location="apps/web/lib/i18n/catalog-manifest.json",
        )
        output = self.scan().stdout
        self.assertIn("FAIL [invalid-localization-catalog-manifest]: apps/web/lib/i18n/catalog-manifest.json", output)
        self.assertIn("FAIL [cjk]: apps/public-web/app/i18n/messages.ts", output)

    def test_localization_catalog_hash_mismatch_fails(self) -> None:
        catalog_path = "apps/web/lib/i18n/messages.ts"
        manifest = {
            "schema_version": "benten.localization-catalog-manifest.v1",
            "default_locale": "en",
            "locales": ["en", "ja", "ko", "zh-Hans", "zh-Hant"],
            "catalogs": [{"path": catalog_path, "sha256": "0" * 64}],
        }
        self.stage_localization_catalog(manifest=manifest)
        self.assertIn("localization-catalog-hash-mismatch", self.scan().stdout)

    def test_localization_manifest_requires_exact_schema_locales_and_entries(self) -> None:
        catalog_path = "apps/web/lib/i18n/messages.ts"
        content = LOCALIZED_CATALOG
        digest = hashlib.sha256(content).hexdigest()
        valid = {
            "schema_version": "benten.localization-catalog-manifest.v1",
            "default_locale": "en",
            "locales": ["en", "ja", "ko", "zh-Hans", "zh-Hant"],
            "catalogs": [{"path": catalog_path, "sha256": digest}],
        }
        invalid_manifests = (
            b"{not-json",
            {**valid, "locales": ["en", "ja", "ko", "zh-Hans", "fr"]},
            {key: value for key, value in valid.items() if key != "default_locale"},
            {**valid, "extra": True},
            {**valid, "catalogs": []},
            {**valid, "catalogs": valid["catalogs"] * 2},
            {**valid, "catalogs": [{"path": "../messages.ts", "sha256": digest}]},
            {**valid, "catalogs": [{"path": "apps/web/lib/i18n/extra.ts", "sha256": digest}]},
        )
        for manifest in invalid_manifests:
            with self.subTest(manifest=manifest):
                self.stage_localization_catalog(content, manifest=manifest)
                self.assertIn("invalid-localization-catalog-manifest", self.scan().stdout)

    def test_localization_manifest_rejects_missing_catalog_file(self) -> None:
        content = LOCALIZED_CATALOG
        self.stage_localization_catalog(content, include_catalog=False)
        self.assertIn("missing-localization-catalog", self.scan().stdout)

    def test_localization_manifest_and_catalog_must_be_regular_index_blobs(self) -> None:
        catalog_path = "apps/web/lib/i18n/messages.ts"
        manifest_path = "apps/web/lib/i18n/catalog-manifest.json"
        catalog_target = "catalog-target.ts"
        target = self.repo / "apps/web/lib/i18n" / catalog_target
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(LOCALIZED_CATALOG)
        catalog = self.repo / catalog_path
        catalog.symlink_to(catalog_target)
        manifest = {
            "schema_version": "benten.localization-catalog-manifest.v1",
            "default_locale": "en",
            "locales": ["en", "ja", "ko", "zh-Hans", "zh-Hant"],
            "catalogs": [{"path": catalog_path, "sha256": hashlib.sha256(catalog_target.encode()).hexdigest()}],
        }
        manifest_file = self.repo / manifest_path
        manifest_file.write_text(json.dumps(manifest))
        subprocess.run(["git", "-C", str(self.repo), "add", manifest_path, catalog_path], check=True)
        self.assertIn("localization-catalog-not-regular-file", self.scan().stdout)

        subprocess.run(["git", "-C", str(self.repo), "rm", "--cached", "-q", manifest_path], check=True)
        manifest_file.unlink()
        manifest_target = json.dumps(manifest, separators=(",", ":"))
        manifest_file.symlink_to(manifest_target)
        subprocess.run(["git", "-C", str(self.repo), "add", manifest_path], check=True)
        self.assertIn("invalid-localization-catalog-manifest", self.scan().stdout)

    def test_localization_exception_preserves_content_safety_checks(self) -> None:
        cases = (
            (("export const value = '/" + f"Users/example/private {LOCALIZED_TEXT}';\n").encode(), None, "local-absolute-path"),
            (("export const value = 'sb_" + f"secret_examplevalue123 {LOCALIZED_TEXT}';\n").encode(), None, "secret-or-private-key-pattern"),
            (f"export const value = 'private-marker {LOCALIZED_TEXT}';\n".encode(), "private-marker", "denylist"),
            (b"export const value = '\xff';\n", None, "unknown-binary"),
            (b"export\0const value = 'safe';\n", None, "unknown-binary"),
        )
        for content, denylist, finding in cases:
            with self.subTest(finding=finding):
                self.stage_localization_catalog(content)
                self.assertIn(finding, self.scan(denylist).stdout)

    def test_staged_scanner_test_source_is_publishable(self) -> None:
        shutil.copy2(Path(__file__), self.repo / "scripts" / "check_publishable_test.py")
        subprocess.run(
            ["git", "-C", str(self.repo), "add", ".vercelignore", "scripts/check_publishable_test.py"],
            check=True,
        )
        result = self.scan()
        self.assertEqual(result.returncode, 0, result.stdout)

    def test_secret_pattern_in_png_text_metadata_fails(self) -> None:
        secret_marker = "sb_" + "secret_examplevalue123"
        self.stage_image(make_png(metadata=(text_chunk(secret_marker),)))
        self.assertIn("secret-or-private-key-pattern", self.scan().stdout)

    def test_unknown_binary_fails_closed(self) -> None:
        (self.repo / "payload.bin").write_bytes(b"\x00\xff\x00")
        subprocess.run(["git", "-C", str(self.repo), "add", "."], check=True)
        self.assertIn("unknown-binary", self.scan().stdout)

    def test_c2pa_cabx_is_structurally_validated_and_scanned(self) -> None:
        self.stage_image(make_png(metadata=((b"caBX", c2pa(b"safe")),)))
        self.assertEqual(self.scan().returncode, 0)
        private_path = b"/" + b"Users/example/private"
        self.stage_image(make_png(metadata=((b"caBX", c2pa(private_path)),)))
        self.assertIn("local-absolute-path", self.scan().stdout)

    def test_indefinite_cbor_text_is_scanned_as_one_semantic_value(self) -> None:
        path = b"\x7f" + cbor_text("/Use") + cbor_text("rs/private") + b"\xff"
        self.stage_image(make_png(metadata=((b"caBX", c2pa_with_cbor(path)),)))
        self.assertIn("local-absolute-path", self.scan().stdout)

        denied = b"\x7f" + cbor_text("private-") + cbor_text("marker") + b"\xff"
        self.stage_image(make_png(metadata=((b"caBX", c2pa_with_cbor(denied)),)))
        self.assertIn("denylist", self.scan("private-marker").stdout)

    def test_jumd_label_is_strict_utf8_and_scanned(self) -> None:
        cjk_label = "".join(chr(value) for value in (0x516C, 0x958B, 0x4E0D, 0x53EF)).encode("utf-8")
        self.stage_image(make_png(metadata=((b"caBX", c2pa_with_cbor(cbor_text("safe"), label=cjk_label)),)))
        self.assertIn("cjk", self.scan().stdout)

        self.stage_image(make_png(metadata=((b"caBX", c2pa_with_cbor(cbor_text("safe"), label=b"\xff")),)))
        self.assertIn("invalid-png", self.scan().stdout)

    def test_malformed_or_unknown_c2pa_boxes_fail_closed(self) -> None:
        malformed = box(b"jumb", box(b"jumd", C2PA_UUID + b"\x03c2pa\0")[:-1])
        unknown_nested = box(b"jumb", box(b"jumd", C2PA_UUID + b"\x03c2pa\0") + box(b"uuid", b"private"))
        for payload in (malformed, unknown_nested):
            with self.subTest(payload=payload):
                self.assert_invalid_png(make_png(metadata=((b"caBX", payload),)))

    def test_unparsed_ancillary_and_unknown_critical_chunks_fail_closed(self) -> None:
        for kind, payload in ((b"eXIf", b"private"), (b"iCCP", b"private"), (b"vpAg", b"private"), (b"ABCD", b"private")):
            with self.subTest(kind=kind):
                self.assert_invalid_png(make_png(metadata=((kind, payload),)))

    def test_idat_requires_one_complete_zlib_stream(self) -> None:
        valid = zlib.compress(b"\x00\x00\x00\x00")
        cases = {
            "not-zlib": b"/" + b"Users/example/private",
            "truncated": valid[:-2],
            "trailing": valid + b"trailing",
            "concatenated": valid + zlib.compress(b"more"),
        }
        for name, payload in cases.items():
            with self.subTest(name=name):
                self.assert_invalid_png(make_png(idat=payload))

    def test_ihdr_legal_combinations_are_enforced(self) -> None:
        invalid_headers = (
            struct.pack(">IIBBBBB", 1, 1, 3, 2, 0, 0, 0),
            struct.pack(">IIBBBBB", 1, 1, 8, 7, 0, 0, 0),
            struct.pack(">IIBBBBB", 1, 1, 8, 2, 1, 0, 0),
            struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 1, 0),
            struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 2),
        )
        for header in invalid_headers:
            with self.subTest(header=header.hex()):
                self.assert_invalid_png(make_png(ihdr=header))

    def test_scanline_size_filter_and_palette_are_enforced(self) -> None:
        for raw in (b"\x00\x00\x00", b"\x00\x00\x00\x00\x00", b"\x05\x00\x00\x00"):
            with self.subTest(raw=raw):
                self.assert_invalid_png(make_png(idat=zlib.compress(raw)))
        indexed = struct.pack(">IIBBBBB", 1, 1, 8, 3, 0, 0, 0)
        self.assert_invalid_png(make_png(ihdr=indexed, idat=zlib.compress(b"\x00\x00")))

    def test_valid_palette_and_adam7_scanlines_pass(self) -> None:
        indexed = struct.pack(">IIBBBBB", 1, 1, 8, 3, 0, 0, 0)
        self.stage_image(make_png(ihdr=indexed, idat=zlib.compress(b"\x00\x00"), include_plte=True))
        self.assertEqual(self.scan().returncode, 0)
        adam7 = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 1)
        self.stage_image(make_png(ihdr=adam7))
        self.assertEqual(self.scan().returncode, 0)

    def test_idat_chunks_must_be_consecutive(self) -> None:
        self.assert_invalid_png(make_png(split_idat=True, between_idat=text_chunk("safe")))

    def test_ztxt_requires_a_complete_stream_without_trailing_data(self) -> None:
        valid = zlib.compress(b"safe")
        self.stage_image(make_png(metadata=(ztxt_chunk(valid),)))
        self.assertEqual(self.scan().returncode, 0)
        for payload in (valid[:-2], valid + b"trailing", valid + zlib.compress(b"second")):
            with self.subTest(payload=payload):
                self.assert_invalid_png(make_png(metadata=(ztxt_chunk(payload),)))

    def test_itxt_accepts_compressed_and_uncompressed_forms(self) -> None:
        for compressed in (False, True):
            with self.subTest(compressed=compressed):
                self.stage_image(make_png(metadata=(itxt_chunk("safe", compressed=compressed),)))
                result = self.scan()
                self.assertEqual(result.returncode, 0, result.stdout)

    def test_compressed_itxt_requires_exactly_one_complete_stream(self) -> None:
        prefix = b"Comment\0\x01\x00\0\0"
        valid = zlib.compress(b"safe")
        for payload in (valid[:-2], valid + b"trailing", valid + zlib.compress(b"second")):
            with self.subTest(payload=payload):
                self.assert_invalid_png(make_png(metadata=((b"iTXt", prefix + payload),)))

    def test_itxt_fields_are_scanned(self) -> None:
        cases = (
            (itxt_chunk("".join(chr(value) for value in (0x516C, 0x958B, 0x4E0D, 0x53EF)), compressed=False), None, "cjk"),
            (itxt_chunk("safe", compressed=False, translated_keyword="/" + "Users/example/private"), None, "local-absolute-path"),
            (itxt_chunk("internal-marker", compressed=True), "internal-marker", "denylist"),
            (itxt_chunk("sb_" + "secret_examplevalue123", compressed=True), None, "secret-or-private-key-pattern"),
        )
        for metadata, denylist, finding in cases:
            with self.subTest(finding=finding):
                self.stage_image(make_png(metadata=(metadata,)))
                self.assertIn(finding, self.scan(denylist).stdout)

    def test_malformed_itxt_fails_closed(self) -> None:
        malformed = (
            b"Comment\0\x02\x00\0\0text",
            b"Comment\0\x01\x01\0\0" + zlib.compress(b"text"),
            b"Comment\0\x00\x00\xff\0\0text",
            b"Comment\0\x00\x00\0\xff\0text",
            b"Comment\0\x01\x00\0\0" + zlib.compress(b"text")[:-2],
        )
        for payload in malformed:
            with self.subTest(payload=payload):
                self.assert_invalid_png(make_png(metadata=((b"iTXt", payload),)))


# Built by concatenation so this test source itself stays publishable.
WALLET_SEND_FEATURE = "solana:" + "signAndSend" + "Transaction"
WALLET_SEND_METHOD = "signAndSend" + "Transaction"
WALLET_EXCEPTION_PATH = "packages/purchase/src/wallet-standard.ts"
# The exception moved with the purchase package; its former path is no longer allowed.
FORMER_WALLET_EXCEPTION_PATH = "apps/web/lib/purchase/wallet-standard.ts"
OTHER_SIGNING_IDENTIFIERS = (
    "sign" + "Transaction",
    "sign" + "AllTransactions",
    "send" + "Transaction",
    "Keypair.from" + "SecretKey",
)


class PublishableVercelIgnoreTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.repo = Path(self.temp.name)
        (self.repo / "scripts").mkdir()
        shutil.copy2(SCANNER, self.repo / "scripts" / "check-publishable.sh")
        subprocess.run(["git", "init", "-q", str(self.repo)], check=True)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def scan_with(self, ignore: str) -> subprocess.CompletedProcess[str]:
        (self.repo / ".vercelignore").write_text(ignore)
        subprocess.run(["git", "-C", str(self.repo), "add", "."], check=True)
        env = {key: value for key, value in os.environ.items() if key not in {"DENYLIST_REGEX", "DENYLIST_REQUIRED"}}
        return subprocess.run(
            ["bash", "scripts/check-publishable.sh"], cwd=self.repo, env=env,
            text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        )

    def test_repository_upload_exclusions_pass(self) -> None:
        result = self.scan_with(VERCEL_IGNORE)
        self.assertEqual(result.returncode, 0, result.stdout)

    def test_each_hosted_build_output_must_be_excluded(self) -> None:
        for entry in ("apps/public-api/dist/", "apps/public-web/build/", "apps/public-web/build-capsule/", "apps/public-web/.generated/"):
            with self.subTest(entry=entry):
                lines = [line for line in VERCEL_IGNORE.splitlines() if line != entry]
                self.assertEqual(len(lines), len(VERCEL_IGNORE.splitlines()) - 1, entry)
                result = self.scan_with("\n".join(lines) + "\n")
                self.assertNotEqual(result.returncode, 0, result.stdout)
                self.assertIn("FAIL [incomplete-vercel-upload-exclusions]", result.stdout)


class PublishableWalletSendExceptionTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.repo = Path(self.temp.name)
        (self.repo / "scripts").mkdir()
        shutil.copy2(SCANNER, self.repo / "scripts" / "check-publishable.sh")
        (self.repo / ".vercelignore").write_text(VERCEL_IGNORE)
        subprocess.run(["git", "init", "-q", str(self.repo)], check=True)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def stage(self, path: str, content: str) -> None:
        target = self.repo / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)
        subprocess.run(["git", "-C", str(self.repo), "add", "."], check=True)

    def scan(self) -> subprocess.CompletedProcess[str]:
        env = {key: value for key, value in os.environ.items() if key not in {"DENYLIST_REGEX", "DENYLIST_REQUIRED"}}
        return subprocess.run(
            ["bash", "scripts/check-publishable.sh"], cwd=self.repo, env=env,
            text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        )

    def test_exception_path_may_use_the_wallet_send_feature(self) -> None:
        self.stage(
            WALLET_EXCEPTION_PATH,
            f"const FEATURE = '{WALLET_SEND_FEATURE}';\n"
            f"export async function approve(feature: any) {{ return feature.{WALLET_SEND_METHOD}({{}}); }}\n",
        )
        result = self.scan()
        self.assertEqual(result.returncode, 0, result.stdout)

    def test_wallet_send_feature_fails_on_every_other_path(self) -> None:
        other_paths = (
            FORMER_WALLET_EXCEPTION_PATH,
            "packages/purchase/src/purchase-machine.ts",
            "packages/purchase/src/wallet-standard.test.ts",
            "packages/purchase/src/nested/wallet-standard.ts",
            "packages/purchase/src/Wallet-Standard.ts",
            "packages/purchase/wallet-standard.ts",
            "apps/web/components/purchase-panel.tsx",
            "apps/public-web/app/lib/wallet-standard.ts",
            "docs/ui-design/purchase-panel-design.md",
        )
        for path in other_paths:
            for content in (f"'{WALLET_SEND_FEATURE}'\n", f"wallet.{WALLET_SEND_METHOD}(input)\n"):
                with self.subTest(path=path, content=content):
                    self.temp.cleanup()
                    self.setUp()
                    self.stage(path, content)
                    result = self.scan()
                    self.assertNotEqual(result.returncode, 0, result.stdout)
                    self.assertIn(f"FAIL [wallet-send-outside-exception]: {path}:1", result.stdout)

    def test_exception_path_still_blocks_other_signing_identifiers(self) -> None:
        for identifier in OTHER_SIGNING_IDENTIFIERS:
            with self.subTest(identifier=identifier):
                self.temp.cleanup()
                self.setUp()
                self.stage(
                    WALLET_EXCEPTION_PATH,
                    f"const FEATURE = '{WALLET_SEND_FEATURE}';\nwallet.{identifier}(input);\n",
                )
                result = self.scan()
                self.assertNotEqual(result.returncode, 0, result.stdout)
                self.assertIn(f"FAIL [secret-or-private-key-pattern]: {WALLET_EXCEPTION_PATH}:2", result.stdout)
                self.assertNotIn("wallet-send-outside-exception", result.stdout)


if __name__ == "__main__":
    unittest.main()
