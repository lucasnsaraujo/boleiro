from __future__ import annotations

import gzip
import json
import unittest

import fetch_national_football as nf
from tests.fixtures import FIXTURES


def fotmob(name: str) -> str:
    """A saved FotMob answer, cut down and gzipped in tests/fixtures."""
    return gzip.decompress((FIXTURES / f"fotmob-{name}.json.gz").read_bytes()).decode("utf-8")


TEAMS = ["spain", "brazil", "united-states", "democratic-republic-of-the-congo", "republic-of-ireland", "bosnia-herzegovina",
         "morocco", "haiti", "scotland"]


class RankingTest(unittest.TestCase):
    def test_reads_the_whole_table_with_its_date(self) -> None:
        ranking = nf.ranking_of(fotmob("team-brazil-ranking"), TEAMS)
        self.assertEqual(ranking.date, "2026-10-07")
        self.assertEqual(ranking.rows[0], nf.RankRow("spain", "Spain", 1, 2012))
        self.assertIn(nf.RankRow("brazil", "Brazil", 6, 1807), ranking.rows)

    def test_names_fotmob_s_short_names_by_the_pack_s_ids(self) -> None:
        ids = {row.team for row in nf.ranking_of(fotmob("team-brazil-ranking"), TEAMS).rows}
        self.assertTrue({"united-states", "democratic-republic-of-the-congo", "republic-of-ireland", "bosnia-herzegovina"} <= ids)

    def test_keeps_a_ranked_team_without_a_squad_under_its_own_slug(self) -> None:
        ids = {row.team for row in nf.ranking_of(fotmob("team-brazil-ranking"), TEAMS).rows}
        self.assertIn("singapore", ids)


class FixturesTest(unittest.TestCase):
    def test_lists_the_group_matches_with_their_group_and_day(self) -> None:
        fixtures = nf.fixtures_of(fotmob("league-world-cup"), "world-cup-2026", TEAMS)
        group = [f for f in fixtures if f.round == "1"]
        self.assertIn(nf.FixtureRow("world-cup-2026", "1", "C", "2026-06-13", "brazil", "morocco"), group)

    def test_keeps_only_the_days_of_a_knockout_round_whose_teams_are_not_drawn_yet(self) -> None:
        fixtures = nf.fixtures_of(fotmob("league-world-cup"), "world-cup-2026", TEAMS)
        knockout = [f for f in fixtures if f.round == "1/16"]
        self.assertTrue(knockout)
        self.assertTrue(all(f.home == "" and f.away == "" and f.group == "" for f in knockout))

    def test_throws_on_a_team_the_pack_does_not_have(self) -> None:
        page = {"fixtures": {"allMatches": [{"round": "1", "group": "A", "home": {"name": "Atlantis"}, "away": {"name": "Brazil"},
                                             "status": {"utcTime": "2026-06-11T19:00:00Z"}}]}}
        with self.assertRaises(ValueError):
            nf.fixtures_of(json.dumps(page), "world-cup-2026", TEAMS)


class PackTest(unittest.TestCase):
    def test_writes_the_same_bytes_for_the_same_data(self) -> None:
        ranking = nf.ranking_of(fotmob("team-brazil-ranking"), TEAMS)
        fixtures = nf.fixtures_of(fotmob("league-world-cup"), "world-cup-2026", TEAMS)
        teams = [nf.TeamRow("brazil", "BRA", "#FFDC02", "#009C3B")]
        first = nf.pack_bytes(nf.pack_content(ranking, fixtures, teams))
        self.assertEqual(first, nf.pack_bytes(nf.pack_content(ranking, fixtures, teams)))
        pack = json.loads(gzip.decompress(first))
        self.assertEqual(pack["format"], 1)
        self.assertTrue(pack["packVersion"].startswith("national-football-"))
        self.assertEqual(pack["teams"]["code"], ["BRA"])
        self.assertEqual(pack["ranking"]["date"], "2026-10-07")


if __name__ == "__main__":
    unittest.main()
