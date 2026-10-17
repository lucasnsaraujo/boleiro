from __future__ import annotations

import unittest

import fetch_national_crests as nc
from tm_pages import ClubRef


class CrestIdsTest(unittest.TestCase):
    def test_finds_each_pack_team_by_its_name_on_the_participants_pages(self) -> None:
        refs = [ClubRef("3439", "brasilien", "Brazil"), ClubRef("3589", "korea-sud", "Korea, South"), ClubRef("3375", "spanien", "Spain")]
        self.assertEqual(nc.crest_ids(refs, {"brazil": "Brazil", "korea-south": "Korea, South"}), {"brazil": "3439", "korea-south": "3589"})

    def test_stops_on_a_pack_team_the_lists_lack(self) -> None:
        with self.assertRaises(SystemExit):
            nc.crest_ids([ClubRef("3439", "brasilien", "Brazil")], {"brazil": "Brazil", "haiti": "Haiti"})


if __name__ == "__main__":
    unittest.main()
