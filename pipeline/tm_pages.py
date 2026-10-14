"""Parsers for the Transfermarkt pages the world scraper reads, from HTML text to plain records.

Pages: a competition's club list (league start page or cup participants), a club's detailed squad
(`kader/verein/<id>/plus/1`), a national team's squad (same URL, other columns) and a club's facts
page (colours). Columns are found by their
header text, not their position, since club and national-team squads order them differently.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from bs4 import BeautifulSoup, Tag

from positions import role_of


CLUB_LINK = re.compile(r"^/([^/]+)/startseite/verein/(\d+)")
PLAYER_LINK = re.compile(r"/spieler/(\d+)")
COMPETITION_LINK = re.compile(r"/wettbewerb/([A-Za-z0-9]+)")
VERY_SMALL_CREST = re.compile(r"/wappen/\w+/(\d+)\.png")
DATE_AND_AGE = re.compile(r"^(?:(\d{2})/(\d{2})/(\d{4}))?\s*\(?(\d+)?\)?$")
DATE = re.compile(r"^(\d{2})/(\d{2})/(\d{4})$")
VALUE = re.compile(r"^€([\d.]+)(bn|m|k)?$")
HEX = re.compile(r"background-color:\s*(#[0-9A-Fa-f]{6})")


@dataclass(frozen=True)
class ClubRef:
    tm_id: str
    slug: str
    name: str


@dataclass(frozen=True)
class SquadPlayer:
    tm_id: str
    name: str
    position: str
    role: str | None
    birth_date: str | None
    age: int | None
    nationalities: list[str]
    foot: str | None
    contract_until: str | None
    market_value_eur: int | None
    # National-team squads only: the club he plays for, and his caps and goals.
    club_name: str | None = None
    club_tm_id: str | None = None
    caps: int | None = None
    goals: int | None = None


@dataclass(frozen=True)
class Squad:
    name: str
    crest: str | None                 # image path on Transfermarkt's image host, "/wappen/head/631.png"
    league_code: str | None
    league_name: str | None
    league_level: str | None          # "First Tier", "Regional Championship"
    country: str | None               # the league's country as the site names it
    confederation: str | None         # national teams
    stadium: str | None
    capacity: int | None
    players: list[SquadPlayer] = field(default_factory=list)


def soup_of(html: str) -> BeautifulSoup:
    return BeautifulSoup(html, "lxml")


def text_of(tag: Tag | None) -> str:
    return tag.get_text(" ", strip=True) if tag else ""


def iso_date(text: str) -> str | None:
    match = DATE.match(text.strip())
    return f"{match.group(3)}-{match.group(2)}-{match.group(1)}" if match else None


def euros(text: str) -> int | None:
    match = VALUE.match(text.strip())
    if not match:
        return None
    scale = {"bn": 1_000_000_000, "m": 1_000_000, "k": 1_000, None: 1}[match.group(2)]
    return round(float(match.group(1)) * scale)


def whole_number(text: str) -> int | None:
    digits = re.sub(r"[^\d]", "", text)
    return int(digits) if digits else None


def image_path(src: str) -> str | None:
    match = re.search(r"https?://[^/]+(/[^?]+)", src)
    return match.group(1) if match else None


def participants(html: str) -> list[ClubRef]:
    """The clubs of a league's start page or a cup's participants page, in the page's order."""
    soup = soup_of(html)
    found: dict[str, ClubRef] = {}
    for table in soup.select("table.items"):
        for link in table.select("td.hauptlink a[href]"):
            match = CLUB_LINK.match(link["href"])
            if match and match.group(2) not in found:
                found[match.group(2)] = ClubRef(match.group(2), match.group(1), link.get("title") or text_of(link))
        if found:
            break
    return list(found.values())


def competition_header(html: str) -> tuple[str, str | None]:
    """A competition page's name (from its header, or its title on cup participant pages) and its country's id."""
    soup = soup_of(html)
    name = text_of(soup.select_one("header.data-header h1"))
    if not name:
        name = re.sub(r"\s*(-\s*Participating teams\s*)?\|\s*Transfermarkt\s*$", "", text_of(soup.title))
    country = soup.select_one("header.data-header a[href*='/wettbewerbe/national/wettbewerbe/']")
    return name, country["href"].rsplit("/", 1)[-1] if country else None


def header_label(header: Tag, label: str) -> Tag | None:
    for item in header.select(".data-header__label"):
        if text_of(item).startswith(label):
            return item.select_one(".data-header__content")
    return None


def column_indexes(soup: BeautifulSoup) -> dict[str, int]:
    heads = soup.select("table.items > thead > tr > th")
    indexes: dict[str, int] = {}
    position = 0
    for head in heads:
        indexes[text_of(head)] = position
        position += int(head.get("colspan", 1))
    return indexes


def player_of(row: Tag, columns: dict[str, int]) -> SquadPlayer | None:
    cells = row.find_all("td", recursive=False)
    if len(cells) < len(columns):
        return None
    cell = lambda name: cells[columns[name]] if name in columns else None
    player_cell = cell("Player")
    link = player_cell.select_one("td.hauptlink a[href*='/spieler/']") if player_cell else None
    if link is None:
        return None
    position_rows = player_cell.select("table tr")
    position = text_of(position_rows[-1]) if len(position_rows) > 1 else ""
    born = DATE_AND_AGE.match(text_of(cell("Date of birth/Age")))
    birth_date = f"{born.group(3)}-{born.group(2)}-{born.group(1)}" if born and born.group(1) else None
    age = int(born.group(4)) if born and born.group(4) else None
    nationality_cell = cell("Nat.")
    club_cell = cell("Club")
    club_link = club_cell.select_one("a[href]") if club_cell else None
    club_image = club_cell.select_one("img") if club_cell else None
    club_id = VERY_SMALL_CREST.search(club_image.get("src", "")) if club_image else None
    foot = text_of(cell("Foot"))
    return SquadPlayer(
        tm_id=PLAYER_LINK.search(link["href"]).group(1),
        name=text_of(link),
        position=position,
        role=role_of(position),
        birth_date=birth_date,
        age=age,
        nationalities=[image["title"] for image in nationality_cell.select("img[title]")] if nationality_cell else [],
        foot=foot if foot in ("right", "left", "both") else None,
        contract_until=iso_date(text_of(cell("Contract"))),
        market_value_eur=euros(text_of(cell("Market value"))),
        club_name=(club_image.get("title") or (club_link.get("title") if club_link else None)) if club_image else None,
        club_tm_id=club_id.group(1) if club_id else None,
        caps=whole_number(text_of(cell("International matches"))) if "International matches" in columns else None,
        goals=whole_number(text_of(cell("Goals"))) if "Goals" in columns else None,
    )


def squad(html: str) -> Squad:
    """A club's or national team's detailed squad page (`kader/verein/<id>/plus/1`)."""
    soup = soup_of(html)
    header = soup.select_one("header.data-header")
    if header is None:
        raise ValueError("not a squad page: no data header")
    league_link = header.select_one(".data-header__club a[href]")
    league_code = COMPETITION_LINK.search(league_link["href"]) if league_link else None
    level = header_label(header, "League level:")
    flag = level.select_one("img[title]") if level else None
    crest = header.select_one(".data-header__profile-container img")
    stadium = header_label(header, "Stadium:")
    seats = stadium.select_one(".tabellenplatz") if stadium else None
    stadium_link = stadium.select_one("a") if stadium else None
    columns = column_indexes(soup)
    players = [player for row in soup.select("table.items > tbody > tr") if (player := player_of(row, columns))]
    return Squad(
        name=text_of(header.select_one("h1")),
        crest=image_path(crest.get("src", "")) if crest else None,
        league_code=league_code.group(1) if league_code else None,
        league_name=text_of(league_link) or None,
        league_level=text_of(level) or None,
        country=flag["title"] if flag else None,
        confederation=text_of(header_label(header, "Confederation:")) or None,
        stadium=text_of(stadium_link) or None,
        capacity=whole_number(text_of(seats)) if seats else None,
        players=players,
    )


def club_colours(html: str) -> list[str]:
    """A club facts page's colours, as `#RRGGBB`, in the site's order."""
    box = soup_of(html).select_one("p.vereinsfarbe")
    return [colour.upper() for colour in HEX.findall(str(box))] if box else []
