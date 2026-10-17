from __future__ import annotations

import hashlib
import sqlite3
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

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


    def test_writes_sponsor_logos_in_their_own_manifest_by_brand_and_keeps_them_out_of_the_crests(self) -> None:
        png = self.root / "betano.png"
        png.write_bytes(tiny_png(300, 60))
        sha = hashlib.sha256(png.read_bytes()).hexdigest()
        self.db.execute("INSERT INTO images VALUES (?, 'sponsor', 'betano', 'logo', ?, ?, 300, 60, 'test')", (self.csv, str(png), sha))
        crests = build_assets.build(build_assets.import_rows(self.db, self.csv), self.root / "pack", tuple(build_assets.FORMATS))
        self.assertEqual(list(crests["clubs"]), ["arsenal"])
        self.assertNotIn("brands", crests)
        logos = build_assets.build(build_assets.logo_rows(self.db, self.csv), self.root / "pack" / "sponsors", build_assets.LOGO_FORMATS, build_assets.LOGO_BOXES, are_logos=True)
        logo = logos["brands"]["betano"]["logo"]
        self.assertEqual(logos["images"][logo]["boxes"], [64, 128, 256])
        self.assertEqual(logos["images"][logo]["formats"], ["webp"])

    def logo(self, brand: str, image: Image.Image) -> tuple[dict, Path]:
        png = self.root / f"{brand}.png"
        image.save(png)
        sha = hashlib.sha256(png.read_bytes()).hexdigest()
        self.db.execute("INSERT INTO images VALUES (?, 'sponsor', ?, 'logo', ?, ?, ?, ?, 'test')", (self.csv, brand, str(png), sha, image.width, image.height))
        out = self.root / "pack" / "sponsors"
        return build_assets.build(build_assets.logo_rows(self.db, self.csv), out, build_assets.LOGO_FORMATS, build_assets.LOGO_BOXES, are_logos=True), out

    def test_leaves_out_a_box_a_logo_is_too_small_to_fill_as_it_would_repeat_the_one_below(self) -> None:
        logos, out = self.logo("favicon", Image.new("RGBA", (100, 100), (200, 30, 30, 255)))
        logo = logos["brands"]["favicon"]["logo"]
        self.assertEqual(logos["images"][logo]["boxes"], [64, 128])
        self.assertEqual(sorted(path.name for path in (out / "assets" / "logo").iterdir()), [f"{logo.removeprefix('logo/')}-{box}.webp" for box in (128, 64)])

    def test_keeps_a_flat_logo_s_colours_exactly(self) -> None:
        flat = Image.new("RGBA", (250, 50), (0, 0, 0, 0))
        ImageDraw.Draw(flat).rectangle((20, 10, 230, 40), fill=(230, 80, 20, 255))
        ImageDraw.Draw(flat).ellipse((40, 15, 90, 35), fill=(255, 255, 255, 255))
        logos, out = self.logo("flat", flat)
        name = logos["brands"]["flat"]["logo"].removeprefix("logo/")
        written = Image.open(out / "assets" / "logo" / f"{name}-256.webp").convert("RGBA")
        # As printed on white: a pixel the logo leaves clear may keep any colour under it.
        on_white = lambda image: Image.alpha_composite(Image.new("RGBA", image.size, "white"), image).convert("RGB")
        self.assertEqual(ImageChops.difference(on_white(written), on_white(flat)).getextrema(), ((0, 0), (0, 0), (0, 0)))


if __name__ == "__main__":
    unittest.main()
