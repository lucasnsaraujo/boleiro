import type { State } from "../../src/data/clubs.js";
import type { Competition, Fixture } from "../../src/sim/gameState.js";

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

/** The competition as a fan names it: "Série A", "Paulista", "Copa do Brasil". */
export function competitionName(competition: Competition): string {
  switch (competition.kind) {
    case "league":
      return `Série ${competition.division}`;
    case "state":
      return STATE_CHAMPIONSHIPS[competition.state];
    case "cup":
      return "Copa do Brasil";
  }
}

/** The competition, plus the round when the game is part of a round robin. */
export function fixtureLabel(competition: Competition, fixture: Fixture): string {
  const stage = competition.stages[fixture.stage];
  const round = stage?.kind === "groups" ? stage.dates.indexOf(fixture.date) + 1 : 0;
  return round > 0 ? `${competitionName(competition)} · ${round}ª rodada` : competitionName(competition);
}
