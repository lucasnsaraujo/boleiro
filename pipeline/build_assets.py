"""Converts the images of the master database's latest CSV-import snapshot into the pack's small variants.

Each distinct source image of a kind (by content hash) becomes WebP and AVIF files fitted into
64, 128 and 256 px boxes, never upscaled: a 139x181 crest's 256 variant stays 139x181. An image is
named by its kind and hash, `<kind>/<hash>`, and its files `assets/<kind>/<hash>-<box>.<format>`;
a PNG used both as a crest and a scoreboard crest gets files in both folders. `assets.json` lists
every image and which club uses it, read by packages/data/src/assetManifest.ts. Files no image
needs any more are removed. `images.path` is relative to the repo root, as import_csv.py writes it.

The crests of the latest full world scrape's clubs that the import doesn't have go to their own manifest,
`world/assets.json`, with their files under `world/assets/`. They come in WebP only, the format the
app reads, and in the 64 and 128 px boxes only: these clubs appear in results, tables and brackets,
never large, and Transfermarkt's crests are 181 px tall at most. That keeps the v1 world's images
within SPEC §4.3's ~25 MB. They need the scrape's page cache (data/tm_cache) on disk.

The sponsors' logos go to `sponsors/assets.json`, with their files under `sponsors/assets/logo/`: WebP
only, in the 128 and 256 px boxes. A logo is wide, so its 128 px box is about 32 px tall, the smallest the
game shows one at twice the pixels (the odds sticker's), and the 256 px box covers the master on the shirt.

Usage: .venv/bin/python pipeline/build_assets.py pipeline/boleiro.db packages/data/pack [snapshot id]
"""
from __future__ import annotations

import io
import json
import sqlite3
import sys
from pathlib import Path

from PIL import Image

from build_pack import latest_snapshot
from build_world_packs import latest_world_snapshot

ROOT = Path(__file__).resolve().parent.parent
MANIFEST_FORMAT = 1
BOXES = (64, 128, 256)
HASH_LENGTH = 16
# q80 WebP and q60 AVIF looked the same as the PNGs on six Série A crests side by side, at under
# half the size of lossless WebP.
FORMATS = {"webp": ("WEBP", {"quality": 80, "method": 6}), "avif": ("AVIF", {"quality": 60})}
WORLD_FORMATS = ("webp",)
WORLD_BOXES = (64, 128)
LOGO_FORMATS = ("webp",)
LOGO_BOXES = (128, 256)
CLUB_KEYS = {"crest": "crest", "scoreboard_crest": "scoreboardCrest"}


def fitted(image: Image.Image, box: int) -> Image.Image:
    scale = min(1.0, box / max(image.size))
    if scale == 1.0:
        return image
    return image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), Image.LANCZOS)


def encoded(image: Image.Image, format_name: str, options: dict[str, int]) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format_name, **options)
    return buffer.getvalue()


def import_rows(db: sqlite3.Connection, snapshot: int) -> list[sqlite3.Row]:
    return db.execute("SELECT * FROM images WHERE snapshot_id = ? AND entity = 'club' ORDER BY entity, entity_id, kind", (snapshot,)).fetchall()


def logo_rows(db: sqlite3.Connection, snapshot: int) -> list[sqlite3.Row]:
    return db.execute("SELECT * FROM images WHERE snapshot_id = ? AND entity = 'sponsor' ORDER BY entity_id", (snapshot,)).fetchall()


def world_crest_rows(db: sqlite3.Connection, snapshot: int, imported_clubs: set[str]) -> list[sqlite3.Row]:
    """The world scrape's club crests, but for the clubs whose crest the import already has."""
    rows = db.execute("SELECT * FROM images WHERE snapshot_id = ? AND entity = 'club' AND kind = 'crest' ORDER BY entity_id", (snapshot,))
    return [row for row in rows if row["entity_id"] not in imported_clubs]


def build(rows: list[sqlite3.Row], out: Path, formats: tuple[str, ...], boxes: tuple[int, ...] = BOXES) -> dict[str, object]:
    images: dict[str, dict[str, object]] = {}
    clubs: dict[str, dict[str, str]] = {}
    brands: dict[str, dict[str, str]] = {}
    written: set[Path] = set()
    for row in rows:
        key = f"{row['kind']}/{row['sha256'][:HASH_LENGTH]}"
        if row["entity"] == "club":
            clubs.setdefault(row["entity_id"], {})[CLUB_KEYS[row["kind"]]] = key
        elif row["entity"] == "sponsor":
            brands[row["entity_id"]] = {"logo": key}
        if key in images:
            continue
        source = Image.open(ROOT / row["path"]).convert("RGBA")
        images[key] = {"kind": row["kind"], "width": row["width"], "height": row["height"], "boxes": list(boxes), "formats": list(formats)}
        for box in boxes:
            variant = fitted(source, box)
            for extension in formats:
                format_name, options = FORMATS[extension]
                path = out / "assets" / f"{key}-{box}.{extension}"
                path.parent.mkdir(parents=True, exist_ok=True)
                data = encoded(variant, format_name, options)
                if not path.exists() or path.read_bytes() != data:
                    path.write_bytes(data)
                written.add(path)
    for stale in (out / "assets").rglob("*.*"):
        if stale not in written:
            stale.unlink()
    manifest: dict[str, object] = {"format": MANIFEST_FORMAT, "images": images, "clubs": dict(sorted(clubs.items()))}
    if brands:
        manifest["brands"] = dict(sorted(brands.items()))
    return manifest


def write(manifest: dict[str, object], out: Path) -> None:
    (out / "assets.json").write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")) + "\n")
    files = sorted((out / "assets").rglob("*.*"))
    print(f"{len(manifest['images'])} images, {len(files)} files, {sum(f.stat().st_size for f in files)} bytes in {out / 'assets'}")


def main() -> None:
    db_path, out = Path(sys.argv[1]), Path(sys.argv[2])
    with sqlite3.connect(db_path) as db:
        db.row_factory = sqlite3.Row
        snapshot = int(sys.argv[3]) if len(sys.argv) > 3 else latest_snapshot(db)
        manifest = build(import_rows(db, snapshot), out, tuple(FORMATS))
        write(manifest, out)
        write(build(logo_rows(db, snapshot), out / "sponsors", LOGO_FORMATS, LOGO_BOXES), out / "sponsors")
        if db.execute("SELECT 1 FROM snapshots WHERE kind = 'transfermarkt'").fetchone():
            world = world_crest_rows(db, latest_world_snapshot(db), {club for club, uses in manifest["clubs"].items() if "crest" in uses})
            write(build(world, out / "world", WORLD_FORMATS, WORLD_BOXES), out / "world")


if __name__ == "__main__":
    main()
