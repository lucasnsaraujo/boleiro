import type { State } from "@boleiro/data/clubs";
import type { Competition, ContinentalCup, Fixture } from "@boleiro/engine/sim/gameState";
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

const CONTINENTAL_CUP_NAMES: Record<ContinentalCup, string> = { libertadores: "Libertadores", "sul-americana": "Sul-Americana", recopa: "Recopa", "club-world-cup": "Mundial de Clubes" };

const isContinentalCup = (key: string): key is ContinentalCup => key in CONTINENTAL_CUP_NAMES;

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
  }
}

function isState(code: string): code is State {
  return code in STATE_CHAMPIONSHIPS;
}

/** A competition as the history keeps it, without the season: "serie-a", "copa-do-brasil", "state-sp". */
export function competitionKeyName(key: CompetitionKey): string {
  if (key === "copa-do-brasil") return "Copa do Brasil";
  if (isContinentalCup(key)) return CONTINENTAL_CUP_NAMES[key];
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
