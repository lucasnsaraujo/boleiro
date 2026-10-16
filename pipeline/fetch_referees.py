"""Fetches each competition's real referees and their profiles, and how often VAR changed a decision, from FotMob.

For every competition below, the league page lists the season's matches; the newest `--matches`
finished ones get their match details, which name the referee and carry his stats for the league
season so far (matches, yellows per match with the league's average, reds, penalties, fouls per
match with the league's average) and the VAR events that changed a decision (goal ruled out,
penalty cancelled, red card removed; FotMob logs no "checked, no change"). A referee seen in
several of a competition's matches (by FotMob id) keeps the stats of his newest one; the state
championships' referees come without stats and are kept by name. Many matches name no referee (in
the 2026-10-16 crawl, all but one of the Série C and D ones; an older scan missed 45% of Série A's):
they count in the coverage, never as a referee.

Writes data/referees.csv (one row per competition and referee), data/referee-coverage.csv (one row
per competition: matches read, matches with a referee, VAR decisions by kind) and the engine's
roster, packages/data/src/refereeRoster.ts, generated from the referees.

Pages come through tm_fetch's cache (data/fotmob_cache), at `--delay` seconds apart (never under 2).
`--offline` reads only the cache.

Usage: .venv/bin/python pipeline/fetch_referees.py data [--delay 2] [--matches 30] [--max-age-days 30] [--offline]
"""
from __future__ import annotations

import argparse
import csv
import json
from dataclasses import dataclass, field
from pathlib import Path

from tm_fetch import Blocked, FetchError, Fetcher

ROOT = Path(__file__).resolve().parent.parent
BASE = "https://www.fotmob.com"
ROSTER_MODULE = ROOT / "packages" / "data" / "src" / "refereeRoster.ts"
# The game's competitions with a FotMob league: Brazil's series ("br-A".."br-D"), the Copa do Brasil
# ("br-cup"), the state championships FotMob covers ("br-state-SP"), CONMEBOL's cups by the game's
# cup id, and the top league of the countries abroad ("<country>-<level>", the game's country ids).
# FotMob league ids from `/api/data/allLeagues`.
COMPETITIONS = {
    "br-A": 268, "br-B": 8814, "br-C": 8971, "br-D": 9464, "br-cup": 9067,
    "br-state-SP": 10244, "br-state-RJ": 10272, "br-state-MG": 10273, "br-state-RS": 10274,
    "libertadores": 45, "sul-americana": 299,
    "gb-eng-0": 47, "es-0": 87, "it-0": 55, "de-0": 54, "fr-0": 53, "pt-0": 61, "nl-0": 57, "ar-0": 112,
}
VAR_KINDS = {"var_goal_cancelled": "goalCancelled", "var_penalty_cancelled": "penaltyCancelled", "var_red_card_cancelled": "redCardCancelled"}
REFEREE_FIELDS = ["competition", "fotmob_league_id", "name", "fotmob_id", "country", "appearances", "stats_league_id", "stats_league",
                  "matches", "yellows_per_match", "league_yellows_per_match", "reds", "penalties", "fouls_per_match",
                  "league_fouls_per_match", "seen_on"]
COVERAGE_FIELDS = ["competition", "fotmob_league_id", "league", "season", "matches_read", "with_referee", "var_goal_cancelled",
                   "var_penalty_cancelled", "var_red_card_cancelled", "var_other", "first_match", "last_match"]


@dataclass
class Coverage:
    league: str = ""
    season: str = ""
    matches: int = 0
    with_referee: int = 0
    var: dict[str, int] = field(default_factory=lambda: {"goalCancelled": 0, "penaltyCancelled": 0, "redCardCancelled": 0, "other": 0})
    dates: list[str] = field(default_factory=list)


def is_json(text: str) -> bool:
    return text.lstrip().startswith("{")


def stat(stats: list[dict[str, object]], kind: str) -> dict[str, object]:
    return next((s for s in stats if s.get("type") == kind), {})


def number(value: object) -> float:
    return float(value) if isinstance(value, (int, float)) else 0.0


def referee_row(competition: str, league_id: int, referee: dict[str, object], seen_on: str) -> dict[str, object] | None:
    if not referee.get("text"):
        return None
    # FotMob names the state championships' referees without stats: they are kept, with none.
    stats = referee.get("stats") if isinstance(referee.get("stats"), list) else []
    matches = number(stat(stats, "matches").get("value"))
    yellows = stat(stats, "yellowCards")
    fouls = stat(stats, "fouls")
    if matches <= 0 or not yellows:
        matches, yellows, fouls = 0, {}, {}
    return {
        "competition": competition, "fotmob_league_id": league_id, "name": str(referee["text"]).strip(),
        "fotmob_id": referee.get("id", ""), "country": referee.get("country", ""), "appearances": 1,
        "stats_league_id": referee.get("leagueId", ""), "stats_league": referee.get("leagueName", ""), "matches": int(matches),
        "yellows_per_match": number(yellows.get("value")), "league_yellows_per_match": number(yellows.get("average")),
        "reds": int(number(stat(stats, "redCards").get("value"))), "penalties": int(number(stat(stats, "penalties").get("value"))),
        "fouls_per_match": number(fouls.get("value")), "league_fouls_per_match": number(fouls.get("average")), "seen_on": seen_on,
    }


def var_kinds(details: dict[str, object]) -> list[str]:
    try:
        events = details["content"]["matchFacts"]["events"]["events"]  # type: ignore[index]
    except (KeyError, TypeError):
        return []
    kinds = []
    for event in events or []:
        if event.get("type") != "VAR":
            continue
        keys = ((event.get("VAR") or {}).get("decision") or {}).get("key") or []
        kinds.append(next((VAR_KINDS[k] for k in keys if k in VAR_KINDS), "other"))
    return kinds


def ts_string(value: object) -> str:
    return json.dumps(str(value), ensure_ascii=False)


def write_roster(referees: list[dict[str, object]]) -> None:
    lines = [
        "// Generated by pipeline/fetch_referees.py from FotMob's match details; edit the script, not this file.",
        "",
        "/**",
        " * A real referee's profile: his stats for the league season FotMob gave, and that league's averages.",
        " * A referee FotMob names without stats has zeros there, and `matches` counts the crawl's matches he refereed.",
        " */",
        "export type RefereeProfile = {",
        "  name: string;",
        "  /** Matches in the stats' league season; how often each referee is drawn. */",
        "  matches: number;",
        "  yellowsPerMatch: number;",
        "  leagueYellowsPerMatch: number;",
        "  reds: number;",
        "  penalties: number;",
        "  foulsPerMatch: number;",
        "  leagueFoulsPerMatch: number;",
        "};",
        "",
        "/** Each competition's referees, by the game's key (\"br-A\", \"br-state-SP\", \"libertadores\", \"gb-eng-0\"). */",
        "export const REFEREE_ROSTER: Record<string, readonly RefereeProfile[]> = {",
    ]
    for competition in COMPETITIONS:
        rows = [r for r in referees if r["competition"] == competition]
        if not rows:
            continue
        lines.append(f"  {ts_string(competition)}: [")
        for r in rows:
            lines.append(
                f"    {{ name: {ts_string(r['name'])}, matches: {r['matches'] or r['appearances']}, yellowsPerMatch: {r['yellows_per_match']}, "
                f"leagueYellowsPerMatch: {r['league_yellows_per_match']}, reds: {r['reds']}, penalties: {r['penalties']}, "
                f"foulsPerMatch: {r['fouls_per_match']}, leagueFoulsPerMatch: {r['league_fouls_per_match']} }},"
            )
        lines.append("  ],")
    lines += ["};", ""]
    ROSTER_MODULE.write_text("\n".join(lines), encoding="utf-8")


def write_csv(path: Path, fields: list[str], rows: list[dict[str, object]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("data", type=Path)
    parser.add_argument("--delay", type=float, default=2.0)
    parser.add_argument("--matches", type=int, default=30, help="newest finished matches read per competition")
    parser.add_argument("--max-age-days", type=float, default=30, help="refetch cached pages older than this")
    parser.add_argument("--cache", type=Path, default=ROOT / "data" / "fotmob_cache")
    parser.add_argument("--offline", action="store_true", help="read only the cache, whatever its age; never ask the site")
    args = parser.parse_args()
    fetcher = Fetcher(args.cache, delay=args.delay, is_offline=args.offline, base=BASE)

    referees: dict[tuple[str, str], dict[str, object]] = {}
    coverage: dict[str, Coverage] = {}
    failures: list[str] = []
    try:
        for competition, league_id in COMPETITIONS.items():
            try:
                page = fetcher.page(f"/api/data/leagues?id={league_id}", args.max_age_days, is_valid=is_json)
            except FetchError as error:
                failures.append(f"{competition}: {error}")
                continue
            league = json.loads(page.html)
            finished = [m for m in league.get("fixtures", {}).get("allMatches", []) if (m.get("status") or {}).get("finished")]
            finished.sort(key=lambda m: m["status"].get("utcTime", ""), reverse=True)
            seen = coverage.setdefault(competition, Coverage(league=league.get("details", {}).get("name", ""),
                                                             season=str(league.get("details", {}).get("selectedSeason", ""))))
            for match in finished[: args.matches]:
                try:
                    details_page = fetcher.page(f"/api/data/matchDetails?matchId={match['id']}", args.max_age_days, is_valid=is_json)
                except FetchError as error:
                    failures.append(f"{competition} match {match['id']}: {error}")
                    continue
                details = json.loads(details_page.html)
                date = str(match["status"].get("utcTime", ""))[:10]
                seen.matches += 1
                seen.dates.append(date)
                for kind in var_kinds(details):
                    seen.var[kind] += 1
                referee = ((details.get("content") or {}).get("matchFacts") or {}).get("infoBox", {}).get("Referee") or {}
                if not referee.get("text"):
                    continue
                seen.with_referee += 1
                # FotMob spells a few names two ways ("Araujo", "Araújo"); its id is the same.
                key = (competition, str(referee.get("id") or referee["text"]).strip())
                if key in referees:
                    referees[key]["appearances"] = int(str(referees[key]["appearances"])) + 1
                    continue
                row = referee_row(competition, league_id, referee, date)
                if row:
                    referees[key] = row
            print(f"{competition}: {seen.matches} matches, {seen.with_referee} with a referee, "
                  f"{sum(1 for k in referees if k[0] == competition)} referees, VAR {seen.var}")
    except Blocked as error:
        print(f"stopped: {error}")
        raise SystemExit(1)

    rows = sorted(referees.values(), key=lambda r: (list(COMPETITIONS).index(str(r["competition"])), str(r["name"])))
    write_csv(args.data / "referees.csv", REFEREE_FIELDS, rows)
    write_csv(args.data / "referee-coverage.csv", COVERAGE_FIELDS, [
        {"competition": competition, "fotmob_league_id": COMPETITIONS[competition], "league": c.league, "season": c.season,
         "matches_read": c.matches, "with_referee": c.with_referee, "var_goal_cancelled": c.var["goalCancelled"],
         "var_penalty_cancelled": c.var["penaltyCancelled"], "var_red_card_cancelled": c.var["redCardCancelled"],
         "var_other": c.var["other"], "first_match": min(c.dates, default=""), "last_match": max(c.dates, default="")}
        for competition, c in coverage.items()
    ])
    write_roster(rows)
    print(f"{len(rows)} referees in {len({r['competition'] for r in rows})} competitions")
    for failure in failures:
        print("failed:", failure)


if __name__ == "__main__":
    main()
