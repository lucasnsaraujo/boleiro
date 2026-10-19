from __future__ import annotations

import unittest

import fetch_big_stadiums as bs

TABLE = """{|class="wikitable sortable sticky-header"
|+List
|-
!Rank
!Stadium
|-
!_row_count
| style{{=}}"background-color:#9FC" |'''[[Camp Nou]]''' ♦||99,354<ref>x</ref>||Europe||{{Flagcountry|Spain}}||[[Barcelona|Barcelona, Catalonia]]
|[[File:B.jpg|left|150px]]||[[FC Barcelona]]
|-
!_row_count
||[[Wembley Stadium]] ♦
|90,000
|Europe
|{{ENG}}
|[[London, England]]
|[[File:W.jpg|left|150px]]
|[[England national football team]]
|-
!_row_count
|[[Croke Park]]||82,300||Europe||{{IRE}}||[[Dublin]]
|[[File:C.jpg]]||[[Gaelic Athletic Association]]
|}
"""


class StadiumsTest(unittest.TestCase):
    def test_reads_name_city_country_and_seats_whatever_the_flag_template(self) -> None:
        rows = bs.stadiums(TABLE, {"ENG": "england"})
        self.assertEqual(rows, [
            {"name": "Camp Nou", "city": "Barcelona", "country": "spain", "capacity": 99354},
            {"name": "Wembley Stadium", "city": "Londres", "country": "england", "capacity": 90000},
        ])


if __name__ == "__main__":
    unittest.main()
