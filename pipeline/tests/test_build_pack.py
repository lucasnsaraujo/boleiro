from __future__ import annotations

import sqlite3
import unittest

import tests.fixtures  # noqa: F401  (puts pipeline/ on the import path)

import build_pack
from import_csv import SCHEMA


class LatestSnapshotTest(unittest.TestCase):
    def test_builds_brazil_from_the_latest_csv_import_even_after_a_newer_world_scrape(self) -> None:
        db = sqlite3.connect(":memory:")
        db.executescript(SCHEMA.read_text())
        for kind in ("csv-import", "csv-import", "transfermarkt"):
            db.execute("INSERT INTO snapshots (taken_at, kind) VALUES ('2026-10-14T00:00:00+00:00', ?)", (kind,))
        self.assertEqual(build_pack.latest_snapshot(db), 2)


if __name__ == "__main__":
    unittest.main()
