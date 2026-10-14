from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path

from tests.world_fixture import Offline, saved_cache, scrape_tiny_world


class ScrapeWorldTest(unittest.TestCase):
    def setUp(self) -> None:
        self.folder = tempfile.TemporaryDirectory()
        self.cache = Path(self.folder.name) / "cache"
        saved_cache(self.cache)
        self.db = sqlite3.connect(":memory:")
        self.network = Offline()
        self.run = scrape_tiny_world(self.db, self.cache, self.network)

    def tearDown(self) -> None:
        self.db.close()
        self.folder.cleanup()

    def rows(self, sql: str, *values: object) -> list[tuple]:
        return self.db.execute(sql, values).fetchall()

    def test_writes_one_transfermarkt_snapshot_with_the_countrys_league_and_clubs(self) -> None:
        self.assertEqual(self.rows("SELECT id, kind FROM snapshots"), [(1, "transfermarkt")])
        self.assertEqual(self.rows("SELECT code, name FROM countries"), [("GB-ENG", "England")])
        self.assertEqual(self.rows("SELECT id, name, kind, tier, code FROM competitions"), [("gb-eng-1", "Premier League", "league", 1, "GB1")])
        self.assertEqual(
            self.rows("SELECT id, name, country_code, league_id FROM clubs ORDER BY seq"),
            [("tm-11", "Arsenal FC", "GB-ENG", "gb-eng-1"), ("tm-31", "Liverpool FC", "GB-ENG", "gb-eng-1")],
        )

    def test_stores_each_player_with_his_role_group_and_transfermarkt_details_but_no_strength_yet(self) -> None:
        self.assertEqual(self.run.players, self.rows("SELECT count(*) FROM players")[0][0])
        alisson = self.rows(
            """SELECT club_id, birth_date, nationalities, foot, position_group, role, strength, market_value_eur, contract_until
               FROM players WHERE id = 'tm-105470'""")
        self.assertEqual(alisson, [("tm-31", "1992-10-02", "Brazil", "right", "GK", "goleiro", None, 15_000_000, "2027-06-30")])
        self.assertEqual(self.rows("SELECT position, source FROM player_positions WHERE player_id = 'tm-105470'"), [("Goalkeeper", "transfermarkt")])

    def test_takes_colours_from_the_facts_page_and_marks_them_a_guess_when_the_page_is_missing(self) -> None:
        colours = self.rows(
            """SELECT c.id, c.primary_colour, c.secondary_colour, s.source FROM clubs c
               JOIN field_sources s ON s.snapshot_id = c.snapshot_id AND s.entity_id = c.id AND s.field = 'colours' ORDER BY c.id""")
        self.assertEqual(colours, [("tm-11", "#FFFFFF", "#000000", "guess"), ("tm-31", "#E6001E", "#39403B", "transfermarkt")])

    def test_records_each_crest_with_its_size_and_source_url(self) -> None:
        crests = self.rows("SELECT entity_id, width, height, source FROM images WHERE kind = 'crest'")
        self.assertEqual(crests, [("tm-31", 3, 4, "https://img.a.transfermarkt.technology/wappen/head/31.png")])
        self.assertTrue(any("crest of tm-11" in failure for failure in self.run.failures))

    def test_stores_a_national_teams_squad_with_each_players_club_and_caps(self) -> None:
        self.assertEqual(self.rows("SELECT id, name FROM national_teams"), [("brazil", "Brazil")])
        pedro = self.rows("SELECT role, club_tm_id, club_name, caps, goals FROM national_team_players WHERE name = 'Pedro'")
        self.assertEqual(pedro, [("atacante", "614", "CR Flamengo", 8, 2)])

    def test_lists_every_page_it_could_not_get_and_carries_on(self) -> None:
        missing_teams = [failure for failure in self.run.failures if "/kader/verein/" in failure]
        self.assertEqual(len(missing_teams), 9)
        self.assertEqual(self.run.national_teams, 1)

    def test_a_second_run_asks_the_site_only_for_pages_the_first_could_not_get(self) -> None:
        first_requests = list(self.network.urls)
        again = Offline()
        second = scrape_tiny_world(self.db, self.cache, again)
        self.assertEqual(sorted(again.urls), sorted(first_requests))
        self.assertEqual(second.snapshot, 2)
        same = "SELECT id, club_id, name, role, market_value_eur FROM players WHERE snapshot_id = ? ORDER BY seq"
        self.assertEqual(self.rows(same, 1), self.rows(same, 2))

    def test_keeps_the_id_a_club_already_has_in_brazils_data(self) -> None:
        db = sqlite3.connect(":memory:")
        scrape_tiny_world(db, self.cache, Offline(), known_club_ids={"31": "liverpool"})
        self.assertEqual(db.execute("SELECT club_id FROM players WHERE id = 'tm-105470'").fetchone(), ("liverpool",))


if __name__ == "__main__":
    unittest.main()
