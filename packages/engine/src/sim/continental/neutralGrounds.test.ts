import { describe, expect, it } from "vitest";
import { recordMatchFinances } from "../finances/recordMatchFinances.js";
import { RAPIDO } from "../formats.js";
import type { Competition, ContinentalCompetition, ContinentalCup, CupAbroadCompetition, Fixture, GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { paramsForCompetition } from "../paramsForCompetition.js";
import { loadEurope } from "../world/loadEurope.js";
import { loadGuests } from "../world/loadGuests.js";
import { loadMarketLeagues } from "../world/loadMarketLeagues.js";
import { loadSouthAmerica } from "../world/loadSouthAmerica.js";
import { syncCupsAbroad } from "./cupsAbroad.js";
import { isOnNeutralGround, neutralGround } from "./neutralGrounds.js";
import { knockoutTie, playEuropeDay, type EuropeanCups } from "./uefaCups.js";

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

describe("UEFA's finals on neutral grounds", () => {
  const ARSENAL = "tm-11";
  const REAL_MADRID = "tm-418";
  const start = loadNewGame(5, { coachClubId: ARSENAL, world: loadEurope(2026), formats: RAPIDO });
  const europe = start.europe;
  if (!europe) throw new Error("no UEFA cups");
  // Arsenal drawn into the season's Champions League final against Real Madrid, and into the Super Cup.
  const final = { name: "final" as const, dates: ["2027-06-05"], ties: [[ARSENAL, REAL_MADRID] as [string, string]], results: "---" };
  const withFinal: GameState = {
    ...start,
    europe: {
      ...europe,
      cups: europe.cups.map((cup) => (cup.cup === "champions-league" ? { ...cup, knockout: [final] } : cup)),
      superCup: { season: europe.season, date: "2026-08-12", clubIds: [ARSENAL, REAL_MADRID], result: "---" },
    },
  };
  const synced = syncCupsAbroad(withFinal);
  const fixtureOf = (competition: Competition | undefined, name: string): { competition: CupAbroadCompetition; fixture: Fixture } => {
    if (competition?.kind !== "cupAbroad") throw new Error(`no cup abroad for the ${name}`);
    const stage = competition.stageNames?.indexOf(name) ?? -1;
    const fixture = synced.fixtures.find((f) => f.competitionId === competition.id && f.stage === stage);
    if (!fixture) throw new Error(`no ${name}`);
    return { competition, fixture };
  };
  const championsLeague = fixtureOf(synced.competitions["champions-league-2026"], "final");
  const superCup = fixtureOf(synced.competitions["uefa-super-cup-2026"], "super-cup");
  const leaguePhase = fixtureOf(synced.competitions["champions-league-2026"], "league-phase");

  it("play the human club's Champions League final and Super Cup at their real grounds, its league phase at a club's", () => {
    expect(neutralGround(championsLeague.competition, championsLeague.fixture)).toBe("Estádio Metropolitano");
    expect(neutralGround(superCup.competition, superCup.fixture)).toBe("Red Bull Arena");
    expect(neutralGround(leaguePhase.competition, leaguePhase.fixture)).toBeNull();
  });

  it("give neither club a home advantage nor a gate there", () => {
    expect(paramsForCompetition(championsLeague.competition, championsLeague.fixture.stage).homeAdvantage).toBe(0);
    expect(paramsForCompetition(leaguePhase.competition, leaguePhase.fixture.stage).homeAdvantage).toBeGreaterThan(0);
    const tickets = (state: GameState) => state.finances[ARSENAL]?.month.revenue.tickets ?? 0;
    const played = (fixture: Fixture): Fixture => ({ ...fixture, homeId: ARSENAL, awayId: REAL_MADRID, result: { homeGoals: 1, awayGoals: 0 } });
    expect(tickets(recordMatchFinances(synced, [played(championsLeague.fixture)]))).toBe(tickets(synced));
    expect(tickets(recordMatchFinances(synced, [played(leaguePhase.fixture)]))).toBeGreaterThan(tickets(synced));
  });

  it("name later seasons' finals where UEFA has given them, the latest one after", () => {
    const at = (season: number) => neutralGround({ ...championsLeague.competition, season }, championsLeague.fixture);
    expect([2026, 2027, 2030].map(at)).toEqual(["Estádio Metropolitano", "Allianz Arena", "Allianz Arena"]);
    const europaLeague = { ...championsLeague.competition, id: "europa-league-2027", cup: "europa-league" as const, season: 2027 };
    expect(isOnNeutralGround(europaLeague, championsLeague.fixture.stage)).toBe(true);
    expect(neutralGround(europaLeague, championsLeague.fixture)).toBe("Arena Națională");
  });

  it("draw a final played result-only with no home advantage: two even clubs score alike", () => {
    // Real Madrid against its own squad under Arsenal's name, the final drawn on many streams.
    const world = start.world;
    const madrid = world?.es?.clubs[REAL_MADRID];
    const england = world?.["gb-eng"];
    if (!world || !madrid || !england) throw new Error("no Real Madrid");
    const twinWorld = { ...world, "gb-eng": { ...england, clubs: { ...england.clubs, [ARSENAL]: { ...madrid, id: ARSENAL } } } };
    let [home, away] = [0, 0];
    for (let stream = 1; stream <= 600; stream++) {
      const cups: EuropeanCups = { ...(withFinal.europe as EuropeanCups), rngState: stream * 7919 };
      const played = playEuropeDay(cups, twinWorld, "2027-06-05", RAPIDO).cups.find((cup) => cup.cup === "champions-league")?.knockout[0];
      const leg = played ? knockoutTie(played, 0).legs[0]?.result : null;
      home += leg?.homeGoals ?? 0;
      away += leg?.awayGoals ?? 0;
    }
    expect(Math.abs(home - away) / (home + away)).toBeLessThan(0.06);
  });
});
