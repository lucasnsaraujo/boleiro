from __future__ import annotations

import hashlib
import sqlite3
import tempfile
import unittest
from pathlib import Path

from tests.world_fixture import Offline, saved_cache, scrape_tiny_world, tiny_png

import build_assets


class WorldCrestsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.folder = tempfile.TemporaryDirectory()
        self.root = Path(self.folder.name)
        saved_cache(self.root / "cache")
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.world = scrape_tiny_world(self.db, self.root / "cache", Offline(), known_club_ids={"11": "arsenal"}).snapshot
        self.csv = self.db.execute("INSERT INTO snapshots (taken_at, kind) VALUES ('2026-10-14T00:00:00+00:00', 'csv-import')").lastrowid
        png = self.root / "arsenal.png"
        png.write_bytes(tiny_png(5, 6))
        sha = hashlib.sha256(png.read_bytes()).hexdigest()
        self.db.execute("INSERT INTO images VALUES (?, 'club', 'arsenal', 'crest', ?, ?, 5, 6, 'test')", (self.csv, str(png), sha))

    def tearDown(self) -> None:
        self.db.close()
        self.folder.cleanup()

    def test_writes_world_club_crests_as_webp_without_the_256_px_box_in_their_own_manifest(self) -> None:
        out = self.root / "world"
        manifest = build_assets.build(build_assets.world_crest_rows(self.db, self.world, set()), out, build_assets.WORLD_FORMATS, build_assets.WORLD_BOXES)
        liverpool = manifest["clubs"]["tm-31"]["crest"]
        self.assertEqual(manifest["images"][liverpool]["formats"], ["webp"])
        self.assertEqual(manifest["images"][liverpool]["boxes"], [64, 128])
        name = liverpool.removeprefix("crest/")
        self.assertEqual(sorted(path.name for path in (out / "assets" / "crest").iterdir()), [f"{name}-{box}.webp" for box in (128, 64)])

    def test_leaves_out_the_crest_of_a_club_the_brazil_import_has(self) -> None:
        self.db.execute("UPDATE images SET entity_id = 'arsenal' WHERE snapshot_id = ? AND entity_id = 'tm-31'", (self.world,))
        imported = build_assets.build(build_assets.import_rows(self.db, self.csv), self.root / "pack", tuple(build_assets.FORMATS))
        rows = build_assets.world_crest_rows(self.db, self.world, set(imported["clubs"]))
        self.assertEqual(rows, [])


if __name__ == "__main__":
    unittest.main()
