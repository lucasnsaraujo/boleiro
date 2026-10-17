from __future__ import annotations

import unittest

import fetch_derbies
from fetch_derbies import Derby


CLUBS = {"Esporte Clube Bahia": "bahia-ba", "Esporte Clube Vitória": "vitoria-ba", "Atlético Nacional": "tm-8172",
         "Millonarios F.C.": "tm-2350", "Atlético Junior": "tm-1", "Unión Magdalena": "tm-2", "Real Cartagena": "tm-3"}


def resolve(title: str) -> str:
    return title.replace("_", " ")


class DerbyLinesTest(unittest.TestCase):
    def test_reads_a_bullet_into_its_two_clubs_and_its_name(self) -> None:
        line = "* Ba–Vi: [[Esporte Clube Bahia|Bahia]] vs. [[Esporte Clube Vitória|Vitória]]<ref name=\"x\">{{cite web |title=Ba-Vi [[Lance!]]}}</ref>"
        self.assertEqual(fetch_derbies.derbies_in_line(line, CLUBS, resolve),
                         [Derby(clubs=("bahia-ba", "vitoria-ba"), name="Ba–Vi", article="")])

    def test_keeps_the_derby_article_the_line_links_to(self) -> None:
        line = "* [[Atlético Nacional–Millonarios F.C. rivalry|Rivalry amongst Atlético Nacional and Millonarios]]"
        self.assertEqual(fetch_derbies.derbies_in_line(line, CLUBS | {"Atlético Nacional–Millonarios F.C. rivalry": ""}, resolve), [])
        line = "* [[El Clásico Paisa|Clásico Paisa]]: [[Atlético Nacional]] vs. [[Millonarios F.C.|Millonarios]]"
        self.assertEqual(fetch_derbies.derbies_in_line(line, CLUBS, resolve),
                         [Derby(clubs=("tm-2350", "tm-8172"), name="Clásico Paisa", article="El Clásico Paisa")])

    def test_pairs_every_club_of_a_three_way_derby(self) -> None:
        line = "*Clásico Costeño: [[Atlético Junior|Junior]] vs. [[Unión Magdalena]] vs. [[Real Cartagena]]"
        self.assertEqual([d.clubs for d in fetch_derbies.derbies_in_line(line, CLUBS, resolve)], [("tm-1", "tm-2"), ("tm-1", "tm-3"), ("tm-2", "tm-3")])

    def test_skips_a_line_naming_one_club_or_a_crowd_of_them(self) -> None:
        self.assertEqual(fetch_derbies.derbies_in_line("* [[Esporte Clube Bahia]] derbies", CLUBS, resolve), [])
        crowd = "* " + ", ".join(f"[[{title}]]" for title in CLUBS)
        self.assertEqual(fetch_derbies.derbies_in_line(crowd, CLUBS, resolve), [])


class IntensityTest(unittest.TestCase):
    def test_ranks_the_unrated_pairs_by_pageviews_into_one_to_four(self) -> None:
        views = {("a", f"b{i}"): (i + 1) * 100 for i in range(20)}
        scale = fetch_derbies.intensities_by_views(views)
        self.assertEqual(scale[("a", "b19")], 4)
        self.assertEqual(scale[("a", "b0")], 1)
        self.assertEqual(sorted(set(scale.values())), [1, 2, 3, 4])
        self.assertTrue(all(scale[("a", f"b{i}")] <= scale[("a", f"b{i + 1}")] for i in range(19)))


if __name__ == "__main__":
    unittest.main()
