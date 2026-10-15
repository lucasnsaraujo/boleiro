"""Loads the repo's data files into the master database as a new snapshot.

Reads the files the game is built from (clubs, players, finances, prize money, crests) plus
Transfermarkt's squad file for ids, foot, contract and value, and FotMob's files
(scrape_fotmob.py) for the players' other positions and the clubs' last elevens. The raw scrape outputs that
build_clubs.py and rate_players.py already folded into those (club facts, wiki colours,
Sofascore stats) are left out.

Usage: python pipeline/import_csv.py data pipeline/boleiro.db
"""
from __future__ import annotations

import csv
import hashlib
import json
import re
import sqlite3
import struct
import sys
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from positions import role_of

SCHEMA = Path(__file__).resolve().parent / "schema.sql"
# crests.csv paths, and so `images.path`, are relative to the repo root.
ROOT = Path(__file__).resolve().parent.parent
COUNTRY = "BR"
CURRENCY = "BRL"
SEASON = 2026
# guess: the Sofascore file holds the last finished season before the 2026 squads.
STATS_SEASON = 2025
LEAGUES = {
    "A": ("br-serie-a", "Brasileirão Série A", 1),
    "B": ("br-serie-b", "Brasileirão Série B", 2),
    "C": ("br-serie-c", "Brasileirão Série C", 3),
    "D": ("br-serie-d", "Brasileirão Série D", 4),
}
CLUB_SOURCE_FIELDS = ("names", "state", "division", "stadium", "pitch", "colours", "fanbase")
TM_DATE = re.compile(r"^(\d{2})/(\d{2})/(\d{4})$")


def slugify(text: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", ascii_text).strip("-")


def sha256_of(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def png_size(path: Path) -> tuple[int, int]:
    header = path.read_bytes()[:24]
    if header[:8] != b"\x89PNG\r\n\x1a\n":
        raise RuntimeError(f"{path} is not a PNG")
    width, height = struct.unpack(">II", header[16:24])
    return width, height


def iso_date(tm_date: str) -> str | None:
    match = TM_DATE.match(tm_date)
    return f"{match.group(3)}-{match.group(2)}-{match.group(1)}" if match else None


def whole(value: str) -> int | None:
    return int(float(value)) if value else None


def player_key(row: dict[str, str], club_id: str) -> tuple[str, ...]:
    return (club_id, row["name"], row["position"], row["age"], row["nationality"], row["market_value_eur"])


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def stadium_ids(clubs: list[dict[str, str]]) -> dict[str, str]:
    """Club id -> stadium id; clubs sharing a ground with the same capacity and pitch share the row."""
    ids: dict[tuple[str, str, str, str], str] = {}
    taken: dict[str, int] = defaultdict(int)
    by_club = {}
    for club in clubs:
        key = (club["stadium"], club["state"], club["capacity"], club["pitch"])
        if key not in ids:
            base = f"{slugify(club['stadium'])}-{club['state'].lower()}"
            taken[base] += 1
            ids[key] = base if taken[base] == 1 else f"{base}-{taken[base]}"
        by_club[club["id"]] = ids[key]
    return by_club


def import_fotmob(db: sqlite3.Connection, snapshot: int, players: list[dict[str, str]], lineups: list[dict[str, str]]) -> None:
    """FotMob's positions for the snapshot's players (ranked after Transfermarkt's main one) and each club's last eleven.
    Rows of players FotMob couldn't match to Transfermarkt, or that aren't in the snapshot, are left out."""
    in_snapshot = {row[0] for row in db.execute("SELECT id FROM players WHERE snapshot_id = ?", (snapshot,))}
    for row in players:
        player_id = f"tm-{row['tm_id']}"
        if not row["tm_id"] or player_id not in in_snapshot:
            continue
        db.execute("INSERT OR IGNORE INTO external_ids VALUES (?, 'player', ?, 'fotmob', ?)", (snapshot, player_id, row["fotmob_id"]))
        for rank, code in enumerate(row["positions"].split(","), start=1):
            db.execute("INSERT OR IGNORE INTO player_positions VALUES (?, ?, ?, ?, 'fotmob')", (snapshot, player_id, rank, code))
    for row in lineups:
        player_id = f"tm-{row['tm_id']}" if row["tm_id"] and f"tm-{row['tm_id']}" in in_snapshot else None
        db.execute("INSERT OR IGNORE INTO external_ids VALUES (?, 'club', ?, 'fotmob', ?)", (snapshot, row["club_id"], row["fotmob_team_id"]))
        db.execute(
            "INSERT INTO club_lineups VALUES (?, ?, ?, ?, ?, ?, 'fotmob')",
            (snapshot, row["club_id"], int(row["slot"]), row["formation"], player_id, row["fotmob_position_id"]),
        )


def import_snapshot(data: Path, db: sqlite3.Connection) -> int:
    files = ["clubs.csv", "players.csv", "transfermarkt-players.csv", "finances.csv", "competition-money.json", "crests.csv",
             "fotmob-players.csv", "fotmob-lineups.csv"]
    clubs = read_csv(data / "clubs.csv")
    players = read_csv(data / "players.csv")
    tm_players = read_csv(data / "transfermarkt-players.csv")
    fotmob_players = read_csv(data / "fotmob-players.csv")
    fotmob_lineups = read_csv(data / "fotmob-lineups.csv")
    finances = read_csv(data / "finances.csv")
    crests = read_csv(data / "crests.csv")
    money = json.loads((data / "competition-money.json").read_text(encoding="utf-8"))

    taken_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    snapshot = db.execute(
        "INSERT INTO snapshots (taken_at, kind, note) VALUES (?, 'csv-import', ?)", (taken_at, f"files in {data.name}/")
    ).lastrowid
    for name in files:
        db.execute("INSERT INTO snapshot_files VALUES (?, ?, ?)", (snapshot, f"{data.name}/{name}", sha256_of(data / name)))

    db.execute("INSERT INTO countries VALUES (?, ?, 'Brasil')", (snapshot, COUNTRY))
    for code, (league_id, name, tier) in LEAGUES.items():
        db.execute(
            "INSERT INTO competitions VALUES (?, ?, ?, ?, 'league', ?, ?, ?)", (snapshot, league_id, COUNTRY, name, tier, code, SEASON)
        )

    stadiums = stadium_ids(clubs)
    for seq, club in enumerate(clubs):
        stadium = stadiums[club["id"]]
        db.execute(
            "INSERT OR IGNORE INTO stadiums VALUES (?, ?, ?, ?, ?, ?, ?)",
            (snapshot, stadium, club["stadium"], COUNTRY, club["state"], int(club["capacity"]), club["pitch"]),
        )
        league = LEAGUES[club["division"]][0] if club["division"] else None
        db.execute(
            "INSERT INTO clubs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (snapshot, club["id"], seq, COUNTRY, club["state"], club["name"], club["short_name"], league, stadium,
             club["primary_colour"], club["secondary_colour"], int(club["fanbase"])),
        )
        db.execute("INSERT INTO external_ids VALUES (?, 'club', ?, 'transfermarkt', ?)", (snapshot, club["id"], club["tm_id"]))
        for field in CLUB_SOURCE_FIELDS:
            db.execute("INSERT INTO field_sources VALUES (?, 'club', ?, ?, ?)", (snapshot, club["id"], field, club[f"{field}_source"]))

    for row in crests:
        for kind, column in (("crest", "crest"), ("scoreboard_crest", "scoreboard_crest")):
            if not row[column]:
                continue
            path = ROOT / row[column]
            width, height = png_size(path)
            db.execute(
                "INSERT INTO images VALUES (?, 'club', ?, ?, ?, ?, ?, ?, ?)",
                (snapshot, row["club_id"], kind, row[column], sha256_of(path), width, height, row[f"{column}_source"]),
            )

    club_by_tm = {club["tm_id"]: club["id"] for club in clubs}
    tm_by_key: dict[tuple[str, ...], list[dict[str, str]]] = defaultdict(list)
    for row in tm_players:
        tm_by_key[player_key(row, club_by_tm[row["club_tm_id"]])].append(row)
    for seq, player in enumerate(players):
        candidates = tm_by_key[player_key(player, player["club_id"])]
        if not candidates:
            raise RuntimeError(f"players.csv row {seq + 2}: no Transfermarkt row for {player['name']} ({player['club_id']})")
        tm = candidates.pop(0)
        player_id = f"tm-{tm['tm_id']}"
        db.execute(
            "INSERT INTO players VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (snapshot, player_id, seq, player["club_id"], player["name"], whole(player["age"]), player["nationality"],
             tm["foot"] or None, player["group"], int(player["strength"]), float(player["confidence"]),
             whole(tm["market_value_eur"]), iso_date(tm["contract_until"]), role_of(player["position"])),
        )
        db.execute("INSERT INTO external_ids VALUES (?, 'player', ?, 'transfermarkt', ?)", (snapshot, player_id, tm["tm_id"]))
        db.execute("INSERT INTO player_positions VALUES (?, ?, 0, ?, 'transfermarkt')", (snapshot, player_id, player["position"]))
        if player["matched"] == "True":
            db.execute(
                "INSERT INTO player_season_stats VALUES (?, ?, 'sofascore', ?, ?, ?, ?)",
                (snapshot, player_id, STATS_SEASON, int(player["sofa_minutes"]),
                 float(player["sofa_rating"]) if player["sofa_rating"] else None, int(player["sofa_goals_assists"])),
            )

    import_fotmob(db, snapshot, fotmob_players, fotmob_lineups)

    for seq, row in enumerate(finances):
        db.execute(
            "INSERT INTO finances VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (snapshot, seq, row["club_id"] or None, LEAGUES[row["division"]][0], row["size"] or None, int(row["season"]), CURRENCY,
             int(row["revenue_total"]), int(row["broadcasting"]), int(row["matchday"]), int(row["membership"]),
             int(row["sponsorship"]), int(row["player_sales"]), int(row["wage_bill"]), int(row["net_debt"]),
             row["basis"], row["guessed_fields"], row["source"]),
        )

    db.execute("INSERT INTO competition_money VALUES (?, ?, ?, ?)", (snapshot, COUNTRY, money["season"], json.dumps(money, ensure_ascii=False)))
    return snapshot


def main() -> None:
    data, db_path = Path(sys.argv[1]), Path(sys.argv[2])
    with sqlite3.connect(db_path) as db:
        db.executescript(SCHEMA.read_text())
        snapshot = import_snapshot(data, db)
        players = db.execute("SELECT count(*) FROM players WHERE snapshot_id = ?", (snapshot,)).fetchone()[0]
    print(f"snapshot {snapshot}: {players} players written to {db_path}")


if __name__ == "__main__":
    main()
