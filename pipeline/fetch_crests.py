"""Download every club's crest into assets/crests/ and write data/crests.csv.

Each club in data/clubs.csv gets the Transfermarkt crest (139x181 PNG) as assets/crests/<tm_id>.png.
Clubs that match an ESPN team with certainty also get ESPN's 500 px logo, for the big scoreboard,
as assets/crests/scoreboard/<tm_id>.png. Certain means the same normalised name (team_key) and the
same division (ESPN's bra.1 is Série A, bra.2 is Série B), with exactly one candidate on each side, or
a row in data/espn-crest-matches.csv. Unsure matches get no scoreboard crest.

Re-running only downloads missing files. Plain HTTP, throttled, 5xx answers retried. Every new file
goes through oxipng (lossless), which cuts the folder by about a fifth; install it with `brew install oxipng`.

Usage: fetch_crests.py
"""
from __future__ import annotations

import csv
import gzip
import json
import shutil
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

from team_key import team_key

ROOT = Path(__file__).resolve().parent.parent
CLUBS = ROOT / "data" / "clubs.csv"
MANUAL_MATCHES = ROOT / "data" / "espn-crest-matches.csv"
MANIFEST = ROOT / "data" / "crests.csv"
CRESTS = Path("assets") / "crests"
SCOREBOARD_CRESTS = CRESTS / "scoreboard"
TM_CREST = "https://tmssl.akamaized.net/images/wappen/head/{}.png"
ESPN_TEAMS = "https://site.api.espn.com/apis/site/v2/sports/soccer/{}/teams"
ESPN_LEAGUES = {"bra.1": "A", "bra.2": "B", "bra.copa_do_brazil": None}
USER_AGENT = "boleiro-pipeline"
PAUSE_SECONDS = 0.5
ATTEMPTS = 5


def get(url: str) -> bytes | None:
    """The body, or None on 404. Retries 5xx and network errors with a growing pause."""
    request = urllib.request.Request(url, headers={"Accept-Encoding": "gzip", "User-Agent": USER_AGENT})
    for attempt in range(ATTEMPTS):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                body = response.read()
                return gzip.decompress(body) if response.headers.get("Content-Encoding") == "gzip" else body
        except urllib.error.HTTPError as error:
            if error.code == 404:
                return None
            if error.code < 500 or attempt == ATTEMPTS - 1:
                raise
        except urllib.error.URLError:
            if attempt == ATTEMPTS - 1:
                raise
        time.sleep(2 ** attempt)
    raise AssertionError("unreachable")


def download(url: str, path: Path) -> bool:
    """Saves url to path unless it is already there. False when the source has no such file.

    The file is written and optimised as <path>.part and only then renamed, so a run cut short
    never leaves a half-written crest that later runs would take as done.
    """
    if path.exists():
        return True
    body = get(url)
    time.sleep(PAUSE_SECONDS)
    if body is None or not body.startswith(b"\x89PNG"):
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    part = path.with_name(path.name + ".part")
    part.write_bytes(body)
    subprocess.run(["oxipng", "--quiet", "--opt", "4", "--strip", "safe", str(part)], check=True)
    part.replace(path)
    return True


def espn_teams() -> dict[str, dict]:
    """ESPN teams with a logo, by id, each with the division its league proves (or None)."""
    teams: dict[str, dict] = {}
    for league, division in ESPN_LEAGUES.items():
        answer = json.loads(get(ESPN_TEAMS.format(league)) or b"{}")
        for entry in answer["sports"][0]["leagues"][0]["teams"]:
            team = entry["team"]
            logo = next((logo["href"] for logo in team.get("logos", []) if "default" in logo["rel"]), None)
            if not logo:
                continue
            known = teams.setdefault(team["id"], {**team, "logo": logo, "division": None})
            known["division"] = known["division"] or division
        time.sleep(PAUSE_SECONDS)
    return teams


def espn_matches(clubs: list[dict[str, str]], teams: dict[str, dict], manual: dict[str, str]) -> dict[str, tuple[dict, str]]:
    """tm_id -> (ESPN team, why the match is certain)."""
    def club_keys(club: dict[str, str]) -> set[str]:
        return {team_key(club["name"]), team_key(club["short_name"])}

    def team_keys(team: dict) -> set[str]:
        return {team_key(team[field]) for field in ("displayName", "name", "shortDisplayName", "location")}

    candidates = {
        club["tm_id"]: [team for team in teams.values() if club["division"] and team["division"] == club["division"] and club_keys(club) & team_keys(team)]
        for club in clubs
    }
    claims: dict[str, int] = {}
    for found in candidates.values():
        for team in found:
            claims[team["id"]] = claims.get(team["id"], 0) + 1
    matches = {
        tm_id: (found[0], f"same name and Série {found[0]['division']}")
        for tm_id, found in candidates.items()
        if len(found) == 1 and claims[found[0]["id"]] == 1
    }
    for tm_id, espn_id in manual.items():
        matches[tm_id] = (teams[espn_id], "checked by hand in data/espn-crest-matches.csv")
    return matches


def main() -> None:
    if not shutil.which("oxipng"):
        raise SystemExit("oxipng not found; install it with `brew install oxipng`")
    clubs = list(csv.DictReader(CLUBS.open()))
    manual = {row["tm_id"]: row["espn_id"] for row in csv.DictReader(MANUAL_MATCHES.open())}
    matches = espn_matches(clubs, espn_teams(), manual)

    rows = []
    for club in clubs:
        tm_id = club["tm_id"]
        crest = CRESTS / f"{tm_id}.png"
        has_crest = download(TM_CREST.format(tm_id), ROOT / crest)
        if not has_crest:
            print(f"no Transfermarkt crest for {club['id']} ({tm_id})")
        scoreboard, scoreboard_source = "", ""
        if tm_id in matches:
            team, why = matches[tm_id]
            path = SCOREBOARD_CRESTS / f"{tm_id}.png"
            if download(team["logo"], ROOT / path):
                scoreboard, scoreboard_source = str(path), f"espn: team {team['id']} {team['displayName']}, {why}"
            else:
                print(f"no ESPN logo for {club['id']} (ESPN team {team['id']})")
        rows.append({
            "club_id": club["id"],
            "tm_id": tm_id,
            "crest": str(crest) if has_crest else "",
            "crest_source": f"transfermarkt: {TM_CREST.format(tm_id)}" if has_crest else "",
            "scoreboard_crest": scoreboard,
            "scoreboard_crest_source": scoreboard_source,
        })

    with MANIFEST.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]), lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    for division in ("A", "B"):
        unmatched = [club["id"] for club in clubs if club["division"] == division and club["tm_id"] not in matches]
        print(f"Série {division} clubs without an ESPN match: {', '.join(unmatched) or 'none'}")
    crests = sum(bool(row["crest"]) for row in rows)
    scoreboards = sum(bool(row["scoreboard_crest"]) for row in rows)
    print(f"{crests}/{len(rows)} crests, {scoreboards} scoreboard crests; manifest written to {MANIFEST.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
