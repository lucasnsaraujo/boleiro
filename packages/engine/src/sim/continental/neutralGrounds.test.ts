import { describe, expect, it } from "vitest";
import { recordMatchFinances } from "../finances/recordMatchFinances.js";
import type { ContinentalCompetition, ContinentalCup, Fixture, GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { paramsForCompetition } from "../paramsForCompetition.js";
import { loadEurope } from "../world/loadEurope.js";
import { loadGuests } from "../world/loadGuests.js";
import { loadMarketLeagues } from "../world/loadMarketLeagues.js";
import { loadSouthAmerica } from "../world/loadSouthAmerica.js";
import { neutralGround } from "./neutralGrounds.js";

const world = [...loadSouthAmerica(2026), ...loadEurope(2026), ...loadMarketLeagues(2026)];
const guests = loadGuests(2026);
const edition = loadNewGame(7, { coachClubId: "flamengo-rj", world, guests, season: 2029 });

function cupOf(state: GameState, cup: ContinentalCup): ContinentalCompetition {
  const found = Object.values(state.competitions).find((c) => c.kind === "continental" && c.cup === cup && c.season === state.season);
  if (found?.kind !== "continental") throw new Error(`no ${cup}`);
  return found;
}

const fixtureAt = (competition: ContinentalCompetition, stage: number, homeId: string, awayId: string): Fixture => ({
  id: `${competition.id}-${stage}-${homeId}-${awayId}`,
  competitionId: competition.id,
  stage,
  date: competition.stageDates[stage]?.[0] ?? "",
  homeId,
  awayId,
  result: { homeGoals: 1, awayGoals: 0 },
});

describe("FIFA's cups on neutral grounds", () => {
  const mundial = cupOf(edition, "intercontinental-cup");
  const superMundial = cupOf(edition, "club-world-cup");

  it("play the Mundial de Clubes' Derby of the Americas, Challenger Cup and final in Qatar, its first two rounds at a club's ground", () => {
    expect([0, 1, 2, 3, 4].map((stage) => neutralGround(mundial, fixtureAt(mundial, stage, "flamengo-rj", "tm-69261")))).toEqual([
      null,
      null,
      "Estádio Ahmad bin Ali",
      "Estádio Ahmad bin Ali",
      "Estádio Ahmad bin Ali",
    ]);
  });

  it("play every Super Mundial match at an American stadium, the semi-finals and final at MetLife", () => {
    const grounds = [0, 1, 2].flatMap((stage) => ["tm-1", "tm-2", "tm-3", "tm-4", "tm-5", "tm-6"].map((awayId) => neutralGround(superMundial, fixtureAt(superMundial, stage, "flamengo-rj", awayId))));
    expect(grounds.every((ground) => ground !== null && ground !== "MetLife Stadium")).toBe(true);
    expect(new Set(grounds).size).toBeGreaterThan(3);
    expect([3, 4].map((stage) => neutralGround(superMundial, fixtureAt(superMundial, stage, "flamengo-rj", "tm-1")))).toEqual(["MetLife Stadium", "MetLife Stadium"]);
  });

  it("give the first-listed club no home advantage there, while a Libertadores host keeps its own", () => {
    const libertadores = cupOf(edition, "libertadores");
    expect(paramsForCompetition(mundial, 2).homeAdvantage).toBe(0);
    expect(paramsForCompetition(superMundial, 0).homeAdvantage).toBe(0);
    expect(paramsForCompetition(mundial, 1).homeAdvantage).toBeGreaterThan(0);
    expect(paramsForCompetition(libertadores, 0).homeAdvantage).toBeGreaterThan(0);
  });

  it("pay the first-listed club no gate there, while it keeps its gate at home in the African–Asian–Pacific Cup", () => {
    const tickets = (state: GameState) => state.finances["flamengo-rj"]?.month.revenue.tickets ?? 0;
    const atQatar = recordMatchFinances(edition, [fixtureAt(mundial, 2, "flamengo-rj", "tm-69261")]);
    const atHome = recordMatchFinances(edition, [fixtureAt(mundial, 1, "flamengo-rj", "tm-69261")]);
    expect(tickets(atQatar)).toBe(tickets(edition));
    expect(tickets(atHome)).toBeGreaterThan(tickets(edition));
  });
});
