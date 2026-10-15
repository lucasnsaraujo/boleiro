from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path

import tm_fetch
import tm_pages
import tm_world
from scrape_world import scrape_world, short_squads
from tests.fixtures import fixture
from tests.world_fixture import ENGLAND,  QUALIFIERS, Offline, saved_cache, scrape_tiny_world


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

    def test_marks_a_run_over_part_of_the_world_as_partial(self) -> None:
        db = sqlite3.connect(":memory:")
        scrape_tiny_world(db, self.cache, Offline(), is_partial=True)
        self.assertEqual(db.execute("SELECT kind FROM snapshots").fetchall(), [("transfermarkt-partial",)])

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


    def test_skips_a_page_that_came_back_without_a_squad_and_lists_it(self) -> None:
        robot_check = self.cache / tm_fetch.cache_name("/fc-arsenal/kader/verein/11/plus/1")
        robot_check.write_text("<html><body>Are you a robot?</body></html>")
        db = sqlite3.connect(":memory:")
        run = scrape_tiny_world(db, self.cache, Offline())
        self.assertEqual(db.execute("SELECT id FROM clubs").fetchall(), [("tm-31",)])
        self.assertTrue(any("/fc-arsenal/kader/verein/11/plus/1" in failure for failure in run.failures))
        self.assertFalse(robot_check.exists(), "the next run should download the page again")


    def test_drops_a_league_page_without_clubs_from_the_cache_so_the_next_run_asks_again(self) -> None:
        league = self.cache / tm_fetch.cache_name("/x/startseite/wettbewerb/GB1")
        league.write_text('<html><header class="data-header"><h1>Premier League</h1></header></html>')
        run = scrape_tiny_world(sqlite3.connect(":memory:"), self.cache, Offline())
        self.assertIn("no clubs on /x/startseite/wettbewerb/GB1", run.failures)
        self.assertFalse(league.exists())

    def test_keeps_two_stadiums_with_the_same_name_and_different_capacities_apart(self) -> None:
        arsenal = self.cache / tm_fetch.cache_name("/fc-arsenal/kader/verein/11/plus/1")
        arsenal.write_text(arsenal.read_text().replace("Emirates Stadium", "Anfield"))
        db = sqlite3.connect(":memory:")
        scrape_tiny_world(db, self.cache, Offline())
        grounds = db.execute(
            "SELECT c.id, s.name, s.capacity FROM clubs c JOIN stadiums s ON s.snapshot_id = c.snapshot_id AND s.id = c.stadium_id ORDER BY c.id"
        ).fetchall()
        self.assertEqual(grounds, [("tm-11", "Anfield", 60704), ("tm-31", "Anfield", 61276)])

    def test_two_clubs_sharing_a_ground_share_its_stadium_row(self) -> None:
        liverpool = (self.cache / tm_fetch.cache_name("/fc-liverpool/kader/verein/31/plus/1")).read_text()
        arsenal = self.cache / tm_fetch.cache_name("/fc-arsenal/kader/verein/11/plus/1")
        arsenal.write_text(arsenal.read_text().replace("Emirates Stadium", "Anfield").replace("60.704", "61.276"))
        db = sqlite3.connect(":memory:")
        scrape_tiny_world(db, self.cache, Offline())
        self.assertIn("61.276", liverpool)
        self.assertEqual(db.execute("SELECT count(DISTINCT stadium_id), count(*) FROM clubs").fetchone(), (1, 2))

    def test_drops_a_facts_page_that_is_not_a_club_page_and_guesses_the_colours(self) -> None:
        facts = self.cache / tm_fetch.cache_name("/x/datenfakten/verein/31")
        facts.write_text("<html><body>Are you a robot?</body></html>")
        db = sqlite3.connect(":memory:")
        run = scrape_tiny_world(db, self.cache, Offline())
        self.assertTrue(any("/x/datenfakten/verein/31" in failure for failure in run.failures))
        self.assertFalse(facts.exists(), "the next run should download the page again")
        source = db.execute("SELECT source FROM field_sources WHERE entity_id = 'tm-31' AND field = 'colours'").fetchone()
        self.assertEqual(source, ("guess",))

    def test_drops_a_national_team_list_without_teams_from_the_cache(self) -> None:
        listing = self.cache / tm_fetch.cache_name(QUALIFIERS)
        listing.write_text("<html><body>Are you a robot?</body></html>")
        run = scrape_tiny_world(sqlite3.connect(":memory:"), self.cache, Offline())
        self.assertIn(f"no teams on {QUALIFIERS}", run.failures)
        self.assertFalse(listing.exists())

    def test_leaves_out_a_club_its_competition_records_as_withdrawn(self) -> None:
        cup = tm_world.Competition("cup", "/x/startseite/wettbewerb/GB1", withdrawn=("11",))
        db = sqlite3.connect(":memory:")
        fetcher = tm_fetch.Fetcher(self.cache, log=lambda _: None, get=Offline().get, sleep=lambda _: None)
        scrape_world(db, fetcher, [ENGLAND], club_world_cup=cup, log=lambda _: None)
        self.assertEqual(db.execute("SELECT club_id FROM competition_clubs WHERE competition_id = 'cup'").fetchall(), [("tm-31",)])

    def test_the_club_world_cup_has_thirty_two_clubs(self) -> None:
        refs = tm_pages.participants(fixture("participants-club-world-cup-2025"))
        kept = [ref for ref in refs if ref.tm_id not in tm_world.CLUB_WORLD_CUP.withdrawn]
        self.assertEqual(len(kept), 32)
        self.assertIn("Los Angeles FC", [ref.name for ref in kept])
        self.assertNotIn("CF América", [ref.name for ref in kept])

    def test_lists_the_clubs_with_fewer_players_than_a_squad_needs(self) -> None:
        self.assertEqual(short_squads(self.db, self.run.snapshot, minimum=25), [("Arsenal FC", "tm-11", 24)])
        self.assertEqual(short_squads(self.db, self.run.snapshot, minimum=24), [])

    def test_keeps_the_cached_squad_when_its_refetch_comes_back_as_a_robot_check(self) -> None:
        class RobotCheck:
            status_code = 200
            content = b"<html><body>Are you a robot?</body></html>"
            headers: dict[str, str] = {}
        db = sqlite3.connect(":memory:")
        fetcher = tm_fetch.Fetcher(self.cache, log=lambda _: None, get=lambda _: RobotCheck(), sleep=lambda _: None)
        scrape_world(db, fetcher, [ENGLAND], max_age_days=0, log=lambda _: None)
        self.assertEqual(db.execute("SELECT id FROM clubs ORDER BY seq").fetchall(), [("tm-11",), ("tm-31",)])

    def test_records_which_lost_pages_could_hold_clubs(self) -> None:
        stored = "SELECT count(*) FROM snapshot_failures WHERE snapshot_id = ? AND holds_clubs = ?"
        self.assertEqual(self.rows(stored, self.run.snapshot, 1), [(0,)])
        self.assertEqual(self.rows(stored, self.run.snapshot, 0), [(len(self.run.failures),)])
        (self.cache / tm_fetch.cache_name("/fc-arsenal/kader/verein/11/plus/1")).unlink()
        db = sqlite3.connect(":memory:")
        scrape_tiny_world(db, self.cache, Offline())
        self.assertEqual(db.execute(stored, (1, 1)).fetchone(), (1,))

    def test_keeps_two_national_teams_with_the_same_name_apart(self) -> None:
        brazil = (self.cache / tm_fetch.cache_name("/brasilien/kader/verein/3439/plus/1")).read_text()
        (self.cache / tm_fetch.cache_name("/argentinien/kader/verein/3437/plus/1")).write_text(brazil)
        db = sqlite3.connect(":memory:")
        run = scrape_tiny_world(db, self.cache, Offline())
        self.assertEqual(run.national_teams, 2)
        ids = sorted(row[0] for row in db.execute("SELECT id FROM national_teams"))
        self.assertEqual(ids[0], "brazil")
        self.assertIn(ids[1], ("tm-3437", "tm-3439"))


if __name__ == "__main__":
    unittest.main()
