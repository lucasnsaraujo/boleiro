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
    clubs: int                         # how many clubs its Transfermarkt page lists, which its pack must hold
    path: str | None = None            # the page listing its clubs, when not the start page
    verified: bool = True              # False while no second source confirms `clubs`

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


COUNTRIES = (
    Country("br", "Brazil", (
        League(1, "BRA1", 20),
        League(2, "BRA2", 20),
        # Séries C and D's start pages show groups, not clubs; their participants pages list them.
        League(3, "BRA3", 20, "/x/teilnehmer/pokalwettbewerb/BRA3/saison_id/2025"),
        League(4, "BRA4", 96, "/x/teilnehmer/pokalwettbewerb/BRA4/saison_id/2025"),
    ), "BRC"),
    Country("ar", "Argentina", (League(1, "ARGC", 30), League(2, "ARG2", 36)), "ARCA"),
    Country("bo", "Bolivia", (League(1, "BO1A", 16),)),
    Country("cl", "Chile", (League(1, "CLPD", 16),)),
    Country("co", "Colombia", (League(1, "COL1", 20),)),
    Country("ec", "Ecuador", (League(1, "EC1N", 16),)),
    Country("py", "Paraguay", (League(1, "PR1C", 12),)),
    Country("pe", "Peru", (League(1, "TDeC", 18, verified=False),)),
    Country("uy", "Uruguay", (League(1, "URUC", 16),)),
    Country("ve", "Venezuela", (League(1, "VZ1L", 15, verified=False),)),
    Country("gb-eng", "England", (League(1, "GB1", 20), League(2, "GB2", 24)), "FAC"),
    Country("es", "Spain", (League(1, "ES1", 20), League(2, "ES2", 22)), "CDR"),
    Country("it", "Italy", (League(1, "IT1", 20), League(2, "IT2", 20)), "CIT"),
    Country("de", "Germany", (League(1, "L1", 18), League(2, "L2", 18)), "DFB"),
    Country("fr", "France", (League(1, "FR1", 18), League(2, "FR2", 18)), "FRC"),
    Country("pt", "Portugal", (League(1, "PO1", 18), League(2, "PO2", 18)), "POPO"),
    Country("nl", "Netherlands", (League(1, "NL1", 18), League(2, "NL2", 20)), "NLP"),
    Country("tr", "Türkiye", (League(1, "TR1", 18), League(2, "TR2", 20)), "TRP"),
    Country("be", "Belgium", (League(1, "BE1", 18), League(2, "BE2", 15)), "CCB"),
    Country("gb-sct", "Scotland", (League(1, "SC1", 12), League(2, "SC2", 10)), "SFA"),
    Country("at", "Austria", (League(1, "A1", 12), League(2, "A2", 16)), "ofb"),
    Country("gr", "Greece", (League(1, "GR1", 14), League(2, "GRS2", 16)), "GRP"),
    Country("cz", "Czech Republic", (League(1, "TS1", 16), League(2, "TS2", 16)), "TSP"),
    Country("hr", "Croatia", (League(1, "KR1", 10), League(2, "KR2", 16)), "KRC"),
    Country("ua", "Ukraine", (League(1, "UKR1", 16), League(2, "UKR2", 16)), "UKRP"),
    Country("pl", "Poland", (League(1, "PL1", 18), League(2, "PL2", 18)), "POPU"),
    Country("no", "Norway", (League(1, "NO1", 16), League(2, "NO2", 16)), "NOPO"),
    Country("sk", "Slovakia", (League(1, "SLO1", 12), League(2, "SK2", 16)), "SKC"),
    Country("si", "Slovenia", (League(1, "SL1", 10), League(2, "SL2", 16)), "SLP"),
    Country("hu", "Hungary", (League(1, "UNG1", 12), League(2, "UN2", 16)), "UNGP"),
    Country("bg", "Bulgaria", (League(1, "BU1", 14), League(2, "BU2", 18)), "BULP"),
    Country("cy", "Cyprus", (League(1, "ZYP1", 14), League(2, "CYP2", 16)), "CPO1"),
    Country("am", "Armenia", (League(1, "ARM1", 12, verified=False), League(2, "ARM2", 15)), "ARPO"),
    Country("il", "Israel", (League(1, "ISR1", 14), League(2, "ISR2", 16)), "ISPO"),
    # Transfermarkt lists no second tier for Azerbaijan.
    Country("az", "Azerbaijan", (League(1, "AZ1", 12),), "ASPK"),
    Country("sa", "Saudi Arabia", (League(1, "SA1", 18),), "SAKC"),
    Country("us", "United States", (League(1, "MLS1", 30),), "MLSP"),
    Country("mx", "Mexico", (League(1, "MEXA", 18),)),
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
