"""Fetches the real derbies between the game's clubs from Wikipedia's rivalry lists.

Reads English Wikipedia's four continental lists (Europe, the Americas, Africa, Asia and Oceania)
and every country list they send to with `{{Main|...}}` (Brazil's derbies, Argentina's, Germany's,
the United Kingdom's...). A list line that links two to four of the game's clubs is a derby between
each pair of them. Clubs are matched by their Wikipedia article: Wikidata gives the English article
of each Transfermarkt club id (property P7223) the packs carry, and the lists' links are followed
through redirects to the same titles (the API's links of each page, redirects resolved).

A line's name for the derby is kept when it is one: a local name ("Clássico da Rivalidade"), not an English
one ("London derby"), a city heading ("Córdoba") or table markup; the game calls the rest "Clássico". In
Brazil's list a link to a namesake club of another state stands for the club of the state section it sits in.

Intensity 1-5: the pairs in HAND_RATED keep the rating written there; the others are ranked by
Wikipedia attention over the last 60 days (Wikimedia pageviews, through the Action API) among all the derbies
of their country: the derby article's views when the line links one that is that derby alone (not a list or
a city's derbies), else the smaller club's article views times the median ratio of derby to club views
among the pairs that have both. The rank sets the intensity (INTENSITY_SHARES).

Writes data/derbies.csv (one row per pair, with the list page it came from) and the engine's table,
packages/data/src/derbies.ts, generated from it. Answers are cached in data/wiki_cache
(git-ignored); requests go out at least `--delay` seconds apart with a generic User-Agent that names
no person or account. `--offline` reads only the cache.

Usage: python3 pipeline/fetch_derbies.py [--delay 1] [--offline]
"""
from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import json
import math
import re
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Callable

ROOT = Path(__file__).resolve().parent.parent
USER_AGENT = "Boleiro/0.1 (personal project)"
WIKI = "https://en.wikipedia.org"
WORLD_PACKS = ROOT / "packages" / "data" / "pack" / "world"
BRAZIL_CLUBS = ROOT / "data" / "clubs.csv"
CSV_OUT = ROOT / "data" / "derbies.csv"
MODULE_OUT = ROOT / "packages" / "data" / "src" / "derbies.ts"
FIELDS = ["club_a", "club_b", "name", "intensity", "basis", "views", "article", "source", "seen_on"]
LISTS = (
    "List of association football club rivalries in Europe",
    "List of association football club rivalries in the Americas",
    "List of association football club rivalries in Africa",
    "List of association football club rivalries in Asia and Oceania",
)
# Days of pageviews the Action API keeps (PageViewInfo's longest window), read through it 50 articles a
# request: the REST pageviews API answers a generic User-Agent once every ~17 seconds (HTTP 429).
VIEWS_DAYS = 60
# Share of a country's derbies at intensity 1, 2, 3 and 4, from the least watched up (guess: most
# derbies on the lists are local matches between small clubs; a tenth draws national attention). The
# hand-rated derbies are ranked with the others, so the unrated ones fall in below the country's biggest.
INTENSITY_SHARES = (0.35, 0.35, 0.2, 0.1)
MAX_CLUBS_IN_A_LINE = 4
# guess: clubs of two countries meet only in a continental cup now and then, so their rivalry stays small.
INTERNATIONAL_MAX = 2
# A request told to slow down (HTTP 429) waits as asked and tries again, this many times in all.
RETRIES = 6

# The biggest derbies of the game's world, rated by hand: 5 for the matches that stop a country
# (and that the world watches), 4 for a big city's or state's main derby, 3 for a smaller state's
# main derby or a big city's next one. Each cites the Wikipedia article that describes it, or the list
# that has it when it has none; keys are the game's club ids, display names in Portuguese (empty to
# keep the list's own name).
HAND_RATED: dict[tuple[str, str], tuple[int, str, str]] = {
    ('flamengo-rj', 'fluminense-rj'): (5, 'Fla-Flu', 'Fla–Flu'),
    ('gremio-rs', 'internacional-rs'): (5, 'Gre-Nal', 'Grenal'),
    ('corinthians-sp', 'palmeiras-sp'): (5, 'Dérbi Paulista', 'Derby Paulista'),
    ('atletico-mg-mg', 'cruzeiro-mg'): (5, 'Clássico Mineiro', 'Clássico Mineiro'),
    ('bahia-ba', 'vitoria-ba'): (5, 'Ba-Vi', 'List of Brazilian football derbies'),
    ('flamengo-rj', 'vasco-rj'): (5, 'Clássico dos Milhões', 'Clássico dos Milhões'),
    ('corinthians-sp', 'sao-paulo-sp'): (4, 'Majestoso', 'Clássico Majestoso'),
    ('palmeiras-sp', 'sao-paulo-sp'): (4, 'Choque-Rei', 'Choque-Rei'),
    ('corinthians-sp', 'santos-sp'): (4, 'Clássico Alvinegro', 'Clássico Alvinegro'),
    ('santos-sp', 'sao-paulo-sp'): (3, 'San–São', 'San–São'),
    ('palmeiras-sp', 'santos-sp'): (3, 'Clássico da Saudade', 'Clássico da Saudade'),
    ('athletico-pr-pr', 'coritiba-pr'): (4, 'Athletiba', 'Athletiba'),
    ('ceara-ce', 'fortaleza-ce'): (4, 'Clássico-Rei', 'List of Brazilian football derbies'),
    ('nautico-pe', 'sport-pe'): (4, 'Clássico dos Clássicos', 'Clássico dos Clássicos'),
    ('santa-cruz-pe', 'sport-pe'): (4, 'Clássico das Multidões', 'List of Brazilian football derbies'),
    ('paysandu-pa', 'remo-pa'): (4, 'Re-Pa', 'Re-Pa'),
    ('botafogo-rj', 'fluminense-rj'): (3, 'Clássico Vovô', 'Clássico Vovô'),
    ('fluminense-rj', 'vasco-rj'): (4, 'Clássico dos Gigantes', 'List of Brazilian football derbies'),
    ('botafogo-rj', 'flamengo-rj'): (4, 'Clássico da Rivalidade', 'List of Brazilian football derbies'),
    ('botafogo-rj', 'vasco-rj'): (3, 'Clássico Alvinegro', 'List of Brazilian football derbies'),
    ('guarani-sp', 'ponte-preta-sp'): (4, 'Dérbi Campineiro', 'Derby Campineiro'),
    ('crb-al', 'csa-al'): (3, 'Clássico das Multidões', 'List of Brazilian football derbies'),
    ('avai-sc', 'figueirense-sc'): (3, 'Clássico da Ilha', 'List of Brazilian football derbies'),
    ('goias-go', 'vila-nova-go'): (3, '', 'List of Brazilian football derbies'),
    ('nautico-pe', 'santa-cruz-pe'): (3, 'Clássico das Emoções', 'Clássico das Emoções'),
    ('caxias-rs', 'juventude-rs'): (3, 'Ca-Ju', 'List of Brazilian football derbies'),
    ('abc-rn', 'america-rn-rn'): (3, '', 'List of Brazilian football derbies'),
    ('moto-ma', 'sampaio-correa-ma'): (3, 'Superclássico Maranhense', 'List of Brazilian football derbies'),
    ('campinense-pb', 'treze-pb'): (3, 'Clássico dos Maiorais', 'List of Brazilian football derbies'),
    ('atletico-go-go', 'goias-go'): (3, '', 'List of Brazilian football derbies'),
    ('tm-189', 'tm-209'): (5, 'Superclássico', 'Superclásico'),
    ('tm-1234', 'tm-1444'): (4, 'Clássico de Avellaneda', 'Avellaneda derby'),
    ('tm-1286', 'tm-1418'): (4, 'Clássico Rosarino', 'Rosario derby'),
    ('tm-1106', 'tm-288'): (3, 'Clássico Platense', 'La Plata derby'),
    ('tm-1775', 'tm-2063'): (3, 'San Lorenzo × Huracán', 'Football rivalries in Argentina'),
    ('tm-861', 'tm-866'): (5, 'Clásico uruguaio', 'Uruguayan Clásico'),
    ('tm-1037', 'tm-2433'): (4, 'Superclássico chileno', 'Chilean Superclásico'),
    ('tm-184', 'tm-6593'): (4, 'Clássico peruano', 'Peruvian Clásico'),
    ('tm-1214', 'tm-629'): (4, 'Superclássico paraguaio', 'Paraguayan football derby'),
    ('tm-3523', 'tm-4561'): (4, 'Clássico del Astillero', 'Clásico del Astillero'),
    ('tm-10093', 'tm-8172'): (3, 'Clássico Paisa', 'El Clásico Paisa'),
    ('tm-3631', 'tm-6711'): (4, 'Clássico Nacional', 'List of association football club rivalries in the Americas'),
    ('tm-3631', 'tm-7633'): (3, 'Clássico Capitalino', 'Clásico Capitalino'),
    ('tm-2407', 'tm-7055'): (3, 'Clássico Regio', 'Clásico Regiomontano'),
    ('tm-6711', 'tm-8590'): (3, 'Clássico Tapatío', 'Clásico Tapatío'),
    ('tm-31', 'tm-985'): (5, 'Clássico do Noroeste', 'Liverpool F.C.–Manchester United F.C. rivalry'),
    ('tm-281', 'tm-985'): (4, 'Dérbi de Manchester', 'Manchester derby'),
    ('tm-29', 'tm-31'): (4, 'Dérbi de Merseyside', 'Merseyside derby'),
    ('tm-11', 'tm-148'): (4, 'Dérbi do Norte de Londres', 'North London derby'),
    ('tm-11', 'tm-985'): (4, 'Arsenal × Manchester United', 'Arsenal F.C.–Manchester United F.C. rivalry'),
    ('tm-11', 'tm-631'): (3, 'Arsenal × Chelsea', 'Arsenal F.C.–Chelsea F.C. rivalry'),
    ('tm-148', 'tm-631'): (3, 'Chelsea × Tottenham', 'Chelsea F.C.–Tottenham Hotspur F.C. rivalry'),
    ('tm-289', 'tm-762'): (4, 'Dérbi Tyne-Wear', 'Tyne–Wear derby'),
    ('tm-124', 'tm-371'): (5, 'Old Firm', 'Old Firm'),
    ('tm-43', 'tm-903'): (3, 'Dérbi de Edimburgo', 'Edinburgh derby'),
    ('tm-131', 'tm-418'): (5, 'El Clásico', 'El Clásico'),
    ('tm-13', 'tm-418'): (4, 'Dérbi de Madri', 'Madrid derby'),
    ('tm-150', 'tm-368'): (4, 'Dérbi de Sevilha', 'Seville derby'),
    ('tm-621', 'tm-681'): (3, 'Dérbi basco', 'Basque derby'),
    ('tm-131', 'tm-714'): (3, 'Dérbi de Barcelona', 'Derbi Barceloní'),
    ('tm-46', 'tm-5'): (5, 'Derby della Madonnina', 'Derby della Madonnina'),
    ('tm-12', 'tm-398'): (4, 'Derby della Capitale', 'Derby della Capitale'),
    ('tm-46', 'tm-506'): (4, "Derby d'Italia", "Derby d'Italia"),
    ('tm-416', 'tm-506'): (3, 'Derby della Mole', 'Derby della Mole'),
    ('tm-1038', 'tm-252'): (3, 'Derby della Lanterna', 'Derby della Lanterna'),
    ('tm-16', 'tm-27'): (4, 'Der Klassiker', 'Der Klassiker'),
    ('tm-16', 'tm-33'): (4, 'Revierderby', 'Revierderby'),
    ('tm-41', 'tm-86'): (3, 'Nordderby', 'Nordderby'),
    ('tm-244', 'tm-583'): (4, 'Le Classique', 'Le Classique'),
    ('tm-1041', 'tm-618'): (3, 'Derby du Rhône', 'Olympique Lyonnais–AS Saint-Étienne rivalry'),
    ('tm-294', 'tm-720'): (4, 'O Clássico', 'O Clássico'),
    ('tm-294', 'tm-336'): (4, 'Dérbi de Lisboa', 'Derby de Lisboa'),
    ('tm-336', 'tm-720'): (4, 'Clássico Porto × Sporting', 'FC Porto–Sporting CP rivalry'),
    ('tm-234', 'tm-610'): (4, 'De Klassieker', 'De Klassieker'),
    ('tm-141', 'tm-36'): (5, 'Dérbi Intercontinental', 'The Intercontinental Derby (football)'),
    ('tm-114', 'tm-141'): (4, 'Galatasaray × Beşiktaş', 'Beşiktaş–Galatasaray rivalry'),
    ('tm-114', 'tm-36'): (4, 'Beşiktaş × Fenerbahçe', 'Beşiktaş–Fenerbahçe rivalry'),
    ('tm-265', 'tm-683'): (5, 'Dérbi dos eternos inimigos', 'Derby of the Eternal Enemies'),
    ('tm-419', 'tm-447'): (4, 'Dérbi eterno croata', 'Eternal derby (Croatia)'),
    ('tm-197', 'tm-62'): (4, 'Dérbi de Praga', 'Prague derby'),
    ('tm-338', 'tm-660'): (4, 'Clássico ucraniano', 'Klasychne derby'),
}


@dataclass(frozen=True)
class Derby:
    clubs: tuple[str, str]
    name: str
    article: str


LINK = re.compile(r"\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]")
REF = re.compile(r"<ref[^>/]*/>|<ref[^>]*>.*?</ref>", re.S)
TEMPLATE = re.compile(r"\{\{[^{}]*\}\}")
MAIN = re.compile(r"\{\{\s*main(?: article)?\s*\|([^}]*)\}\}", re.I)
# Where a line's derby clause ends and its prose begins: a verb or the end of a sentence outside a link.
PROSE = re.compile(r"\s(?:was|is|are|were|has|have|had|who|which|since|until|after|when|while)\s|(?<!vs)(?<!\sv)[.;](?:\s|$)")
# A list's name for a derby in English ("Black Country derby", "The Topper", "Derby of Via Emilia") is left out: the game shows
# "Clássico". A local name may open with the word ("Derby della Madonnina", "Derby do Cerrado").
ENGLISH_NAME = re.compile(r"\b(?:derbies|rivalry|rivalries)\b|\S[\s-]derby\b|^(?:the|derby\s+of)\s", re.I)
# Table markup, a pair of places ("Godoy Cruz/San Juan") or a link left open is no derby's name.
NOT_A_NAME = re.compile(r"\[\[|\]\]|[|=/]")
# An article about several derbies (a city's or a country's) says nothing about one of them.
LIST_ARTICLE = re.compile(r"\b(?:derbies|rivalries)\b|^(?:List of|Football rivalries)", re.I)
# Words in a derby article's title; a heading link without them is a city or a region, not the derby.
DERBY_WORDS = ("derby", "derbi", "dérbi", "rivalr", "clásico", "clássico", "classico", "classique", "klassiker", "superclás", "old firm", "–", "-")


def plain(text: str) -> str:
    """Wikitext without refs, templates, links' targets and quote marks."""
    text = REF.sub("", text)
    while TEMPLATE.search(text):
        text = TEMPLATE.sub("", text)
    text = LINK.sub(lambda m: m.group(2) or m.group(1), text)
    return re.sub(r"'{2,}", "", text).strip(" *#:;|-")


def is_name(text: str) -> bool:
    return bool(text) and not NOT_A_NAME.search(text) and not ENGLISH_NAME.search(text) and not is_list(text)


def name_and_article(head: str, clubs: dict[str, str], resolve: Callable[[str], str]) -> tuple[str, str]:
    """
    A line head's name for its derby and the derby's own article: of its "or" alternatives ("[[Natal]] derby
    or ''Clássico-Rei''"), translations in brackets dropped, the first that is a name and the first that is
    a link to one derby's article. An alternative that links a place alone is a city heading, neither.
    """
    name, article = "", ""
    for alternative in re.split(r"\s+or\s+", re.sub(r"\s*\([^()]*\)", "", head)):
        alternative = alternative.strip(" '*#")
        whole = LINK.fullmatch(alternative)
        title = resolve(whole.group(1).strip()) if whole else ""
        if whole and (title in clubs or not any(w in title.lower() for w in DERBY_WORDS)):
            continue
        if title and not article and not LIST_ARTICLE.search(title):
            article = title
        text = re.sub(r"\s+vs?\.?\s+", " × ", plain(alternative))
        if not name and is_name(text):
            name = text
    return name[:60], article


def derbies_in_line(line: str, clubs: dict[str, str], resolve: Callable[[str], str], club_of_link: Callable[[str, str], str] | None = None) -> list[Derby]:
    """
    The derbies a list line names: each pair of the two to four clubs it links, its name and article.
    `club_of_link` (a link's resolved title and label) picks the club a link stands for, when not `clubs`.
    """
    text = REF.sub("", line)
    while TEMPLATE.search(text):
        text = TEMPLATE.sub("", text)
    # A colon inside a link ("[[:pl:Derby Łodzi|Łódź Derby]]") is not the head's.
    masked = LINK.sub(lambda m: "x" * len(m.group(0)), text)
    has_colon = ":" in masked
    head = text[: masked.index(":")] if has_colon else text
    name, article = name_and_article(head, clubs, resolve) if has_colon else ("", "")
    prose = PROSE.search(masked, len(head) + 1 if has_colon else 0)
    if prose:
        text = text[: prose.start()]
    found: list[str] = []
    for match in LINK.finditer(text):
        title = resolve(match.group(1).strip())
        club = club_of_link(title, match.group(2) or match.group(1)) if club_of_link else clubs.get(title, "")
        if club and club not in found:
            found.append(club)
    if not 2 <= len(found) <= MAX_CLUBS_IN_A_LINE:
        return []
    ordered = sorted(found)
    return [Derby(clubs=(a, b), name=name, article=article) for i, a in enumerate(ordered) for b in ordered[i + 1:]]


BRAZIL_LIST = "List of Brazilian football derbies"
STATE_CODES = {
    "acre": "AC", "alagoas": "AL", "amapa": "AP", "amazonas": "AM", "bahia": "BA", "ceara": "CE", "federal district": "DF",
    "distrito federal": "DF", "espirito santo": "ES", "goias": "GO", "maranhao": "MA", "mato grosso": "MT",
    "mato grosso do sul": "MS", "minas gerais": "MG", "para": "PA", "paraiba": "PB", "parana": "PR", "pernambuco": "PE",
    "piaui": "PI", "rio de janeiro": "RJ", "rio grande do norte": "RN", "rio grande do sul": "RS", "rondonia": "RO",
    "roraima": "RR", "santa catarina": "SC", "sao paulo": "SP", "sergipe": "SE", "tocantins": "TO",
}
HEADING = re.compile(r"^==([^=].*?)==\s*$")


def folded(text: str) -> str:
    """Lower case without accents, as names are compared."""
    return "".join(c for c in unicodedata.normalize("NFD", text.lower()) if unicodedata.category(c) != "Mn").strip()


def clubs_by_state_name(clubs: list[dict[str, str]]) -> dict[tuple[str, str], str]:
    """Each Brazilian club by its state and its folded short name, without its "-PB" state mark."""
    by_state: dict[tuple[str, str], str] = {}
    for club in clubs:
        state = club["state"]
        by_state.setdefault((state, folded(re.sub(rf"-{state}$", "", club["short_name"]))), club["id"])
    return by_state


def state_lines(wikitext: str) -> list[tuple[str, str]]:
    """Brazil's list bullets, each with the state of the section it sits under ("" outside one)."""
    lines: list[tuple[str, str]] = []
    state = ""
    for line in wikitext.splitlines():
        heading = HEADING.match(line)
        if heading:
            state = STATE_CODES.get(folded(re.sub(r"\s*\(.*\)", "", plain(heading.group(1)))), "")
        elif line.startswith(("*", "#")):
            lines.append((state, line))
    return lines


def brazilian_club_titles(wikitext: str, clubs: list[dict[str, str]], resolve: Callable[[str], str]) -> dict[str, str]:
    """
    The game's Brazilian clubs Wikidata leaves unmatched, found in Brazil's derby list: a link after a line's
    head (the head names the city) whose label is a club's short name in the state section it sits under.
    """
    by_state = clubs_by_state_name(clubs)
    found: dict[str, str] = {}
    for state, line in state_lines(wikitext):
        text = REF.sub("", line)
        head, has_colon, _ = text.partition(":")
        for match in LINK.finditer(text, len(head) if has_colon else 0):
            club = by_state.get((state, folded(match.group(2) or match.group(1))))
            if club:
                found.setdefault(resolve(match.group(1).strip()), club)
    return found


def brazilian_derbies(wikitext: str, clubs: dict[str, str], brazil: list[dict[str, str]], resolve: Callable[[str], str]) -> list[Derby]:
    """
    The derbies of Brazil's list. The list links some clubs to a namesake's article from another state (Santarém's
    São Raimundo to Manaus's): in a state's section, a link to another state's club stands for the section's own
    club of that short name when it has one.
    """
    by_state = clubs_by_state_name(brazil)
    state_of = {club["id"]: club["state"] for club in brazil}
    derbies: list[Derby] = []
    for state, line in state_lines(wikitext):
        def club_of_link(title: str, label: str) -> str:
            club = clubs.get(title, "")
            if state and club in state_of and state_of[club] != state:
                return by_state.get((state, folded(label)), club)
            return club
        derbies += derbies_in_line(line, clubs, resolve, club_of_link)
    return derbies


def intensities_by_views(views: dict[tuple[str, str], float], countries: dict[str, str] | None = None) -> dict[tuple[str, str], int]:
    """
    Intensity 1-4 for each pair by its rank in attention among its country's pairs (given `countries`; the
    pairs of two countries apart, no higher than INTERNATIONAL_MAX), INTENSITY_SHARES of them at each level.
    """
    def country_of(pair: tuple[str, str]) -> str:
        if countries is None:
            return ""
        return countries.get(pair[0], "") if countries.get(pair[0]) == countries.get(pair[1]) else "international"
    bounds = [sum(INTENSITY_SHARES[: level + 1]) for level in range(len(INTENSITY_SHARES))]
    scale = {}
    for country in sorted({country_of(pair) for pair in views}):
        ranked = sorted((pair for pair in views if country_of(pair) == country), key=lambda pair: (views[pair], pair))
        for rank, pair in enumerate(ranked):
            share = (rank + 1) / len(ranked)
            level = next(level + 1 for level, bound in enumerate(bounds) if share <= bound + 1e-9)
            scale[pair] = min(level, INTERNATIONAL_MAX) if country == "international" else level
    return scale


def attention_articles(articles: dict[tuple[str, str], str]) -> dict[tuple[str, str], str]:
    """The pairs whose article is about their derby alone: not a list, and no other pair's article too."""
    counts: dict[str, int] = {}
    for article in articles.values():
        counts[article] = counts.get(article, 0) + 1
    return {pair: article for pair, article in articles.items() if article and counts[article] == 1 and not LIST_ARTICLE.search(article)}


class Wiki:
    def __init__(self, cache: Path, delay: float, is_offline: bool) -> None:
        self.cache, self.delay, self.is_offline = cache, delay, is_offline

    def get(self, url: str, data: bytes | None = None) -> str:
        key = hashlib.sha256(url.encode() + (data or b"")).hexdigest()[:24]
        cached = self.cache / f"{key}.json.gz"
        if cached.exists():
            return gzip.decompress(cached.read_bytes()).decode("utf-8")
        if self.is_offline:
            raise FileNotFoundError(f"{url} is not in the cache")
        request = urllib.request.Request(url, data=data, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
        for attempt in range(RETRIES):
            try:
                with urllib.request.urlopen(request, timeout=60) as answer:
                    body = answer.read().decode("utf-8")
                break
            except urllib.error.HTTPError as error:
                if error.code == 404:
                    body = "{}"
                    break
                if error.code != 429 or attempt == RETRIES - 1:
                    raise
                time.sleep(float(error.headers.get("Retry-After") or 0) or 10 * (attempt + 1))
        time.sleep(self.delay)
        self.cache.mkdir(parents=True, exist_ok=True)
        cached.write_bytes(gzip.compress(body.encode("utf-8"), mtime=0))
        return body

    def api(self, **params: str) -> dict:
        query = urllib.parse.urlencode({**params, "format": "json", "formatversion": "2"})
        return json.loads(self.get(f"{WIKI}/w/api.php?{query}"))

    def wikitext(self, title: str) -> tuple[str, str]:
        parsed = self.api(action="parse", page=title, prop="wikitext", redirects="1").get("parse", {})
        return parsed.get("title", title), parsed.get("wikitext", "")

    def landings(self, page: str) -> dict[str, str]:
        """Each article a page links to, as the title it lands on after redirects (500 links a request)."""
        found: dict[str, str] = {}
        cont: dict[str, str] = {}
        while True:
            answer = self.api(action="query", generator="links", titles=page, gplnamespace="0", gpllimit="max", redirects="1", **cont)
            query = answer.get("query", {})
            hops = {item["from"]: item["to"] for item in query.get("normalized", []) + query.get("redirects", [])}
            for item in query.get("pages", []):
                found[item["title"]] = item["title"]
            for start in hops:
                landing, seen = start, set()
                while landing in hops and landing not in seen:
                    seen.add(landing)
                    landing = hops[landing]
                found[start] = landing
            if "continue" not in answer:
                return found
            cont = {key: str(value) for key, value in answer["continue"].items()}

    def english_articles(self, tm_ids: list[str]) -> dict[str, str]:
        """The English article of each Transfermarkt club id, from Wikidata."""
        found: dict[str, str] = {}
        for start in range(0, len(tm_ids), 200):
            values = " ".join(f'"{i}"' for i in tm_ids[start:start + 200])
            query = f"""SELECT ?tm ?title WHERE {{ VALUES ?tm {{ {values} }} ?item wdt:P7223 ?tm .
              ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?title . }}"""
            body = self.get("https://query.wikidata.org/sparql", urllib.parse.urlencode({"query": query, "format": "json"}).encode())
            for row in json.loads(body)["results"]["bindings"]:
                found.setdefault(row["tm"]["value"], row["title"]["value"])
        return found

    def views(self, titles: list[str]) -> dict[str, int]:
        """Each article's pageviews over the last VIEWS_DAYS days, 50 articles a request."""
        found: dict[str, int] = {}
        for start in range(0, len(titles), 50):
            batch = titles[start:start + 50]
            cont: dict[str, str] = {}
            while True:
                answer = self.api(action="query", prop="pageviews", pvipdays=str(VIEWS_DAYS), redirects="1", titles="|".join(batch), **cont)
                query = answer.get("query", {})
                back = {item["to"]: item["from"] for item in query.get("normalized", []) + query.get("redirects", [])}
                for page in query.get("pages", []):
                    if "pageviews" in page:
                        title = page["title"]
                        while title in back and title not in batch:
                            title = back[title]
                        found[title] = sum(views or 0 for views in page["pageviews"].values())
                if "continue" not in answer:
                    break
                cont = {key: str(value) for key, value in answer["continue"].items()}
        return found


def countries_of_clubs() -> dict[str, str]:
    """Each game club's country, by its pack ("br" for Brazil's slugs)."""
    countries: dict[str, str] = {}
    with BRAZIL_CLUBS.open(encoding="utf-8") as rows:
        for row in csv.DictReader(rows):
            countries[row["id"]] = "br"
    for pack in sorted(WORLD_PACKS.glob("*.pack.json.gz")):
        table = json.loads(gzip.decompress(pack.read_bytes())).get("clubs", {})
        for club_id in table.get("id", []):
            countries.setdefault(club_id, pack.name.split(".")[0])
    return countries


def game_clubs() -> dict[str, str]:
    """The game's club id of each Transfermarkt club id: Brazil's slugs, `tm-<id>` abroad."""
    clubs: dict[str, str] = {}
    with BRAZIL_CLUBS.open(encoding="utf-8") as rows:
        for row in csv.DictReader(rows):
            if row["tm_id"]:
                clubs[row["tm_id"]] = row["id"]
    for pack in sorted(WORLD_PACKS.glob("*.pack.json.gz")):
        table = json.loads(gzip.decompress(pack.read_bytes())).get("clubs", {})
        for club_id in table.get("id", []):
            if club_id.startswith("tm-"):
                clubs.setdefault(club_id.removeprefix("tm-"), club_id)
    return clubs


def lines_of(wikitext: str) -> list[str]:
    """List bullets and table rows, each as one line."""
    lines = [line for line in wikitext.splitlines() if line.startswith(("*", "#"))]
    for table in re.findall(r"\{\|.*?\|\}", wikitext, re.S):
        lines += [row.replace("\n", " ") for row in table.split("|-")[1:]]
    return lines


def is_list(title: str) -> bool:
    return title.startswith(("List of", "Football rivalries"))


def page_url(title: str) -> str:
    return f"{WIKI}/wiki/{urllib.parse.quote(title.replace(' ', '_'))}"


def ts_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def write_module(rows: list[dict[str, str]], seen_on: str) -> None:
    lines = [
        "// Generated by pipeline/fetch_derbies.py from Wikipedia's rivalry lists; edit the script, not this file.",
        "",
        "/** A real derby between two of the game's clubs: their ids in order, its name (empty when the lists give none) and how big it is, 1 to 5. */",
        "export type RealDerby = { clubs: readonly [string, string]; name: string; intensity: number };",
        "",
        "/** The day the lists were read. */",
        f"export const DERBIES_SEEN_ON = {ts_string(seen_on)};",
        "",
        "/** Every derby between the game's clubs on that day. */",
        "export const DERBIES: readonly RealDerby[] = [",
    ]
    for row in rows:
        lines.append(f"  {{ clubs: [{ts_string(row['club_a'])}, {ts_string(row['club_b'])}], name: {ts_string(row['name'])}, intensity: {row['intensity']} }},")
    lines += ["];", ""]
    MODULE_OUT.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--delay", type=float, default=1.0)
    parser.add_argument("--offline", action="store_true")
    parser.add_argument("--cache", type=Path, default=ROOT / "data" / "wiki_cache")
    args = parser.parse_args()
    wiki = Wiki(args.cache, max(0.5, args.delay), args.offline)
    seen_on = date.today().isoformat()

    by_tm = game_clubs()
    articles = wiki.english_articles(sorted(by_tm))
    club_of_title = {title: by_tm[tm] for tm, title in articles.items()}
    print(f"{len(club_of_title)} of {len(by_tm)} clubs have an English article")

    pages: dict[str, str] = {}
    queue = list(LISTS)
    while queue:
        title = queue.pop(0)
        landing, text = wiki.wikitext(title)
        if landing in pages or not text:
            continue
        pages[landing] = text
        if title in LISTS:
            for target in MAIN.findall(text):
                for sub in target.split("|"):
                    sub = sub.strip()
                    if sub and "=" not in sub and re.search(r"rivalr|derb", sub, re.I):
                        queue.append(sub)
    print(f"{len(pages)} list pages")

    landing: dict[str, str] = {}
    for page in pages:
        landing.update(wiki.landings(page))
    resolve = lambda title: landing.get(title, landing.get(title[:1].upper() + title[1:], title))  # noqa: E731
    # Wikidata may still name a club by a title that now redirects to its article.
    club_of_title = {**{resolve(title): club for title, club in club_of_title.items()}, **club_of_title}
    with BRAZIL_CLUBS.open(encoding="utf-8") as rows:
        brazil = list(csv.DictReader(rows))
    matched = set(club_of_title.values())
    by_name = brazilian_club_titles(pages.get(BRAZIL_LIST, ""), [row for row in brazil if row["id"] not in matched], resolve)
    club_of_title = {**by_name, **club_of_title}
    print(f"{len(by_name)} more Brazilian clubs matched by name in their state's derbies")

    found: dict[tuple[str, str], tuple[Derby, str]] = {}
    for page, text in pages.items():
        lines = brazilian_derbies(text, club_of_title, brazil, resolve) if page == BRAZIL_LIST else [d for line in lines_of(text) for d in derbies_in_line(line, club_of_title, resolve)]
        for derby in lines:
            if derby.clubs not in found or (derby.article and not found[derby.clubs][0].article):
                found[derby.clubs] = (derby, page_url(page))
    # A hand-rated derby is watched through the article its rating cites, and comes from that page when no list has it;
    # a rating that cites a list (the derby has no article of its own) is watched through its clubs.
    for pair, (_, name, cited) in HAND_RATED.items():
        article = "" if is_list(cited) else cited
        source = found[pair][1] if pair in found else page_url(cited)
        found[pair] = (Derby(clubs=pair, name=name or (found[pair][0].name if pair in found else ""), article=article), source)
    print(f"{len(found)} derbies")

    title_of_club = {club: title for title, club in club_of_title.items()}
    clubs_in_derbies = sorted({c for pair in found for c in pair if c in title_of_club})
    articles = sorted({derby.article for derby, _ in found.values() if derby.article})
    views = wiki.views(sorted({title_of_club[c] for c in clubs_in_derbies} | set(articles)))
    club_views = {club: views.get(title_of_club[club], 0) if club in title_of_club else 0 for club in sorted({c for pair in found for c in pair})}
    own_articles = attention_articles({pair: derby.article for pair, (derby, _) in found.items()})
    article_views = {pair: views.get(article, 0) for pair, article in sorted(own_articles.items())}
    ratios = sorted(article_views[pair] / min(club_views[c] for c in pair) for pair in article_views if min(club_views[c] for c in pair) > 0)
    ratio = ratios[len(ratios) // 2] if ratios else 0.05
    print(f"derby article / smaller club views, median of {len(ratios)}: {ratio:.3f}")
    attention = {pair: article_views.get(pair) or ratio * min(club_views[c] for c in pair) for pair in found}
    by_views = intensities_by_views(attention, countries_of_clubs())

    rows = []
    for pair in sorted(found):
        derby, source = found[pair]
        rated = HAND_RATED.get(pair)
        rows.append({
            "club_a": pair[0], "club_b": pair[1], "name": derby.name,
            "intensity": str(rated[0] if rated else by_views[pair]), "basis": "hand" if rated else "pageviews",
            "views": str(round(attention[pair])), "article": derby.article, "source": source, "seen_on": seen_on,
        })
    with CSV_OUT.open("w", newline="", encoding="utf-8") as out:
        writer = csv.DictWriter(out, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    write_module(rows, seen_on)
    print(f"wrote {len(rows)} derbies, {sum(1 for r in rows if r['basis'] == 'hand')} rated by hand")


if __name__ == "__main__":
    main()
