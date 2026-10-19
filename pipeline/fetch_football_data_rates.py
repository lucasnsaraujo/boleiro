"""Rebuild data/history/football-data/league-rates.csv: per league and season, how many games ended
home, draw and away, the goals (and their squares, for the spread) and, where the file has them, the
yellow and red cards, in all and by side. Source: football-data.co.uk, whose files list every finished
game. Its notes.txt: English and Scottish yellows leave out the first yellow of a player sent off for a
second, which the other European files count.

Two kinds of file: `mmz4281/{yy}{yy}/{code}.csv` for the European leagues (one per season, with cards)
and `new/{code}.csv` for the rest (every season in one file, goals only). Only finished seasons count:
the European 2022/23 to 2025/26 and the others' calendar years 2022 to 2025 (Liga MX: the four
seasons 2022/2023 to 2025/2026, each holding its Apertura and Clausura).

The first column keys the game's competition: the country id of packages/engine/src/sim/world, a dash and
the level (`gb-eng-1` is the Premier League).

Usage: fetch_football_data_rates.py
"""
from __future__ import annotations

import csv
import time
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "data" / "history" / "football-data" / "league-rates.csv"
BASE = "https://www.football-data.co.uk"
USER_AGENT = "Boleiro/0.1 (personal project)"

EUROPE_SEASONS = ["2223", "2324", "2425", "2526"]
# league key -> football-data code of the European files
EUROPE = {
    "gb-eng-1": "E0", "gb-eng-2": "E1", "es-1": "SP1", "es-2": "SP2", "it-1": "I1", "it-2": "I2",
    "de-1": "D1", "de-2": "D2", "fr-1": "F1", "fr-2": "F2", "pt-1": "P1", "nl-1": "N1",
    "tr-1": "T1", "be-1": "B1", "gb-sct-1": "SC0", "gb-sct-2": "SC1", "gr-1": "G1",
}
# league key -> (football-data code of the `new` files, the seasons to keep)
CALENDAR_YEARS = ["2022", "2023", "2024", "2025"]
LIGA_MX_SEASONS = ["2022/2023", "2023/2024", "2024/2025", "2025/2026"]
OTHERS = {
    "ar-1": ("ARG", CALENDAR_YEARS), "us-1": ("USA", CALENDAR_YEARS), "mx-1": ("MEX", LIGA_MX_SEASONS),
    "no-1": ("NOR", CALENDAR_YEARS), "at-1": ("AUT", ["2022/2023", "2023/2024", "2024/2025", "2025/2026"]),
    "pl-1": ("POL", ["2022/2023", "2023/2024", "2024/2025", "2025/2026"]),
}
COLUMNS = [
    "league", "season", "matches", "home", "draw", "away", "goals", "goals_squared",
    "card_matches", "yellows", "reds", "home_yellows", "away_yellows", "home_reds", "away_reds",
]


def download(url: str, attempts: int = 4) -> list[dict]:
    """The file's rows; the site is slow and answers 503 when busy, so a failed try waits longer each time."""
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                text = response.read().decode("utf-8-sig", errors="replace")
            time.sleep(1)
            return list(csv.DictReader(text.splitlines()))
        except OSError:
            if attempt == attempts - 1:
                raise
            time.sleep(30 * (attempt + 1))
    return []


def tally(league: str, season: str, games: list[tuple[int, int]], cards: list[tuple[int, int, int, int]]) -> dict:
    return {
        "league": league,
        "season": season,
        "matches": len(games),
        "home": sum(h > a for h, a in games),
        "draw": sum(h == a for h, a in games),
        "away": sum(h < a for h, a in games),
        "goals": sum(h + a for h, a in games),
        "goals_squared": sum((h + a) ** 2 for h, a in games),
        "card_matches": len(cards),
        "yellows": sum(hy + ay for hy, ay, _, _ in cards),
        "reds": sum(hr + ar for _, _, hr, ar in cards),
        "home_yellows": sum(hy for hy, _, _, _ in cards),
        "away_yellows": sum(ay for _, ay, _, _ in cards),
        "home_reds": sum(hr for _, _, hr, _ in cards),
        "away_reds": sum(ar for _, _, _, ar in cards),
    }


def number(value: str | None) -> int | None:
    try:
        return int(float(value)) if value not in (None, "") else None
    except ValueError:
        return None


def european_rows() -> list[dict]:
    rows = []
    for league, code in EUROPE.items():
        for season in EUROPE_SEASONS:
            games, cards = [], []
            for row in download(f"{BASE}/mmz4281/{season}/{code}.csv"):
                home, away = number(row.get("FTHG")), number(row.get("FTAG"))
                if home is None or away is None:
                    continue
                games.append((home, away))
                counts = [number(row.get(column)) for column in ("HY", "AY", "HR", "AR")]
                hy, ay, hr, ar = counts
                if hy is not None and ay is not None and hr is not None and ar is not None:
                    cards.append((hy, ay, hr, ar))
            rows.append(tally(league, f"{season[:2]}/{season[2:]}", games, cards))
    return rows


def other_rows() -> list[dict]:
    rows = []
    for league, (code, seasons) in OTHERS.items():
        files = download(f"{BASE}/new/{code}.csv")
        for season in seasons:
            games = [(number(r["HG"]), number(r["AG"])) for r in files if r["Season"] == season and number(r["HG"]) is not None and number(r["AG"]) is not None]
            rows.append(tally(league, season, games, []))
    return rows


def main() -> None:
    rows = european_rows() + other_rows()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    print(f"{len(rows)} league seasons, {sum(r['matches'] for r in rows)} games -> {OUT}")


if __name__ == "__main__":
    main()
