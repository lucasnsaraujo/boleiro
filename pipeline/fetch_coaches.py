"""Fetches every league's current head coaches from Transfermarkt's manager lists.

Each league the world packs carry (packages/data/pack/world/*.pack.json.gz, Brazil's Séries A–D
included) has one page, `/<slug>/trainer/pokalwettbewerb/<code>`, that lists its clubs' head coaches:
the coach's Transfermarkt id, name, nationality (the first flag), club, age, time in charge, contract
end and whether Transfermarkt has a playing career for him. Clubs are matched by their Transfermarkt
id to the game's club ids, the ones the packs use (`tm-<id>` abroad, `flamengo-rj` in Brazil).

Writes data/coaches.csv (one row per club with a coach on the page, the latest appointment when a page lists two) and the engine's roster,
packages/data/src/coachRoster.ts, generated from it. Clubs the pages don't cover (state-only clubs,
the Club World Cup's guests) get invented coaches in the game.

Pages are cached in data/tm_cache (git-ignored) and fetched `--delay` seconds apart (never under 2),
with a generic User-Agent that names no person or account. `--offline` reads only the cache.

Usage: python3 pipeline/fetch_coaches.py [--delay 3] [--offline]
"""
from __future__ import annotations

import argparse
import csv
import gzip
import html
import json
import re
import time
import urllib.request
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = "https://www.transfermarkt.com"
USER_AGENT = "Boleiro/0.1 (personal project)"
WORLD_PACKS = ROOT / "packages" / "data" / "pack" / "world"
CSV_OUT = ROOT / "data" / "coaches.csv"
ROSTER_MODULE = ROOT / "packages" / "data" / "src" / "coachRoster.ts"
FIELDS = ["club_id", "name", "transfermarkt_id", "nationality", "age", "in_charge_since", "contract_until", "former_player", "league", "source", "seen_on"]

ROW = re.compile(r'<tr class="(?:odd|even)">(.*?)</tr>', re.S)
COACH = re.compile(r'<a title="[^"]*" id="(\d+)" href="/[^"]*/profil/trainer/\d+">([^<]+)</a>')
FLAG = re.compile(r'<img src="[^"]*/flagge/[^"]*" title="([^"]+)"')
CLUB = re.compile(r'href="/[^"]*/startseite/verein/(\d+)"')
CELLS = re.compile(r'<td class="zentriert">([^<]*)</td>')
TENURE = re.compile(r"(?:(\d+) years?)?\s*(?:(\d+) months?)?\s*(?:(\d+) days?)?")


@dataclass(frozen=True)
class Manager:
    transfermarkt_id: int
    name: str
    nationality: str
    club_tm_id: int
    age: int | None
    tenure: tuple[int, int, int]
    contract_until: str
    is_former_player: bool


def _tenure(text: str) -> tuple[int, int, int]:
    found = TENURE.fullmatch(text.strip())
    if not found:
        return (0, 0, 0)
    years, months, days = (int(part) if part else 0 for part in found.groups())
    return (years, months, days)


def managers(page: str) -> list[Manager]:
    """The head coaches a league's manager list shows, in page order; rows without a club are left out."""
    found = []
    for row in ROW.findall(page):
        coach, club = COACH.search(row), CLUB.search(row)
        if not coach or not club:
            continue
        flag = FLAG.search(row)
        cells = [html.unescape(cell).strip() for cell in CELLS.findall(row)]
        age = next((int(cell) for cell in cells if cell.isdigit() and len(cell) <= 2), None)
        tenure = next((cell for cell in cells if "year" in cell or "month" in cell or "day" in cell), "")
        contract = next((cell for cell in cells if len(cell) == 4 and cell.isdigit()), "")
        found.append(Manager(int(coach.group(1)), html.unescape(coach.group(2)).strip(), html.unescape(flag.group(1)) if flag else "",
                             int(club.group(1)), age, _tenure(tenure), contract, "/profil/spieler/" in row))
    return found


def in_charge_since(tenure: tuple[int, int, int], seen_on: date) -> date:
    """The day a coach took over, from his time in charge as the page counted it on `seen_on`."""
    years, months, days = tenure
    month_index = seen_on.year * 12 + seen_on.month - 1 - years * 12 - months
    year, month = divmod(month_index, 12)
    day = min(seen_on.day, 28 if month + 1 == 2 else 30 if month + 1 in (4, 6, 9, 11) else 31)
    return date(year, month + 1, day) - timedelta(days=days)


def leagues() -> list[tuple[str, dict[int, str]]]:
    """Every league code in the world packs, with its clubs: Transfermarkt id -> the game's club id."""
    found = []
    for path in sorted(WORLD_PACKS.glob("*.pack.json.gz")):
        pack = json.loads(gzip.decompress(path.read_bytes()))
        competitions = pack.get("competitions")
        if not competitions:
            continue
        clubs = pack["clubs"]
        for competition_id, code, kind in zip(competitions["id"], competitions["code"], competitions["kind"]):
            if kind != "league":
                continue
            members = {int(tm): club_id for club_id, tm, league in zip(clubs["id"], clubs["transfermarktId"], clubs["league"]) if league == competition_id}
            found.append((code, members))
    return found


def fetch(url: str, cache: Path, delay: float, is_offline: bool) -> str:
    cached = cache / (re.sub(r"[^a-z0-9]+", "_", url.removeprefix(BASE).lower()) + ".html")
    if cached.exists():
        return cached.read_text(encoding="utf-8")
    if is_offline:
        raise FileNotFoundError(f"{url} is not in the cache")
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept-Language": "en"})
    with urllib.request.urlopen(request, timeout=30) as answer:
        page = answer.read().decode("utf-8")
    time.sleep(max(2.0, delay))
    cache.mkdir(parents=True, exist_ok=True)
    cached.write_text(page, encoding="utf-8")
    return page


def newest_per_club(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    """One row per club, sorted by club: a page that lists a club twice (the coach on his way out and the one just installed) keeps the latest appointment."""
    newest: dict[str, dict[str, str]] = {}
    for row in rows:
        kept = newest.get(row["club_id"])
        if kept is None or row["in_charge_since"] > kept["in_charge_since"]:
            newest[row["club_id"]] = row
    return [newest[club_id] for club_id in sorted(newest)]


def _ts(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def write_roster(rows: list[dict[str, str]], seen_on: str) -> None:
    lines = [
        "// Generated by pipeline/fetch_coaches.py from Transfermarkt's league manager lists; edit the script, not this file.",
        "",
        "/** A club's real head coach as Transfermarkt listed him: nationality as it names it (\"Spain\"), age that day and since when he is in charge. */",
        "export type RealCoach = { name: string; nationality: string; age: number | null; since: string; isFormerPlayer: boolean };",
        "",
        f"/** The day the lists were read. */\nexport const COACH_ROSTER_SEEN_ON = {_ts(seen_on)};",
        "",
        "/** Each club's head coach on that day, by the game's club id. */",
        "export const COACH_ROSTER: Readonly<Record<string, RealCoach>> = {",
    ]
    for row in rows:
        age = row["age"] or "null"
        lines.append(f"  {_ts(row['club_id'])}: {{ name: {_ts(row['name'])}, nationality: {_ts(row['nationality'])}, age: {age}, since: {_ts(row['in_charge_since'])}, isFormerPlayer: {str(row['former_player'] == '1').lower()} }},")
    lines.append("};")
    ROSTER_MODULE.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--delay", type=float, default=3)
    parser.add_argument("--offline", action="store_true")
    parser.add_argument("--cache", type=Path, default=ROOT / "data" / "tm_cache")
    args = parser.parse_args()
    seen_on = date.today()
    rows: list[dict[str, str]] = []
    for code, members in leagues():
        url = f"{BASE}/x/trainer/pokalwettbewerb/{code}"
        try:
            page = fetch(url, args.cache, args.delay, args.offline)
        except Exception as error:  # noqa: BLE001 - one league's failure must not lose the others
            print(f"{code}: {error}")
            continue
        listed = managers(page)
        matched = [m for m in listed if m.club_tm_id in members]
        print(f"{code}: {len(matched)} of {len(members)} clubs")
        for m in matched:
            rows.append({
                "club_id": members[m.club_tm_id], "name": m.name, "transfermarkt_id": str(m.transfermarkt_id), "nationality": m.nationality,
                "age": "" if m.age is None else str(m.age), "in_charge_since": in_charge_since(m.tenure, seen_on).isoformat(),
                "contract_until": m.contract_until, "former_player": "1" if m.is_former_player else "0", "league": code,
                "source": url, "seen_on": seen_on.isoformat(),
            })
    rows = newest_per_club(rows)
    with CSV_OUT.open("w", newline="", encoding="utf-8") as out:
        writer = csv.DictWriter(out, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    write_roster(rows, seen_on.isoformat())
    print(f"{len(rows)} coaches")


if __name__ == "__main__":
    main()
