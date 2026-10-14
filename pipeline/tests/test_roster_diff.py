from __future__ import annotations

import sqlite3
import unittest

import roster_diff
from import_csv import SCHEMA


def snapshot(db: sqlite3.Connection, kind: str, clubs: dict[str, list[str]]) -> int:
    """A snapshot whose clubs (by name) hold the named players; a player's id is his name."""
    snapshot_id = db.execute("INSERT INTO snapshots (taken_at, kind) VALUES ('2026-10-14T00:00:00+00:00', ?)", (kind,)).lastrowid
    for seq, (club, players) in enumerate(clubs.items()):
        db.execute("INSERT INTO clubs VALUES (?, ?, ?, 'GB-ENG', NULL, ?, ?, NULL, 'ground', '#FFFFFF', '#000000', 0)",
                   (snapshot_id, club.lower(), seq, club, club))
        for player in players:
            db.execute("INSERT INTO players (snapshot_id, id, seq, club_id, name, nationalities, position_group) VALUES (?, ?, 0, ?, ?, '', 'MID')",
                       (snapshot_id, player.lower(), club.lower(), player))
    return snapshot_id


class RosterDiffTest(unittest.TestCase):
    def setUp(self) -> None:
        self.db = sqlite3.connect(":memory:")
        self.db.executescript(SCHEMA.read_text())

    def test_lists_moves_arrivals_and_departures_between_two_snapshots(self) -> None:
        old = snapshot(self.db, "transfermarkt", {"Arsenal": ["Saka", "Odegaard"], "Liverpool": ["Salah", "Alisson"]})
        new = snapshot(self.db, "transfermarkt", {"Arsenal": ["Saka", "Salah"], "Liverpool": ["Alisson", "Wirtz"]})
        changes = roster_diff.roster_changes(self.db, old, new)
        self.assertEqual(changes.moves, [("Salah", "Liverpool", "Arsenal")])
        self.assertEqual(changes.arrivals, [("Wirtz", "Liverpool")])
        self.assertEqual(changes.departures, [("Odegaard", "Arsenal")])
        self.assertEqual(changes.missing_clubs, [])
        self.assertEqual(changes.new_clubs, [])

    def test_does_not_call_a_whole_squad_gone_when_its_club_failed_to_scrape(self) -> None:
        old = snapshot(self.db, "transfermarkt", {"Arsenal": ["Saka"], "Liverpool": ["Salah"]})
        new = snapshot(self.db, "transfermarkt", {"Arsenal": ["Saka"]})
        changes = roster_diff.roster_changes(self.db, old, new)
        self.assertEqual(changes.departures, [])
        self.assertEqual(changes.missing_clubs, ["Liverpool"])

    def test_lists_a_club_new_to_the_world_once_instead_of_each_of_its_players_as_an_arrival(self) -> None:
        old = snapshot(self.db, "transfermarkt", {"Arsenal": ["Saka"]})
        new = snapshot(self.db, "transfermarkt", {"Arsenal": ["Saka"], "Sunderland": ["Xhaka", "Isidor"]})
        changes = roster_diff.roster_changes(self.db, old, new)
        self.assertEqual(changes.arrivals, [])
        self.assertEqual(changes.new_clubs, ["Sunderland"])
        self.assertIn("## Clubs new in this snapshot\n- Sunderland", roster_diff.markdown(changes))

    def test_compares_the_two_latest_world_scrapes_by_default(self) -> None:
        snapshot(self.db, "transfermarkt", {})
        second = snapshot(self.db, "transfermarkt", {})
        snapshot(self.db, "csv-import", {})
        third = snapshot(self.db, "transfermarkt", {})
        self.assertEqual(roster_diff.latest_pair(self.db), (second, third))

    def test_prints_the_changes_as_a_markdown_summary(self) -> None:
        old = snapshot(self.db, "transfermarkt", {"Arsenal": ["Odegaard"], "Liverpool": ["Salah"]})
        new = snapshot(self.db, "transfermarkt", {"Arsenal": ["Salah"], "Liverpool": ["Wirtz"]})
        text = roster_diff.markdown(roster_diff.roster_changes(self.db, old, new))
        self.assertIn("- Salah: Liverpool → Arsenal", text)
        self.assertIn("- Wirtz → Liverpool", text)
        self.assertIn("- Odegaard left Arsenal", text)
        self.assertIn("1 moved, 1 arrived, 1 left", text)


if __name__ == "__main__":
    unittest.main()
