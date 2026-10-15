from __future__ import annotations

import gzip
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from tests.world_fixture import Offline, saved_cache, scrape_tiny_world

import build_world_packs


class WorldPacksTest(unittest.TestCase):
    def setUp(self) -> None:
        self.folder = tempfile.TemporaryDirectory()
        self.root = Path(self.folder.name)
        saved_cache(self.root / "cache")
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.snapshot = scrape_tiny_world(self.db, self.root / "cache", Offline()).snapshot

    def tearDown(self) -> None:
        self.db.close()
        self.folder.cleanup()

    def test_builds_one_pack_per_country_and_one_for_the_national_teams(self) -> None:
        packs = build_world_packs.packs(self.db, self.snapshot)
        self.assertEqual(sorted(packs), ["gb-eng", "national-teams"])

    def test_a_country_pack_holds_its_clubs_and_their_players_column_by_column(self) -> None:
        england = build_world_packs.packs(self.db, self.snapshot)["gb-eng"]
        clubs, players = england["clubs"], england["players"]
        self.assertEqual(clubs["name"], ["Arsenal FC", "Liverpool FC"])
        self.assertEqual(clubs["league"], ["gb-eng-1", "gb-eng-1"])
        self.assertEqual(clubs["sources"]["colours"], ["guess", "transfermarkt"])
        self.assertEqual(england["competitions"]["id"], ["gb-eng-1"])
        alisson = players["id"].index("tm-105470")
        self.assertEqual(clubs["name"][players["club"][alisson]], "Liverpool FC")
        self.assertEqual((players["role"][alisson], players["group"][alisson]), ("goleiro", "GK"))
        self.assertEqual(len(players["name"]), len(players["role"]))

    def test_the_national_teams_pack_lists_each_squad_with_its_players_clubs(self) -> None:
        teams = build_world_packs.packs(self.db, self.snapshot)["national-teams"]
        self.assertEqual(teams["teams"]["id"], ["brazil"])
        pedro = teams["players"]["name"].index("Pedro")
        self.assertEqual(teams["players"]["clubName"][pedro], "CR Flamengo")

    def test_writes_gzipped_packs_named_by_country_and_versioned_by_their_content(self) -> None:
        out = self.root / "packs"
        build_world_packs.write(self.db, self.snapshot, out)
        first = (out / "gb-eng.pack.json.gz").read_bytes()
        pack = json.loads(gzip.decompress(first))
        self.assertTrue(pack["packVersion"].startswith("gb-eng-"))
        build_world_packs.write(self.db, self.snapshot, out)
        self.assertEqual((out / "gb-eng.pack.json.gz").read_bytes(), first)
        self.db.execute("UPDATE players SET name = 'Alisson Becker' WHERE id = 'tm-105470'")
        build_world_packs.write(self.db, self.snapshot, out)
        changed = json.loads(gzip.decompress((out / "gb-eng.pack.json.gz").read_bytes()))
        self.assertNotEqual(changed["packVersion"], pack["packVersion"])

    def test_takes_the_latest_full_world_scrape_and_skips_partial_ones(self) -> None:
        scrape_tiny_world(self.db, self.root / "cache", Offline(), is_partial=True)
        self.assertEqual(build_world_packs.latest_world_snapshot(self.db), self.snapshot)

    def test_a_full_world_scrape_removes_the_packs_of_countries_it_no_longer_has(self) -> None:
        out = self.root / "packs"
        out.mkdir()
        (out / "xx.pack.json.gz").write_bytes(b"old")
        (out / "assets.json").write_text("{}")
        build_world_packs.write(self.db, self.snapshot, out)
        self.assertEqual(sorted(path.name for path in out.iterdir()), ["assets.json", "gb-eng.pack.json.gz", "national-teams.pack.json.gz"])

    def test_a_partial_scrape_leaves_the_other_countries_packs_alone(self) -> None:
        out = self.root / "packs"
        out.mkdir()
        (out / "xx.pack.json.gz").write_bytes(b"old")
        partial = scrape_tiny_world(self.db, self.root / "cache", Offline(), is_partial=True).snapshot
        build_world_packs.write(self.db, partial, out)
        self.assertTrue((out / "xx.pack.json.gz").exists())


if __name__ == "__main__":
    unittest.main()
