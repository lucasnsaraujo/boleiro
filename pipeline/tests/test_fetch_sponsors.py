from __future__ import annotations

import unittest

from bs4 import BeautifulSoup

from fetch_sponsors import cell_names, infobox_deals, wiki_names


def cell(html: str):
    return BeautifulSoup(f"<table><tr><td>{html}</td></tr></table>", "lxml").td


class KitTableCellTest(unittest.TestCase):
    def test_keeps_a_brand_whose_name_has_a_decimal_comma_whole(self) -> None:
        names = cell_names(cell("Estrella Galicia 0,0"))
        self.assertEqual(names, [("Estrella Galicia 0,0", "")])

    def test_still_splits_brands_listed_with_commas(self) -> None:
        names = cell_names(cell('<a href="/wiki/Betano" title="Betano">Betano</a>, Hapvida'))
        self.assertEqual(names, [("Betano", "Betano"), ("Hapvida", "")])

    def test_drops_the_links_to_other_languages_after_a_brand_without_an_english_article(self) -> None:
        html = (
            '<a href="/w/index.php?title=Robey_Sportswear&amp;action=edit&amp;redlink=1" class="new" title="Robey Sportswear (page does not exist)">Robey</a>'
            '<span class="noprint" style="font-size:85%;">&#160;&#91;<a href="https://it.wikipedia.org/wiki/Robey_Sportswear" class="extiw" title="it:Robey Sportswear">it</a>; '
            '<a href="https://nl.wikipedia.org/wiki/Robey" class="extiw" title="nl:Robey">nl</a>&#93;</span>'
        )
        self.assertEqual(cell_names(cell(html)), [("Robey", "")])


class InfoboxTest(unittest.TestCase):
    def test_reads_an_external_link_as_its_text(self) -> None:
        self.assertEqual(wiki_names("[[Banestes]] <br /> [https://apexpartners.com.br Apex Partners] Blackbox"), [("Banestes", "Banestes"), ("Apex Partners Blackbox", "")])

    def test_keeps_a_decimal_comma_in_a_name(self) -> None:
        self.assertEqual(wiki_names("Estrella Galicia 0,0, [[Unimed]]"), [("Estrella Galicia 0,0", ""), ("Unimed", "Unimed")])

    def test_takes_the_first_of_the_sponsors_an_infobox_lists_as_the_master_and_never_the_kit_maker(self) -> None:
        wikitext = "{{Info/Clube\n| material = [[Adidas]]\n| patrocinio = [[Adidas]], [[Raízen]], [[Unimed]], Cataguá\n}}"
        self.assertEqual(infobox_deals(wikitext), [("kit", "Adidas", "Adidas"), ("master", "Raízen", "Raízen")])


if __name__ == "__main__":
    unittest.main()
