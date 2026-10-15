"""Prints who moved where between two snapshots of the master database, as Markdown for a PR body.

Players and clubs keep their ids across snapshots, so the diff is a join on the player id. A club
missing from the newer snapshot (its page failed, or it left the world) or new in it (promoted, or
its page failed last time) is listed on its own instead of every one of its players showing up as
gone or arrived.

Usage: python pipeline/roster_diff.py pipeline/boleiro.db [old snapshot id] [new snapshot id]
       (the two latest full `transfermarkt` snapshots when the ids are left out; partial runs are skipped)
"""
from __future__ import annotations

import sqlite3
import sys
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Changes:
    moves: list[tuple[str, str, str]]          # player, from club, to club
    arrivals: list[tuple[str, str]]            # player new to the world, club
    departures: list[tuple[str, str]]          # player gone from the world, last club
    missing_clubs: list[str]                   # clubs of the old snapshot the new one doesn't have
    new_clubs: list[str]                       # clubs of the new snapshot the old one didn't have


def latest_pair(db: sqlite3.Connection) -> tuple[int, int]:
    ids = [row[0] for row in db.execute("SELECT id FROM snapshots WHERE kind = 'transfermarkt' ORDER BY id DESC LIMIT 2")]
    if len(ids) < 2:
        raise RuntimeError("the database needs two transfermarkt snapshots; run scrape_world.py twice")
    return ids[1], ids[0]


def rosters(db: sqlite3.Connection, snapshot: int) -> tuple[dict[str, tuple[str, str]], dict[str, str]]:
    """Player id -> (name, club id), and club id -> club name."""
    clubs = dict(db.execute("SELECT id, name FROM clubs WHERE snapshot_id = ? ORDER BY seq", (snapshot,)).fetchall())
    players = {row[0]: (row[1], row[2]) for row in db.execute("SELECT id, name, club_id FROM players WHERE snapshot_id = ? ORDER BY seq", (snapshot,))}
    return players, clubs


def roster_changes(db: sqlite3.Connection, old: int, new: int) -> Changes:
    old_players, old_clubs = rosters(db, old)
    new_players, new_clubs = rosters(db, new)
    club_name = {**old_clubs, **new_clubs}
    moves = [
        (name, club_name[old_players[player][1]], club_name[club])
        for player, (name, club) in new_players.items()
        if player in old_players and old_players[player][1] != club
    ]
    arrivals = [
        (name, club_name[club]) for player, (name, club) in new_players.items()
        if player not in old_players and club in old_clubs
    ]
    departures = [
        (name, club_name[club]) for player, (name, club) in old_players.items()
        if player not in new_players and club in new_clubs
    ]
    missing = [name for club, name in old_clubs.items() if club not in new_clubs]
    added = [name for club, name in new_clubs.items() if club not in old_clubs]
    return Changes(moves, arrivals, departures, missing, added)


def markdown(changes: Changes) -> str:
    lines = [f"{len(changes.moves)} moved, {len(changes.arrivals)} arrived, {len(changes.departures)} left"]
    sections = (
        ("Moved", [f"- {name}: {old} → {new}" for name, old, new in changes.moves]),
        ("New to the world", [f"- {name} → {club}" for name, club in changes.arrivals]),
        ("Left the world", [f"- {name} left {club}" for name, club in changes.departures]),
        ("Clubs missing from the new snapshot", [f"- {club}" for club in changes.missing_clubs]),
        ("Clubs new in this snapshot", [f"- {club}" for club in changes.new_clubs]),
    )
    for title, items in sections:
        if items:
            lines += ["", f"## {title}", *items]
    return "\n".join(lines)


def main() -> None:
    db_path = Path(sys.argv[1])
    with sqlite3.connect(db_path) as db:
        old, new = (int(sys.argv[2]), int(sys.argv[3])) if len(sys.argv) > 3 else latest_pair(db)
        print(f"# Squads: snapshot {old} → {new}\n")
        print(markdown(roster_changes(db, old, new)))


if __name__ == "__main__":
    main()
