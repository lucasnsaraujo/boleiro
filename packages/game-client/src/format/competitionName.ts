import type { State } from "@boleiro/data/clubs";
import type { Competition, ContinentalCup, CupAbroad, Fixture } from "@boleiro/engine/sim/gameState";
import { EUROPE } from "@boleiro/engine/sim/world/europe";
import { MARKET_LEAGUES } from "@boleiro/engine/sim/world/marketLeagues";
import { SOUTH_AMERICA } from "@boleiro/engine/sim/world/southAmerica";
import type { CompetitionKey } from "@boleiro/engine/sim/history/history";

const STATE_CHAMPIONSHIPS: Record<State, string> = {
  AC: "Acreano",
  AL: "Alagoano",
  AP: "Amapaense",
  AM: "Amazonense",
  BA: "Baiano",
  CE: "Cearense",
  DF: "Brasiliense",
  ES: "Capixaba",
  GO: "Goiano",
  MA: "Maranhense",
  MT: "Mato-Grossense",
  MS: "Sul-Mato-Grossense",
  MG: "Mineiro",
  PA: "Paraense",
  PB: "Paraibano",
  PR: "Paranaense",
  PE: "Pernambucano",
  PI: "Piauiense",
  RJ: "Carioca",
  RN: "Potiguar",
  RS: "Gaúcho",
  RO: "Rondoniense",
  RR: "Roraimense",
  SC: "Catarinense",
  SP: "Paulista",
  SE: "Sergipano",
  TO: "Tocantinense",
};

// FIFA's yearly Intercontinental Cup goes by the Club World Cup's old name, its 32-club cup every four years by its Brazilian nickname.
const CONTINENTAL_CUP_NAMES: Record<ContinentalCup, string> = {
  libertadores: "Libertadores",
  "sul-americana": "Sul-Americana",
  recopa: "Recopa",
  "club-world-cup": "Super Mundial",
  "intercontinental-cup": "Mundial de Clubes",
};

const isContinentalCup = (key: string): key is ContinentalCup => key in CONTINENTAL_CUP_NAMES;

const UEFA_CUP_NAMES: Record<Exclude<CupAbroad, "national-cup">, string> = { "champions-league": "Champions League", "europa-league": "Europa League", "uefa-super-cup": "Supercopa da UEFA" };

// Each country's cup as Transfermarkt names it (the world packs, read 2026-10-14), without its season; Italy's by its own name.
const NATIONAL_CUP_NAMES: Record<string, string> = {
  am: "Armenian Independence Cup", at: "ÖFB-Cup", az: "Azerbaycan Kuboku", be: "Croky Cup", bg: "Bulgarian Cup", cy: "Kypello Kyprou", cz: "MOL Cup",
  de: "DFB-Pokal", es: "Copa del Rey", fr: "Coupe de France", "gb-eng": "FA Cup", "gb-sct": "Scottish FA Cup", gr: "Kypello Elladas",
  hr: "Hrvatski nogometni kup", hu: "Magyar Kupa", il: "Gvia haMedina", it: "Coppa Italia", nl: "KNVB Beker", no: "NM-Cup", pl: "STS Polish Cup",
  pt: "Taça de Portugal", si: "Pokal Slovenije", sk: "Slovnaft Cup", tr: "Türkiye Kupasi", ua: "Ukrainian Cup",
};

const isUefaCup = (key: string): key is Exclude<CupAbroad, "national-cup"> => key in UEFA_CUP_NAMES;
const STRUCTURES = [...EUROPE, ...SOUTH_AMERICA, ...MARKET_LEAGUES];

/** A competition abroad by its key: a country's league level ("gb-eng-1") or cup ("gb-eng-cup"); null for any other key. */
function abroadKeyName(key: string): string | null {
  const cup = /^([a-z-]+)-cup$/.exec(key)?.[1];
  if (cup) return NATIONAL_CUP_NAMES[cup] ?? null;
  const [, country, level] = /^([a-z-]+)-(\d+)$/.exec(key) ?? [];
  return STRUCTURES.find((structure) => structure.id === country)?.levels[Number(level) - 1]?.name ?? null;
}

/** The competition as a fan names it: "Série A", "Paulista", "Copa do Brasil", "Libertadores". */
export function competitionName(competition: Competition): string {
  switch (competition.kind) {
    case "league":
      return competition.abroad ? competition.abroad.name : `Série ${competition.division}`;
    case "state":
      return STATE_CHAMPIONSHIPS[competition.state];
    case "cup":
      return "Copa do Brasil";
    case "continental":
      return CONTINENTAL_CUP_NAMES[competition.cup];
    case "cupAbroad":
      return competition.cup === "national-cup" ? (NATIONAL_CUP_NAMES[competition.country ?? ""] ?? "Copa nacional") : UEFA_CUP_NAMES[competition.cup];
  }
}

function isState(code: string): code is State {
  return code in STATE_CHAMPIONSHIPS;
}

/** A competition as the history keeps it, without the season: "serie-a", "copa-do-brasil", "state-sp". */
export function competitionKeyName(key: CompetitionKey): string {
  if (key === "copa-do-brasil") return "Copa do Brasil";
  if (isContinentalCup(key)) return CONTINENTAL_CUP_NAMES[key];
  if (isUefaCup(key)) return UEFA_CUP_NAMES[key];
  const abroad = abroadKeyName(key);
  if (abroad) return abroad;
  const league = /^serie-([a-d])$/.exec(key)?.[1];
  if (league) return `Série ${league.toUpperCase()}`;
  const state = /^state-([a-z]{2})$/.exec(key)?.[1]?.toUpperCase();
  return state && isState(state) ? STATE_CHAMPIONSHIPS[state] : key;
}

/** The competition, plus the round when the game is part of a round robin. */
export function fixtureLabel(competition: Competition, fixture: Fixture): string {
  const stage = competition.stages[fixture.stage];
  const round = stage?.kind === "groups" ? stage.dates.indexOf(fixture.date) + 1 : 0;
  return round > 0 ? `${competitionName(competition)} · ${round}ª rodada` : competitionName(competition);
}
