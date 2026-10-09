"""Rebuild data/history/sofascore/ from Sofascore: Copa do Brasil and Série B–D results, closing 1X2 odds,
and the division (A–D) every team played each year.

Sofascore blocks plain HTTP clients, so every request runs as fetch() inside a headless
agent-browser page. Raw answers are cached per season in data/history_cache/, so a rerun
only fetches what is missing; delete a cache file to refresh it.

Odds are one request per match, and Sofascore's rate limit makes that too slow for ~1,100 league
matches a year, so only the cup gets odds; the odds columns of Série B–D stay empty.

Sofascore's rate limit blocked this machine for over an hour after the 2024 fetch, so the committed
files hold 2024 only and the other seasons come from ESPN (pipeline/fetch_espn.py).

Usage: fetch_history.py [--first 2024] [--last 2024]
"""
from __future__ import annotations

import argparse
import csv
import json
import subprocess
import time
from datetime import datetime
from fractions import Fraction
from pathlib import Path
from zoneinfo import ZoneInfo

from team_key import team_key

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "history" / "sofascore"
CACHE = ROOT / "data" / "history_cache"
TOURNAMENTS = {"copa-do-brasil": 373, "A": 325, "B": 390, "C": 1281, "D": 10326}
RESULT_FILES = {"copa-do-brasil": "copa-do-brasil.csv", "B": "brasileirao-serie-b.csv", "C": "brasileirao-serie-c.csv", "D": "brasileirao-serie-d.csv"}
RESULT_COLUMNS = ["season", "date", "round", "event_id", "home_id", "home", "home_key", "away_id", "away", "away_key",
                  "home_goals", "away_goals", "penalty_winner", "odds_home", "odds_draw", "odds_away"]
BRAZIL = ZoneInfo("America/Sao_Paulo")
BATCH = 60

# Runs inside the page: fetches the paths one at a time with a pause between calls (parallel
# requests trip Cloudflare's captcha), retries twice on anything but 200/404, and keeps only the
# fields the pipeline needs.
FETCH_JS = """(async()=>{
const paths=%s, pick=%s, out=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function get(p){for(let tries=0;;tries++){let status=0;
  try{const r=await fetch(p);status=r.status;if(r.ok)return [200,pick(await r.json())];}catch(e){}
  if(status===404||tries>=2)return [status,null]; await sleep(5000);}}
for(const p of paths){out.push(await get(p));await sleep(400);}
return JSON.stringify(out)})()"""

PICK_EVENTS = """j=>({more:j.hasNextPage,events:j.events.map(e=>({id:e.id,t:e.startTimestamp,status:e.status.type,
round:e.roundInfo?(e.roundInfo.name||String(e.roundInfo.round)):"",home:[e.homeTeam.id,e.homeTeam.name],
away:[e.awayTeam.id,e.awayTeam.name],hs:e.homeScore,as:e.awayScore,winner:e.winnerCode}))})"""
PICK_ODDS = """j=>{const m=j.markets.find(m=>m.marketId===1);return m?m.choices.map(c=>[c.name,c.fractionalValue]):null}"""
PICK_STANDINGS = """j=>j.standings.flatMap(s=>s.rows.map(r=>[r.team.id,r.team.name]))"""


_browser_open = False


def open_sofascore() -> None:
    """Opens the page on first use, so a rebuild from a full cache needs no browser."""
    global _browser_open
    if _browser_open:
        return
    subprocess.run(["agent-browser", "open", "https://www.sofascore.com/"], check=True, capture_output=True)
    _browser_open = True
    url = subprocess.run(["agent-browser", "get", "url"], check=True, capture_output=True, text=True).stdout
    if "captcha" in url:
        raise RuntimeError("Sofascore answered with a Cloudflare captcha; wait a while (it took over 35 minutes once) and rerun")


def browser_fetch(paths: list[str], pick: str) -> list[tuple[int, object]]:
    open_sofascore()
    results: list[tuple[int, object]] = []
    for start in range(0, len(paths), BATCH):
        if start:
            time.sleep(5)
        chunk = paths[start:start + BATCH]
        done = subprocess.run(["agent-browser", "eval", FETCH_JS % (json.dumps(chunk), pick)], capture_output=True, text=True)
        if done.returncode != 0:
            raise RuntimeError(f"agent-browser eval failed: {done.stdout[-500:]} {done.stderr[-500:]}")
        results += [tuple(r) for r in json.loads(json.loads(done.stdout.strip().splitlines()[-1]))]
    return results


def cached(name: str, build):
    path = CACHE / f"{name}.json"
    if path.exists():
        return json.loads(path.read_text())
    value = build()
    path.write_text(json.dumps(value))
    return value


def season_ids(tournament: int) -> dict[int, int]:
    def build():
        [(status, seasons)] = browser_fetch([f"/api/v1/unique-tournament/{tournament}/seasons"],
                                            "j=>j.seasons.map(s=>[s.year,s.id])")
        if status != 200:
            raise RuntimeError(f"seasons of {tournament}: HTTP {status}")
        return seasons
    # Série A 2020 is labelled "20/21" because it finished in February 2021.
    return {int(year[:4]) if len(year) == 4 else 2000 + int(year[:2]): sid for year, sid in cached(f"seasons-{tournament}", build)}


def season_events(tournament: int, season: int) -> list[dict]:
    events: list[dict] = []
    for page in range(100):
        [(status, body)] = browser_fetch([f"/api/v1/unique-tournament/{tournament}/season/{season}/events/last/{page}"], PICK_EVENTS)
        if status == 404:
            break
        if status != 200:
            raise RuntimeError(f"events {tournament}/{season} page {page}: HTTP {status}")
        events += body["events"]
        if not body["more"]:
            break
    return sorted({e["id"]: e for e in events}.values(), key=lambda e: (e["t"], e["id"]))


def standings(tournament: int, season: int) -> list[list]:
    [(status, teams)] = browser_fetch([f"/api/v1/unique-tournament/{tournament}/season/{season}/standings/total"], PICK_STANDINGS)
    if status != 200:
        raise RuntimeError(f"standings {tournament}/{season}: HTTP {status}")
    return teams


def decimal_odds(fractional: str) -> str:
    return f"{1 + float(Fraction(fractional)):.2f}"


def closing_odds(name: str, event_ids: list[int]) -> dict[str, list[str] | None]:
    """Odds are many calls, so each batch is cached on its own and an interrupted run resumes."""
    answers: list = []
    for n, start in enumerate(range(0, len(event_ids), BATCH)):
        chunk = event_ids[start:start + BATCH]

        def fetch_chunk():
            time.sleep(5)
            got = browser_fetch([f"/api/v1/event/{i}/odds/1/all" for i in chunk], PICK_ODDS)
            failed = [i for i, (status, _) in zip(chunk, got) if status not in (200, 404)]
            if failed:
                raise RuntimeError(f"odds requests failed for {len(failed)} events, e.g. {failed[:5]} (captcha? wait and rerun)")
            return got
        answers += cached(f"{name}-{n}", fetch_chunk)
    odds: dict[str, list[str] | None] = {}
    for event_id, (_, choices) in zip(event_ids, answers):
        by_name = dict(choices or [])
        odds[str(event_id)] = [decimal_odds(by_name[k]) for k in ("1", "X", "2")] if {"1", "X", "2"} <= by_name.keys() else None
    return odds


def result_rows(year: int, events: list[dict], odds: dict[str, list[str] | None]) -> list[dict]:
    rows = []
    for e in events:
        # "display" is the score without the shootout; "current" adds the shootout goals.
        if e["status"] != "finished" or "display" not in e["hs"]:
            continue
        hs, aw = e["hs"], e["as"]
        shootout = "penalties" in hs and "penalties" in aw
        prices = odds.get(str(e["id"])) or ["", "", ""]
        rows.append({
            "season": year,
            "date": datetime.fromtimestamp(e["t"], BRAZIL).strftime("%Y-%m-%d"),
            "round": e["round"],
            "event_id": e["id"],
            "home_id": e["home"][0], "home": e["home"][1], "home_key": team_key(e["home"][1]),
            "away_id": e["away"][0], "away": e["away"][1], "away_key": team_key(e["away"][1]),
            "home_goals": hs["display"], "away_goals": aw["display"],
            "penalty_winner": ("home" if hs["penalties"] > aw["penalties"] else "away") if shootout else "",
            "odds_home": prices[0], "odds_draw": prices[1], "odds_away": prices[2],
        })
    return rows


def write_csv(path: Path, columns: list[str], rows: list[dict]) -> None:
    with path.open("w", newline="") as f:
        writer = csv.DictWriter(f, columns, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--first", type=int, default=2024)
    parser.add_argument("--last", type=int, default=2024)
    args = parser.parse_args()
    CACHE.mkdir(exist_ok=True)
    OUT.mkdir(exist_ok=True)
    years = range(args.first, args.last + 1)
    try:
        seasons = {key: season_ids(t) for key, t in TOURNAMENTS.items()}
        divisions = []
        for year in years:
            for division in "ABCD":
                sid = seasons[division][year]
                teams = cached(f"standings-{division}-{year}", lambda: standings(TOURNAMENTS[division], sid))
                divisions += [{"season": year, "team_id": tid, "team": name, "team_key": team_key(name), "division": division}
                              for tid, name in dict(map(tuple, teams)).items()]
        write_csv(OUT / "divisions.csv", ["season", "team_id", "team", "team_key", "division"], divisions)

        for key, filename in RESULT_FILES.items():
            rows = []
            for year in years:
                tournament, sid = TOURNAMENTS[key], seasons[key][year]
                events = cached(f"events-{key}-{year}", lambda: season_events(tournament, sid))
                finished = [e["id"] for e in events if e["status"] == "finished"]
                odds = closing_odds(f"odds-{key}-{year}", finished) if key == "copa-do-brasil" else {}
                rows += result_rows(year, events, odds)
                print(f"{key} {year}: {sum(r['season'] == year for r in rows)} matches", flush=True)
            write_csv(OUT / filename, RESULT_COLUMNS, rows)
    finally:
        if _browser_open:
            subprocess.run(["agent-browser", "close"], capture_output=True)


if __name__ == "__main__":
    main()
