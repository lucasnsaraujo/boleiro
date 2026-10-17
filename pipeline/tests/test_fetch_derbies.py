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

    def test_leaves_an_english_name_out_for_the_game_to_call_it_a_classico(self) -> None:
        line = "* Rivalry of the Andes derby: [[Atlético Nacional]] vs. [[Millonarios F.C.|Millonarios]]"
        self.assertEqual(fetch_derbies.derbies_in_line(line, CLUBS, resolve)[0].name, "")

    def test_keeps_a_local_name_that_opens_with_derby(self) -> None:
        line = "* ''Derby do Cerrado'' ([[Cerrado]] Derby): [[Atlético Nacional]] vs. [[Millonarios F.C.|Millonarios]]"
        self.assertEqual(fetch_derbies.derbies_in_line(line, CLUBS, resolve)[0].name, "Derby do Cerrado")

    def test_keeps_the_derby_article_the_line_links_to(self) -> None:
        line = "* [[Atlético Nacional–Millonarios F.C. rivalry|Rivalry amongst Atlético Nacional and Millonarios]]"
        self.assertEqual(fetch_derbies.derbies_in_line(line, CLUBS | {"Atlético Nacional–Millonarios F.C. rivalry": ""}, resolve), [])
        line = "* [[El Clásico Paisa|Clásico Paisa]]: [[Atlético Nacional]] vs. [[Millonarios F.C.|Millonarios]]"
        self.assertEqual(fetch_derbies.derbies_in_line(line, CLUBS, resolve),
                         [Derby(clubs=("tm-2350", "tm-8172"), name="Clásico Paisa", article="El Clásico Paisa")])

    def test_ignores_clubs_the_line_names_in_its_prose_after_the_derby(self) -> None:
        line = "*[[Clásico Paisa]]: [[Atlético Nacional]] against [[Millonarios F.C.|Millonarios]] was the only derby whose sides both won it, up until [[Esporte Clube Bahia]]'s win"
        self.assertEqual([d.clubs for d in fetch_derbies.derbies_in_line(line, CLUBS, resolve)], [("tm-2350", "tm-8172")])

    def test_takes_a_city_heading_for_no_derby_article(self) -> None:
        line = "* [[Medellín]]: [[Atlético Nacional]] vs. [[Millonarios F.C.|Millonarios]]"
        self.assertEqual(fetch_derbies.derbies_in_line(line, CLUBS, resolve)[0].article, "")

    def test_takes_a_city_heading_for_no_derby_name(self) -> None:
        line = "*[[Córdoba, Argentina|Córdoba]]: [[Atlético Nacional]] vs. [[Millonarios F.C.|Millonarios]] (''Cordoban derby'')"
        self.assertEqual(fetch_derbies.derbies_in_line(line, CLUBS, resolve)[0].name, "")

    def test_keeps_a_portuguese_name_without_its_english_translation(self) -> None:
        line = "* ''Clássico da Rivalidade'' (The Rivalry Derby): [[Esporte Clube Bahia|Bahia]] vs. [[Esporte Clube Vitória|Vitória]]"
        self.assertEqual(fetch_derbies.derbies_in_line(line, CLUBS, resolve)[0].name, "Clássico da Rivalidade")

    def test_takes_the_local_name_of_a_city_derby_that_has_one(self) -> None:
        line = "* [[Natal, Rio Grande do Norte|Natal]] derby or ''Clássico-Rei'' (The Derby-King): [[Esporte Clube Bahia|Bahia]] vs. [[Esporte Clube Vitória|Vitória]]"
        self.assertEqual(fetch_derbies.derbies_in_line(line, CLUBS, resolve)[0].name, "Clássico-Rei")
        line = "* [[Caxias do Sul]] derby or Ca–Ju: [[Esporte Clube Bahia|Bahia]] vs. [[Esporte Clube Vitória|Vitória]]"
        self.assertEqual(fetch_derbies.derbies_in_line(line, CLUBS, resolve)[0].name, "Ca–Ju")

    def test_leaves_out_table_markup_place_pairs_and_english_titles_as_names(self) -> None:
        for head in ("rowspan=2|Bahia |Vitória |Ba-Vi |Games ", "[[Godoy Cruz, Mendoza|Godoy Cruz]]/[[San Juan, Argentina|San Juan]]",
                     "The Topper", "Derby of Via Emilia", "Tel Aviv mini-derby", "List of Brazilian football derbies"):
            line = f"* {head}: [[Esporte Clube Bahia|Bahia]] vs. [[Esporte Clube Vitória|Vitória]]"
            self.assertEqual([d.name for d in fetch_derbies.derbies_in_line(line, CLUBS, resolve)], [""], head)

    def test_reads_no_head_out_of_a_link_to_another_wikipedia(self) -> None:
        line = "* [[:pl:Derby Bahii|Bahia Derby]] (''Ba–Vi''): [[Esporte Clube Bahia|Bahia]] vs. [[Esporte Clube Vitória|Vitória]]"
        self.assertEqual([d.name for d in fetch_derbies.derbies_in_line(line, CLUBS, resolve)], [""])

    def test_names_no_hand_rated_derby_after_a_list_or_in_english(self) -> None:
        for pair, (_, name, _) in fetch_derbies.HAND_RATED.items():
            self.assertTrue(not name or fetch_derbies.is_name(name), pair)

    def test_leaves_a_list_of_derbies_out_as_the_derby_article(self) -> None:
        line = "* [[London derbies|London derby]]: [[Atlético Nacional]] vs. [[Millonarios F.C.|Millonarios]]"
        self.assertEqual(fetch_derbies.derbies_in_line(line, CLUBS, resolve)[0].article, "")

    def test_pairs_every_club_of_a_three_way_derby(self) -> None:
        line = "*Clásico Costeño: [[Atlético Junior|Junior]] vs. [[Unión Magdalena]] vs. [[Real Cartagena]]"
        self.assertEqual([d.clubs for d in fetch_derbies.derbies_in_line(line, CLUBS, resolve)], [("tm-1", "tm-2"), ("tm-1", "tm-3"), ("tm-2", "tm-3")])

    def test_skips_a_line_naming_one_club_or_a_crowd_of_them(self) -> None:
        self.assertEqual(fetch_derbies.derbies_in_line("* [[Esporte Clube Bahia]] derbies", CLUBS, resolve), [])
        crowd = "* " + ", ".join(f"[[{title}]]" for title in CLUBS)
        self.assertEqual(fetch_derbies.derbies_in_line(crowd, CLUBS, resolve), [])


class BrazilianClubsTest(unittest.TestCase):
    def test_matches_a_link_to_the_club_of_its_state_section_with_that_short_name(self) -> None:
        wikitext = "\n".join([
            "==[[Pernambuco]]==",
            "* ''Clássico das Multidões'': [[Santa Cruz Futebol Clube|Santa Cruz]] vs. [[Sport Club do Recife|Sport]]",
            "==[[Paraíba]]==",
            "* ''Clássico dos Maiorais'': [[Botafogo Futebol Clube (PB)|Botafogo]] vs. [[Treze Futebol Clube|Treze]]",
        ])
        clubs = [
            {"id": "santa-cruz-pe", "short_name": "Santa Cruz", "state": "PE"},
            {"id": "botafogo-rj", "short_name": "Botafogo", "state": "RJ"},
            {"id": "botafogo-pb", "short_name": "Botafogo-PB", "state": "PB"},
            {"id": "treze-pb", "short_name": "Treze", "state": "PB"},
        ]
        self.assertEqual(fetch_derbies.brazilian_club_titles(wikitext, clubs, resolve), {
            "Santa Cruz Futebol Clube": "santa-cruz-pe", "Botafogo Futebol Clube (PB)": "botafogo-pb", "Treze Futebol Clube": "treze-pb",
        })

    def test_takes_a_city_heading_for_no_club_of_that_name(self) -> None:
        wikitext = "==[[Sergipe]]==\n*[[Aracaju]] derby: [[Associação Desportiva Confiança|Confiança]] vs. [[Club Sportivo Sergipe|Sergipe]]"
        clubs = [{"id": "aracaju-se", "short_name": "Aracaju", "state": "SE"}, {"id": "confianca-se", "short_name": "Confiança", "state": "SE"}]
        self.assertEqual(fetch_derbies.brazilian_club_titles(wikitext, clubs, resolve), {"Associação Desportiva Confiança": "confianca-se"})


class BrazilianLinesTest(unittest.TestCase):
    STATES = {"sao-raimundo-am": "AM", "sao-raimundo-pa": "PA", "sao-francisco-pa": "PA", "nacional-am": "AM"}
    SHORT_NAMES = {"sao-raimundo-am": "São Raimundo", "sao-raimundo-pa": "São Raimundo", "sao-francisco-pa": "São Francisco", "nacional-am": "Nacional"}

    def derbies(self, wikitext: str) -> list[tuple[str, str]]:
        clubs = {"São Raimundo Esporte Clube (AM)": "sao-raimundo-am", "São Francisco Futebol Clube (PA)": "sao-francisco-pa", "Nacional Futebol Clube": "nacional-am"}
        brazil = [{"id": club, "short_name": self.SHORT_NAMES[club], "state": state} for club, state in self.STATES.items()]
        return [d.clubs for d in fetch_derbies.brazilian_derbies(wikitext, clubs, brazil, resolve)]

    def test_takes_a_link_to_a_namesake_from_another_state_for_the_club_of_the_section(self) -> None:
        wikitext = "==[[Pará]]==\n* [[Santarém, Pará|Santarém]] derby: [[São Francisco Futebol Clube (PA)|São Francisco]] vs. [[São Raimundo Esporte Clube (AM)|São Raimundo]]"
        self.assertEqual(self.derbies(wikitext), [("sao-francisco-pa", "sao-raimundo-pa")])

    def test_keeps_the_linked_club_in_its_own_state_section(self) -> None:
        wikitext = "==[[Amazonas (Brazilian state)|Amazonas]]==\n* São–Nal: [[Nacional Futebol Clube|Nacional]] vs. [[São Raimundo Esporte Clube (AM)|São Raimundo]]"
        self.assertEqual(self.derbies(wikitext), [("nacional-am", "sao-raimundo-am")])


class IntensityTest(unittest.TestCase):
    def test_ranks_the_unrated_pairs_by_pageviews_into_one_to_four(self) -> None:
        views = {("a", f"b{i}"): (i + 1) * 100 for i in range(20)}
        scale = fetch_derbies.intensities_by_views(views)
        self.assertEqual(scale[("a", "b19")], 4)
        self.assertEqual(scale[("a", "b0")], 1)
        self.assertEqual(sorted(set(scale.values())), [1, 2, 3, 4])
        self.assertTrue(all(scale[("a", f"b{i}")] <= scale[("a", f"b{i + 1}")] for i in range(19)))

    def test_keeps_a_rivalry_across_borders_small_however_famous_its_clubs(self) -> None:
        views = {("a", f"b{i}"): (i + 1) * 100 for i in range(20)}
        countries = {"a": "es", **{f"b{i}": "es" for i in range(19)}, "b19": "it"}
        self.assertEqual(fetch_derbies.intensities_by_views(views, countries)[("a", "b19")], 2)
        self.assertEqual(fetch_derbies.intensities_by_views(views, countries)[("a", "b18")], 4)

    def test_ranks_each_country_on_its_own(self) -> None:
        views = {("a", f"b{i}"): (i + 1) * 100 for i in range(20)} | {("c", f"d{i}"): (i + 1) * 10_000 for i in range(20)}
        countries = {"a": "br", **{f"b{i}": "br" for i in range(20)}, "c": "en", **{f"d{i}": "en" for i in range(20)}}
        scale = fetch_derbies.intensities_by_views(views, countries)
        self.assertEqual((scale[("a", "b19")], scale[("a", "b0")]), (4, 1))
        self.assertEqual((scale[("c", "d19")], scale[("c", "d0")]), (4, 1))


class AttentionTest(unittest.TestCase):
    def test_counts_an_article_for_a_pair_only_when_it_is_that_derby_alone(self) -> None:
        derbies = {("a", "b"): "A–B rivalry", ("c", "d"): "West London derby", ("c", "e"): "West London derby", ("d", "e"): "West London derby"}
        self.assertEqual(fetch_derbies.attention_articles(derbies), {("a", "b"): "A–B rivalry"})


if __name__ == "__main__":
    unittest.main()
