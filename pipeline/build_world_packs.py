"""Builds a data pack per country, plus one for the national teams, from a world-scrape snapshot.

Same layout as brazil.pack.json.gz (build_pack.py): gzipped JSON with a column per field, a
`packVersion` hashed from the content, and gzip's time zeroed, so the same snapshot always gives
the same bytes. Files are `<country id>.pack.json.gz` ("gb-eng.pack.json.gz") and
`national-teams.pack.json.gz`. Players carry no strength yet: the rating step comes later. A full
world scrape removes the pack of every country it doesn't have, so a country that left the world
loses its pack (one whose pages all failed keeps its old one); a partial scrape (`transfermarkt-partial`, from `scrape_world.py --countries`) only
writes the countries whose leagues it scraped.

Usage: python pipeline/build_world_packs.py pipeline/boleiro.db <out dir> [snapshot id]
       (the latest full `transfermarkt` snapshot when the id is left out)
"""
from __future__ import annotations

import gzip
import hashlib
import json
import sqlite3
import sys
from pathlib import Path

PACK_FORMAT = 1
NATIONAL_TEAMS = "national-teams"
CLUB_SOURCE_FIELDS = ("names", "short_name", "division", "stadium", "pitch", "colours", "fanbase")


def columns(rows: list[sqlite3.Row], fields: dict[str, str]) -> dict[str, list[object]]:
    return {name: [row[column] for row in rows] for name, column in fields.items()}


def latest_world_snapshot(db: sqlite3.Connection) -> int:
    found = db.execute("SELECT max(id) FROM snapshots WHERE kind = 'transfermarkt'").fetchone()[0]
    if found is None:
        raise RuntimeError("the database has no world scrape; run scrape_world.py first")
    return found


def country_pack(db: sqlite3.Connection, snapshot: int, code: str, name: str) -> dict[str, object]:
    competitions = db.execute(
        "SELECT * FROM competitions WHERE snapshot_id = ? AND country_code = ? ORDER BY kind DESC, tier, id", (snapshot, code)
    ).fetchall()
    clubs = db.execute(
        """SELECT c.*, s.name AS stadium, s.capacity, x.external_id AS tm_id, i.source AS crest
           FROM clubs c
           JOIN stadiums s ON s.snapshot_id = c.snapshot_id AND s.id = c.stadium_id
           LEFT JOIN external_ids x ON x.snapshot_id = c.snapshot_id AND x.entity = 'club' AND x.entity_id = c.id AND x.source = 'transfermarkt'
           LEFT JOIN images i ON i.snapshot_id = c.snapshot_id AND i.entity = 'club' AND i.entity_id = c.id AND i.kind = 'crest'
           WHERE c.snapshot_id = ? AND c.country_code = ? ORDER BY c.seq""",
        (snapshot, code),
    ).fetchall()
    club_index = {club["id"]: i for i, club in enumerate(clubs)}
    players = [
        player for player in db.execute("SELECT * FROM players WHERE snapshot_id = ? ORDER BY seq", (snapshot,))
        if player["club_id"] in club_index
    ]
    sources = {
        (row["entity_id"], row["field"]): row["source"]
        for row in db.execute("SELECT * FROM field_sources WHERE snapshot_id = ? AND entity = 'club'", (snapshot,))
    }
    return {
        "country": {"id": code.lower(), "name": name},
        "competitions": columns(competitions, {"id": "id", "name": "name", "kind": "kind", "tier": "tier", "code": "code", "season": "season"}),
        "clubs": {
            **columns(clubs, {
                "id": "id", "transfermarktId": "tm_id", "name": "name", "shortName": "short_name", "league": "league_id",
                "stadium": "stadium", "capacity": "capacity", "primaryColour": "primary_colour",
                "secondaryColour": "secondary_colour", "crestSource": "crest",
            }),
            "sources": {field: [sources.get((club["id"], field)) for club in clubs] for field in CLUB_SOURCE_FIELDS},
        },
        "players": {
            "club": [club_index[player["club_id"]] for player in players],
            **columns(players, {
                "id": "id", "name": "name", "role": "role", "group": "position_group", "birthDate": "birth_date", "age": "age",
                "nationalities": "nationalities", "foot": "foot", "marketValueEur": "market_value_eur", "contractUntil": "contract_until",
            }),
        },
    }


def national_teams_pack(db: sqlite3.Connection, snapshot: int) -> dict[str, object]:
    teams = db.execute("SELECT * FROM national_teams WHERE snapshot_id = ? ORDER BY seq", (snapshot,)).fetchall()
    team_index = {team["id"]: i for i, team in enumerate(teams)}
    players = db.execute(
        "SELECT p.* FROM national_team_players p JOIN national_teams t ON t.snapshot_id = p.snapshot_id AND t.id = p.team_id "
        "WHERE p.snapshot_id = ? ORDER BY t.seq, p.seq",
        (snapshot,),
    ).fetchall()
    return {
        "teams": columns(teams, {"id": "id", "name": "name", "confederation": "confederation"}),
        "players": {
            "team": [team_index[player["team_id"]] for player in players],
            **columns(players, {
                "id": "player_id", "name": "name", "role": "role", "birthDate": "birth_date",
                "clubTransfermarktId": "club_tm_id", "clubName": "club_name", "marketValueEur": "market_value_eur",
                "caps": "caps", "goals": "goals",
            }),
        },
    }


def is_full_world(db: sqlite3.Connection, snapshot: int) -> bool:
    return db.execute("SELECT kind FROM snapshots WHERE id = ?", (snapshot,)).fetchone()[0] == "transfermarkt"


def packs(db: sqlite3.Connection, snapshot: int) -> dict[str, dict[str, object]]:
    """Pack name -> content, for every country with a club in the snapshot; in a partial one, only the countries
    whose leagues it scraped, not those it only has a Club World Cup guest of."""
    with_clubs = "SELECT country_code FROM clubs WHERE snapshot_id = ?"
    if not is_full_world(db, snapshot):
        with_clubs = "SELECT country_code FROM competitions WHERE snapshot_id = ? AND kind = 'league'"
    countries = db.execute(
        f"SELECT code, name FROM countries WHERE snapshot_id = ? AND code IN ({with_clubs}) ORDER BY code",
        (snapshot, snapshot),
    ).fetchall()
    found = {row["code"].lower(): country_pack(db, snapshot, row["code"], row["name"]) for row in countries}
    if db.execute("SELECT 1 FROM national_teams WHERE snapshot_id = ?", (snapshot,)).fetchone():
        found[NATIONAL_TEAMS] = national_teams_pack(db, snapshot)
    return found


def pack_bytes(name: str, content: dict[str, object]) -> bytes:
    body = json.dumps(content, ensure_ascii=False, separators=(",", ":"))
    version = f"{name}-{hashlib.sha256(body.encode()).hexdigest()[:12]}"
    text = json.dumps({"format": PACK_FORMAT, "packVersion": version, **content}, ensure_ascii=False, separators=(",", ":"))
    return gzip.compress(text.encode(), compresslevel=9, mtime=0)


def write(db: sqlite3.Connection, snapshot: int, out: Path) -> dict[str, Path]:
    out.mkdir(parents=True, exist_ok=True)
    written = {}
    for name, content in packs(db, snapshot).items():
        path = out / f"{name}.pack.json.gz"
        path.write_bytes(pack_bytes(name, content))
        written[name] = path
    if is_full_world(db, snapshot):
        kept = {f"{code.lower()}.pack.json.gz" for (code,) in db.execute("SELECT code FROM countries WHERE snapshot_id = ?", (snapshot,))}
        kept.add(f"{NATIONAL_TEAMS}.pack.json.gz")
        for stale in out.glob("*.pack.json.gz"):
            if stale.name not in kept:
                stale.unlink()
    return written


def main() -> None:
    db_path, out = Path(sys.argv[1]), Path(sys.argv[2])
    with sqlite3.connect(db_path) as db:
        db.row_factory = sqlite3.Row
        snapshot = int(sys.argv[3]) if len(sys.argv) > 3 else latest_world_snapshot(db)
        written = write(db, snapshot, out)
    total = sum(path.stat().st_size for path in written.values())
    print(f"snapshot {snapshot} -> {len(written)} packs in {out}, {total} bytes gzipped")


if __name__ == "__main__":
    main()
