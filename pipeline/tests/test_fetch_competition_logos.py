from __future__ import annotations

import unittest

import fetch_competition_logos as cl


class SeededTest(unittest.TestCase):
    def test_keys_every_league_by_country_and_level_and_every_european_cup(self) -> None:
        keys = {row["key"] for row in cl.transfermarkt_rows()}
        self.assertTrue({"gb-eng-1", "gb-eng-2", "ar-2", "us-1", "es-cup", "az-cup"} <= keys)
        self.assertFalse({"br-1", "ar-cup", "sa-cup", "us-cup"} & keys)

    def test_keeps_a_row_already_in_the_file(self) -> None:
        own = {"key": "gb-eng-1", "name": "Premier League", "source": "wikimedia", "page": "https://commons.wikimedia.org/wiki/File:X.svg", "licence": "trademark"}
        rows = cl.seeded([own])
        self.assertEqual([row for row in rows if row["key"] == "gb-eng-1"], [own])

    def test_reads_a_competition_code_from_its_page(self) -> None:
        self.assertEqual(cl.transfermarkt_code("https://www.transfermarkt.com/x/startseite/wettbewerb/BRCM"), "brcm")


class CreditTest(unittest.TestCase):
    def test_lists_only_licences_that_ask_for_credit(self) -> None:
        rows = [{"key": key, "licence": licence} for key, licence in [("a", "CC0"), ("b", "public domain (PD-textlogo); trademark"), ("c", "CC BY-SA 4.0")]]
        self.assertEqual(cl.owed_credits(rows), ["c"])


if __name__ == "__main__":
    unittest.main()
