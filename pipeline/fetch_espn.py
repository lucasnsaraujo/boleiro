"""Rebuild data/history/espn/ from ESPN's public API: Copa do Brasil, Série B and Série C results
and the division (A–C) every team played each season.

ESPN answers plain HTTP (gzip), one scoreboard call per league and calendar year. It has no Série D
and no Série C before 2017. Raw answers are cached in data/history_cache/espn/; delete a file to
refetch it.

Usage: fetch_espn.py [--first 2015] [--last 2026]
"""
from __future__ import annotations

import argparse
import csv
import gzip
import json
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from team_key import team_key

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "history" / "espn"
CACHE = ROOT / "data" / "history_cache" / "espn"
SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/soccer/{league}/scoreboard?dates={year}&limit=1000"
STANDINGS = "https://site.api.espn.com/apis/v2/sports/soccer/{league}/standings?season={year}"
RESULT_LEAGUES = {"copa-do-brasil.csv": "bra.copa_do_brazil", "brasileirao-serie-b.csv": "bra.2", "brasileirao-serie-c.csv": "bra.3"}
DIVISION_LEAGUES = {"A": "bra.1", "B": "bra.2", "C": "bra.3"}
RESULT_COLUMNS = ["season", "date", "round", "event_id", "home_id", "home", "home_key", "away_id", "away", "away_key",
                  "home_goals", "away_goals", "penalty_winner", "odds_home", "odds_draw", "odds_away"]
BRAZIL = ZoneInfo("America/Sao_Paulo")


def get_json(url: str, name: str) -> dict:
    path = CACHE / f"{name}.json"
    if path.exists():
        return json.loads(path.read_text())
    request = urllib.request.Request(url, headers={"Accept-Encoding": "gzip", "User-Agent": "boleiro-pipeline"})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            body = response.read()
            if response.headers.get("Content-Encoding") == "gzip":
                body = gzip.decompress(body)
    except urllib.error.HTTPError as error:
        if error.code != 404:
            raise
        body = b"{}"
    time.sleep(0.3)
    path.write_text(body.decode())
    return json.loads(body)


def result_row(event: dict, is_cup: bool) -> dict | None:
    competition = event["competitions"][0]
    if not competition["status"]["type"]["completed"]:
        return None
    sides = {c["homeAway"]: c for c in competition["competitors"]}
    home, away = sides["home"], sides["away"]
    shootout = "shootoutScore" in home and "shootoutScore" in away
    return {
        "season": event["season"]["year"],
        "date": datetime.fromisoformat(event["date"].replace("Z", "+00:00")).astimezone(BRAZIL).strftime("%Y-%m-%d"),
        # For the cup ESPN's season slug is the stage ("round-of-16"); for leagues it names the season, so the round stays empty.
        "round": event["season"].get("slug", "") if is_cup else "",
        "event_id": event["id"],
        "home_id": home["team"]["id"], "home": home["team"]["displayName"], "home_key": team_key(home["team"]["displayName"]),
        "away_id": away["team"]["id"], "away": away["team"]["displayName"], "away_key": team_key(away["team"]["displayName"]),
        "home_goals": int(home["score"]), "away_goals": int(away["score"]),
        "penalty_winner": ("home" if home["shootoutScore"] > away["shootoutScore"] else "away") if shootout else "",
        "odds_home": "", "odds_draw": "", "odds_away": "",
    }


def write_csv(path: Path, columns: list[str], rows: list[dict]) -> None:
    with path.open("w", newline="") as f:
        writer = csv.DictWriter(f, columns, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--first", type=int, default=2015)
    parser.add_argument("--last", type=int, default=2026)
    args = parser.parse_args()
    CACHE.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    seasons = range(args.first, args.last + 1)

    # Série C standings from 2020 on list only the second-phase groups, so league membership also
    # counts every team that played a match in that league.
    played: dict[tuple[int, str], dict[str, str]] = {}
    for filename, league in RESULT_LEAGUES.items():
        rows: dict[str, dict] = {}
        # A season can spill into the next calendar year (Série B 2020 ended in January 2021).
        for year in range(args.first, args.last + 2):
            for event in get_json(SCOREBOARD.format(league=league, year=year), f"scoreboard-{league}-{year}").get("events", []):
                row = result_row(event, league == "bra.copa_do_brazil")
                if row and row["season"] in seasons:
                    rows[row["event_id"]] = row
        ordered = sorted(rows.values(), key=lambda r: (r["season"], r["date"], int(r["event_id"])))
        for r in ordered:
            teams = played.setdefault((r["season"], league), {})
            teams[r["home_id"]], teams[r["away_id"]] = r["home"], r["away"]
        write_csv(OUT / filename, RESULT_COLUMNS, ordered)
        print(filename, {s: sum(r["season"] == s for r in ordered) for s in seasons}, flush=True)

    divisions = []
    for year in seasons:
        for division, league in DIVISION_LEAGUES.items():
            table = get_json(STANDINGS.format(league=league, year=year), f"standings-{league}-{year}")
            teams = {e["team"]["id"]: e["team"]["displayName"] for group in table.get("children", []) for e in group["standings"]["entries"]}
            teams.update(played.get((year, league), {}))
            divisions += [{"season": year, "team_id": tid, "team": name, "team_key": team_key(name), "division": division}
                          for tid, name in teams.items()]
    write_csv(OUT / "divisions.csv", ["season", "team_id", "team", "team_key", "division"], divisions)
    print("divisions", {y: sum(d["season"] == y for d in divisions) for y in seasons})


if __name__ == "__main__":
    main()
