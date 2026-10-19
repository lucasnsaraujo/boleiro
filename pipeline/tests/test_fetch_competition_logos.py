from __future__ import annotations

import unittest

from PIL import Image

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
        licences = [("a", "CC0"), ("b", "public domain (PD-textlogo); trademark"), ("c", "CC BY-SA 4.0"), ("d", "CC BY-SA 4.0; trademark"),
                    ("e", "unknown licence; trademark; via Transfermarkt"), ("f", "non-free (en.wikipedia, fair use); trademark")]
        self.assertEqual(cl.owed_credits([{"key": key, "licence": licence} for key, licence in licences]), ["c", "d"])


if __name__ == "__main__":
    unittest.main()


class ClearedTest(unittest.TestCase):
    def test_clears_a_white_box_around_a_logo_but_keeps_a_coloured_one(self) -> None:
        boxed = Image.new("RGBA", (20, 20), (255, 255, 255, 255))
        boxed.paste((200, 0, 0, 255), (5, 5, 15, 15))
        clear = cl.cleared(boxed)
        self.assertEqual(clear.getpixel((0, 0))[3], 0)
        self.assertEqual(clear.getpixel((10, 10)), (200, 0, 0, 255))
        navy = Image.new("RGBA", (20, 20), (10, 20, 60, 255))
        self.assertEqual(cl.cleared(navy).getpixel((0, 0))[3], 255)
