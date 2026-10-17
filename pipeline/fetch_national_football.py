"""Builds the national-football pack: the FIFA men's ranking, the real 2026 World Cup and Nations League schedules, and each national team's code and kit colours.

FotMob's Brazil team page carries the whole FIFA/Coca-Cola men's ranking (`details.fifaRanking`, 211 teams with
their points and the ranking's date); its league pages carry the 2026 World Cup (id 77) and the 2026-27 Nations
League A (id 9806) match by match. Group matches keep their real pairing, group and day; a knockout round keeps
only its days, since the game draws who plays. Team names are FotMob's, mapped to the national-teams pack's ids
(`national-teams.pack.json.gz`); a fixture naming a team the pack lacks stops the build. The FIFA codes and kit
colours come from data/national-teams.csv (codes from https://en.wikipedia.org/wiki/List_of_FIFA_country_codes,
colours hand-picked from each home kit: guess).

Pages come through tm_fetch's cache (data/fotmob_cache) with a generic User-Agent and `--delay` seconds between
requests (never under 2). `--offline` reads only the cache.

Usage: python pipeline/fetch_national_football.py [--delay 3] [--offline]
"""
from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import json
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path

import requests

from tm_fetch import Fetcher

ROOT = Path(__file__).resolve().parent.parent
BASE = "https://www.fotmob.com"
USER_AGENT = "Boleiro/0.1 (personal project)"
PACK_FORMAT = 1
NAME = "national-football"
PACK = ROOT / "packages" / "data" / "pack"
WORLD = PACK / "world"
RANKING_PAGE = "/api/data/teams?id=8256&ccode3=BRA"
COMPETITIONS = {"world-cup-2026": "/api/data/leagues?id=77", "nations-league-a-2026": "/api/data/leagues?id=9806"}
# FotMob's short names that don't slug to the pack's ids (the pack names teams as Transfermarkt does).
ALIASES = {"usa": "united-states", "dr-congo": "democratic-republic-of-the-congo", "ireland": "republic-of-ireland",
           "bosnia-and-herzegovina": "bosnia-herzegovina"}


@dataclass(frozen=True)
class RankRow:
    team: str
    name: str
    rank: int
    points: int


@dataclass(frozen=True)
class Ranking:
    date: str
    rows: list[RankRow]


@dataclass(frozen=True)
class FixtureRow:
    competition: str
    round: str
    group: str
    date: str
    home: str
    away: str


@dataclass(frozen=True)
class TeamRow:
    id: str
    code: str
    primary: str
    secondary: str


def slug(name: str) -> str:
    plain = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", plain).strip("-")


def team_id(name: str) -> str:
    own = slug(name)
    return ALIASES.get(own, own)


def ranking_of(page: str, teams: list[str]) -> Ranking:
    """The ranking on a FotMob team page, best first; a team the pack has goes by the pack's id, any other by its slug."""
    table = json.loads(page)["details"]["fifaRanking"]["rankings"]
    day, month, year = table["periodName"].split(".")
    known = set(teams)
    rows = []
    for row in table["ranks"]:
        own = team_id(row["name"])
        rows.append(RankRow(own if own in known else slug(row["name"]), row["name"], int(row["rank"]), int(row["totalPoints"])))
    return Ranking(f"{year}-{month}-{day}", sorted(rows, key=lambda row: row.rank))


def fixtures_of(page: str, competition: str, teams: list[str]) -> list[FixtureRow]:
    """A competition's matches: the group ones with their teams, a knockout round's only by day (one row per match)."""
    known = set(teams)
    rows = []
    for match in json.loads(page)["fixtures"]["allMatches"]:
        day = match["status"]["utcTime"][:10]
        group = str(match.get("group") or "")
        if not group:
            rows.append(FixtureRow(competition, str(match["round"]), "", day, "", ""))
            continue
        home, away = team_id(match["home"]["name"]), team_id(match["away"]["name"])
        for own, name in ((home, match["home"]["name"]), (away, match["away"]["name"])):
            if own not in known:
                raise ValueError(f"{competition}: {name} is not in the national-teams pack")
        rows.append(FixtureRow(competition, str(match["round"]), group, day, home, away))
    return rows


def teams_of(path: Path) -> list[TeamRow]:
    with path.open(encoding="utf-8") as handle:
        return [TeamRow(row["id"], row["fifa_code"], row["primary_colour"], row["secondary_colour"]) for row in csv.DictReader(handle)]


def pack_content(ranking: Ranking, fixtures: list[FixtureRow], teams: list[TeamRow]) -> dict[str, object]:
    return {
        "ranking": {
            "date": ranking.date,
            "source": f"{BASE}{RANKING_PAGE} (details.fifaRanking)",
            "team": [row.team for row in ranking.rows],
            "name": [row.name for row in ranking.rows],
            "rank": [row.rank for row in ranking.rows],
            "points": [row.points for row in ranking.rows],
        },
        "teams": {
            "id": [team.id for team in teams],
            "code": [team.code for team in teams],
            "primaryColour": [team.primary for team in teams],
            "secondaryColour": [team.secondary for team in teams],
        },
        "fixtures": {
            "source": {competition: f"{BASE}{path}" for competition, path in COMPETITIONS.items()},
            "competition": [row.competition for row in fixtures],
            "round": [row.round for row in fixtures],
            "group": [row.group for row in fixtures],
            "date": [row.date for row in fixtures],
            "home": [row.home for row in fixtures],
            "away": [row.away for row in fixtures],
        },
    }


def pack_bytes(content: dict[str, object]) -> bytes:
    body = json.dumps(content, ensure_ascii=False, separators=(",", ":"))
    version = f"{NAME}-{hashlib.sha256(body.encode()).hexdigest()[:12]}"
    text = json.dumps({"format": PACK_FORMAT, "packVersion": version, **content}, ensure_ascii=False, separators=(",", ":"))
    return gzip.compress(text.encode(), compresslevel=9, mtime=0)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--delay", type=float, default=3)
    parser.add_argument("--offline", action="store_true", help="read only the cache, whatever its age; never ask the site")
    args = parser.parse_args()
    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT
    fetcher = Fetcher(ROOT / "data" / "fotmob_cache", delay=args.delay, is_offline=args.offline, base=BASE,
                      get=lambda url: session.get(url, timeout=45))
    national = json.loads(gzip.decompress((WORLD / "national-teams.pack.json.gz").read_bytes()))
    teams = national["teams"]["id"]
    ranking = ranking_of(fetcher.page(RANKING_PAGE, max_age_days=30).html, teams)
    fixtures = [row for competition, path in COMPETITIONS.items() for row in fixtures_of(fetcher.page(path, max_age_days=30).html, competition, teams)]
    rows = teams_of(ROOT / "data" / "national-teams.csv")
    missing = sorted(set(teams) - {row.id for row in rows})
    if missing:
        raise SystemExit(f"data/national-teams.csv lacks {', '.join(missing)}")
    out = PACK / f"{NAME}.pack.json.gz"
    out.write_bytes(pack_bytes(pack_content(ranking, fixtures, rows)))
    print(f"{out}: ranking of {ranking.date} ({len(ranking.rows)} teams), {len(fixtures)} fixtures, {len(rows)} teams")


if __name__ == "__main__":
    main()
