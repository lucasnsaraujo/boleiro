"""Reads each club's shirt sponsors and kit maker from Wikipedia into data/sponsors.csv.

Séries A, B and C come from the "Personnel and kits" table of the English Wikipedia season article
(kit maker, main sponsor, and the other sponsors by place on the kit where the table lists them), and so
do the clubs of the leagues abroad a coach can take (the world packs' first and second divisions of the
countries in ABROAD_ARTICLES), whose tables name the kit maker and the chest, sleeve and back sponsors.
Série D and the state-only clubs come from the `material` and `patrocinio` fields of each club's
Portuguese Wikipedia infobox, found through Wikidata by Transfermarkt id (P7223).

Every page is read as it stood before Brazil's ban on betting sponsors (25 September 2026), the
game's decision (SPEC §14): the revision current on 24 September. Each row keeps the revision's URL.

Answers are cached in data/sponsors_cache, so a re-run only fetches what is missing. One request a
second, with a generic User-Agent (no personal data).

Usage: .venv/bin/python pipeline/fetch_sponsors.py
"""
from __future__ import annotations

import csv
import gzip
import hashlib
import json
import re
import time
import urllib.parse
from pathlib import Path

import requests
from bs4 import BeautifulSoup

from brand_key import brand_id
from team_key import team_key

ROOT = Path(__file__).resolve().parent.parent
CLUBS = ROOT / "data" / "clubs.csv"
OUT = ROOT / "data" / "sponsors.csv"
CACHE = ROOT / "data" / "sponsors_cache"
HEADERS = {"User-Agent": "Boleiro/0.1 (personal project)"}
PAUSE_SECONDS = 2.0
ATTEMPTS = 6
MAX_WAIT_SECONDS = 30
BEFORE_BAN = "2026-09-24T23:59:59Z"
LEAGUE_ARTICLES = {
    "A": "2026 Campeonato Brasileiro Série A",
    "B": "2026 Campeonato Brasileiro Série B",
    "C": "2026 Campeonato Brasileiro Série C",
}
# "Personnel and kits", "Personnel and sponsoring", "Personnel and sponsorship", "Personnel and sponsors".
KITS_SECTION = "Personnel and"
WORLD_PACKS = ROOT / "packages" / "data" / "pack" / "world"
# The season articles of the leagues abroad whose tables list kits, by the world packs' league id.
ABROAD_ARTICLES = {
    "gb-eng-1": "2026–27 Premier League", "gb-eng-2": "2026–27 EFL Championship",
    "es-1": "2026–27 La Liga", "es-2": "2026–27 Segunda División",
    "it-1": "2026–27 Serie A", "it-2": "2026–27 Serie B",
    "de-1": "2026–27 Bundesliga", "de-2": "2026–27 2. Bundesliga",
    "fr-1": "2026–27 Ligue 1", "fr-2": "2026–27 Ligue 2",
    "pt-1": "2026–27 Primeira Liga", "nl-1": "2026–27 Eredivisie", "be-1": "2026–27 Belgian Pro League",
    "tr-1": "2026–27 Süper Lig", "gb-sct-1": "2026–27 Scottish Premiership", "ar-1": "2026 Argentine Primera División",
    "sa-1": "2026–27 Saudi Pro League", "us-1": "2026 Major League Soccer season", "mx-1": "2026–27 Liga MX season",
}
# The table's places on the kit, as the game names them.
PLACES = {"Front": "front", "Back": "back", "Sleeves": "sleeves", "Shorts": "shorts", "Socks": "socks", "Number": "number"}
PLACE_PATTERN = re.compile(r"(Front|Back|Sleeves|Shorts|Socks|Number):\s*(.*?)(?=\s*(?:Front|Back|Sleeves|Shorts|Socks|Number):|$)")
# Table names that differ from data/clubs.csv in more than team_key folds, checked by hand.
ALIASES = {
    ("A", "athletico-paranaense"): "athletico-pr-pr",
    ("A", "atletico-mineiro"): "atletico-mg-mg",
    ("A", "red-bull-bragantino"): "bragantino-sp",
    ("A", "vasco-da-gama"): "vasco-rj",
    ("A", "sao-paulo"): "sao-paulo-sp",
    ("B", "america-mineiro"): "america-mg-mg",
    ("B", "atletico-goianiense"): "atletico-go-go",
    ("B", "novorizontino"): "gremio-novorizontino-sp",
    ("B", "operario-ferroviario"): "operario-pr-pr",
}
FIELDS = ("club_id", "slot", "rank", "brand_id", "brand", "brand_link", "source_url")


def cached_get(url: str, params: dict[str, object]) -> dict:
    key = hashlib.sha256((url + json.dumps(params, sort_keys=True)).encode()).hexdigest()[:24]
    path = CACHE / f"{key}.json"
    if path.exists():
        return json.loads(path.read_text())
    for attempt in range(ATTEMPTS):
        response = requests.get(url, params=params, headers=HEADERS, timeout=60)
        time.sleep(PAUSE_SECONDS)
        if response.status_code != 429 and response.status_code < 500:
            break
        # Wikimedia asks a busy client to slow down; wait as it says, or longer each time, up to half a minute.
        time.sleep(min(MAX_WAIT_SECONDS, float(response.headers.get("Retry-After") or 0) or 5 * 2 ** attempt))
    response.raise_for_status()
    answer = response.json()
    if "error" in answer:
        raise RuntimeError(f"{url}: {answer['error'].get('info')}")
    CACHE.mkdir(parents=True, exist_ok=True)
    path.write_text(response.text)
    return answer


def api(host: str, **params: object) -> dict:
    return cached_get(f"https://{host}/w/api.php", {"format": "json", "formatversion": 2, **params})


def revision_before_ban(host: str, title: str, content: bool = False) -> dict | None:
    """The page's revision as it stood the day before the ban, or None when the page didn't exist then."""
    answer = api(host, action="query", prop="revisions", titles=title, rvlimit=1, rvstart=BEFORE_BAN, rvdir="older",
                 rvprop="ids|timestamp" + ("|content" if content else ""), rvslots="main", redirects=1)
    page = answer["query"]["pages"][0]
    revisions = page.get("revisions")
    return {**revisions[0], "title": page["title"]} if revisions else None


def latest_revisions(host: str, titles: list[str]) -> dict[str, dict]:
    """Each page's current revision with its wikitext, by the title asked for, fifty pages a request."""
    found: dict[str, dict] = {}
    for start in range(0, len(titles), 50):
        batch = titles[start:start + 50]
        query = api(host, action="query", prop="revisions", titles="|".join(batch), rvprop="ids|timestamp|content", rvslots="main", redirects=1)["query"]
        asked = {item["to"]: item["from"] for item in query.get("redirects", []) + query.get("normalized", [])}
        for page in query["pages"]:
            title = page["title"]
            while title in asked:
                title = asked[title]
            if page.get("revisions"):
                found[title] = {**page["revisions"][0], "title": page["title"]}
    return found


def revision_url(host: str, title: str, revid: int) -> str:
    return f"https://{host}/w/index.php?" + urllib.parse.urlencode({"title": title, "oldid": revid})


def cell_names(cell) -> list[tuple[str, str]]:
    """The names a cell lists, comma-separated, each with the article it links to ('' when none)."""
    for note in cell.find_all("sup"):
        note.decompose()
    links = {a.get_text(" ", strip=True): a.get("title", "") for a in cell.find_all("a")}
    text = cell.get_text(" ", strip=True)
    return [(name, links.get(name, "")) for name in split_names(text)]


def split_names(text: str) -> list[str]:
    names = [re.sub(r"\s+", " ", part).strip(" .;") for part in re.split(r",|<br\s*/?>|\n", text)]
    return [name for name in names if name and name.lower() not in {"none", "—", "-", "n/a"}]


def column_of(header: list[str], *words: str, without: tuple[str, ...] = ()) -> int | None:
    """The first column whose name holds every word and none of `without`, case aside."""
    for i, name in enumerate(header):
        lower = name.lower()
        if all(word in lower for word in words) and not any(word in lower for word in without):
            return i
    return None


def one_club_by_words(league: str, key: str, clubs: dict[tuple[str, str], str]) -> str | None:
    """The league's one club whose name's words hold the table's, or are held by them: "Napoli" is "SSC Napoli"."""
    words = set(key.split("-"))
    found = {club_id for (own, other), club_id in clubs.items() if own == league and (words <= set(other.split("-")) or set(other.split("-")) <= words)}
    return found.pop() if len(found) == 1 else None


def league_rows(league: str, title: str, clubs: dict[tuple[str, str], str]) -> list[dict[str, str]]:
    """The kit table of a league's season article, club by club; `league` is a Série's letter or a world pack's league id."""
    host = "en.wikipedia.org"
    revision = revision_before_ban(host, title)
    if revision is None:
        print(f"{title} has no revision before the ban")
        return []
    sections = api(host, action="parse", oldid=revision["revid"], prop="sections")["parse"]["sections"]
    index = next((s["index"] for s in sections if s["line"].startswith(KITS_SECTION)), None)
    if index is None:
        print(f"{title} has no kit table")
        return []
    html = api(host, action="parse", oldid=revision["revid"], section=index, prop="text")["parse"]["text"]
    # The kit table, not a maintenance banner above it.
    table = next((t for t in BeautifulSoup(html, "lxml").find_all("table") if re.search(r"sponsor|kit", t.find("tr").get_text(" ", strip=True), re.IGNORECASE)), None)
    if table is None:
        print(f"{title} has no kit table")
        return []
    header = [cell.get_text(" ", strip=True) for cell in table.find("tr").find_all(["th", "td"])]
    kit_column = column_of(header, "kit", without=("sponsor",))
    main_column = column_of(header, "sponsor", without=("sleeve", "back", "other", "short"))
    places = {"sleeves": column_of(header, "sleeve"), "back": column_of(header, "back", "sponsor")}
    other_column = column_of(header, "other sponsor")
    source = revision_url(host, revision["title"], revision["revid"])
    rows: list[dict[str, str]] = []
    for tr in table.find_all("tr")[1:]:
        # A cell spanning columns (one sponsor on the chest and sleeves, a "—" over two) counts in each.
        cells = [cell for cell in tr.find_all(["th", "td"]) for _ in range(int(cell.get("colspan") or 1))]
        if len(cells) < len(header):
            continue
        name = cells[0].get_text(" ", strip=True)
        key = team_key(name)
        club_id = ALIASES.get((league, key)) or clubs.get((league, key)) or one_club_by_words(league, key, clubs)
        if club_id is None:
            print(f"{league}: no club for {name!r} ({key})")
            continue

        def add(slot: str, names: list[tuple[str, str]]) -> None:
            for rank, (brand, link) in enumerate(names):
                rows.append({"club_id": club_id, "slot": slot, "rank": str(rank), "brand_id": brand_id(brand), "brand": brand, "brand_link": link, "source_url": source})

        if kit_column is not None:
            add("kit", cell_names(cells[kit_column]))
        if main_column is not None:
            add("master", cell_names(cells[main_column]))
        for slot, place_column in places.items():
            if place_column is not None:
                add(slot, cell_names(cells[place_column]))
        if other_column is not None:
            other = cells[other_column]
            for note in other.find_all("sup"):
                note.decompose()
            links = {a.get_text(" ", strip=True): a.get("title", "") for a in other.find_all("a")}
            text = re.sub(r"^List\s*", "", other.get_text(" ", strip=True))
            for place, listed in PLACE_PATTERN.findall(text):
                add(PLACES[place], [(brand, links.get(brand, "")) for brand in split_names(listed)])
    return rows


def world_clubs() -> dict[tuple[str, str], str]:
    """The world packs' league clubs by (league id, team key of their name or short name)."""
    found: dict[tuple[str, str], str] = {}
    for path in sorted(WORLD_PACKS.glob("*.pack.json.gz")):
        clubs = json.loads(gzip.decompress(path.read_bytes())).get("clubs")
        if not clubs:
            continue
        for club_id, name, short, league in zip(clubs["id"], clubs["name"], clubs["shortName"], clubs["league"]):
            if league:
                for label in (name, short):
                    found.setdefault((league, team_key(label)), club_id)
    return found


def ptwiki_titles(tm_ids: list[str]) -> dict[str, str]:
    """Portuguese Wikipedia article titles by Transfermarkt id, through Wikidata."""
    found: dict[str, str] = {}
    for start in range(0, len(tm_ids), 100):
        values = " ".join(f'"{i}"' for i in tm_ids[start:start + 100])
        query = f"""SELECT ?tm ?title WHERE {{ VALUES ?tm {{ {values} }} ?item wdt:P7223 ?tm .
          ?article schema:about ?item ; schema:isPartOf <https://pt.wikipedia.org/> ; schema:name ?title . }}"""
        answer = cached_get("https://query.wikidata.org/sparql", {"query": query, "format": "json"})
        found.update({row["tm"]["value"]: row["title"]["value"] for row in answer["results"]["bindings"]})
    return found


def infobox_field(wikitext: str, field: str) -> str:
    match = re.search(rf"^\s*\|\s*{field}\s*=(.*)$", wikitext, re.MULTILINE)
    return match.group(1) if match else ""


def wiki_names(value: str) -> list[tuple[str, str]]:
    """The names an infobox value lists (by line breaks or commas), each with the article it links to."""
    value = re.sub(r"<ref[^>]*/>|<ref[^>]*>.*?</ref>|<ref[^>]*>.*$", "", value)
    value = re.sub(r"\{\{[^{}]*\}\}|<!--.*?-->|'''?|<small>|</small>", "", value)
    names: list[tuple[str, str]] = []
    for part in re.split(r"<br\s*/?>|,|\s/\s|;", value):
        link = re.search(r"\[\[([^|\]]+)(?:\|([^\]]+))?\]\]", part)
        text = re.sub(r"\[\[(?:[^|\]]+\|)?([^\]]+)\]\]", r"\1", part).strip(" .")
        if text and text.lower() not in {"nenhum", "sem patrocinador", "não possui", "—", "-"}:
            names.append((text, link.group(1).strip() if link else ""))
    return names


def infobox_rows(clubs: list[dict[str, str]]) -> list[dict[str, str]]:
    host = "pt.wikipedia.org"
    titles = ptwiki_titles([club["tm_id"] for club in clubs])
    latest = latest_revisions(host, sorted(set(titles.values())))
    rows: list[dict[str, str]] = []
    for club in clubs:
        title = titles.get(club["tm_id"])
        revision = latest.get(title) if title else None
        if title and (revision is None or revision["timestamp"] > BEFORE_BAN):
            revision = revision_before_ban(host, title, content=True)
        if revision is None:
            print(f"no Portuguese article for {club['id']}")
            continue
        wikitext = revision["slots"]["main"]["content"]
        source = revision_url(host, revision["title"], revision["revid"])
        for slot, field in (("kit", "material"), ("master", "patrocinio")):
            for rank, (brand, link) in enumerate(wiki_names(infobox_field(wikitext, field))):
                rows.append({"club_id": club["id"], "slot": slot, "rank": str(rank), "brand_id": brand_id(brand), "brand": brand, "brand_link": link and f"pt:{link}", "source_url": source})
    return rows


def main() -> None:
    clubs = list(csv.DictReader(CLUBS.open()))
    by_name: dict[tuple[str, str], str] = {}
    for club in clubs:
        for name in (club["name"], club["short_name"]):
            by_name.setdefault((club["division"], team_key(name)), club["id"])
    rows: list[dict[str, str]] = []
    for division, title in LEAGUE_ARTICLES.items():
        found = league_rows(division, title, by_name)
        print(f"Série {division}: {len({row['club_id'] for row in found})} clubs, {len(found)} rows")
        rows += found
    abroad = world_clubs()
    for league, title in ABROAD_ARTICLES.items():
        found = league_rows(league, title, abroad)
        print(f"{league}: {len({row['club_id'] for row in found})} clubs, {len(found)} rows")
        rows += found
    covered = {row["club_id"] for row in rows}
    rest = [club for club in clubs if club["id"] not in covered]
    found = infobox_rows(rest)
    print(f"infoboxes: {len({row['club_id'] for row in found})} of {len(rest)} clubs, {len(found)} rows")
    rows += found
    with OUT.open("w", newline="") as out:
        writer = csv.DictWriter(out, fieldnames=FIELDS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    print(f"{len(rows)} rows for {len({row['club_id'] for row in rows})} clubs -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
