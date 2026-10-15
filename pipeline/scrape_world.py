"""Scrapes the v1 world's squads from Transfermarkt into a new snapshot of the master database.

For every country in tm_world.py: each league's clubs, each club's detailed squad, its colours
(facts page) and crest; then the Champions/Europa League draw (checked against the world), the
Club World Cup's other clubs, and the national teams' last squads. Pages come through tm_fetch's
cache, so a second run, or one resumed after a crash, only downloads what is missing. A page that
keeps failing is logged and skipped; the summary at the end lists every one. When the site refuses
too many requests in a row the run stops and writes no snapshot; the cache keeps what it got.
`--offline` builds the snapshot from the cache alone and never asks the site.

Usage: .venv/bin/python pipeline/scrape_world.py pipeline/boleiro.db [--countries br,gb-eng]
         [--no-national-teams] [--no-guests] [--delay 3] [--max-age-days 7] [--offline]
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import sqlite3
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Iterable

import tm_pages
import tm_world
from import_csv import SCHEMA, png_size, slugify
from positions import GROUP_OF_ROLE
from tm_fetch import Blocked, FetchError, Fetcher, cache_name

ROOT = Path(__file__).resolve().parent.parent
SEASON = 2026
FALLBACK_COLOURS = ("#FFFFFF", "#000000")


@dataclass
class Run:
    snapshot: int
    clubs: int = 0
    players: int = 0
    national_teams: int = 0
    failures: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


@dataclass
class Scraper:
    db: sqlite3.Connection
    fetcher: Fetcher
    run: Run
    known_club_ids: dict[str, str]
    max_age_days: float
    log: Callable[[str], None]
    club_ids: dict[str, str] = field(default_factory=dict)       # Transfermarkt id -> our club id
    club_seq: int = 0
    player_seq: int = 0

    def page(self, path: str) -> str | None:
        try:
            return self.fetcher.page(path, self.max_age_days).html
        except FetchError as error:
            self.run.failures.append(str(error))
            self.log(f"  failed: {error}")
            return None

    def squad(self, ref: tm_pages.ClubRef) -> tm_pages.Squad | None:
        """A club's or national team's squad page; one that came back as something else is dropped from the cache."""
        path = f"/{ref.slug}/kader/verein/{ref.tm_id}/plus/1"
        html = self.page(path)
        if html is None:
            return None
        try:
            return tm_pages.squad(html)
        except ValueError as error:
            (self.fetcher.cache / cache_name(path)).unlink(missing_ok=True)
            self.run.failures.append(f"{error} on {path}")
            self.log(f"  failed: {error} on {path}")
            return None

    def insert(self, table: str, *values: object, verb: str = "INSERT") -> None:
        marks = ", ".join("?" for _ in range(len(values) + 1))
        self.db.execute(f"{verb} INTO {table} VALUES ({marks})", (self.run.snapshot, *values))

    def insert_or_ignore(self, table: str, *values: object) -> None:
        self.insert(table, *values, verb="INSERT OR IGNORE")

    def competition(self, competition_id: str, country: str | None, path: str, kind: str, tier: int | None, code: str | None) -> str | None:
        html = self.page(path)
        if html is None:
            return None
        name, _ = tm_pages.competition_header(html)
        self.insert("competitions", competition_id, country, name, kind, tier, code, SEASON)
        return html

    def club(self, ref: tm_pages.ClubRef, country: str | None, league_id: str | None) -> str | None:
        """Scrapes one club into the snapshot and returns its id; `country` None takes it from the page."""
        if ref.tm_id in self.club_ids:
            return self.club_ids[ref.tm_id]
        squad = self.squad(ref)
        if squad is None:
            return None
        if country is None:
            country = self.guest_country(squad.country or "")
        club_id = self.known_club_ids.get(ref.tm_id, f"tm-{ref.tm_id}")
        self.club_ids[ref.tm_id] = club_id
        colours = self.colours(ref.tm_id)
        stadium_slug = slugify(squad.stadium or "")
        stadium_id = f"{stadium_slug}-{country.lower()}" if stadium_slug else f"tm-{ref.tm_id}-ground"
        self.db.execute(
            "INSERT OR IGNORE INTO stadiums VALUES (?, ?, ?, ?, NULL, ?, 'natural')",
            (self.run.snapshot, stadium_id, squad.stadium or "", country.upper(), squad.capacity or 0),
        )
        primary, secondary = (colours + colours[:1])[:2] if colours else FALLBACK_COLOURS
        self.insert("clubs", club_id, self.club_seq, country.upper(), None, squad.name, squad.name, league_id, stadium_id,
                    primary, secondary, 0)
        self.club_seq += 1
        self.insert("external_ids", "club", club_id, "transfermarkt", ref.tm_id)
        sources = {
            "names": "transfermarkt", "short_name": "guess", "division": "transfermarkt",
            "stadium": "transfermarkt" if squad.stadium else "missing", "pitch": "guess",
            "colours": "transfermarkt" if colours else "guess", "fanbase": "missing",
        }
        for name, source in sources.items():
            self.insert("field_sources", "club", club_id, name, source)
        if squad.crest:
            self.crest(club_id, squad.crest)
        for player in squad.players:
            self.player(club_id, player)
        self.run.clubs += 1
        self.log(f"  {squad.name}: {len(squad.players)} players")
        return club_id

    def guest_country(self, name: str) -> str:
        known = {country.name: country.id for country in tm_world.COUNTRIES}
        found = known.get(name) or tm_world.GUEST_COUNTRIES.get(name)
        if found is None:
            found = slugify(name) or "unknown"
            self.run.warnings.append(f"no country id for {name!r}, using {found!r}")
        if not self.db.execute("SELECT 1 FROM countries WHERE snapshot_id = ? AND code = ?", (self.run.snapshot, found.upper())).fetchone():
            self.insert("countries", found.upper(), name)
        return found

    def colours(self, tm_id: str) -> list[str]:
        html = self.page(f"/x/datenfakten/verein/{tm_id}")
        return tm_pages.club_colours(html) if html else []

    def crest(self, club_id: str, image: str) -> None:
        try:
            file, url = self.fetcher.image(image, self.max_age_days * 4)
            width, height = png_size(file)
        except (FetchError, RuntimeError) as error:
            self.run.failures.append(f"crest of {club_id}: {error}")
            return
        path = file.resolve()
        stored = str(path.relative_to(ROOT)) if ROOT in path.parents else str(path)
        sha = hashlib.sha256(file.read_bytes()).hexdigest()
        self.insert("images", "club", club_id, "crest", stored, sha, width, height, url)

    def player(self, club_id: str, player: tm_pages.SquadPlayer) -> None:
        player_id = f"tm-{player.tm_id}"
        if self.db.execute("SELECT 1 FROM players WHERE snapshot_id = ? AND id = ?", (self.run.snapshot, player_id)).fetchone():
            self.run.warnings.append(f"{player.name} ({player_id}) listed by two clubs; kept the first")
            return
        group = GROUP_OF_ROLE.get(player.role or "", "MID")
        self.insert("players", player_id, self.player_seq, club_id, player.name, player.birth_date, player.age,
                    "/".join(player.nationalities), player.foot, group, None, None, player.market_value_eur,
                    player.contract_until, player.role)
        self.insert("external_ids", "player", player_id, "transfermarkt", player.tm_id)
        self.insert("player_positions", player_id, 0, player.position or "unknown", "transfermarkt")
        if player.role is None:
            self.insert("field_sources", "player", player_id, "position_group", "guess")
        self.player_seq += 1
        self.run.players += 1

    def country(self, country: tm_world.Country) -> None:
        self.log(f"{country.name}")
        self.insert("countries", country.id.upper(), country.name)
        for league in country.leagues:
            league_id = f"{country.id}-{league.tier}"
            html = self.competition(league_id, country.id.upper(), league.clubs_page, "league", league.tier, league.code)
            clubs = tm_pages.participants(html) if html else []
            self.log(f" {league.code}: {len(clubs)} clubs")
            if html is not None and not clubs:
                (self.fetcher.cache / cache_name(league.clubs_page)).unlink(missing_ok=True)
                self.run.failures.append(f"no clubs on {league.clubs_page}")
            for ref in clubs:
                self.club(ref, country.id, league_id)
        if country.cup:
            self.competition(f"{country.id}-cup", country.id.upper(), f"/x/startseite/pokalwettbewerb/{country.cup}", "cup", None, country.cup)

    def entries(self, competition: tm_world.Competition, take_guests: bool) -> None:
        html = self.competition(competition.id, None, competition.path, "continental", None, None)
        if html is None:
            return
        for seq, ref in enumerate(tm_pages.participants(html)):
            club_id = self.club_ids.get(ref.tm_id) or (self.club(ref, None, None) if take_guests else None)
            if club_id is None:
                self.run.warnings.append(f"{competition.id}: {ref.name} ({ref.tm_id}) plays outside the scraped world")
                continue
            self.insert("competition_clubs", competition.id, seq, club_id)

    def national_teams(self, lists: Iterable[str]) -> None:
        refs: dict[str, tm_pages.ClubRef] = {}
        for path in lists:
            html = self.page(path)
            for ref in tm_pages.participants(html) if html else []:
                refs.setdefault(ref.tm_id, ref)
        self.log(f"national teams: {len(refs)}")
        for seq, ref in enumerate(refs.values()):
            squad = self.squad(ref)
            if squad is None:
                continue
            team_id = slugify(squad.name)
            if not team_id or self.db.execute("SELECT 1 FROM national_teams WHERE snapshot_id = ? AND id = ?", (self.run.snapshot, team_id)).fetchone():
                team_id = f"tm-{ref.tm_id}"
            self.insert("national_teams", team_id, seq, squad.name, squad.confederation)
            self.insert("external_ids", "national_team", team_id, "transfermarkt", ref.tm_id)
            for rank, player in enumerate(squad.players):
                self.insert_or_ignore("national_team_players", team_id, rank, f"tm-{player.tm_id}", player.name, player.birth_date,
                            player.position, player.role, player.club_tm_id, player.club_name, player.market_value_eur,
                            player.caps, player.goals)
            self.run.national_teams += 1
            self.log(f"  {squad.name}: {len(squad.players)} players")


def scrape_world(
    db: sqlite3.Connection,
    fetcher: Fetcher,
    countries: Iterable[tm_world.Country],
    draws: Iterable[tm_world.Competition] = (),
    club_world_cup: tm_world.Competition | None = None,
    national_team_lists: Iterable[str] = (),
    known_club_ids: dict[str, str] | None = None,
    max_age_days: float = 7,
    log: Callable[[str], None] = print,
) -> Run:
    """Writes one `transfermarkt` snapshot; `known_club_ids` keeps a club's existing id (Brazil's "bahia-ba")."""
    db.executescript(SCHEMA.read_text())
    countries = list(countries)
    taken_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    note = "countries " + ",".join(country.id for country in countries)
    snapshot = db.execute("INSERT INTO snapshots (taken_at, kind, note) VALUES (?, 'transfermarkt', ?)", (taken_at, note)).lastrowid
    scraper = Scraper(db, fetcher, Run(snapshot), known_club_ids or {}, max_age_days, log)
    for country in countries:
        scraper.country(country)
    for draw in draws:
        scraper.entries(draw, take_guests=False)
    if club_world_cup:
        scraper.entries(club_world_cup, take_guests=True)
    scraper.national_teams(national_team_lists)
    return scraper.run


def brazil_club_ids(clubs_csv: Path) -> dict[str, str]:
    """Transfermarkt id -> the id Brazil's CSVs give the club, so both snapshots name it alike."""
    with clubs_csv.open(newline="", encoding="utf-8") as handle:
        return {row["tm_id"]: row["id"] for row in csv.DictReader(handle)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("db", type=Path)
    parser.add_argument("--countries", help="comma-separated ids from tm_world.py; all when left out")
    parser.add_argument("--no-national-teams", action="store_true")
    parser.add_argument("--no-guests", action="store_true", help="skip the draw check and the Club World Cup's other clubs")
    parser.add_argument("--delay", type=float, default=3.0, help="seconds after each page request (at least 2)")
    parser.add_argument("--max-age-days", type=float, default=7, help="refetch cached pages older than this")
    parser.add_argument("--cache", type=Path, default=ROOT / "data" / "tm_cache")
    parser.add_argument("--offline", action="store_true", help="read only the cache, whatever its age; never ask the site")
    args = parser.parse_args()

    wanted = set(args.countries.split(",")) if args.countries else None
    countries = [country for country in tm_world.COUNTRIES if wanted is None or country.id in wanted]
    unknown = (wanted or set()) - {country.id for country in countries}
    if unknown:
        parser.error(f"unknown countries: {', '.join(sorted(unknown))}")
    fetcher = Fetcher(args.cache, delay=args.delay, is_offline=args.offline)
    started = time.monotonic()
    try:
        with sqlite3.connect(args.db) as db:
            run = scrape_world(
                db, fetcher, countries,
                draws=() if args.no_guests else tm_world.DRAWS,
                club_world_cup=None if args.no_guests else tm_world.CLUB_WORLD_CUP,
                national_team_lists=() if args.no_national_teams else tm_world.NATIONAL_TEAM_LISTS,
                known_club_ids=brazil_club_ids(ROOT / "data" / "clubs.csv"),
                max_age_days=args.max_age_days,
            )
    except Blocked as error:
        raise SystemExit(f"stopped, no snapshot written: {error}. Run again later; the cache keeps every page so far.")
    elapsed = time.monotonic() - started
    print(f"\nsnapshot {run.snapshot}: {run.clubs} clubs, {run.players} players, {run.national_teams} national teams")
    print(f"{elapsed:.0f} s, {fetcher.requests} live requests, {elapsed / max(run.clubs + run.national_teams, 1):.1f} s per squad")
    for warning in run.warnings:
        print(f"warning: {warning}")
    for failure in run.failures:
        print(f"failed: {failure}")


if __name__ == "__main__":
    main()
