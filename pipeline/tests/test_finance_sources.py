from __future__ import annotations

import sqlite3
import unittest

from import_csv import ROOT, SCHEMA, finance_source_problems, import_finances, read_csv

FIELDS = ("revenue_total", "broadcasting", "matchday", "membership", "sponsorship", "player_sales", "wage_bill", "net_debt")


def finance_row(**overrides: str) -> dict[str, str]:
    row = {
        "club_id": "flamengo-rj", "division": "A", "size": "", "season": "2025", "revenue_total": "100", "broadcasting": "40",
        "matchday": "20", "membership": "10", "sponsorship": "20", "player_sales": "5", "wage_bill": "60", "net_debt": "-3",
        "basis": "published", "guessed_fields": "membership", "source": "Flamengo 2025 accounts",
    }
    return {**row, **overrides}


def sources_for(row: dict[str, str]) -> list[dict[str, str]]:
    guessed = set(row["guessed_fields"].split(";"))
    return [
        {"club_id": row["club_id"], "field": field, "value": row[field], "document": "Demonstrações financeiras 2025",
         "url": "https://example.org/df-2025.pdf", "page": "12", "published": "2026-03-30", "note": ""}
        for field in FIELDS if field not in guessed
    ]


class FinanceSourceProblemsTest(unittest.TestCase):
    def test_accepts_a_published_row_with_a_source_for_every_field_it_does_not_guess(self) -> None:
        row = finance_row()
        self.assertEqual(finance_source_problems([row], sources_for(row)), [])

    def test_flags_a_published_figure_without_a_source(self) -> None:
        row = finance_row()
        sources = [s for s in sources_for(row) if s["field"] != "net_debt"]
        self.assertEqual(finance_source_problems([row], sources), ["flamengo-rj net_debt: no source"])

    def test_flags_a_source_whose_value_differs_from_the_finances_row(self) -> None:
        row = finance_row()
        sources = [{**s, "value": "-4"} if s["field"] == "net_debt" else s for s in sources_for(row)]
        self.assertEqual(finance_source_problems([row], sources), ["flamengo-rj net_debt: source says -4, finances.csv -3"])

    def test_flags_a_source_for_a_guessed_field(self) -> None:
        row = finance_row()
        extra = {**sources_for(row)[0], "field": "membership", "value": "10"}
        self.assertEqual(finance_source_problems([row], [*sources_for(row), extra]), ["flamengo-rj membership: sourced but listed as guessed"])

    def test_flags_a_source_without_a_web_address_or_page(self) -> None:
        row = finance_row()
        sources = [{**s, "url": "", "page": ""} if s["field"] == "wage_bill" else s for s in sources_for(row)]
        self.assertEqual(finance_source_problems([row], sources), ["flamengo-rj wage_bill: no url", "flamengo-rj wage_bill: no page"])

    def test_flags_a_source_for_a_club_without_a_finances_row(self) -> None:
        row = finance_row()
        stray = {**sources_for(row)[0], "club_id": "santos-sp"}
        self.assertEqual(finance_source_problems([row], [*sources_for(row), stray]), ["santos-sp revenue_total: no finances.csv row"])

    def test_needs_no_source_for_a_guess_or_a_division_estimate(self) -> None:
        guess = finance_row(club_id="chapecoense-sc", basis="guess", guessed_fields=";".join(FIELDS))
        estimate = finance_row(club_id="", division="B", size="median", basis="estimate", guessed_fields="")
        self.assertEqual(finance_source_problems([guess, estimate], []), [])

    def test_flags_a_published_row_that_guesses_every_field(self) -> None:
        row = finance_row(guessed_fields=";".join(FIELDS))
        self.assertEqual(finance_source_problems([row], []), ["flamengo-rj: published but every field is guessed"])

    def test_the_committed_data_has_a_source_for_every_figure(self) -> None:
        data = ROOT / "data"
        self.assertEqual(finance_source_problems(read_csv(data / "finances.csv"), read_csv(data / "finance-sources.csv")), [])


class ImportFinancesTest(unittest.TestCase):
    def test_stores_each_figure_with_its_document_page_and_date(self) -> None:
        db = sqlite3.connect(":memory:")
        db.executescript(SCHEMA.read_text())
        db.execute("INSERT INTO snapshots (taken_at, kind) VALUES ('2026-10-17T00:00:00+00:00', 'csv-import')")
        db.execute("INSERT INTO competitions VALUES (1, 'br-serie-a', 'BR', 'Série A', 'league', 1, 'A', 2026)")
        row = finance_row()
        import_finances(db, 1, [row], sources_for(row))
        stored = db.execute("SELECT club_id, field, value, url, page, published FROM finance_sources WHERE field = 'net_debt'").fetchall()
        self.assertEqual(stored, [("flamengo-rj", "net_debt", -3, "https://example.org/df-2025.pdf", "12", "2026-03-30")])
        self.assertEqual(db.execute("SELECT net_debt FROM finances").fetchall(), [(-3,)])

    def test_refuses_figures_without_sources(self) -> None:
        db = sqlite3.connect(":memory:")
        db.executescript(SCHEMA.read_text())
        db.execute("INSERT INTO snapshots (taken_at, kind) VALUES ('2026-10-17T00:00:00+00:00', 'csv-import')")
        with self.assertRaisesRegex(RuntimeError, "flamengo-rj net_debt: no source"):
            import_finances(db, 1, [finance_row()], [s for s in sources_for(finance_row()) if s["field"] != "net_debt"])


if __name__ == "__main__":
    unittest.main()
