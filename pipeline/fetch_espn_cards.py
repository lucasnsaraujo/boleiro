"""Rebuild data/history/espn/cards.csv: yellow and red cards of every finished Série A, B, C and
Copa do Brasil match in the chosen seasons, from ESPN's public match summary
(`site.api.espn.com/apis/site/v2/sports/soccer/{league}/summary?event={id}`).

Series B, C and cup event ids come from the result files fetch_espn.py writes; Série A ids come from
the bra.1 scoreboard. Each summary's `keyEvents` lists every card with its minute. A second yellow
shows up as a "Red Card" key event and does not add a yellow. Raw answers are cached in
data/history_cache/espn/.

Usage: fetch_espn_cards.py [--first 2024] [--last 2025]
"""
from __future__ import annotations

import argparse
import csv
import re
import time
import urllib.error
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from fetch_espn import CACHE, OUT, SCOREBOARD, get_json, write_csv

SUMMARY = "https://site.api.espn.com/apis/site/v2/sports/soccer/{league}/summary?event={event}"
LEAGUES = {"A": "bra.1", "B": "bra.2", "C": "bra.3", "cup": "bra.copa_do_brazil"}
RESULT_FILES = {"B": "brasileirao-serie-b.csv", "C": "brasileirao-serie-c.csv", "cup": "copa-do-brasil.csv"}
COLUMNS = ["season", "competition", "event_id", "home_yellow", "away_yellow", "home_red", "away_red", "red_minutes"]


def event_ids(competition: str, seasons: range) -> list[tuple[int, str]]:
    if competition in RESULT_FILES:
        with (OUT / RESULT_FILES[competition]).open() as f:
            return [(int(r["season"]), r["event_id"]) for r in csv.DictReader(f) if int(r["season"]) in seasons]
    ids: dict[str, int] = {}
    for year in seasons:
        for event in get_json(SCOREBOARD.format(league=LEAGUES[competition], year=year), f"scoreboard-{LEAGUES[competition]}-{year}").get("events", []):
            if event["competitions"][0]["status"]["type"]["completed"] and event["season"]["year"] in seasons:
                ids[event["id"]] = event["season"]["year"]
    return [(season, event) for event, season in ids.items()]


def minute(display: str) -> int:
    numbers = [int(n) for n in re.findall(r"\d+", display)]
    return min(90, numbers[0]) if numbers else 90


def fetch_with_retries(url: str, name: str, attempts: int = 4) -> dict:
    """ESPN answers some summaries with a 502 or 504 now and then; after a few tries the match is skipped."""
    for attempt in range(attempts):
        try:
            return get_json(url, name)
        except urllib.error.HTTPError as error:
            if error.code < 500:
                raise
            time.sleep(2 ** attempt)
    print(f"skipped {url}", flush=True)
    return {}


def card_row(competition: str, season: int, event: str) -> dict | None:
    summary = fetch_with_retries(SUMMARY.format(league=LEAGUES[competition], event=event), f"summary-{LEAGUES[competition]}-{event}")
    competitors = summary.get("header", {}).get("competitions", [{}])[0].get("competitors", [])
    side = {c["team"]["id"]: c["homeAway"] for c in competitors}
    if len(side) != 2 or "keyEvents" not in summary:
        return None
    row = {"season": season, "competition": competition, "event_id": event,
           "home_yellow": 0, "away_yellow": 0, "home_red": 0, "away_red": 0, "red_minutes": ""}
    reds = []
    for key_event in summary["keyEvents"]:
        kind = key_event.get("type", {}).get("text", "")
        where = side.get(key_event.get("team", {}).get("id", ""))
        if where is None or kind not in ("Yellow Card", "Red Card"):
            continue
        if kind == "Yellow Card":
            row[f"{where}_yellow"] += 1
        else:
            row[f"{where}_red"] += 1
            reds.append(f"{where[0]}{minute(key_event.get('clock', {}).get('displayValue', ''))}")
    row["red_minutes"] = ";".join(reds)
    return row


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--first", type=int, default=2024)
    parser.add_argument("--last", type=int, default=2025)
    args = parser.parse_args()
    CACHE.mkdir(parents=True, exist_ok=True)
    seasons = range(args.first, args.last + 1)
    jobs = [(competition, season, event) for competition in LEAGUES for season, event in event_ids(competition, seasons)]
    with ThreadPoolExecutor(8) as pool:
        rows = [row for row in pool.map(lambda job: card_row(*job), jobs) if row]
    rows.sort(key=lambda r: (r["competition"], r["season"], int(r["event_id"])))
    write_csv(OUT / "cards.csv", COLUMNS, rows)
    for competition in LEAGUES:
        own = [r for r in rows if r["competition"] == competition]
        if own:
            yellows = sum(r["home_yellow"] + r["away_yellow"] for r in own) / len(own)
            reds = sum(r["home_red"] + r["away_red"] for r in own) / len(own)
            print(f"{competition}: {len(own)} matches, {yellows:.2f} yellows and {reds:.3f} reds a match")


if __name__ == "__main__":
    main()
