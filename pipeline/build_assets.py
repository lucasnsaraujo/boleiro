"""Converts the images of the master database's latest snapshot into the pack's small variants.

Each distinct source image (by content hash) becomes WebP and AVIF files fitted into 64, 128
and 256 px boxes, never upscaled: a 139x181 crest's 256 variant stays 139x181. Files are named
`assets/<kind>/<hash>-<box>.<format>`, and `assets.json` lists every image and which club uses it,
read by packages/data/src/assetManifest.ts. Files no image needs any more are removed.

Usage: .venv/bin/python pipeline/build_assets.py pipeline/boleiro.db packages/data/pack [snapshot id]
"""
from __future__ import annotations

import io
import json
import sqlite3
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MANIFEST_FORMAT = 1
BOXES = (64, 128, 256)
HASH_LENGTH = 16
# q80 WebP and q60 AVIF looked the same as the PNGs on six Série A crests side by side, at under
# half the size of lossless WebP.
FORMATS = {"webp": ("WEBP", {"quality": 80, "method": 6}), "avif": ("AVIF", {"quality": 60})}
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


def build(db: sqlite3.Connection, snapshot: int, out: Path) -> dict[str, object]:
    rows = db.execute("SELECT * FROM images WHERE snapshot_id = ? ORDER BY entity, entity_id, kind", (snapshot,)).fetchall()
    images: dict[str, dict[str, object]] = {}
    clubs: dict[str, dict[str, str]] = {}
    written: set[Path] = set()
    for row in rows:
        key = row["sha256"][:HASH_LENGTH]
        if row["entity"] == "club":
            clubs.setdefault(row["entity_id"], {})[CLUB_KEYS[row["kind"]]] = key
        if key in images:
            continue
        source = Image.open(ROOT / row["path"]).convert("RGBA")
        images[key] = {"kind": row["kind"], "width": row["width"], "height": row["height"], "boxes": list(BOXES), "formats": list(FORMATS)}
        for box in BOXES:
            variant = fitted(source, box)
            for extension, (format_name, options) in FORMATS.items():
                path = out / "assets" / row["kind"] / f"{key}-{box}.{extension}"
                path.parent.mkdir(parents=True, exist_ok=True)
                data = encoded(variant, format_name, options)
                if not path.exists() or path.read_bytes() != data:
                    path.write_bytes(data)
                written.add(path)
    for stale in (out / "assets").rglob("*.*"):
        if stale not in written:
            stale.unlink()
    return {"format": MANIFEST_FORMAT, "images": images, "clubs": dict(sorted(clubs.items()))}


def main() -> None:
    db_path, out = Path(sys.argv[1]), Path(sys.argv[2])
    with sqlite3.connect(db_path) as db:
        db.row_factory = sqlite3.Row
        snapshot = int(sys.argv[3]) if len(sys.argv) > 3 else db.execute("SELECT max(id) FROM snapshots").fetchone()[0]
        manifest = build(db, snapshot, out)
    (out / "assets.json").write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")) + "\n")
    files = sorted((out / "assets").rglob("*.*"))
    print(f"snapshot {snapshot} -> {len(manifest['images'])} images, {len(files)} files, {sum(f.stat().st_size for f in files)} bytes in {out / 'assets'}")


if __name__ == "__main__":
    main()
