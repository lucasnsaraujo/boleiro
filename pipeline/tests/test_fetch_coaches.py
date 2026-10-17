from __future__ import annotations

import unittest
from datetime import date

import fetch_coaches
from fetch_coaches import Manager
from tests.fixtures import fixture


class ManagersPageTest(unittest.TestCase):
    def test_reads_each_manager_with_his_club_nationality_age_and_whether_he_played(self) -> None:
        managers = fetch_coaches.managers(fixture("managers-premier-league"))
        self.assertEqual([m.name for m in managers], ["Mikel Arteta", "Unai Emery", "Pierre Sage"])
        arteta = managers[0]
        self.assertEqual(arteta, Manager(transfermarkt_id=47620, name="Mikel Arteta", nationality="Spain", club_tm_id=11, age=44,
                                         tenure=(6, 9, 25), contract_until="2030", is_former_player=True))
        self.assertFalse(managers[2].is_former_player)
        self.assertEqual(managers[2].tenure, (0, 3, 16))

    def test_dates_a_tenure_back_from_the_day_the_page_was_read(self) -> None:
        self.assertEqual(fetch_coaches.in_charge_since((6, 9, 25), date(2026, 10, 17)), date(2019, 12, 23))
        self.assertEqual(fetch_coaches.in_charge_since((0, 3, 16), date(2026, 10, 17)), date(2026, 7, 1))


class NewestCoachTest(unittest.TestCase):
    def test_keeps_the_latest_appointment_when_a_page_lists_two_coaches_for_one_club(self) -> None:
        rows = [
            {"club_id": "fortaleza-ce", "name": "Paulo Autuori", "in_charge_since": "2026-07-31"},
            {"club_id": "fortaleza-ce", "name": "Thiago Dantas", "in_charge_since": "2026-10-17"},
            {"club_id": "flamengo-rj", "name": "Leonardo Jardim", "in_charge_since": "2026-03-04"},
        ]
        self.assertEqual([r["name"] for r in fetch_coaches.newest_per_club(rows)], ["Leonardo Jardim", "Thiago Dantas"])


if __name__ == "__main__":
    unittest.main()
