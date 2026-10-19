import { describe, expect, it } from "vitest";
import { recordMatchFinances } from "../finances/recordMatchFinances.js";
import { RAPIDO } from "../formats.js";
import type { Competition, ContinentalCompetition, ContinentalCup, CupAbroadCompetition, Fixture, GameState, NationalFullTierCompetition } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { paramsForCompetition } from "../paramsForCompetition.js";
import { loadEurope } from "../world/loadEurope.js";
import { loadGuests } from "../world/loadGuests.js";
import { loadMarketLeagues } from "../world/loadMarketLeagues.js";
import { loadSouthAmerica } from "../world/loadSouthAmerica.js";
import { syncCupsAbroad } from "./cupsAbroad.js";
import { isOnNeutralGround, neutralGround, neutralVenue } from "./neutralGrounds.js";
import { knockoutTie, playEuropeDay, type EuropeanCups } from "./uefaCups.js";

const world = [...loadSouthAmerica(2026), ...loadEurope(2026), ...loadMarketLeagues(2026)];
const guests = loadGuests(2026);
const edition = loadNewGame(7, { coachClubId: "flamengo-rj", world, guests, season: 2029 });

function cupOf(state: GameState, cup: ContinentalCup): ContinentalCompetition {
  const found = Object.values(state.competitions).find((c) => c.kind === "continental" && c.cup === cup && c.season === state.season);
  if (found?.kind !== "continental") throw new Error(`no ${cup}`);
  return found;
}

/** A competition as a game saved before hosts keeps it: without its edition's host. */
function savedBeforeHosts<T extends { host?: unknown }>(competition: T): T {
  const saved = { ...competition };
  delete saved.host;
  return saved;
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

  it("play every Super Mundial match at a ground of its drawn host, the semi-finals and final at its final's", () => {
    const host = superMundial.host;
    if (!host) throw new Error("no Super Mundial host");
    const others = host.grounds.filter((ground) => ground.name !== host.final.name).map((ground) => ground.name);
    const grounds = [0, 1, 2].flatMap((stage) => ["tm-1", "tm-2", "tm-3", "tm-4", "tm-5", "tm-6"].map((awayId) => neutralGround(superMundial, fixtureAt(superMundial, stage, "flamengo-rj", awayId))));
    expect(grounds.every((ground) => ground !== null && others.includes(ground))).toBe(true);
    expect(new Set(grounds).size).toBeGreaterThan(3);
    expect([3, 4].map((stage) => neutralGround(superMundial, fixtureAt(superMundial, stage, "flamengo-rj", "tm-1")))).toEqual([host.final.name, host.final.name]);
    expect(edition.hosts?.["club-world-cup-2029"]).toEqual(host);
  });

  it("play every Super Mundial match of a game saved before hosts at an American stadium, the semi-finals and final at MetLife", () => {
    const saved = savedBeforeHosts(superMundial);
    const grounds = [0, 1, 2].flatMap((stage) => ["tm-1", "tm-2", "tm-3", "tm-4", "tm-5", "tm-6"].map((awayId) => neutralGround(saved, fixtureAt(saved, stage, "flamengo-rj", awayId))));
    expect(grounds.every((ground) => ground !== null && ground !== "MetLife Stadium")).toBe(true);
    expect(new Set(grounds).size).toBeGreaterThan(3);
    expect([3, 4].map((stage) => neutralGround(saved, fixtureAt(saved, stage, "flamengo-rj", "tm-1")))).toEqual(["MetLife Stadium", "MetLife Stadium"]);
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

describe("CONMEBOL's one-match finals at their host's ground", () => {
  const libertadores = cupOf(edition, "libertadores");
  const sulAmericana = cupOf(edition, "sul-americana");
  const finalOf = (competition: ContinentalCompetition) => competition.stageDates.length - 1;

  it("play the Libertadores and Sul-Americana finals at the season's hosts' grounds, every earlier stage at a club's", () => {
    const final = fixtureAt(libertadores, finalOf(libertadores), "flamengo-rj", "tm-1");
    expect(libertadores.host).toEqual(edition.hosts?.["libertadores-2029"]);
    expect(neutralGround(libertadores, final)).toBe(libertadores.host?.final.name);
    expect(neutralVenue(sulAmericana, fixtureAt(sulAmericana, finalOf(sulAmericana), "flamengo-rj", "tm-1"))).toEqual(sulAmericana.host?.final);
    expect(neutralGround(libertadores, fixtureAt(libertadores, finalOf(libertadores) - 1, "flamengo-rj", "tm-1"))).toBeNull();
  });

  it("give the first-listed finalist no home advantage nor gate there", () => {
    const final = fixtureAt(libertadores, finalOf(libertadores), "flamengo-rj", "tm-1");
    expect(paramsForCompetition(libertadores, final.stage).homeAdvantage).toBe(0);
    const tickets = (state: GameState) => state.finances["flamengo-rj"]?.month.revenue.tickets ?? 0;
    expect(tickets(recordMatchFinances(edition, [final]))).toBe(tickets(edition));
  });

  it("keep a final at the home club's ground in a cup opened before hosts", () => {
    const saved = savedBeforeHosts(libertadores);
    expect(isOnNeutralGround(saved, finalOf(saved))).toBe(false);
    expect(paramsForCompetition(saved, finalOf(saved)).homeAdvantage).toBeGreaterThan(0);
  });
});

describe("national final tournaments at their hosts' grounds", () => {
  const host = edition.hosts?.["world-cup-2030"];
  if (!host) throw new Error("no 2030 World Cup host");
  const worldCup: NationalFullTierCompetition = {
    id: "national:world-cup-2030", kind: "national", nationalId: "world-cup-2030", nationalKind: "world-cup", name: "Copa do Mundo 2030", season: 2030,
    clubIds: ["brazil", "spain"], stages: [], stageDates: [["2030-06-14"], ["2030-07-21"]], drawOrder: [], rounds: ["group", "final"], groupNames: [["A"], []],
    neutral: [true, true], host,
  };

  it("play a group match at one of the hosts' other grounds and the final at the final's", () => {
    const group = ["a", "b", "c", "d", "e", "f"].map((id) => neutralVenue(worldCup, { id, stage: 0 }));
    expect(group.every((ground) => ground !== null && ground.name !== host.final.name && host.countries.includes(ground.country))).toBe(true);
    expect(neutralGround(worldCup, { id: "final", stage: 1 })).toBe(host.final.name);
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

  it("name later seasons' finals where UEFA has announced them in a game saved before hosts, none before it does, still on neutral ground", () => {
    const saved = savedBeforeHosts(championsLeague.competition);
    const at = (season: number) => neutralGround({ ...saved, season }, championsLeague.fixture);
    expect([2026, 2027, 2030].map(at)).toEqual(["Estádio Metropolitano", "Allianz Arena", null]);
    expect(isOnNeutralGround({ ...championsLeague.competition, season: 2030 }, championsLeague.fixture.stage)).toBe(true);
    const europaLeague = { ...saved, id: "europa-league-2027", cup: "europa-league" as const, season: 2027 };
    expect(isOnNeutralGround(europaLeague, championsLeague.fixture.stage)).toBe(true);
    expect(neutralGround(europaLeague, championsLeague.fixture)).toBe("Arena Națională");
  });

  it("play a final UEFA hasn't announced at the ground the game drew for it, in a member's big stadium", () => {
    const hosts = synced.hosts ?? {};
    const drawn = hosts["champions-league-2028"];
    if (!drawn) throw new Error("no 2028 Champions League host");
    const later = { ...championsLeague.competition, id: "champions-league-2028", season: 2028, host: drawn };
    expect(neutralGround(later, championsLeague.fixture)).toBe(drawn.final.name);
    expect(drawn.final.capacity).toBeGreaterThanOrEqual(60_000);
    expect(championsLeague.competition.host?.final.name).toBe("Estádio Metropolitano");
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
