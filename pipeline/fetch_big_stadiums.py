"""Writes the world's big football grounds into `packages/engine/src/sim/hosts/bigStadiums.ts`.

The source is the English Wikipedia's "List of association football stadiums by capacity", every football ground of
40,000 seats or more, read through the MediaWiki API (cached in data/wiki_cache, generic User-Agent). Each row keeps the
stadium's name, city (in Portuguese where it has its own name), country as the national-teams pack ids it ("brazil", "united-states") and seating capacity. The
game draws hosts and finals' grounds from them (packages/engine/src/sim/hosts/).

Usage: .venv/bin/python pipeline/fetch_big_stadiums.py [--offline]
"""
from __future__ import annotations

import argparse
import csv
import json
import re
from datetime import date
from pathlib import Path

import requests

from import_csv import slugify

ROOT = Path(__file__).resolve().parent.parent
PAGE = "List_of_association_football_stadiums_by_capacity"
CACHE = ROOT / "data" / "wiki_cache" / f"{PAGE}.json"
OUT = ROOT / "packages" / "engine" / "src" / "sim" / "hosts" / "bigStadiums.ts"
USER_AGENT = "Boleiro/0.1 (personal project)"
# The list's country names and codes whose pack id isn't their slug.
COUNTRY_IDS = {
    "prk": "north-korea", "usa": "united-states", "united states": "united-states", "kor": "south-korea", "korea republic": "south-korea",
    "turkey": "turkiye", "türkiye": "turkiye", "czech republic": "czechia", "ireland": "republic-of-ireland", "uae": "united-arab-emirates",
    "ivory coast": "ivory-coast", "côte d'ivoire": "ivory-coast", "dr congo": "democratic-republic-of-the-congo",
    "democratic republic of the congo": "democratic-republic-of-the-congo", "prc": "china", "people's republic of china": "china",
}
# Cities by the names Brazilian fans know them, where Portuguese has its own.
CITY_NAMES = {
    "London": "Londres", "Madrid": "Madri", "Seville": "Sevilha", "Lisbon": "Lisboa", "Munich": "Munique", "Rome": "Roma", "Milan": "Milão",
    "Turin": "Turim", "Naples": "Nápoles", "Florence": "Florença", "Cologne": "Colônia", "Hamburg": "Hamburgo", "Nuremberg": "Nuremberg",
    "Hanover": "Hanôver", "Bremen": "Bremen", "Berlin": "Berlim", "Istanbul": "Istambul", "Athens": "Atenas", "Piraeus": "Pireu",
    "Bucharest": "Bucareste", "Vienna": "Viena", "Warsaw": "Varsóvia", "Moscow": "Moscou", "Saint Petersburg": "São Petersburgo",
    "Kyiv": "Kiev", "Belgrade": "Belgrado", "Budapest": "Budapeste", "Sofia": "Sófia", "Stockholm": "Estocolmo", "Amsterdam": "Amsterdã",
    "Rotterdam": "Roterdã", "Brussels": "Bruxelas", "Marseille": "Marselha", "Dublin": "Dublim", "Edinburgh": "Edimburgo", "Cardiff": "Cardiff",
    "Mexico City": "Cidade do México", "New York City": "Nova York", "Philadelphia": "Filadélfia", "Montevideo": "Montevidéu",
    "Asunción": "Assunção", "Rosario": "Rosário", "Córdoba": "Córdoba", "Cape Town": "Cidade do Cabo", "Johannesburg": "Joanesburgo",
    "Cairo": "Cairo", "Alexandria": "Alexandria", "Riyadh": "Riad", "Jeddah": "Jidá", "Tangier": "Tânger", "Marrakesh": "Marrakech",
    "Fes": "Fez", "Tokyo": "Tóquio", "Seoul": "Seul", "Beijing": "Pequim", "Shanghai": "Xangai", "Baku": "Baku", "Tbilisi": "Tbilisi",
    "Yerevan": "Erevan", "Helsinki": "Helsinque", "Gothenburg": "Gotemburgo", "Lyon": "Lyon", "Bordeaux": "Bordeaux", "Bari": "Bari",
}
# A flag template's code that the national-teams pack doesn't name, as the list writes it.
CODE_IDS = {"IRE": "republic-of-ireland", "IRI": "iran", "IND": "india", "RUS": "russia", "PRK": "north-korea", "CHN": "china", "NGA": "nigeria",
            "MAS": "malaysia", "INA": "indonesia", "THA": "thailand", "HKG": "hong-kong", "UAE": "united-arab-emirates", "KUW": "kuwait"}
LINK = re.compile(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]")
TEMPLATE = re.compile(r"\{\{\s*([^}|]+?)\s*(?:\|\s*([^}|]+?)\s*)?\}\}")
CAPACITY = re.compile(r"^\s*'*\s*(\d{2,3}(?:,\d{3}))")
SHY = re.compile(r"\{\{shy\|([^}]*)\}\}")
MARKS = re.compile("'''|♦")


def pack_codes() -> dict[str, str]:
    """The national-teams pack's ids by FIFA code ("BRA": "brazil")."""
    with (ROOT / "data" / "national-teams.csv").open(encoding="utf-8") as rows:
        return {row["fifa_code"]: row["id"] for row in csv.DictReader(rows)}


def wikitext(is_offline: bool) -> str:
    if not CACHE.exists() and not is_offline:
        response = requests.get("https://en.wikipedia.org/w/api.php", params={"action": "parse", "page": PAGE, "prop": "wikitext", "format": "json",
                                                                              "formatversion": 2}, headers={"User-Agent": USER_AGENT}, timeout=60)
        response.raise_for_status()
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        CACHE.write_text(response.text, encoding="utf-8")
    return json.loads(CACHE.read_text(encoding="utf-8"))["parse"]["wikitext"]


def country_id(name: str) -> str:
    key = name.strip().lower()
    return COUNTRY_IDS.get(key, slugify(key))


def country_of(cell: str, codes: dict[str, str]) -> str | None:
    """The pack id of a flag template: `{{ENG}}`, `{{Flagcountry|Spain}}`, `{{Flagu|Australia}}`."""
    template = TEMPLATE.search(cell)
    if not template:
        return None
    name = template.group(2) or template.group(1)
    return codes.get(name) or CODE_IDS.get(name) or country_id(name)


def text_of(cell: str) -> str:
    """A cell's shown text: its first link's label, without bold, the largest-in-country mark or soft hyphens."""
    cell = SHY.sub(lambda match: match.group(1).replace("|", ""), cell)
    link = LINK.search(cell)
    return MARKS.sub("", (link.group(2) or link.group(1)) if link else cell).strip(" |")


def stadiums(text: str, codes: dict[str, str]) -> list[dict[str, object]]:
    """Each row of the list's sortable table: name, city, country id and capacity, largest first."""
    table = text[text.index("{|class=\"wikitable sortable"):]
    table = table[:table.index("\n|}")]
    rows = []
    for row in table.split("\n|-")[1:]:
        body = re.sub(r"<ref[^>]*/>|<ref[^>]*>.*?</ref>", "", row, flags=re.DOTALL).replace("||", "\n|")
        cells = [re.sub(r'^\s*style\{\{=\}\}"[^"]*"\s*\|', "", line[1:]) for line in body.split("\n") if line.startswith("|")]
        capacity = CAPACITY.match(cells[1]) if len(cells) >= 5 else None
        country = country_of(cells[3], codes) if capacity else None
        # Croke Park is the Gaelic games' ground, not football's.
        if not capacity or not country or "Gaelic" in cells[-1]:
            continue
        city = text_of(cells[4]).split(",")[0].strip()
        rows.append({"name": text_of(cells[0]), "city": CITY_NAMES.get(city, city), "country": country,
                     "capacity": int(capacity.group(1).replace(",", ""))})
    return sorted(rows, key=lambda row: (-int(row["capacity"]), str(row["name"])))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--offline", action="store_true")
    args = parser.parse_args()
    rows = stadiums(wikitext(args.offline), pack_codes())
    read_on = date.fromtimestamp(CACHE.stat().st_mtime).isoformat()
    lines = [
        "// Generated by pipeline/fetch_big_stadiums.py; edit the script, not this file.",
        f"// Source: https://en.wikipedia.org/wiki/{PAGE}, read {read_on}: every football ground of 40,000 seats or more.",
        "",
        'import type { Stadium } from "./venue.js";',
        "",
        "/** The world's football grounds of 40,000 seats or more, largest first. */",
        "export const BIG_STADIUMS: readonly Stadium[] = [",
    ]
    for row in rows:
        lines.append("  { " + ", ".join(f"{key}: {json.dumps(value, ensure_ascii=False)}" for key, value in row.items()) + " },")
    lines += ["];", ""]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"{len(rows)} stadiums -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
