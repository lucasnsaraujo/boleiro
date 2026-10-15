from __future__ import annotations

import gzip
import json
import unittest

import scrape_fotmob
from positions import roles_of
from scrape_fotmob import SquadMember, Starter, Team, TmPlayer
from tests.fixtures import FIXTURES


def fotmob(name: str) -> str:
    """A saved FotMob answer, cut down and gzipped in tests/fixtures."""
    return gzip.decompress((FIXTURES / f"fotmob-{name}.json.gz").read_bytes()).decode("utf-8")


def club(club_id: str, name: str, short_name: str, state: str, division: str) -> dict[str, str]:
    return {"id": club_id, "name": name, "short_name": short_name, "state": state, "division": division}


class LeaguePageTest(unittest.TestCase):
    def test_lists_a_league_s_clubs_from_its_standings(self) -> None:
        teams = scrape_fotmob.league_teams(fotmob("league-serie-a"))
        self.assertEqual(len(teams), 20)
        self.assertIn(Team(9770, "Flamengo"), teams)

    def test_lists_a_cup_s_clubs_from_its_fixtures(self) -> None:
        teams = scrape_fotmob.league_teams(fotmob("league-copa-do-brasil"))
        self.assertEqual(len(teams), 12)
        self.assertIn(Team(197401, "América SE"), teams)

    def test_leaves_out_the_placeholders_of_a_draw_not_yet_made(self) -> None:
        page = {"fixtures": {"allMatches": [
            {"home": {"id": 0, "name": "São Bernardo"}, "away": {"id": 1, "name": "Atlético-MG/Grêmio"}},
            {"home": {"id": 9770, "name": "Flamengo"}, "away": {"id": 8517, "name": "Botafogo"}},
        ]}}
        self.assertEqual(scrape_fotmob.league_teams(json.dumps(page)), [Team(9770, "Flamengo"), Team(8517, "Botafogo")])


class TeamPageTest(unittest.TestCase):
    def test_reads_every_player_s_positions_main_first_without_the_coach(self) -> None:
        members = scrape_fotmob.squad(fotmob("team-flamengo"))
        by_name = {member.name: member for member in members}
        self.assertEqual(by_name["Lucas Paquetá"].positions, ("CAM", "CDM", "CM", "RW", "ST"))
        self.assertEqual(by_name["Danilo"].positions, ("CB", "RB"))
        self.assertNotIn("Leonardo Jardim", by_name)
        self.assertNotIn("Gabriel Werneck", by_name, "a player FotMob gives no position is left out")

    def test_reads_the_last_match_s_formation_and_eleven_keeper_first(self) -> None:
        lineup = scrape_fotmob.last_lineup(fotmob("team-flamengo"))
        assert lineup is not None
        self.assertEqual(lineup.formation, "4-2-3-1")
        self.assertEqual(len(lineup.starters), 11)
        self.assertEqual(lineup.starters[0].name, "Agustín Rossi")
        self.assertEqual(lineup.starters[-1].name, "Pedro")

    def test_has_no_lineup_when_the_page_shows_none(self) -> None:
        self.assertIsNone(scrape_fotmob.last_lineup(json.dumps({"overview": {"lastLineupStats": None}})))


class MatchingTest(unittest.TestCase):
    clubs = [
        club("botafogo-rj", "Botafogo de Futebol e Regatas", "Botafogo", "RJ", "A"),
        club("botafogo-sp-sp", "Botafogo FC", "Botafogo-SP", "SP", "B"),
        club("vitoria-ba", "Esporte Clube Vitória", "Vitória", "BA", "A"),
        club("santos-sp", "Santos FC", "Santos", "SP", "A"),
        club("santos-ap", "Santos FC", "Santos", "AP", ""),
        club("bragantino-sp", "Red Bull Bragantino", "Bragantino", "SP", "A"),
        club("x-a", "Clube X", "X", "AL", ""),
        club("x-b", "Clube X", "X", "BA", ""),
    ]

    def test_matches_a_club_by_name_and_takes_the_one_highest_in_the_pyramid_when_several_share_it(self) -> None:
        teams = [Team(8517, "Botafogo"), Team(8514, "Santos"), Team(7733, "Vitória"), Team(109705, "RB Bragantino")]
        self.assertEqual(scrape_fotmob.match_clubs(teams, self.clubs),
                         {8517: "botafogo-rj", 8514: "santos-sp", 7733: "vitoria-ba", 109705: "bragantino-sp"})

    def test_leaves_a_club_out_when_level_namesakes_could_be_it_or_nobody_has_its_name(self) -> None:
        self.assertEqual(scrape_fotmob.match_clubs([Team(1, "X"), Team(2, "Linense")], self.clubs), {})

    def test_matches_players_by_name_nickname_or_full_name_but_never_two_ways(self) -> None:
        tm = [TmPlayer("1", "Léo Ortiz", 30), TmPlayer("2", "Pedro", 29), TmPlayer("3", "Giorgian de Arrascaeta", 32),
              TmPlayer("4", "Gabriel Silva", 20), TmPlayer("5", "Gabriel Souza", 21)]
        members = [SquadMember(10, "Leo Ortiz", 30, ("CB",)), SquadMember(11, "Pedro Guilherme", 29, ("ST",)),
                   SquadMember(12, "Arrascaeta", 32, ("CAM",)), SquadMember(13, "Gabriel", 20, ("CM",))]
        self.assertEqual(scrape_fotmob.match_players(members, tm), ["1", "2", "3", None])

    def test_matches_starters_fotmob_gives_the_same_id_each_to_their_own_player_and_never_to_one_already_taken(self) -> None:
        tm = [TmPlayer("1", "Douglas", None), TmPlayer("2", "Ruan Costa", None), TmPlayer("3", "Pedro", None)]
        starters = [Starter(0, "Douglas", 9), Starter(0, "Ruan Costa", 9), Starter(0, "Pedro", 9)]
        self.assertEqual(scrape_fotmob.match_players(starters, tm, taken=["3"]), ["1", "2", None])


class RolesTest(unittest.TestCase):
    def test_keeps_transfermarkt_s_main_role_first_then_fotmob_s_others_once_each(self) -> None:
        self.assertEqual(roles_of("meia", ["CAM", "CDM", "RW", "ST", "LW"]), ["meia", "atacante"])
        self.assertEqual(roles_of("zagueiro", ["CB", "RB", "RWB"]), ["zagueiro", "lateral"])
        self.assertEqual(roles_of("lateral", ["XYZ"]), ["lateral"])


if __name__ == "__main__":
    unittest.main()
