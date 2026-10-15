from __future__ import annotations

import unittest

from tests.fixtures import fixture

import tm_pages


class ClubSquadPageTest(unittest.TestCase):
    def setUp(self) -> None:
        self.squad = tm_pages.squad(fixture("squad-liverpool"))

    def test_reads_the_club_its_league_and_stadium_from_the_header(self) -> None:
        self.assertEqual(self.squad.name, "Liverpool FC")
        self.assertEqual((self.squad.league_code, self.squad.country), ("GB1", "England"))
        self.assertEqual((self.squad.stadium, self.squad.capacity), ("Anfield", 61276))
        self.assertEqual(self.squad.crest, "/wappen/head/31.png")

    def test_reads_every_player_with_his_detailed_position_mapped_to_a_role(self) -> None:
        self.assertEqual(len(self.squad.players), 29)
        alisson = next(player for player in self.squad.players if player.name == "Alisson")
        self.assertEqual(alisson.tm_id, "105470")
        self.assertEqual((alisson.position, alisson.role), ("Goalkeeper", "goleiro"))
        self.assertEqual((alisson.birth_date, alisson.age, alisson.foot), ("1992-10-02", 34, "right"))
        self.assertEqual((alisson.contract_until, alisson.market_value_eur), ("2027-06-30", 15_000_000))
        self.assertEqual(alisson.nationalities, ["Brazil"])

    def test_keeps_every_nationality_in_the_sites_order(self) -> None:
        koumas = next(player for player in self.squad.players if player.name == "Lewis Koumas")
        self.assertEqual(koumas.nationalities, ["Wales", "England"])

    def test_maps_every_position_on_the_page_to_one_of_the_five_roles(self) -> None:
        roles = {player.role for player in self.squad.players}
        self.assertEqual(roles, {"goleiro", "lateral", "zagueiro", "meia", "atacante"})


class NationalTeamSquadPageTest(unittest.TestCase):
    def test_reads_each_players_club_caps_and_the_confederation(self) -> None:
        squad = tm_pages.squad(fixture("squad-brazil-national-team"))
        self.assertEqual(squad.name, "Brazil")
        self.assertEqual(squad.confederation, "South American Football Confederation")
        pedro = next(player for player in squad.players if player.name == "Pedro")
        self.assertEqual((pedro.club_name, pedro.club_tm_id), ("CR Flamengo", "614"))
        self.assertEqual((pedro.caps, pedro.goals, pedro.role), (8, 2, "atacante"))


class CompetitionPagesTest(unittest.TestCase):
    def test_lists_a_leagues_clubs_in_the_pages_order(self) -> None:
        clubs = tm_pages.participants(fixture("league-premier-league-two-clubs"))
        self.assertEqual([(club.tm_id, club.slug) for club in clubs], [("11", "fc-arsenal"), ("31", "fc-liverpool")])

    def test_lists_the_national_teams_of_a_qualifiers_participants_page(self) -> None:
        teams = tm_pages.participants(fixture("participants-wc-qualifiers-south-america"))
        self.assertEqual(len(teams), 10)
        self.assertIn(("3439", "brasilien"), [(team.tm_id, team.slug) for team in teams])

    def test_names_a_competition_from_its_header(self) -> None:
        self.assertEqual(tm_pages.competition_header(fixture("league-premier-league-two-clubs")), ("Premier League", "189"))


class ClubFactsPageTest(unittest.TestCase):
    def test_reads_the_club_colours_as_hex_in_the_sites_order(self) -> None:
        self.assertEqual(tm_pages.club_colours(fixture("facts-liverpool")), ["#E6001E", "#39403B", "#FFFFFF"])


if __name__ == "__main__":
    unittest.main()
