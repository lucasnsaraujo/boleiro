from __future__ import annotations

import csv
import re
import sys
import unicodedata
from pathlib import Path

from scrape_tm import COMPETITIONS, STATE_CHAMPIONSHIPS, club_ids, fetch, state_championship_clubs

BRAZIL_POPULATION = 213_421_037
FANBASE_GUESS = {"A": 800_000, "B": 500_000, "C": 200_000, "D": 80_000, "": 20_000}
CAPACITY_GUESS = {"A": 30_000, "B": 15_000, "C": 8_000, "D": 5_000, "": 3_000}
EDGE_WORDS = {
    "aa", "ac", "ad", "ae", "ca", "ce", "cr", "ec", "fc", "sc", "se", "ser", "aad", "acd", "ga", "ltda", "cf", "fr",
    "associacao", "associação", "asociação", "atletica", "atlética", "atletico", "atlético", "clube", "club", "de", "do", "da", "dos",
    "esporte", "esportiva", "esportivo", "futebol", "football", "foot-ball", "sport", "sporting", "sociedade",
    "regatas", "e", "desportiva", "desportivo", "recreativo", "social", "agremiação", "sportiva", "ltda.",
}
KEEP_FIRST = {"atlético", "atletico", "américa"}
SEATS = re.compile(r"Stadium:\s*(.+?)\s+([\d.]+)\s+Seats")
STATE_SUFFIX = re.compile(r"\(([A-Z]{2})\)\s*$")


def slugify(text: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", ascii_text).strip("-")


def short_name(name: str) -> str:
    words = STATE_SUFFIX.sub("", name).split()
    while len(words) > 1 and words[0].lower() in EDGE_WORDS and words[0].lower() not in KEEP_FIRST:
        words.pop(0)
    while len(words) > 1 and words[-1].lower() in EDGE_WORDS:
        words.pop()
    return " ".join(words)


def colours(club_id: str) -> list[str]:
    soup = fetch(f"/x/datenfakten/verein/{club_id}")
    return [match.upper() for match in re.findall(r"background-color:\s*(#[0-9A-Fa-f]{6})", str(soup.select_one("table.profilheader")))]


def load_facts(path: Path) -> dict[str, dict[str, tuple[str, str]]]:
    facts: dict[str, dict[str, tuple[str, str]]] = {}
    for row in csv.DictReader(path.open()):
        facts.setdefault(row["tm_id"], {})[row["field"]] = (row["value"], row["source"])
    return facts


def build(facts: dict[str, dict[str, tuple[str, str]]], wiki_colours: dict[str, dict[str, str]], squad_slugs: dict[str, str]) -> list[dict[str, object]]:
    divisions: dict[str, str] = {}
    for division, path in COMPETITIONS.items():
        for club_id in club_ids(path):
            divisions.setdefault(club_id, division)
    states: dict[str, str] = {}
    for state, code in STATE_CHAMPIONSHIPS.items():
        for club_id in state_championship_clubs(code):
            states.setdefault(club_id, state)

    clubs = []
    for club_id in sorted(set(divisions) | set(states), key=int):
        division = divisions.get(club_id, "")
        fact = facts.get(club_id, {})
        soup = fetch(f"/{squad_slugs[club_id]}/kader/verein/{club_id}/plus/1")
        name = soup.select_one("h1").get_text(strip=True)
        seats = SEATS.search(soup.select_one(".data-header").get_text(" ", strip=True))
        suffix = STATE_SUFFIX.search(name)

        if "state" in fact:
            state, state_source = fact["state"]
        elif club_id in states:
            state, state_source = states[club_id], f"transfermarkt: 2026 {states[club_id]} state championship"
        elif suffix:
            state, state_source = suffix.group(1), "transfermarkt: club name"
        else:
            raise RuntimeError(f"no state for {club_id} {name}; add it to the facts file")

        if "stadium" in fact:
            stadium, stadium_source = fact["stadium"]
            capacity = int(fact["capacity"][0])
        elif seats and int(seats.group(2).replace(".", "")) > 0:
            stadium, capacity, stadium_source = seats.group(1), int(seats.group(2).replace(".", "")), "transfermarkt"
        elif seats:
            stadium, capacity, stadium_source = seats.group(1), CAPACITY_GUESS[division], "transfermarkt (stadium); guess (capacity)"
        else:
            stadium, capacity, stadium_source = f"Estádio de {short_name(name)}", CAPACITY_GUESS[division], "guess"

        found = colours(club_id)
        if "primary_colour" in fact:
            primary, secondary, colours_source = fact["primary_colour"][0], fact["secondary_colour"][0], fact["primary_colour"][1]
        elif len(found) >= 2:
            primary, secondary, colours_source = found[0], found[1], "transfermarkt"
        elif club_id in wiki_colours:
            wiki = wiki_colours[club_id]
            primary, secondary, colours_source = wiki["primary_colour"], wiki["secondary_colour"], wiki["source"]
        elif found:
            primary, secondary, colours_source = found[0], "#FFFFFF", "transfermarkt (primary); guess (secondary)"
        else:
            primary, secondary, colours_source = "#1F3A93", "#FFFFFF", "guess"

        if "fanbase_share" in fact:
            share, fanbase_source = fact["fanbase_share"]
            fanbase = round(float(share) / 100 * BRAZIL_POPULATION)
        else:
            fanbase, fanbase_source = FANBASE_GUESS[division], "guess"

        if "pitch" in fact:
            pitch, pitch_source = fact["pitch"]
        elif division == "A":
            pitch, pitch_source = "natural", "not on the Série A 2026 synthetic-pitch lists (band.com.br, itatiaia.com.br)"
        else:
            pitch, pitch_source = "natural", "guess"
        short = fact.get("short_name", (short_name(name), ""))[0]
        clubs.append({
            "id": f"{slugify(short)}-{state.lower()}",
            "tm_id": club_id,
            "name": name,
            "short_name": short,
            "state": state,
            "division": division,
            "stadium": stadium,
            "capacity": capacity,
            "pitch": pitch,
            "primary_colour": primary,
            "secondary_colour": secondary,
            "fanbase": fanbase,
            "names_source": "transfermarkt" + ("; short name: curated" if "short_name" in fact else ""),
            "state_source": state_source,
            "division_source": f"transfermarkt: Série {division} 2026" if division else "transfermarkt: plays only its state championship in 2026",
            "stadium_source": stadium_source,
            "pitch_source": pitch_source,
            "colours_source": colours_source,
            "fanbase_source": fanbase_source,
        })
    ids = [club["id"] for club in clubs]
    duplicates = {club_id for club_id in ids if ids.count(club_id) > 1}
    if duplicates:
        raise RuntimeError(f"duplicate club ids {duplicates}; add a short_name fact")
    return clubs


def main() -> None:
    facts_path, wiki_path, out_path = (Path(arg) for arg in sys.argv[1:4])
    squad_slugs: dict[str, str] = {}
    for path in COMPETITIONS.values():
        squad_slugs.update(club_ids(path))
    for code in STATE_CHAMPIONSHIPS.values():
        for cid, slug in state_championship_clubs(code).items():
            squad_slugs.setdefault(cid, slug)
    wiki_colours = {row["tm_id"]: row for row in csv.DictReader(wiki_path.open())} if wiki_path.exists() else {}
    clubs = build(load_facts(facts_path), wiki_colours, squad_slugs)
    with out_path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(clubs[0]))
        writer.writeheader()
        writer.writerows(sorted(clubs, key=lambda club: (club["division"] or "Z", club["state"], club["name"])))
    print(f"{len(clubs)} clubs written to {out_path}")


if __name__ == "__main__":
    main()
