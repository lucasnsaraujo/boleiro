"""The v1 world on Transfermarkt (SPEC §6): which countries, leagues, cups and national teams.

Europe is every country with a club in the 2026/27 Champions League or Europa League league phase,
as Transfermarkt's participant pages for that draw listed them on 2026-10-14; the scraper checks
the draw again on every run and logs a club whose league is missing here. Leagues with Apertura
and Clausura use the half being played in October. Cups are recorded as competitions, but only the
league clubs get squads.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class League:
    tier: int
    code: str                          # Transfermarkt's competition code, "GB1"
    path: str | None = None            # the page listing its clubs, when not the start page

    @property
    def clubs_page(self) -> str:
        return self.path or f"/x/startseite/wettbewerb/{self.code}"


@dataclass(frozen=True)
class Country:
    id: str                            # lowercase, names its pack and save shard: "br", "gb-eng"
    name: str                          # as Transfermarkt's squad pages name the league's country
    leagues: tuple[League, ...]
    cup: str | None = None


@dataclass(frozen=True)
class Competition:
    id: str
    path: str
    withdrawn: tuple[str, ...] = ()    # Transfermarkt ids its page still lists but that don't play in it


def top(code: str) -> tuple[League, ...]:
    return (League(1, code),)


def two(first: str, second: str) -> tuple[League, ...]:
    return (League(1, first), League(2, second))


COUNTRIES = (
    Country("br", "Brazil", (
        League(1, "BRA1"), League(2, "BRA2"),
        # Séries C and D's start pages show groups, not clubs; their participants pages list them.
        League(3, "BRA3", "/x/teilnehmer/pokalwettbewerb/BRA3/saison_id/2025"),
        League(4, "BRA4", "/x/teilnehmer/pokalwettbewerb/BRA4/saison_id/2025"),
    ), "BRC"),
    Country("ar", "Argentina", two("ARGC", "ARG2"), "ARCA"),
    Country("bo", "Bolivia", top("BO1A")),
    Country("cl", "Chile", top("CLPD")),
    Country("co", "Colombia", top("COL1")),
    Country("ec", "Ecuador", top("EC1N")),
    Country("py", "Paraguay", top("PR1C")),
    Country("pe", "Peru", top("TDeC")),
    Country("uy", "Uruguay", top("URUC")),
    Country("ve", "Venezuela", top("VZ1L")),
    Country("gb-eng", "England", two("GB1", "GB2"), "FAC"),
    Country("es", "Spain", two("ES1", "ES2"), "CDR"),
    Country("it", "Italy", two("IT1", "IT2"), "CIT"),
    Country("de", "Germany", two("L1", "L2"), "DFB"),
    Country("fr", "France", two("FR1", "FR2"), "FRC"),
    Country("pt", "Portugal", two("PO1", "PO2"), "POPO"),
    Country("nl", "Netherlands", two("NL1", "NL2"), "NLP"),
    Country("tr", "Türkiye", two("TR1", "TR2"), "TRP"),
    Country("be", "Belgium", two("BE1", "BE2"), "CCB"),
    Country("gb-sct", "Scotland", two("SC1", "SC2"), "SFA"),
    Country("at", "Austria", two("A1", "A2"), "ofb"),
    Country("gr", "Greece", two("GR1", "GRS2"), "GRP"),
    Country("cz", "Czech Republic", two("TS1", "TS2"), "TSP"),
    Country("hr", "Croatia", two("KR1", "KR2"), "KRC"),
    Country("ua", "Ukraine", two("UKR1", "UKR2"), "UKRP"),
    Country("pl", "Poland", two("PL1", "PL2"), "POPU"),
    Country("no", "Norway", two("NO1", "NO2"), "NOPO"),
    Country("sk", "Slovakia", two("SLO1", "SK2"), "SKC"),
    Country("si", "Slovenia", two("SL1", "SL2"), "SLP"),
    Country("hu", "Hungary", two("UNG1", "UN2"), "UNGP"),
    Country("bg", "Bulgaria", two("BU1", "BU2"), "BULP"),
    Country("cy", "Cyprus", two("ZYP1", "CYP2"), "CPO1"),
    Country("am", "Armenia", two("ARM1", "ARM2"), "ARPO"),
    Country("il", "Israel", two("ISR1", "ISR2"), "ISPO"),
    # Transfermarkt lists no second tier for Azerbaijan.
    Country("az", "Azerbaijan", top("AZ1"), "ASPK"),
    Country("sa", "Saudi Arabia", top("SA1"), "SAKC"),
    Country("us", "United States", top("MLS1"), "MLSP"),
    Country("mx", "Mexico", top("MEXA")),
)

# The clubs of these competitions must all play in a league above: the draw that picks Europe.
DRAWS = (
    Competition("uefa-champions-league", "/x/teilnehmer/pokalwettbewerb/CL/saison_id/2026"),
    Competition("uefa-europa-league", "/x/teilnehmer/pokalwettbewerb/EL/saison_id/2026"),
)
# Its clubs from outside the world above get squads and no league. The page lists 33 clubs: FIFA
# excluded León, and Club América (3631) lost the play-off for its place to LAFC, 2-1 after extra
# time in Los Angeles on 31 May 2025 (Wikipedia, "2025 FIFA Club World Cup", Qualified teams).
CLUB_WORLD_CUP = Competition("fifa-club-world-cup", "/x/teilnehmer/pokalwettbewerb/KLUB/saison_id/2024", withdrawn=("3631",))
# National teams: the 2026 World Cup and both qualifying groups the game's countries come from.
NATIONAL_TEAM_LISTS = (
    "/x/teilnehmer/pokalwettbewerb/FIWC/saison_id/2025",
    "/x/teilnehmer/pokalwettbewerb/WMQ4/saison_id/2023",
    "/x/teilnehmer/pokalwettbewerb/WMQ6/saison_id/2024",
)
# Club World Cup countries outside the world, by the name their squad pages give.
GUEST_COUNTRIES = {
    "United Arab Emirates": "ae", "Korea, South": "kr", "Japan": "jp", "New Zealand": "nz", "Egypt": "eg",
    "Tunisia": "tn", "Morocco": "ma", "South Africa": "za",
}
