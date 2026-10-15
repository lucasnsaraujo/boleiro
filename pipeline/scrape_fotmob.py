"""Scrapes FotMob for Brazil's clubs: each player's positions and each club's last starting eleven.

FotMob's league pages list the clubs of Brazil's national series, the Copa do Brasil and the state
championships it covers; each club of the game found there gets its team page, which lists every
player's positions (main first, "CB,LB") and the eleven and formation of the club's last match.
Players are matched to Transfermarkt's by name within the club (data/transfermarkt-players.csv), so
the rows carry Transfermarkt ids. A team page without the last eleven (Séries C and D) has it from
the last match's details, which name the starters but not the formation. Writes data/fotmob-players.csv and data/fotmob-lineups.csv, which
import_csv.py loads into the master database.

Pages come through tm_fetch's cache (data/fotmob_cache), at `--delay` seconds apart (never under 2),
with its retries, Retry-After and stop after 10 refusals in a row. `--offline` reads only the cache.

Usage: .venv/bin/python pipeline/scrape_fotmob.py data [--delay 2] [--max-age-days 7] [--offline]
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from tm_fetch import Blocked, FetchError, Fetcher

ROOT = Path(__file__).resolve().parent.parent
BASE = "https://www.fotmob.com"
# FotMob's Brazilian competitions (`/api/data/allLeagues`, 2026-10-14): the four national series, the
# national and regional cups, and the state championships it covers.
LEAGUES = {
    268: "Série A", 8814: "Série B", 8971: "Série C", 9464: "Série D", 9067: "Copa do Brasil", 9429: "Copa do Nordeste",
    10244: "Paulista A1", 9483: "Paulista A2", 11646: "Copa Paulista", 10272: "Carioca", 10273: "Mineiro",
    10274: "Gaúcho", 10290: "Baiano", 10291: "Goiano",
}
# FotMob names a few clubs unlike Transfermarkt's names and short names: FotMob id -> the game's club id.
CLUB_OVERRIDES = {
    109705: "bragantino-sp", 581838: "gremio-novorizontino-sp", 581832: "ferroviaria-sp", 162167: "confianca-se",
    197604: "sampaio-rr", 304653: "capital-df", 197816: "operario-varzea-grandense-mt", 239707: "tuna-luso-brasileira-pa",
    215629: "oratorio-rc-ap", 1696139: "cefat-tirol-ce", 197403: "cs-sergipe-se", 1116984: "retro-fc-brasil-pe",
    584262: "decisao-pe", 197706: "alagoinhas-ba", 197805: "democrata-mg", 298451: "real-noroeste-cfc-es",
    6065: "portuguesa-sp", 606359: "velo-clube-rioclarense-sp", 162172: "nautico-marcilio-dias-sc",
    1320837: "if-sao-joseense-pr", 197401: "america-se", 297311: "bragantino-clube-do-para-pa", 198608: "vasco-da-gama-ac",
}
# Where a name fits several clubs (Botafogo, Santos), FotMob means the one highest in the pyramid.
DIVISION_RANK = {"A": 0, "B": 1, "C": 2, "D": 3, "": 4}
PLAYER_FIELDS = ["club_id", "tm_id", "fotmob_id", "name", "positions"]
LINEUP_FIELDS = ["club_id", "fotmob_team_id", "formation", "slot", "fotmob_position_id", "tm_id", "fotmob_id", "name"]
# Words clubs add to their names that the other source often leaves out.
CLUB_WORDS = {"ec", "fc", "sc", "ac", "aa", "ca", "cr", "se", "sa", "cf", "fbc", "afc", "clube", "esporte", "esportivo", "futebol",
              "de", "do", "da", "dos", "das", "e", "club", "sport", "associacao", "atletica", "sociedade", "recreativo", "regatas"}


@dataclass(frozen=True)
class Team:
    id: int
    name: str


@dataclass(frozen=True)
class SquadMember:
    id: int
    name: str
    age: int | None
    positions: tuple[str, ...]  # FotMob's codes, main first: ("CB", "LB")


@dataclass(frozen=True)
class Starter:
    id: int
    name: str
    position_id: int  # FotMob's slot code: 11 the keeper, then line and lane


@dataclass(frozen=True)
class Lineup:
    formation: str
    starters: tuple[Starter, ...]


@dataclass(frozen=True)
class TmPlayer:
    tm_id: str
    name: str
    age: int | None


def plain(text: str) -> str:
    """Lowercase ASCII words: accents, hyphens and dots dropped."""
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    return " ".join(re.sub(r"[^a-z0-9]+", " ", ascii_text).split())


def _tables(node: object) -> Iterable[list[dict[str, object]]]:
    """Every standings list in a league page, however its groups nest them."""
    if isinstance(node, dict):
        table = node.get("table")
        if isinstance(table, dict) and isinstance(table.get("all"), list):
            yield table["all"]
        for value in node.values():
            yield from _tables(value)
    elif isinstance(node, list):
        for value in node:
            yield from _tables(value)


def _is_club(team: Team) -> bool:
    """Fixtures of a draw not yet made name a placeholder: id 0, or "Atlético-MG/Grêmio" for a tie's winner."""
    return team.id > 0 and "/" not in team.name


def league_teams(text: str) -> list[Team]:
    """The clubs a league page lists in its standings and fixtures, once each, in page order."""
    page = json.loads(text)
    seen: dict[int, Team] = {}
    rows = [row for table in _tables(page.get("table")) for row in table]
    fixtures = page.get("fixtures", {}).get("allMatches", []) if isinstance(page.get("fixtures"), dict) else []
    sides = [match.get(side) or {} for match in fixtures for side in ("home", "away")]
    for entry in [*rows, *sides]:
        if "id" in entry and "name" in entry:
            team = Team(int(entry["id"]), str(entry["name"]))
            if _is_club(team):
                seen.setdefault(team.id, team)
    return list(seen.values())


def squad(text: str) -> list[SquadMember]:
    """A team page's players with their positions; coaches and players without any are left out."""
    page = json.loads(text)
    members = []
    for group in (page.get("squad") or {}).get("squad") or []:
        if group.get("title") == "coach":
            continue
        for member in group.get("members", []):
            codes = member.get("positionIdsDesc")
            if not codes:
                continue
            age = member.get("age")
            members.append(SquadMember(int(member["id"]), str(member["name"]), int(age) if isinstance(age, int) else None,
                                       tuple(code.strip() for code in str(codes).split(",") if code.strip())))
    return members


def last_lineup(text: str) -> Lineup | None:
    """The formation and eleven of the team's last match, keeper first, or None when the page has none."""
    stats = json.loads(text).get("overview", {}).get("lastLineupStats")
    if not stats or not stats.get("formation") or len(stats.get("starters") or []) != 11:
        return None
    starters = tuple(Starter(int(p["id"]), str(p["name"]), int(p["positionId"])) for p in stats["starters"])
    return Lineup(str(stats["formation"]), tuple(sorted(starters, key=lambda s: s.position_id)))


def last_match_id(text: str) -> int | None:
    """The team's last match, for a page without its lineup."""
    last = (json.loads(text).get("overview") or {}).get("lastMatch") or {}
    return int(last["id"]) if last.get("id") else None


def match_lineup(text: str, team_id: int) -> Lineup | None:
    """The team's eleven in a match's details, keeper first. Smaller leagues' matches list the starters
    without their slots: the formation is then empty and each slot code is FotMob's usual group
    (0 keeper, 1 defender, 2 midfielder, 3 forward)."""
    lineup = (json.loads(text).get("content") or {}).get("lineup") or {}
    team = next((side for side in (lineup.get("homeTeam"), lineup.get("awayTeam")) if side and side.get("id") == team_id), None)
    if not team or len(team.get("starters") or []) != 11:
        return None
    def code(player: dict[str, object]) -> int:
        return int(str(player.get("positionId", player.get("usualPlayingPositionId", 9))))
    starters = tuple(Starter(int(p["id"]), str(p["name"]), code(p)) for p in team["starters"])
    return Lineup(str(team.get("formation") or ""), tuple(sorted(starters, key=lambda s: s.position_id)))


def club_words(name: str) -> frozenset[str]:
    return frozenset(word for word in plain(name).split() if word not in CLUB_WORDS)


def match_clubs(teams: Iterable[Team], clubs: list[dict[str, str]]) -> dict[int, str]:
    """FotMob team id -> the game's club id: an override, else the club whose name, short name or short
    name with its state reads the same once the words clubs add are dropped, the highest in the pyramid
    when several do; none when the highest are level."""
    rank = {club["id"]: DIVISION_RANK[club["division"]] for club in clubs}
    names: dict[frozenset[str], set[str]] = {}
    for club in clubs:
        for name in (club["name"], club["short_name"], f"{club['short_name']} {club['state']}"):
            names.setdefault(club_words(name), set()).add(club["id"])
    matched: dict[int, str] = {}
    for team in teams:
        if team.id in CLUB_OVERRIDES:
            matched[team.id] = CLUB_OVERRIDES[team.id]
            continue
        found = sorted(names.get(club_words(team.name), set()), key=lambda club_id: rank[club_id])
        if len(found) == 1 or (len(found) > 1 and rank[found[0]] < rank[found[1]]):
            matched[team.id] = found[0]
    return matched


def _same_person(fotmob: str, tm: str) -> bool:
    """Whether two names can be one player: a one-word name is the other's first or last word;
    otherwise every word of the shorter name comes, in order, in the longer."""
    shorter, longer = sorted((plain(fotmob).split(), plain(tm).split()), key=len)
    if not shorter:
        return False
    if len(shorter) == 1:
        return shorter[0] in (longer[0], longer[-1])
    words = iter(longer)
    return all(word in words for word in shorter)


def match_players(members: Iterable[SquadMember | Starter], tm_players: list[TmPlayer]) -> dict[int, str]:
    """FotMob player id -> Transfermarkt id within one club: the same plain name, else the only
    Transfermarkt player whose name holds the other's words (age within a year when both are known)."""
    by_name: dict[str, list[TmPlayer]] = {}
    for player in tm_players:
        by_name.setdefault(plain(player.name), []).append(player)
    matched: dict[int, str] = {}
    taken: set[str] = set()
    pending = []
    for member in members:
        same = by_name.get(plain(member.name), [])
        if len(same) == 1 and same[0].tm_id not in taken:
            matched[member.id] = same[0].tm_id
            taken.add(same[0].tm_id)
        else:
            pending.append(member)
    for member in pending:
        age = member.age if isinstance(member, SquadMember) else None
        candidates = [p for p in tm_players if p.tm_id not in taken and _same_person(member.name, p.name)
                      and (age is None or p.age is None or abs(age - p.age) <= 1)]
        if len(candidates) == 1:
            matched[member.id] = candidates[0].tm_id
            taken.add(candidates[0].tm_id)
    return matched


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def write_csv(path: Path, fields: list[str], rows: list[dict[str, object]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("data", type=Path)
    parser.add_argument("--delay", type=float, default=2.0, help="seconds after each request (at least 2)")
    parser.add_argument("--max-age-days", type=float, default=7, help="refetch cached pages older than this")
    parser.add_argument("--cache", type=Path, default=ROOT / "data" / "fotmob_cache")
    parser.add_argument("--offline", action="store_true", help="read only the cache, whatever its age; never ask the site")
    args = parser.parse_args()

    fetcher = Fetcher(args.cache, delay=args.delay, is_offline=args.offline, base=BASE)
    clubs = read_csv(args.data / "clubs.csv")
    club_by_tm = {club["tm_id"]: club["id"] for club in clubs}
    tm_by_club: dict[str, list[TmPlayer]] = {}
    for row in read_csv(args.data / "transfermarkt-players.csv"):
        club_id = club_by_tm.get(row["club_tm_id"])
        if club_id:
            tm_by_club.setdefault(club_id, []).append(TmPlayer(row["tm_id"], row["name"], int(row["age"]) if row["age"].isdigit() else None))

    teams: dict[int, Team] = {}
    failures: list[str] = []
    try:
        for league_id, name in LEAGUES.items():
            try:
                page = fetcher.page(f"/api/data/leagues?id={league_id}", args.max_age_days, is_valid=lambda text: text.lstrip().startswith("{"))
            except FetchError as error:
                failures.append(f"{name}: {error}")
                continue
            for team in league_teams(page.html):
                teams.setdefault(team.id, team)
        club_of = match_clubs(teams.values(), clubs)
        unmatched = sorted({team.name for team in teams.values() if team.id not in club_of})
        print(f"{len(teams)} FotMob teams, {len(club_of)} matched to {len(set(club_of.values()))} of the game's {len(clubs)} clubs")
        print("unmatched FotMob teams:", "; ".join(unmatched))

        players: list[dict[str, object]] = []
        lineups: list[dict[str, object]] = []
        done: set[str] = set()
        for team_id, club_id in club_of.items():
            if club_id in done:
                continue
            done.add(club_id)
            try:
                page = fetcher.page(f"/api/data/teams?id={team_id}", args.max_age_days, is_valid=lambda text: text.lstrip().startswith("{"))
            except FetchError as error:
                failures.append(f"{club_id}: {error}")
                continue
            members = squad(page.html)
            tm_players = tm_by_club.get(club_id, [])
            tm_of = match_players(members, tm_players)
            for member in members:
                players.append({"club_id": club_id, "tm_id": tm_of.get(member.id, ""), "fotmob_id": member.id, "name": member.name,
                                "positions": ",".join(member.positions)})
            lineup = last_lineup(page.html)
            match_id = last_match_id(page.html)
            if lineup is None and match_id is not None:
                try:
                    details = fetcher.page(f"/api/data/matchDetails?matchId={match_id}", args.max_age_days, is_valid=lambda text: text.lstrip().startswith("{"))
                    lineup = match_lineup(details.html, team_id)
                except FetchError as error:
                    failures.append(f"{club_id} last match: {error}")
            if lineup:
                starter_tm = {**match_players(lineup.starters, tm_players), **{k: v for k, v in tm_of.items()}}
                for slot, starter in enumerate(lineup.starters):
                    lineups.append({"club_id": club_id, "fotmob_team_id": team_id, "formation": lineup.formation, "slot": slot,
                                    "fotmob_position_id": starter.position_id, "tm_id": starter_tm.get(starter.id, ""),
                                    "fotmob_id": starter.id, "name": starter.name})
    except Blocked as error:
        print(f"stopped: {error}")
        raise SystemExit(1)

    players.sort(key=lambda row: (str(row["club_id"]), int(str(row["fotmob_id"]))))
    write_csv(args.data / "fotmob-players.csv", PLAYER_FIELDS, players)
    write_csv(args.data / "fotmob-lineups.csv", LINEUP_FIELDS, lineups)
    matched = sum(1 for row in players if row["tm_id"])
    print(f"{len(done)} clubs, {len(players)} players ({matched} matched to Transfermarkt), {len(lineups) // 11} lineups")
    for failure in failures:
        print("failed:", failure)


if __name__ == "__main__":
    main()
