"""Builds the data pack the game ships from the master database's latest CSV-import snapshot.

The pack is one gzipped JSON document with a column per field (`clubs.name[i]` is club i's name),
read by packages/data/src/dataPack.ts. `packVersion` is a hash of the content, so a career saved
with one pack never silently loads another.

Usage: python pipeline/build_pack.py pipeline/boleiro.db packages/data/pack [snapshot id]
"""
from __future__ import annotations

import gzip
import hashlib
import json
import sqlite3
import sys
from pathlib import Path

PACK_FORMAT = 1
PACK_FILE = "brazil.pack.json.gz"
CLUB_SOURCE_FIELDS = ("names", "state", "division", "stadium", "pitch", "colours", "fanbase")
FINANCE_FIELDS = {
    "season": "season", "revenueTotal": "revenue_total", "broadcasting": "broadcasting", "matchday": "matchday",
    "membership": "membership", "sponsorship": "sponsorship", "playerSales": "player_sales", "wageBill": "wage_bill",
    "netDebt": "net_debt", "basis": "basis", "guessedFields": "guessed_fields", "source": "source",
}


def columns(rows: list[sqlite3.Row], fields: dict[str, str]) -> dict[str, list[object]]:
    return {name: [row[column] for row in rows] for name, column in fields.items()}


def latest_snapshot(db: sqlite3.Connection) -> int:
    """The newest snapshot of the Brazil CSVs; world scrapes are snapshots too, packed by build_world_packs.py."""
    found = db.execute("SELECT max(id) FROM snapshots WHERE kind = 'csv-import'").fetchone()[0]
    if found is None:
        raise RuntimeError("the database has no snapshot; run import_csv.py first")
    return found


def build(db: sqlite3.Connection, snapshot: int) -> dict[str, object]:
    clubs = db.execute(
        """SELECT c.*, s.name AS stadium, s.capacity, s.pitch, x.external_id AS tm_id, l.code AS division
           FROM clubs c
           JOIN stadiums s ON s.snapshot_id = c.snapshot_id AND s.id = c.stadium_id
           LEFT JOIN external_ids x ON x.snapshot_id = c.snapshot_id AND x.entity = 'club' AND x.entity_id = c.id AND x.source = 'transfermarkt'
           LEFT JOIN competitions l ON l.snapshot_id = c.snapshot_id AND l.id = c.league_id
           WHERE c.snapshot_id = ? ORDER BY c.seq""",
        (snapshot,),
    ).fetchall()
    sources: dict[tuple[str, str], str] = {
        (row["entity_id"], row["field"]): row["source"]
        for row in db.execute("SELECT * FROM field_sources WHERE snapshot_id = ? AND entity = 'club'", (snapshot,))
    }
    club_index = {club["id"]: i for i, club in enumerate(clubs)}
    players = db.execute("SELECT * FROM players WHERE snapshot_id = ? ORDER BY seq", (snapshot,)).fetchall()
    finances = db.execute(
        """SELECT f.*, l.code AS division FROM finances f
           JOIN competitions l ON l.snapshot_id = f.snapshot_id AND l.id = f.league_id
           WHERE f.snapshot_id = ? ORDER BY f.seq""",
        (snapshot,),
    ).fetchall()
    club_finances = [row for row in finances if row["club_id"] is not None]
    estimates = [row for row in finances if row["club_id"] is None]
    money = db.execute(
        "SELECT body FROM competition_money WHERE snapshot_id = ? AND country_code = 'BR' ORDER BY season DESC LIMIT 1", (snapshot,)
    ).fetchone()
    if money is None:
        raise RuntimeError(f"snapshot {snapshot} has no Brazilian prize money")

    return {
        "clubs": {
            **columns(clubs, {
                "id": "id", "transfermarktId": "tm_id", "name": "name", "shortName": "short_name", "state": "region",
                "division": "division", "stadium": "stadium", "capacity": "capacity", "pitch": "pitch",
                "primaryColour": "primary_colour", "secondaryColour": "secondary_colour", "fanbase": "fanbase",
            }),
            "sources": {field: [sources[(club["id"], field)] for club in clubs] for field in CLUB_SOURCE_FIELDS},
        },
        "players": {
            "club": [club_index[player["club_id"]] for player in players],
            **columns(players, {"name": "name", "group": "position_group", "strength": "strength", "age": "age", "nationalities": "nationalities"}),
        },
        "finances": {
            "clubs": {"club": [club_index[row["club_id"]] for row in club_finances], "division": [row["division"] for row in club_finances], **columns(club_finances, FINANCE_FIELDS)},
            "divisionEstimates": {**columns(estimates, {"division": "division", "size": "size"}), **columns(estimates, FINANCE_FIELDS)},
        },
        "competitionMoney": json.loads(money["body"]),
    }


def pack_json(content: dict[str, object]) -> str:
    body = json.dumps(content, ensure_ascii=False, separators=(",", ":"))
    version = "br-" + hashlib.sha256(body.encode()).hexdigest()[:12]
    return json.dumps({"format": PACK_FORMAT, "packVersion": version, **content}, ensure_ascii=False, separators=(",", ":"))


def main() -> None:
    db_path, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
    with sqlite3.connect(db_path) as db:
        db.row_factory = sqlite3.Row
        snapshot = int(sys.argv[3]) if len(sys.argv) > 3 else latest_snapshot(db)
        text = pack_json(build(db, snapshot))
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / PACK_FILE
    out.write_bytes(gzip.compress(text.encode(), compresslevel=9, mtime=0))
    print(f"snapshot {snapshot} -> {out}: {len(text)} bytes of JSON, {out.stat().st_size} gzipped")


if __name__ == "__main__":
    main()
